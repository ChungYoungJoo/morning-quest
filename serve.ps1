<#
    docs 폴더를 로컬에서 띄우는 작은 정적 서버 (PowerShell 기본 기능만 사용).

    이 PC에는 Node/Python이 없고, index.html 을 파일(file://)로 바로 열면
    ES 모듈이 CORS 때문에 막힙니다. 그래서 확인용으로 이 스크립트를 씁니다.

    사용법:
        .\serve.ps1              → http://localhost:8083 에서 열기
        .\serve.ps1 -Port 9000
    멈출 때는 Ctrl+C.
#>

param(
    [int]    $Port = 8083,
    [string] $Root = '',
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

if (-not $Root) {
    $base = $PSScriptRoot
    if (-not $base) { $base = (Get-Location).Path }
    $Root = Join-Path $base 'docs'
}
$Root = (Resolve-Path $Root).Path

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.ico'  = 'image/x-icon'
    '.webmanifest' = 'application/manifest+json'
}

$listener = New-Object Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    throw "포트 $Port 를 열지 못했습니다. 다른 포트로 시도하세요: .\serve.ps1 -Port 8083  ($($_.Exception.Message))"
}

Write-Host "아침 모험 로컬 서버: $prefix" -ForegroundColor Cyan
Write-Host "폴더: $Root"
Write-Host "멈추려면 Ctrl+C" -ForegroundColor DarkGray

if (-not $NoBrowser) { Start-Process $prefix | Out-Null }

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        # 요청 하나가 실패해도 서버는 계속 살아 있어야 한다.
        try {
            $relative = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
            if (-not $relative) { $relative = 'index.html' }
            $target = Join-Path $Root ($relative -replace '/', '\')
            # somi/ 처럼 폴더 주소면 그 안의 index.html 을 준다 (GitHub Pages 와 같은 동작)
            if (Test-Path $target -PathType Container) { $target = Join-Path $target 'index.html' }

            # 폴더 밖으로 나가는 경로(../) 차단
            $resolved = $null
            if (Test-Path $target -PathType Leaf) { $resolved = (Resolve-Path $target).Path }
            if ($resolved -and -not $resolved.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { $resolved = $null }

            # HEAD 는 헤더만 보내야 한다. 본문을 쓰면 Content-Length 위반으로 예외가 난다.
            $headOnly = ($req.HttpMethod -eq 'HEAD')

            if ($resolved) {
                $bytes = [IO.File]::ReadAllBytes($resolved)
                $ext = [IO.Path]::GetExtension($resolved).ToLower()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $res.StatusCode = 200
                $res.ContentType = $type
                $res.Headers.Add('Cache-Control', 'no-store')
                $res.ContentLength64 = $bytes.Length
                if (-not $headOnly) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
                Write-Host ("200 {0}" -f $relative) -ForegroundColor DarkGray
            } else {
                $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $relative")
                $res.StatusCode = 404
                $res.ContentType = 'text/plain; charset=utf-8'
                $res.ContentLength64 = $body.Length
                if (-not $headOnly) { $res.OutputStream.Write($body, 0, $body.Length) }
                Write-Host ("404 {0}" -f $relative) -ForegroundColor Yellow
            }
        } catch {
            Write-Host ("ERR {0}" -f $_.Exception.Message) -ForegroundColor Red
        } finally {
            try { $res.OutputStream.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host '서버를 멈췄습니다.'
}
