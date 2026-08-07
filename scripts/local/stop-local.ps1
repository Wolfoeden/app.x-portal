[CmdletBinding()]
param(
  [int]$Port = 3001
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$processFile = Join-Path $repoPath '.local\server.pid'

$projectProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($repoPath)
})

$projectProcessIds = @($projectProcesses | ForEach-Object { [int]$_.ProcessId })
$rootProcesses = @($projectProcesses | Where-Object {
  $projectProcessIds -notcontains [int]$_.ParentProcessId
})

function Stop-ValidatedProcessTree {
  param([int]$TargetProcessId)

  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $TargetProcessId" -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    Stop-ValidatedProcessTree -TargetProcessId ([int]$child.ProcessId)
  }

  $target = Get-CimInstance Win32_Process -Filter "ProcessId = $TargetProcessId" -ErrorAction SilentlyContinue
  if ($target -and $target.CommandLine -and $target.CommandLine.Contains($repoPath)) {
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
  }
}

foreach ($rootProcess in $rootProcesses) {
  Stop-ValidatedProcessTree -TargetProcessId ([int]$rootProcess.ProcessId)
}

Start-Sleep -Milliseconds 500
$remainingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($remainingListener) {
  $ownerProcessId = @($remainingListener)[0].OwningProcess
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerProcessId" -ErrorAction SilentlyContinue
  if ($owner -and $owner.CommandLine -and $owner.CommandLine.Contains($repoPath)) {
    Stop-ValidatedProcessTree -TargetProcessId ([int]$ownerProcessId)
    Start-Sleep -Milliseconds 500
  }
}

if (Test-Path -LiteralPath $processFile) {
  Remove-Item -LiteralPath $processFile -Force
}

$remainingProjectProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($repoPath)
})
$remainingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($remainingProjectProcesses.Count -gt 0 -or $remainingListener) {
  throw 'The local app process could not be stopped completely.'
}

Write-Host "app.x-portal is stopped; port $Port is free."
