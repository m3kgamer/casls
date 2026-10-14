# Tiny static web server for local use (no Node/Python needed). Started by start.bat.
param([int]$Port = 5173)
$Root = $PSScriptRoot
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
try { $l.Start() } catch { Write-Host "Port $Port is busy - the app may already be running at http://localhost:$Port/"; Start-Process "http://localhost:$Port/"; exit }
Write-Host "Smart Calorie Tracker running at http://localhost:$Port/  (close this window to stop)"
Start-Process "http://localhost:$Port/"
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png' }
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
    if ($p -eq '/') { $p = '/index.html' }
    $f = Join-Path $Root ($p.TrimStart('/') -replace '/', '\')
    if ((Test-Path $f -PathType Leaf) -and ((Resolve-Path $f).Path.StartsWith($Root))) {
      $b = [IO.File]::ReadAllBytes($f)
      $c.Response.ContentType = $types[[IO.Path]::GetExtension($f).ToLower()]
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
