$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$public = Join-Path $PSScriptRoot '..\public'
$source = [System.Drawing.Image]::FromFile((Join-Path $public 'fresa-master-emblem.png'))
try {
    foreach ($variant in @(
        @{ Size = 180; Name = 'app-icon-180.png'; Scale = 0.88 },
        @{ Size = 192; Name = 'app-icon-192.png'; Scale = 0.88 },
        @{ Size = 512; Name = 'app-icon-512.png'; Scale = 0.88 },
        @{ Size = 512; Name = 'app-icon-maskable-512.png'; Scale = 0.70 }
    )) {
        $size = $variant.Size
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#0b1833'))
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $height = [int]($size * $variant.Scale)
            $width = [int]($height * $source.Width / $source.Height)
            $graphics.DrawImage($source, [int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
            $bitmap.Save((Join-Path $public $variant.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $source.Dispose()
}
