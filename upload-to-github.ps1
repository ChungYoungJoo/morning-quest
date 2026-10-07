<#
    아침 모험 배포 스크립트

    회사 네트워크가 git push / 웹 업로드를 막기 때문에 GitHub Contents API(JSON PUT)로
    파일을 하나씩 올립니다. 요청 본문에 한계(~45KB)가 있어 큰 파일은 미리 걸러 경고합니다.

    사용법:
        .\upload-to-github.ps1
        .\upload-to-github.ps1 -Message "질문 추가"
        .\upload-to-github.ps1 -WhatIf          # 무엇이 올라갈지만 확인

    토큰: GitHub > Settings > Developer settings > Personal access tokens
          (Fine-grained 이면 이 저장소에 Contents: Read and write 권한)
          환경변수 GITHUB_TOKEN 이 있으면 그것을 쓰고, 없으면 물어봅니다.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]   $Owner   = 'ChungYoungJoo',
    [string]   $Repo    = 'morning-quest',
    [string]   $Branch  = 'main',
    [string[]] $Paths   = @('docs', 'README.md', 'serve.ps1', 'upload-to-github.ps1'),
    [string]   $Message = '',
    [switch]   $NoRepoSetup   # 저장소 생성 / Pages 설정을 건너뛴다
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MaxBytes = 30KB   # base64로 부풀면 ~40KB. 회사 프록시의 본문 한계(~45KB) 아래로 유지.
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

# ---------- 토큰 ----------
function Get-Token {
    if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN.Trim() }
    $secure = Read-Host -Prompt 'GitHub 토큰 붙여넣기' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    # 붙여넣을 때 딸려오는 제어문자/공백 제거
    return ($plain -replace '[^\x21-\x7E]', '')
}

