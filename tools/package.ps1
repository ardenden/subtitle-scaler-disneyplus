# Builds the Chrome Web Store upload zip into dist/.
#
#   powershell -File tools/package.ps1
#
# Entries are written with forward slashes and manifest.json sits at the root —
# Compress-Archive on Windows PowerShell 5.1 emits backslash separators, which
# the ZIP spec doesn't allow, and a nested manifest is the classic first-upload
# rejection.

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

$zipPath = Join-Path $dist "subtitle-scaler-$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Only what the extension needs at runtime. No README, test/, tools/ or .git.
$include = @('manifest.json', 'LICENSE') + `
  (Get-ChildItem (Join-Path $root 'src') -File | ForEach-Object { "src/$($_.Name)" }) + `
  (Get-ChildItem (Join-Path $root 'icons') -File -Filter *.png | ForEach-Object { "icons/$($_.Name)" })

$stream = [System.IO.File]::Create($zipPath)
$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($rel in $include) {
    $full = Join-Path $root ($rel -replace '/', '\')
    $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $out = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $out.Write($bytes, 0, $bytes.Length)
    $out.Dispose()
    Write-Output "  + $rel"
  }
}
finally {
  $archive.Dispose()
  $stream.Dispose()
}

"{0}  ({1:N0} bytes)" -f $zipPath, (Get-Item $zipPath).Length
