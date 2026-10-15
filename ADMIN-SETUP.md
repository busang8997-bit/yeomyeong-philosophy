# 여명철학 관리자

운영자는 `https://여명철학.kr/admin/` 한 곳에서 GitHub 로그인 후 도서·PDF·가격·그로블 주소·YouTube 샘플 영상 링크를 관리합니다. PDF와 운영 상품 정보는 Netlify Blobs의 비공개 저장소를 사용합니다. 이 운영정보를 저장할 때 코드 변경이나 재배포는 발생하지 않습니다.

## 인증

관리자 로그인은 기존 Decap/GitHub OAuth를 이용합니다. 로그인 토큰은 관리자 페이지의 기존 로그인 세션에만 보관되고, Netlify 함수가 GitHub 계정의 여명철학 저장소 쓰기 권한을 검증한 다음 8시간 운영 세션을 발급합니다. `READER_UPLOAD_KEY`는 함수 내부의 세션 서명에 쓰며 관리자 화면에서 입력하거나 저장하지 않습니다.

## 스테이징 변경·검수

사이트 코드 변경은 `staging`에서만 진행하고 GitHub의 `main`은 승인 없이 수정하지 않습니다. 코드 변경이 반영될 때 한 번 배포가 필요하지만, 이후 책 추가, PDF 교체, 가격/결제 주소 및 YouTube 링크 저장은 운영 저장소에 바로 반영됩니다.

## 저장과 복구

- 도서 운영정보: Netlify Blobs의 `reader:catalog`
- 비공개 PDF: Netlify Blobs의 `pdf:<도서코드>`
- 구매자의 90일 entitlement 및 webhook 기록: 기존 `yeomyeong-reader-access-*` 저장소 항목
- 표지 주소: 공개 정적 이미지 또는 HTTPS 이미지 주소

PDF 교체는 동일 도서의 현재 파일을 업로드 완료 시점에 교체합니다. 책 정보 저장은 카탈로그 전체를 갱신하므로 관리자 화면을 한 번에 저장하고, 필요하면 GitHub 저장소의 staging에서 코드 변경 이력을 확인합니다.