# ---------- git 이 계산하는 것과 같은 blob SHA1 (바뀐 파일만 올리기 위해) ----------
function Get-GitBlobSha {
    param([byte[]] $Bytes)
    $header = [Text.Encoding]::ASCII.GetBytes("blob $($Bytes.Length)`0")
    $buffer = New-Object byte[] ($header.Length + $Bytes.Length)
    [Array]::Copy($header, 0, $buffer, 0, $header.Length)
    [Array]::Copy($Bytes, 0, $buffer, $header.Length, $Bytes.Length)
    $sha1 = [Security.Cryptography.SHA1]::Create()
    try {
        return (($sha1.ComputeHash($buffer) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha1.Dispose()
    }
}

function Invoke-GitHub {
    param(
        [string] $Method,
        [string] $Url,
        [string] $Token,
        [string] $Body
    )
    $headers = @{
        Authorization          = "Bearer $Token"
        Accept                 = 'application/vnd.github+json'
        'User-Agent'           = 'morning-quest-uploader'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
    try {
        if ($Body) {
            # PowerShell 5.1 은 문자열 본문을 UTF-8 로 보내지 않아(한글·가운뎃점 등이 깨져 400) 바이트로 직접 인코딩한다.
            $utf8 = [Text.Encoding]::UTF8.GetBytes($Body)
            return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body $utf8 -ContentType 'application/json; charset=utf-8'
        }
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int] $_.Exception.Response.StatusCode }
        if ($status -eq 404) { return $null }
        if ($status -eq 401) { throw '토큰이 잘못됐거나 만료됐습니다. 새 토큰을 발급해 다시 시도하세요. (401)' }
        if ($status -eq 403) { throw "토큰 권한이 모자랍니다. classic 토큰이면 'repo' 스코프가 필요합니다. (403)" }
        throw "GitHub $Method $Url 실패 (HTTP $status): $($_.Exception.Message)"
    }
}

# ---------- 저장소 / Pages 준비 ----------
function Initialize-Repo {
    param([string] $Token)

    $repoUrl = "https://api.github.com/repos/$Owner/$Repo"
    $info = Invoke-GitHub -Method 'GET' -Url $repoUrl -Token $Token
    if (-not $info) {
        Write-Host "저장소 $Owner/$Repo 가 없어 새로 만듭니다..." -ForegroundColor Yellow
        $body = @{
            name        = $Repo
            description = '아침 모험 - 소미와 소빈의 아침 습관 앱'
            private     = $false      # GitHub Pages 무료 사용은 public 저장소여야 한다
            auto_init   = $true       # main 브랜치를 만들어 둔다 (파일 업로드의 전제)
        } | ConvertTo-Json -Compress
        $info = Invoke-GitHub -Method 'POST' -Url 'https://api.github.com/user/repos' -Token $Token -Body $body
        if (-not $info) { throw "저장소를 만들지 못했습니다. 토큰 권한(classic: repo)을 확인하세요." }
        Write-Host "  + 저장소 생성됨: $($info.html_url)" -ForegroundColor Green
        Start-Sleep -Seconds 2   # 첫 커밋이 만들어질 때까지 잠깐
    }
}

function Initialize-Pages {
    param([string] $Token)

    $pagesUrl = "https://api.github.com/repos/$Owner/$Repo/pages"
    $pages = Invoke-GitHub -Method 'GET' -Url $pagesUrl -Token $Token
    $wanted = @{ source = @{ branch = $Branch; path = '/docs' } } | ConvertTo-Json -Compress

    if (-not $pages) {
        try {
            Invoke-GitHub -Method 'POST' -Url $pagesUrl -Token $Token -Body $wanted | Out-Null
            Write-Host "  + GitHub Pages 켜짐 ($Branch /docs)" -ForegroundColor Green
        } catch {
            Write-Warning "Pages 자동 설정 실패. 저장소 Settings > Pages 에서 Branch=$Branch, Folder=/docs 로 직접 지정하세요."
        }
        return
    }

    if ($pages.source.path -ne '/docs' -or $pages.source.branch -ne $Branch) {
        try {
            Invoke-GitHub -Method 'PUT' -Url $pagesUrl -Token $Token -Body $wanted | Out-Null
            Write-Host "  + GitHub Pages 경로 수정됨 ($Branch /docs)" -ForegroundColor Green
        } catch {
            Write-Warning "Pages 설정을 바꾸지 못했습니다. Settings > Pages 를 확인하세요."
        }
    }
}

# ---------- 올릴 파일 모으기 ----------
$files = @()
foreach ($p in $Paths) {
    $full = Join-Path $root $p
    if (-not (Test-Path $full)) { Write-Warning "건너뜀 (없음): $p"; continue }
    if (Test-Path $full -PathType Container) {
        $files += Get-ChildItem $full -Recurse -File
    } else {
        $files += Get-Item $full
    }
}

if (-not $files) { Write-Host '올릴 파일이 없습니다.' -ForegroundColor Yellow; return }

$rootPrefix = $root.TrimEnd('\') + '\'
$token = Get-Token
if (-not $token) { throw '토큰이 비어 있습니다.' }

if (-not $Message) { $Message = "update from morning-quest uploader ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))" }

if (-not $NoRepoSetup) { Initialize-Repo -Token $token }

$uploaded = 0; $skipped = 0; $failed = 0

foreach ($file in $files) {
    $relative = $file.FullName.Substring($rootPrefix.Length).Replace('\', '/')
    $bytes = [IO.File]::ReadAllBytes($file.FullName)

    if ($bytes.Length -gt $MaxBytes) {
        Write-Warning ("{0} — {1:N0} bytes. 회사 프록시 한계에 걸릴 수 있어 건너뜁니다. 파일을 나누세요." -f $relative, $bytes.Length)
        $failed++
        continue
    }

    $apiUrl = "https://api.github.com/repos/$Owner/$Repo/contents/$relative"
    $existing = Invoke-GitHub -Method 'GET' -Url "${apiUrl}?ref=$Branch" -Token $token

    $localSha = Get-GitBlobSha -Bytes $bytes
    if ($existing -and $existing.sha -eq $localSha) {
        Write-Host ("  = {0}" -f $relative) -ForegroundColor DarkGray
        $skipped++
        continue
    }

    if (-not $PSCmdlet.ShouldProcess($relative, 'upload')) { continue }

    $payload = @{
        message = $Message
        content = [Convert]::ToBase64String($bytes)
        branch  = $Branch
    }
    if ($existing) { $payload.sha = $existing.sha }

    try {
        $json = $payload | ConvertTo-Json -Compress
        Invoke-GitHub -Method 'PUT' -Url $apiUrl -Token $token -Body $json | Out-Null
        Write-Host ("  + {0}  ({1:N0} bytes)" -f $relative, $bytes.Length) -ForegroundColor Green
        $uploaded++
    } catch {
        Write-Host ("  ! {0} — {1}" -f $relative, $_) -ForegroundColor Red
        $failed++
    }
}

if (-not $NoRepoSetup) { Initialize-Pages -Token $token }

Write-Host ''
Write-Host ("올림 {0} / 그대로 {1} / 실패 {2}" -f $uploaded, $skipped, $failed) -ForegroundColor Cyan
Write-Host ("배포 주소: https://{0}.github.io/{1}/" -f $Owner.ToLower(), $Repo)
Write-Host '(첫 배포는 1~2분쯤 걸립니다. 404가 뜨면 잠시 뒤 새로고침하세요.)' -ForegroundColor DarkGray
