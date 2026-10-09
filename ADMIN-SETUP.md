# 관리자 복원

기존 PHP 관리자 대신 GitHub에 저장하는 Decap CMS를 사용합니다. `/admin/`에서 콘텐츠를 수정하면 초안 브랜치·PR에 저장됩니다. 미리보기 검수 후 발행해야 운영 배포됩니다.

## 운영 전 필수 설정
1. Netlify에서 이 저장소 main 자동배포 연결을 확인합니다. 빌드 `node scripts/build.mjs`, 발행 폴더 `dist`입니다.
2. GitHub OAuth 앱을 등록하고 callback URL을 `https://api.netlify.com/auth/done`으로 설정합니다. Client ID와 Secret은 Netlify의 OAuth Authentication providers에만 저장하며 저장소·브라우저 코드에는 넣지 않습니다.
3. CMS 설정의 `site_domain`은 실제 연결된 사이트 도메인 `xn--v42bn2semfh4j.kr`입니다. 로그인 후 저장·미리보기·발행·복구를 실제로 검수합니다.
4. 인증 앱 등록·권한 부여는 사용자 확인 후 진행합니다. 유료 서비스 가입은 없습니다.

## 데이터·복구
`cms/data/`는 공개 상품 설명·가격·링크만 저장합니다. 기존 비밀번호·인증정보·개인상담자료·구매자 목록·책 본문은 이전하지 않습니다. 현재 root HTML은 화면 기준 템플릿이고 빌드가 CMS 데이터를 반영한 HTML을 dist에 생성합니다. 수동 배포 시 dist만 발행해야 합니다.

공지는 등록된 항목이 있을 때만 첫 화면에 나타납니다. 복구는 Git 변경을 되돌리는 새 커밋으로 처리합니다. 기존 PHP 백업 자동 복원 UI나 비밀번호 변경 UI는 제공하지 않습니다.

이 복원은 콘텐츠 관리자입니다. 결제·구매자 로그인·열람권·기간 만료 처리는 포함하지 않습니다.
