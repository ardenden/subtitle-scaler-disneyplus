# Regenerates icons/icon{16,48,128}.png.
#
# The mark is two stacked caption bars, the lower one larger and brighter —
# "text getting bigger" reads at 16px, where anything more detailed turns to
# mush. Run from the repo root:  powershell -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot '..\icons'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

foreach ($s in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # Backdrop
  $panel = New-RoundedPath 0 0 $s $s ([single]($s * 0.22))
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($s, $s)),
    [System.Drawing.Color]::FromArgb(255, 26, 32, 56),
    [System.Drawing.Color]::FromArgb(255, 12, 14, 26))
  $g.FillPath($grad, $panel)

  # Upper bar: smaller, dimmer
  $topH = [single][math]::Max(1, $s * 0.085)
  $topW = [single]($s * 0.42)
  $dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 232, 235, 242))
  $g.FillPath($dim, (New-RoundedPath ([single](($s - $topW) / 2)) ([single]($s * 0.30)) $topW $topH ([single]($topH / 2))))

  # Lower bar: larger, accent
  $botH = [single][math]::Max(2, $s * 0.155)
  $botW = [single]($s * 0.66)
  $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 74, 125, 255))
  $g.FillPath($accent, (New-RoundedPath ([single](($s - $botW) / 2)) ([single]($s * 0.53)) $botW $botH ([single]($botH / 2))))

  $g.Dispose()
  $bmp.Save((Join-Path $dir "icon$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "icon$s.png"
}
