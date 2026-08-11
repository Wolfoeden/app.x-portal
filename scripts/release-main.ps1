[CmdletBinding()]
param(
  [switch]$SkipQualityChecks,
  [ValidateRange(60, 1800)]
  [int]$NetlifyTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedLogin = "Wolfoeden"
$expectedRemote = "https://github.com/Wolfoeden/app.x-portal.git"
$productionUrl = "https://x-portal.eu"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

foreach ($proxyName in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")) {
  $proxyValue = [Environment]::GetEnvironmentVariable($proxyName)
  if ($proxyValue -match '^https?://127\.0\.0\.1:9/?$') {
    [Environment]::SetEnvironmentVariable($proxyName, $null)
  }
}

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

$loginResult = & gh api user --jq .login
if ($LASTEXITCODE -ne 0) {
  throw "Release refused: GitHub CLI authentication is unavailable."
}
$login = "$loginResult".Trim()
if ($login -cne $expectedLogin) {
  throw "Release refused: GitHub login must be exactly '$expectedLogin' (current: '$login')."
}

$remote = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $remote -cne $expectedRemote) {
  throw "Release refused: origin must be exactly '$expectedRemote' (current: '$remote')."
}

$changes = @(git status --porcelain --untracked-files=all) | Where-Object {
  $_ -notmatch '^\?\? (AGENTS\.md|CLAUDE\.md)$'
}
if ($changes.Count -gt 0) {
  throw "Release refused: commit the intended changes first.`n$($changes -join "`n")"
}

if (-not $SkipQualityChecks) {
  Invoke-Checked "pnpm" @("check")
}

$sha = (& git rev-parse HEAD).Trim()
$askPass = Join-Path ([IO.Path]::GetTempPath()) "xportal-github-$([guid]::NewGuid()).cmd"
$previousAskPass = $env:GIT_ASKPASS
$previousTerminalPrompt = $env:GIT_TERMINAL_PROMPT

try {
  @'
@echo off
echo %~1 | findstr /i "Username" >nul
if %errorlevel% equ 0 (
  echo x-access-token
  exit /b 0
)
gh auth token
'@ | Set-Content -LiteralPath $askPass -Encoding Ascii
  $env:GIT_ASKPASS = $askPass
  $env:GIT_TERMINAL_PROMPT = "0"
  Invoke-Checked "git" @("-c", "credential.helper=", "push", "origin", "HEAD:main")
}
finally {
  $env:GIT_ASKPASS = $previousAskPass
  $env:GIT_TERMINAL_PROMPT = $previousTerminalPrompt
  Remove-Item -LiteralPath $askPass -Force -ErrorAction SilentlyContinue
}

$remoteMain = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
if ($remoteMain -ne $sha) {
  throw "GitHub verification failed: main is '$remoteMain', expected '$sha'."
}

$deadline = (Get-Date).AddSeconds($NetlifyTimeoutSeconds)
$netlifyUrl = $null
do {
  $checks = @(gh api "repos/Wolfoeden/app.x-portal/commits/$sha/check-runs" --jq '.check_runs[] | select(.app.slug == "netlify") | [.status, (.conclusion // ""), .details_url] | @tsv' 2>$null)
  $statuses = @(gh api "repos/Wolfoeden/app.x-portal/commits/$sha/status" --jq '.statuses[] | select(.context | test("netlify"; "i")) | [.state, .target_url] | @tsv' 2>$null)
  $failed = @($checks + $statuses) | Where-Object { $_ -match '^(completed\s+(failure|cancelled|timed_out)|failure\s)' }
  if ($failed.Count -gt 0) {
    throw "Netlify deployment failed: $($failed -join '; ')"
  }
  $successful = @($checks + $statuses) | Where-Object { $_ -match '^(completed\s+success|success\s)' } | Select-Object -First 1
  if ($successful) {
    $netlifyUrl = ($successful -split "\t")[-1]
    break
  }
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)

if (-not $netlifyUrl) {
  throw "Netlify did not report a successful deployment for $sha within $NetlifyTimeoutSeconds seconds."
}

foreach ($path in @("/home", "/chat", "/api/health")) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$productionUrl$path" -TimeoutSec 30
  if ($response.StatusCode -ne 200) {
    throw "Production smoke failed for $path with HTTP $($response.StatusCode)."
  }
}

Write-Host "Release complete"
Write-Host "GitHub: $expectedRemote@$sha"
Write-Host "Netlify: $netlifyUrl"
Write-Host "Production: $productionUrl/chat"
