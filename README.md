# 여명철학 공개 홈페이지 (정적 이전본)

현재 닷홈 PHP 운영본의 공개 화면을 GitHub + Netlify용 정적 사이트로 변환한 버전입니다.

- 관리자(`admin/`), 인증, 비밀번호 해시, 백업, 원본 JSON 데이터는 포함하지 않습니다.
- 돌봄 사이트(`dolbom/`, `dolbom.zip`)는 포함하지 않습니다.
- 공개 페이지 수정은 GitHub 소스 변경 → Netlify 자동 배포 방식으로 운영합니다.
- 대상 도메인: https://여명철학.kr

## 공통 헤더·푸터 수정 방법

모든 페이지의 헤더(로고·메뉴)와 푸터(사업자 정보 등)는 `_layout/` 폴더 한 곳에서 관리합니다.

1. `_layout/header.html` 또는 `_layout/footer.html`을 수정합니다. (메뉴 추가·이름 변경, 사업자 정보 수정 등)
2. 저장소 폴더에서 `python3 _layout/build.py`를 실행합니다. 18개 페이지의 `<!-- layout:header -->`, `<!-- layout:footer -->` 사이가 한 번에 갱신됩니다.
3. 현재 페이지의 메뉴 강조는 자동입니다. (`book-*.html` → 도서, `lecture-*.html` → 강의)
4. `python3 _layout/build.py --check`로 어긋난 페이지가 없는지 확인할 수 있습니다.

새 페이지를 만들 때는 기존 페이지를 복사하면 마커가 함께 따라옵니다. 페이지 본문(`<main>`)은 스크립트가 건드리지 않습니다.
