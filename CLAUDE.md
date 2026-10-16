# 여명철학 홈페이지 작업 규칙

여명철학출판사 전자책 판매·열람 사이트. Cloudflare Pages(+ Functions) · D1 `yeomyeong-db` · Bunny Storage `yeomyeong-pdf` · Groble 결제. 운영 도메인 https://여명철학.kr, 관리자 `/admin/`.

## 브랜치·배포
- 작업은 `staging`에서만 한다. `staging` 수정·커밋·push와 Preview 배포 확인은 승인 없이 진행한다.
- `main` merge/push, Production 배포·설정, DNS는 사용자의 명시적 승인 전에는 하지 않는다. PR도 만들지 않는다.
- staging Preview: https://staging.yeomyeong-philosophy.pages.dev (push하면 Cloudflare가 자동 배포)

## 먼저 물어봐야 하는 것
Secret·환경변수 추가/변경/삭제, 실제 D1 운영 데이터 변경, Bunny PDF 업로드·삭제·교체, Groble 상품·결제·환불 설정, 실제 결제, 판매정책·운영방향 변경, 새 시스템·DB·결제방식 도입.

## 외부 채널(블로그·유튜브·인스타그램 등)
- 글·제목·설명·해시태그 초안 작성은 승인 없이 한다. 홈페이지 도서 정보(제목·가격·판매 상태)와 맞춘다.
- 게시·수정·삭제·공개 전환 등 바깥에 노출되는 동작은 올리기 전에 최종 내용을 보여 주고 사용자 확인을 받은 뒤에만 한다. 결제·댓글·팔로우·메시지 발송은 하지 않는다.
- 브라우저는 사용자가 로그인해 둔 Chrome(Claude in Chrome)을 쓴다. 로그인 정보·비밀번호는 요구하거나 저장하지 않는다.
- 인스타그램은 자동 조작을 피하고 게시물 준비까지만 한다.

## 비밀값
- 비밀번호·Bunny 키·Groble Secret 값을 채팅으로 요구하거나 출력하지 않는다. 소스·GitHub에 저장하지 않는다.
- Secret 설정은 `node ops/cf.mjs secret-put <NAME> --env preview --from-clipboard`(사용자가 값을 복사해 둔 뒤)로만 한다. Wrangler는 `--env`를 빼면 Production에 적용하므로 직접 호출하지 말고 이 도구를 쓴다.

## 운영 도구 (ops/, 사이트 빌드에 포함되지 않음)
- `node ops/cf.mjs status` 최근 Preview/Production 배포, `secrets` Secret 이름 목록(값 없음)
- `node ops/cf.mjs redeploy-staging` → `node ops/cf.mjs wait-deploy` Secret 변경 후 재배포·결과 확인
- `node ops/check-site.mjs [주소]` 실제 사이트를 PC 1280 · 모바일 360/390으로 검수, API로 D1·Bunny 상태 구분
- 처음 설정: `ops/README.md`

## 작업 원칙
- 문제를 받으면 Preview 환경 차이인지 코드 버그인지 먼저 구분한다. 환경 문제는 보고하고, 코드 버그는 staging에서 고친다.
- 기존 구조 유지: 열람기(`reader.js`, `cms/reader-body.html`), 90일 열람권, `/api/reader` 결제 시작(`mode=checkout`, ref 부여), `/admin/` 비밀번호 로그인(`READER_UPLOAD_KEY`).
- 수정 후: `npm run build` · `npm test` · 360/390/1280 렌더링 확인 → staging push → 배포 확인 → `ops/check-site.mjs`.
- 공통 메뉴·푸터는 `_layout/*.html` 수정 후 `python3 _layout/build.py`.
- 상담 전화·상담 신청 유도 없음. 홈·메뉴는 전자책·패키지·샘플강의 중심.
- 보고는 수정한 것과 검증한 것만 짧게.
