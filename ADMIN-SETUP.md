# 여명철학 관리자

운영자는 `/admin/` 한 곳에서 도서·PDF·가격·그로블 주소·YouTube 샘플강의 링크를 관리합니다. 현재 운영 구조는 Cloudflare Pages + Pages Functions, D1(`yeomyeong-db`), Bunny Storage(`yeomyeong-pdf`), Groble 결제입니다. 운영정보 저장에는 코드 변경이나 재배포가 필요하지 않습니다.

## 인증

- `/admin/`에서 관리자 비밀번호를 입력하면 `POST /api/admin-login`이 Pages 환경변수 `READER_UPLOAD_KEY` 값과 비교합니다.
- 맞으면 `ym_admin_session` 쿠키(HttpOnly·Secure·SameSite=Strict, 7일)를 발급합니다. 쿠키 서명에도 `READER_UPLOAD_KEY`를 사용하므로 이 값을 바꾸면 기존 로그인은 모두 풀립니다.
- 로그인 여부 확인은 `GET /api/reader?mode=admin-status`만 사용합니다. D1·Bunny를 조회하지 않으므로 저장소 문제가 있어도 로그인 자체는 정상으로 표시되고, 도서 목록 오류나 PDF 상태 확인 불가는 관리 화면 안에서 따로 안내합니다.
- 쿠키는 접속한 주소에만 적용됩니다. 배포별 미리보기 주소, staging 주소, 운영 도메인은 각각 따로 로그인해야 합니다.
- Cloudflare Pages의 환경변수는 이미 만들어진 배포에 소급되지 않습니다. Preview 또는 Production에 값을 추가·변경한 뒤에는 해당 브랜치를 다시 배포해야 적용됩니다. 이 경우 로그인 화면에 "관리자 비밀번호가 이 배포에 적용되지 않았습니다"가 표시됩니다.

## 필요한 Pages 환경변수(Preview·Production 각각)

- `READER_UPLOAD_KEY`: 관리자 비밀번호 겸 세션 서명 키
- `BUNNY_STORAGE_KEY`: 비공개 PDF 저장소 접근 키. 없으면 관리 화면에 "PDF 상태 확인 불가"가 표시되고 열람·결제 시작이 되지 않습니다.
- `GROBLE_WEBHOOK_SECRET`: 결제 웹훅 서명 확인

## 스테이징 변경·검수

사이트 코드 변경은 `staging`에서만 진행하고 `main`은 승인 없이 수정하지 않습니다. 이후 책 추가, PDF 교체, 가격/결제 주소 및 YouTube 링크 저장은 D1·Bunny에 바로 반영됩니다.

## 저장 위치

- 도서 운영정보: D1 `app_kv`의 `reader:catalog`
- 비공개 PDF: Bunny Storage `yeomyeong-pdf`의 `<도서코드>`
- 구매자 90일 열람권·웹훅 기록: D1 `app_kv`의 `entitlement:*`, `checkout:*` 등
- 표지: 공개 정적 이미지(`/assets/uploads/...`) 또는 HTTPS 이미지 주소

`netlify/` 폴더는 이전 Netlify 호스팅 기록으로 남겨 둔 것입니다.
