$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
$shell = New-Object -ComObject WScript.Shell
$rows = New-Object System.Collections.Generic.List[object]
$cache = $env:CANAPEY_ICON_CACHE
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Add-App($name, $kind, $value, $arguments, $cwd, $source) {
  if (!$value -or !$name -or $rows.Count -ge 1500) { return }
  if ($name -match '(?i)uninstall|désinstaller|desinstaller|redistributable|crash reporter') { return }
  $icon = $null
  if ($kind -eq 'executable' -and (Test-Path -LiteralPath $value -PathType Leaf)) {
    try {
      $sha = [Security.Cryptography.SHA256]::Create()
      $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value.ToLowerInvariant()))).Replace('-','')
      $sha.Dispose()
      $dest = Join-Path $cache "$hash.png"
      if (!(Test-Path -LiteralPath $dest)) {
        $ico = [Drawing.Icon]::ExtractAssociatedIcon($value)
        if ($ico) { $bmp = $ico.ToBitmap(); $bmp.Save($dest,[Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $ico.Dispose() }
      }
      if (Test-Path -LiteralPath $dest) { $icon = $dest }
    } catch {}
  }
  $rows.Add([PSCustomObject]@{name=$name;kind=$kind;value=$value;rawArguments=$arguments;workingDir=$cwd;source=$source;icon=$icon})
}
$roots = @([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'),[Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('CommonDesktopDirectory')) | Select-Object -Unique
$links = @()
if ($env:CANAPEY_SINGLE_LINK) { $links = @(Get-Item -LiteralPath $env:CANAPEY_SINGLE_LINK) }
else { foreach ($root in $roots) { if ($root -and (Test-Path -LiteralPath $root)) { $links += Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 600 } } }
foreach ($file in $links) {
  try {
    $link = $shell.CreateShortcut($file.FullName)
    $target = [Environment]::ExpandEnvironmentVariables($link.TargetPath)
    if ($target -and $target.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)) {
      Add-App $file.BaseName 'executable' $target $link.Arguments $link.WorkingDirectory 'Raccourci Windows'
    } else { Add-App $file.BaseName 'shortcut' $file.FullName '' '' 'Raccourci Windows' }
  } catch {}
}
if (!$env:CANAPEY_SINGLE_LINK) {
  foreach ($reg in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths')) {
    if (Test-Path $reg) { foreach ($key in Get-ChildItem $reg -ErrorAction SilentlyContinue) { try { $p=$key.GetValue(''); if ($p) { $p=$p.Trim('"'); Add-App ([IO.Path]::GetFileNameWithoutExtension($key.PSChildName)) 'executable' $p '' '' 'Application enregistrée' } } catch {} } }
  }
  $packages = @(Get-AppxPackage -ErrorAction SilentlyContinue)
  foreach ($app in Get-StartApps -ErrorAction SilentlyContinue) {
    if ($app.AppID -like '*!*') {
      Add-App $app.Name 'packaged' $app.AppID '' '' 'Microsoft Store'
      try {
        $family = ($app.AppID -split '!')[0]
        $package = $packages | Where-Object PackageFamilyName -eq $family | Select-Object -First 1
        if ($package) {
          $manifest = Get-AppxPackageManifest $package -ErrorAction Stop
          $application = $manifest.Package.Applications.Application | Where-Object Id -eq (($app.AppID -split '!')[1]) | Select-Object -First 1
          $logo = $application.VisualElements.Square44x44Logo
          if ($logo) {
            $source = Join-Path $package.InstallLocation $logo
            if (!(Test-Path -LiteralPath $source)) {
              $dir = Split-Path $source; $stem = [IO.Path]::GetFileNameWithoutExtension($source)
              $source = (Get-ChildItem -LiteralPath $dir -Filter "$stem*.png" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
            }
            if ($source -and (Test-Path -LiteralPath $source)) {
              $dest = Join-Path $cache (($app.AppID -replace '[^a-zA-Z0-9_-]','_')+'.png')
              Copy-Item -LiteralPath $source -Destination $dest -Force
              $rows[$rows.Count-1].icon = $dest
            }
          }
        }
      } catch {}
    }
  }
}
ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 4 -Compress
