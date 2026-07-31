# Conforms screenshots to Chrome Web Store requirements: exactly 1280x800 (or
# 640x400), 24-bit PNG with no alpha channel. Windows capture tools save 32-bit
# ARGB, and region captures are routinely a pixel or two off — both are rejected
# with a bare "An unknown error occurred".
#
#   powershell -File tools/fix-screenshots.ps1 "C:\path\to\screenshots"
#
# Originals are left alone; results land in a "ready" subfolder.

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$Width = 1280,
  [int]$Height = 800
)

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $Path 'ready'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$n = 0
# -Include needs a wildcard in the path to match anything, so filter explicitly.
Get-ChildItem $Path -File | Where-Object { $_.Extension -match '^\.(png|jpe?g)$' } | ForEach-Object {
  $src = [System.Drawing.Image]::FromFile($_.FullName)

  # Scale down only if it overflows, preserving aspect; then centre on a black
  # canvas. Padding a dark screenshot with black is invisible, and never
  # distorts the image the way a straight stretch to 1280x800 would.
  $scale = [Math]::Min([Math]::Min($Width / $src.Width, $Height / $src.Height), 1.0)
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  $x = [int](($Width - $w) / 2)
  $y = [int](($Height - $h) / 2)

  # Format24bppRgb is what drops the alpha channel.
  $dst = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.Clear([System.Drawing.Color]::Black)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, $x, $y, $w, $h)
  $g.Dispose()

  $out = Join-Path $outDir ($_.BaseName + '.png')
  $dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  "{0}  ->  {1}x{2}  24-bit  (source {3}x{4})" -f $_.Name, $dst.Width, $dst.Height, $src.Width, $src.Height
  $dst.Dispose()
  $src.Dispose()
  $n++
}

"`n$n file(s) written to $outDir"
