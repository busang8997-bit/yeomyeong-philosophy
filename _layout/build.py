#!/usr/bin/env python3
"""공통 헤더·푸터를 모든 페이지에 반영합니다.

사용법
  python3 _layout/build.py           # _layout/header.html, footer.html 내용을 모든 *.html에 반영
  python3 _layout/build.py --check   # 파일은 건드리지 않고, 어긋난 페이지가 있으면 목록을 보여 주고 종료코드 1

규칙
  - 각 페이지의 <!-- layout:header -->...<!-- /layout:header -->, <!-- layout:footer -->...<!-- /layout:footer -->
    사이 내용만 바꿉니다. 페이지 본문은 건드리지 않습니다.
  - 현재 페이지 메뉴 강조(aria-current="page")는 자동으로 붙습니다.
      · 메뉴 주소와 같은 파일(ask.html 등)  → 그 메뉴
      · book-*.html  → 도서(books.html),  lecture-*.html → 강의(lectures.html)
      · index.html, privacy.html 등 → 강조 없음
    새 상세 페이지 접두어가 생기면 아래 PREFIX_TO_MENU에 한 줄 추가하세요.
  - 새 페이지를 만들 때는 위 마커 두 쌍만 넣어 두면 됩니다(기존 페이지를 복사하는 것이 가장 쉽습니다).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREFIX_TO_MENU = {"book-": "books.html", "lecture-": "lectures.html"}


def load(name, tag):
    """파티얼 파일에서 맨 앞 안내 주석을 빼고 <header>/<footer> 요소만 가져온다."""
    text = (ROOT / "_layout" / name).read_text(encoding="utf-8")
    m = re.search(rf"<{tag}\b.*?</{tag}>", text, re.S)
    if not m:
        sys.exit(f"_layout/{name} 에서 <{tag}> 요소를 찾지 못했습니다.")
    return m.group(0)


def menu_for(page_name):
    if page_name == "index.html":
        return None
    nav_hrefs = re.findall(r'<a href="([^"#?]+\.html)"', HEADER.split("<nav", 1)[1])
    if page_name in nav_hrefs:
        return page_name
    for prefix, menu in PREFIX_TO_MENU.items():
        if page_name.startswith(prefix):
            return menu
    return None


def render(page_name, text):
    header = HEADER
    menu = menu_for(page_name)
    if menu:
        marked = header.replace(f'<a href="{menu}">', f'<a href="{menu}" aria-current="page">', 1)
        if marked == header:
            sys.exit(f"{page_name}: 메뉴 '{menu}' 를 header.html 에서 찾지 못했습니다.")
        header = marked
    for tag, block in (("header", header), ("footer", FOOTER)):
        pat = re.compile(rf"<!-- layout:{tag} -->.*?<!-- /layout:{tag} -->", re.S)
        if not pat.search(text):
            sys.exit(f"{page_name}: <!-- layout:{tag} --> 마커가 없습니다.")
        text = pat.sub(lambda _m: f"<!-- layout:{tag} -->{block}<!-- /layout:{tag} -->", text, count=1)
    return text


HEADER = load("header.html", "header")
FOOTER = load("footer.html", "footer")


def main():
    check = "--check" in sys.argv
    stale = []
    for path in sorted(ROOT.glob("*.html")):
        old = path.read_text(encoding="utf-8")
        new = render(path.name, old)
        if new != old:
            stale.append(path.name)
            if not check:
                path.write_text(new, encoding="utf-8")
    if check:
        if stale:
            print("공통 헤더·푸터와 다른 페이지:", ", ".join(stale))
            print("→ python3 _layout/build.py 를 실행하세요.")
            sys.exit(1)
        print("모든 페이지가 공통 헤더·푸터와 일치합니다.")
    else:
        print(f"{len(stale)}개 페이지 갱신" + (": " + ", ".join(stale) if stale else " (변경 없음)"))


if __name__ == "__main__":
    main()
