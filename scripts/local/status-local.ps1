[CmdletBinding()]
param(
  [int]$Port = 3001
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$healthUrl = "http://127.0.0.1:$Port/api/health"
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$statusCode = try {
  (Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3).StatusCode
} catch {
  $null
}

$owners = @()
foreach ($connection in @($listener)) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
  $owners += [pscustomobject]@{
    processId = $connection.OwningProcess
    belongsToProject = [bool]($process -and $process.CommandLine -and $process.CommandLine.Contains($repoPath))
  }
}

[pscustomobject]@{
  url = "http://localhost:$Port/"
  listening = [bool]$listener
  healthy = $statusCode -eq 200
  statusCode = $statusCode
  owners = $owners
} | ConvertTo-Json -Depth 4
