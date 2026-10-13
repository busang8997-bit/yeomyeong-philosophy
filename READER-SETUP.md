# 여명철학 전자책 열람 설정 (staging)

다섯 권의 전자책은 한 열람 화면을 사용하며, 책별 결제가 확인되면 같은 브라우저에 90일 열람 권한을 부여합니다. 원본 PDF는 공개 GitHub 저장소와 `dist`에 포함하지 않고 Netlify Blobs 비공개 저장소에 넣습니다.

## Netlify 환경 변수

여명철학 staging 프로젝트 `singular-rabanadas-bdad1a`에 다음 변수를 등록합니다. 운영 프로젝트나 다른 사이트에는 등록하지 않습니다.

- `GROBLE_WEBHOOK_SECRET`: 그로블 웹훅 서명 검증에 사용할 시크릿
- `READER_UPLOAD_KEY`: 관리자 PDF 업로드 화면에서 쓸 별도의 긴 비밀번호

비밀 값은 GitHub, CMS, 공개 HTML에 저장하지 않습니다.

## 그로블 웹훅

- 주소: `https://staging--singular-rabanadas-bdad1a.netlify.app/.netlify/functions/groble-webhook`
- 수신 이벤트: `payment.completed`, `payment.refunded`
- 결제 링크는 상품별로 만들고, `sellerReference` 값을 웹훅 결제 정보에 그대로 돌려보내도록 설정합니다.
- Groble 서명 검증이 켜져 있어야 하며, 결제 성공만 권한을 부여합니다. 환불 이벤트는 해당 결제의 권한을 회수합니다.

## 전자책 원고 등록 및 상품 연결

1. Netlify에 변수를 저장한 뒤 staging 배포를 완료합니다.
2. staging의 `/reader-upload.html`에서 책을 선택하고 해당 PDF와 `READER_UPLOAD_KEY`를 입력해 책마다 등록합니다. 업로드는 작은 조각으로 전송되며 파일은 비공개 Blobs 저장소에만 기록됩니다.
3. 관리자 CMS의 상품별 그로블 결제 URL을 등록하고 상태를 `판매중`, 이용 기간을 `90일 열람`으로 지정합니다.
4. 다섯 권을 각각 결제 테스트한 뒤 `/reader.html`에서 열람 기간과 페이지 이동·확대·화면 맞춤을 확인합니다.

결제 권한은 구매 당시 사용한 브라우저 쿠키에 연결됩니다. 쿠키를 지우거나 다른 기기를 쓰면 현재 설계로는 자동 복구되지 않습니다. PDF 다운로드 버튼은 제공하지 않지만, 웹 열람기 자체가 완전한 복제 방지 DRM은 아닙니다.
