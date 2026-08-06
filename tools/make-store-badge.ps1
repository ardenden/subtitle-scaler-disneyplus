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

# Two independent knobs:
#   $D  how large the button appears in the README — raise to make it bigger
#   $S  supersampling for HiDPI; the PNG renders at $S times display size
$D = 1
$S = 2
$U = $D * $S                # design unit -> pixels

$H = [int](58 * $U)
$TX = 54 * $U               # text left edge
$PAD_R = 18 * $U            # right padding, matched to the icon's left margin
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
$small = New-Object System.Drawing.Font('Segoe UI', (10.5 * $U), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$large = New-Object System.Drawing.Font('Segoe UI Semibold', (19 * $U), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

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
$body = New-RoundedPath 1 1 ($W - 2) ($H - 2) (10 * $U)
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 26, 30, 42))), $body)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 58, 68, 89)), (1 * $U)
$g.DrawPath($pen, $body)

# The extension's mark: two caption bars, lower one larger and accented
$ix = 18 * $U; $iy = 17 * $U; $iw = 24 * $U
$dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 232, 235, 242))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 74, 125, 255))
$g.FillPath($dim, (New-RoundedPath ($ix + $iw * 0.28) $iy ($iw * 0.44) (3 * $U) (1.5 * $U)))
$g.FillPath($accent, (New-RoundedPath $ix ($iy + 9 * $U) $iw (6 * $U) (3 * $U)))

# Wordmark
$greyText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 176, 185, 204))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

$g.DrawString('Download from the', $small, $greyText, $TX, (11 * $U), $fmt)
$g.DrawString('Chrome Web Store', $large, $white, $TX, (25 * $U), $fmt)

$g.Dispose()
$out = Join-Path $outDir 'chrome-web-store-badge.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

"{0}  ({1}x{2}, display at {3}x{4})" -f $out, $W, $H, ($W / $S), ($H / $S)
