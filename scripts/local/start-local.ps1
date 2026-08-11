[CmdletBinding()]
param(
  [int]$Port = 3001,
  [switch]$SkipBuild,
  [string]$PreferredNodePath,
  [string]$BasePath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runtimePath = Join-Path $repoPath '.local'
$logPath = Join-Path $runtimePath 'logs'
$processFile = Join-Path $runtimePath 'server.pid'
$standardLog = Join-Path $logPath 'server.out.log'
$errorLog = Join-Path $logPath 'server.err.log'
$normalizedBasePath = $BasePath.Trim().Trim('/')
$healthPrefix = if ($normalizedBasePath) { "/$normalizedBasePath" } else { '' }
$healthUrl = "http://127.0.0.1:$Port$healthPrefix/api/health"

function Resolve-NodeExecutable {
  $candidatePaths = New-Object System.Collections.Generic.List[string]

  if (-not [string]::IsNullOrWhiteSpace($PreferredNodePath)) {
    $candidatePaths.Add($PreferredNodePath)
  }

  $pathNode = Get-Command node -ErrorAction SilentlyContinue
  if ($pathNode) {
    $candidatePaths.Add($pathNode.Source)
  }

  $userProfilePath = $env:USERPROFILE
  if (-not [string]::IsNullOrWhiteSpace($userProfilePath)) {
    $candidatePaths.Add((Join-Path $userProfilePath '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
  }

  foreach ($candidatePath in ($candidatePaths | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
      continue
    }

    try {
      $versionText = (& $candidatePath -p 'process.versions.node').Trim()
      if ([Version]$versionText -ge [Version]'22.13.0') {
        return $candidatePath
      }
    } catch {
      continue
    }
  }

  throw 'Node.js 22.13 or newer was not found. Install it or pass -PreferredNodePath.'
}

function Resolve-PnpmExecutable {
  $pathPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($pathPnpm) {
    return $pathPnpm.Source
  }

  $userProfilePath = $env:USERPROFILE
  if (-not [string]::IsNullOrWhiteSpace($userProfilePath)) {
    $bundledPnpm = Join-Path $userProfilePath '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
    if (Test-Path -LiteralPath $bundledPnpm -PathType Leaf) {
      return $bundledPnpm
    }
  }

  throw 'pnpm was not found. Install pnpm or add it to PATH.'
}

function Get-HealthStatus {
  try {
    return (Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3).StatusCode
  } catch {
    return $null
  }
}

$existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
  $statusCode = Get-HealthStatus
  if ($statusCode -eq 200) {
    Write-Host "app.x-portal is already healthy at http://localhost:$Port/"
    exit 0
  }

  $ownerProcessId = @($existingListener)[0].OwningProcess
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerProcessId" -ErrorAction SilentlyContinue
  $ownedByProject = $owner -and $owner.CommandLine -and $owner.CommandLine.Contains($repoPath)
  if ($ownedByProject) {
    throw "Port $Port is held by an unhealthy app.x-portal process. Run pnpm local:stop first."
  }

  throw "Port $Port is already used by another process (PID $ownerProcessId)."
}

$nodePath = Resolve-NodeExecutable
$pnpmPath = Resolve-PnpmExecutable
$nodeDirectory = Split-Path -Parent $nodePath
$originalPath = $env:PATH
$env:PATH = "$nodeDirectory;$originalPath"

if (-not $SkipBuild) {
  Write-Host 'Creating a production build...'
  & $pnpmPath --dir $repoPath build
  if ($LASTEXITCODE -ne 0) {
    throw "Production build failed with exit code $LASTEXITCODE."
  }
}

$nextCliPath = Join-Path $repoPath 'node_modules\next\dist\bin\next'
$buildIdPath = Join-Path $repoPath '.next\BUILD_ID'
if (
  -not (Test-Path -LiteralPath $nextCliPath -PathType Leaf) -or
  -not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)
) {
  throw 'No production build exists. Run without -SkipBuild first.'
}

$environmentFile = Join-Path $repoPath '.env.local'
if (Test-Path -LiteralPath $environmentFile -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $environmentFile) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      continue
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$env:PORT = [string]$Port
$env:HOSTNAME = '0.0.0.0'
$quotedNextCliPath = '"' + $nextCliPath + '"'
$serverProcess = Start-Process `
  -FilePath $nodePath `
  -ArgumentList @($quotedNextCliPath, 'start', '--hostname', '0.0.0.0', '--port', [string]$Port) `
  -WorkingDirectory $repoPath `
  -RedirectStandardOutput $standardLog `
  -RedirectStandardError $errorLog `
  -WindowStyle Hidden `
  -PassThru

Set-Content -LiteralPath $processFile -Value ([string]$serverProcess.Id) -Encoding Ascii

$statusCode = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  $statusCode = Get-HealthStatus
  if ($statusCode -eq 200) {
    break
  }
  if ($serverProcess.HasExited) {
    break
  }
}

if ($statusCode -ne 200) {
  if (-not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $errorTail = if (Test-Path -LiteralPath $errorLog) {
    (Get-Content -LiteralPath $errorLog -Tail 20) -join [Environment]::NewLine
  } else {
    'No error log was created.'
  }
  throw "The local server did not become healthy.$([Environment]::NewLine)$errorTail"
}

Write-Host "app.x-portal is healthy at http://localhost:$Port/ (PID $($serverProcess.Id))."
Write-Host "Logs: $logPath"
