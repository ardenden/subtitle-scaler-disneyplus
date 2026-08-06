# Generates assets/chrome-web-store-badge.png — a store-button style badge for
# the README, in the vein of the App Store / Microsoft Store buttons.
#
#   powershell -File tools/make-store-badge.ps1
#
# Google's own badge assets aren't publicly hotlinkable (they 403), so this is
# drawn locally and committed. It uses this extension's own mark rather than
# Chrome's logo, which avoids trading on someone else's branding; the store name
# appears as text, which is ordinary nominative use.
#
# Rendered at 2x and displayed at half size, so it stays sharp on HiDPI screens.

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\assets'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$S = 2                      # scale factor
$H = 58 * $S
$TX = 54 * $S               # text left edge
$PAD_R = 18 * $S            # right padding, matched to the icon's left margin
# Width is measured from the text rather than guessed, so the right padding
# always matches the left regardless of the wording or font metrics.

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

# Typographic formatting removes the extra padding DrawString adds by default,
# so what's measured is what's drawn.
$fmt = [System.Drawing.StringFormat]::GenericTypographic
$small = New-Object System.Drawing.Font('Segoe UI', (8.5 * $S), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$large = New-Object System.Drawing.Font('Segoe UI Semibold', (15 * $S), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

$probe = [System.Drawing.Graphics]::FromImage((New-Object System.Drawing.Bitmap(1, 1)))
$probe.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$wSmall = $probe.MeasureString('Download from the', $small, [int]::MaxValue, $fmt).Width
$wLarge = $probe.MeasureString('Chrome Web Store', $large, [int]::MaxValue, $fmt).Width
$probe.Dispose()

$W = [int][Math]::Ceiling($TX + [Math]::Max($wSmall, $wLarge) + $PAD_R)

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# Body + hairline border
$body = New-RoundedPath 1 1 ($W - 2) ($H - 2) (10 * $S)
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 26, 30, 42))), $body)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 58, 68, 89)), (1 * $S)
$g.DrawPath($pen, $body)

# The extension's mark: two caption bars, lower one larger and accented
$ix = 18 * $S; $iy = 17 * $S; $iw = 24 * $S
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 232, 235, 242))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 74, 125, 255))
$g.FillPath($dim, (New-RoundedPath ($ix + $iw * 0.28) $iy ($iw * 0.44) (3 * $S) (1.5 * $S)))
$g.FillPath($accent, (New-RoundedPath $ix ($iy + 9 * $S) $iw (6 * $S) (3 * $S)))

# Wordmark
$greyText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 176, 185, 204))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

# The upper line is shorter than the lower one, which leaves an obvious hole in
# the top-right corner. Track it out to the same width — the same trick the App
# Store and Microsoft Store badges use — so the block reads as a unit.
function Write-Tracked($graphics, $text, $font, $brush, $x, $y, $targetWidth, $format) {
  $chars = $text.ToCharArray()
  $natural = 0.0
  $widths = @()
  foreach ($ch in $chars) {
    $w = $graphics.MeasureString([string]$ch, $font, [int]::MaxValue, $format).Width
    $widths += $w
    $natural += $w
  }
  $gaps = [Math]::Max($chars.Length - 1, 1)
  $extra = [Math]::Max($targetWidth - $natural, 0) / $gaps
  $cursor = [single]$x
  for ($i = 0; $i -lt $chars.Length; $i++) {
    $graphics.DrawString([string]$chars[$i], $font, $brush, $cursor, $y, $format)
    $cursor += $widths[$i] + $extra
  }
}

Write-Tracked $g 'Download from the' $small $greyText $TX (14 * $S) $wLarge $fmt
$g.DrawString('Chrome Web Store', $large, $white, $TX, (26 * $S), $fmt)

$g.Dispose()
$out = Join-Path $outDir 'chrome-web-store-badge.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

"{0}  ({1}x{2}, display at {3}x{4})" -f $out, $W, $H, ($W / $S), ($H / $S)
