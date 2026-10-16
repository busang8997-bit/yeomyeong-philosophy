# 여명철학 로컬 운영 환경 준비 (Windows PowerShell)
# 처음 한 번 실행:
#   irm https://raw.githubusercontent.com/busang8997-bit/yeomyeong-philosophy/staging/ops/setup-windows.ps1 | iex
# 이미 저장소가 있으면 그 폴더에서:
#   powershell -ExecutionPolicy Bypass -File ops\setup-windows.ps1
#
# 하는 일: Git·Node·Claude Code 점검(없으면 설치) → 저장소 준비(staging) → 운영 도구 설치
#          → Cloudflare 로그인(처음 한 번 브라우저 승인) → 프로젝트·배포·Secret 이름 점검
# 하지 않는 일: main 변경, Production 변경, Secret 값 입력·저장

$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/busang8997-bit/yeomyeong-philosophy.git'
$Dir = Join-Path $HOME 'yeomyeong-philosophy'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Has($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
function NeedWinget { if (-not (Has winget)) { throw 'winget이 없습니다. Microsoft Store에서 "앱 설치 관리자"를 설치한 뒤 다시 실행하세요.' } }

Step '1. 필수 프로그램 점검'
if (-not (Has git)) { NeedWinget; winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements; RefreshPath }
$nodeMajor = 0
if (Has node) { $nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0]) }
if ($nodeMajor -lt 22) { NeedWinget; winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements; RefreshPath }
if (-not (Has claude)) { Write-Host 'Claude Code 설치 중…'; Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression; RefreshPath }
Write-Host ("git    : " + (git --version))
Write-Host ("node   : " + (node -v))
Write-Host ("claude : " + $(if (Has claude) { (claude --version) } else { '설치 후 새 터미널에서 확인 필요' }))

Step '2. 저장소 준비 (staging)'
if (-not (Test-Path (Join-Path $Dir '.git'))) { git clone $Repo $Dir }
Set-Location $Dir
git fetch origin staging main
$dirty = git status --porcelain
if ($dirty) { Write-Host '커밋하지 않은 변경이 있어 브랜치는 바꾸지 않습니다.' -ForegroundColor Yellow }
else {
  git checkout -B staging origin/staging | Out-Null
  git branch --set-upstream-to=origin/staging staging | Out-Null
}
Write-Host ("현재 브랜치: " + (git rev-parse --abbrev-ref HEAD) + " @ " + (git rev-parse --short HEAD))
# main에 실수로 push하지 않도록 이 PC의 저장소에서 main push를 막는다(승인 후에는 .git\hooks\pre-push 를 지운다).
$hook = Join-Path $Dir '.git\hooks\pre-push'
@'
#!/bin/sh
# 여명철학: main/Production은 사용자 승인 전 push 금지
while read local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in refs/heads/main) echo "main push 차단: 사용자 승인 후 이 hook을 지우고 진행하세요." >&2; exit 1;; esac
done
exit 0
'@ | Set-Content -Path $hook -Encoding ascii -NoNewline

Step '3. 사이트 빌드·테스트 확인'
npm run build
npm test

Step '4. 운영 도구 설치 (ops: Wrangler, Playwright)'
Push-Location ops
npm install --no-audit --no-fund
$chrome = Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not $chrome) { npx playwright install chromium }
Pop-Location

Step '5. Cloudflare 로그인 (처음 한 번만 브라우저에서 승인)'
Push-Location ops
node node_modules/wrangler/bin/wrangler.js whoami --json *> $null
if ($LASTEXITCODE -ne 0) { node node_modules/wrangler/bin/wrangler.js login }
Pop-Location
node ops/cf.mjs whoami

Step '6. Pages 프로젝트 점검 (읽기 전용)'
node ops/cf.mjs status
node ops/cf.mjs secrets

Step '완료'
Write-Host "저장소 폴더: $Dir"
Write-Host '다음: 이 폴더에서 claude 를 실행하고 "여명철학 작업 이어서 진행" 이라고 입력하세요. 규칙은 CLAUDE.md에 있습니다.'
Write-Host 'GitHub push 시 처음 한 번 브라우저 로그인 창이 뜰 수 있습니다(Git Credential Manager).'
