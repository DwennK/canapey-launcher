$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$paths = New-Object System.Collections.Generic.List[string]
function Add-Candidate($path) {
  if ($path -and $paths.Count -lt 100) { $paths.Add([Environment]::ExpandEnvironmentVariables($path)) }
}
if ($env:CANAPEY_VACUUMTUBE_PATHS) { foreach ($p in (ConvertFrom-Json $env:CANAPEY_VACUUMTUBE_PATHS)) { Add-Candidate $p } }
foreach ($root in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
  if ($root) { Add-Candidate (Join-Path $root 'VacuumTube\VacuumTube.exe'); Add-Candidate (Join-Path $root 'Programs\VacuumTube\VacuumTube.exe') }
}
foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
  if (Test-Path $root) {
    foreach ($key in Get-ChildItem $root -ErrorAction SilentlyContinue) {
      try { if ($key.GetValue('DisplayName') -eq 'VacuumTube') {
        $location = $key.GetValue('InstallLocation')
        if ($location) { Add-Candidate (Join-Path $location 'VacuumTube.exe') }
        $icon = $key.GetValue('DisplayIcon')
        if ($icon -match '^"([^"]+\.exe)"(?:,\d+)?$') { Add-Candidate $Matches[1] }
        elseif ($icon -match '^(.+\.exe)(?:,\d+)?$') { Add-Candidate $Matches[1] }
      } } catch {}
    }
  }
}
$shell = New-Object -ComObject WScript.Shell
foreach ($root in @([Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'), [Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('CommonDesktopDirectory'))) {
  if ($root -and (Test-Path -LiteralPath $root)) {
    foreach ($link in (Get-ChildItem -LiteralPath $root -Filter '*VacuumTube*.lnk' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 30)) {
      try { Add-Candidate ($shell.CreateShortcut($link.FullName).TargetPath) } catch {}
    }
  }
}
$found = $null
foreach ($path in ($paths | Select-Object -Unique)) {
  try { if ([IO.Path]::GetFileName($path) -ieq 'VacuumTube.exe' -and (Test-Path -LiteralPath $path -PathType Leaf)) {
    $found = (Get-Item -LiteralPath $path).FullName; break
  } } catch {}
}
ConvertTo-Json -InputObject $found -Compress
