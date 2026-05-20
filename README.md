# PRD Manager

`prd.md`를 브라우저에서 보기 좋게 보고, 바로 수정하고, 저장하면 다시 `prd.md`로 반영하는 로컬 웹앱입니다.

## 기능

- `prds/prd.md` 자동 로드
- Markdown Preview
- Markdown Edit
- Split View
- 저장 시 원본 `prd.md` 갱신
- `#`, `##`, `###` 기준 목차 자동 생성
- 다크모드
- `schemas/db_schema.sql` 별도 탭 표시
- 세련된 문서형 UI

## 설치

```bash
pip install -r requirements.txt
```

## 실행

```bash
python app.py
```

브라우저에서 아래 주소 접속:

```text
http://127.0.0.1:8787
```

## 파일 위치

```text
prds/prd.md              # 관리할 PRD 문서
schemas/db_schema.sql    # 같이 볼 DB 스키마
```

## 사용 방식

1. `prds/prd.md`에 문서를 넣습니다.
2. `python app.py`를 실행합니다.
3. 브라우저에서 PRD를 확인합니다.
4. Edit 또는 Split 탭에서 수정합니다.
5. Save PRD 버튼을 누르면 `prd.md`에 저장됩니다.

## 주의

현재 버전은 로컬 개인용 MVP입니다.
운영/팀 협업용으로 확장하려면 아래 기능을 추가하는 것을 추천합니다.

- 자동 백업
- 변경 이력 저장
- 여러 PRD 파일 선택
- Git commit 연동
- Mermaid 다이어그램 지원
- DB Schema 자동 파싱 및 ERD 생성
