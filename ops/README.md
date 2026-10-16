# 여명철학 로컬 운영 환경 (Windows)

클라우드 세션은 Cloudflare 계정과 실제 사이트에 접근할 수 없습니다. 내 PC의 Claude Code에서 Wrangler와 Playwright로 Pages 상태 확인, Preview Secret 설정, 실제 staging 화면 검수를 하기 위한 도구입니다. `ops/`는 사이트 빌드에 포함되지 않습니다.

## 처음 한 번

PowerShell을 열고 실행합니다.

```powershell
irm https://raw.githubusercontent.com/busang8997-bit/yeomyeong-philosophy/staging/ops/setup-windows.ps1 | iex
```

스크립트가 하는 일:
1. Git, Node 22 이상, Claude Code를 확인하고 없으면 설치합니다(winget·공식 설치 스크립트).
2. `%USERPROFILE%\yeomyeong-philosophy`에 저장소를 받고 `staging`을 체크아웃합니다. 이 PC에서 `main` push를 막는 hook을 설치합니다.
3. 사이트 빌드·테스트를 한 번 실행합니다.
4. `ops`에 Wrangler 4.151.1, Playwright 1.56.1을 설치합니다. Chrome이 있으면 그 Chrome으로 검수합니다.
5. **Cloudflare 로그인**: 브라우저가 열리면 승인합니다(처음 한 번). 토큰은 Wrangler가 PC 사용자 폴더에 보관하며 저장소에는 들어가지 않습니다.
6. Pages 프로젝트의 최근 배포와 Preview/Production Secret **이름**을 출력합니다.

끝나면 그 폴더에서 `claude`를 실행합니다. 규칙은 저장소의 `CLAUDE.md`, 허용·차단 명령은 `.claude/settings.json`에 있습니다.

## 자주 쓰는 명령

| 목적 | 명령 |
|---|---|
| 로그인 확인 | `node ops/cf.mjs whoami` |
| 최근 배포(Preview/Production) | `node ops/cf.mjs status` |
| Secret 이름 목록 | `node ops/cf.mjs secrets` |
| Preview Secret 설정 | 값을 복사한 뒤 `node ops/cf.mjs secret-put BUNNY_STORAGE_KEY --env preview --from-clipboard` |
| staging 재배포 | `node ops/cf.mjs redeploy-staging` |
| 배포 완료 대기·결과 | `node ops/cf.mjs wait-deploy` |
| 실제 사이트 검수 | `node ops/check-site.mjs` (기본: staging 주소) |

## Preview·Production 구분
- Wrangler 4.151.1의 `pages secret put/list`는 `--env preview|production`으로 환경을 고르고, **`--env`를 빼면 Production**에 적용합니다. 그래서 Secret은 `ops/cf.mjs`로만 다룹니다. 이 도구는 `--env`가 없으면 멈추고, Production은 사용자 승인 후 `YEOMYEONG_ALLOW_PRODUCTION=1`이 있어야만 진행합니다.
- 값은 화면·채팅·파일에 남지 않습니다. `--from-clipboard`는 클립보드 값을 Wrangler 입력으로 바로 넘깁니다.
- Secret은 이미 있는 배포에는 적용되지 않습니다. 바꾼 뒤 `redeploy-staging`이 필요합니다.

## 검수 결과 읽기
`check-site.mjs`는 API 응답으로 상태를 먼저 구분합니다.
- `session 503`: 열람·구매 확인 실패. 대부분 이 배포에서 Bunny 연결(BUNNY_STORAGE_KEY) 문제이며, `/admin/` 경고에 원인 코드가 나옵니다.
- `admin-status 401`: 정상(로그인 전). `503`이면 이 배포에 `READER_UPLOAD_KEY`가 없습니다.
- 각 페이지별 HTTP 상태, 가로 넘침, 콘솔 오류, 구매 버튼 존재·가려짐을 PC 1280 · 모바일 360/390에서 확인하고 스크린샷을 `ops/out/`에 남깁니다.
