# Codex 초안 예약 작업

매 실행마다 다음 절차만 수행한다.

1. `vault/00-inbox/*.md` 중 front matter `status`가 `inbox` 또는 `revision_requested`인 파일만 읽는다. 다른 상태와 다른 폴더의 작업 파일은 처리하지 않는다.
2. `vault/personas/{blog}.md`와 `vault/templates/draft.md`를 읽는다.
3. 공식 문서를 우선 검색하고 실제 페이지를 확인한다. 중요 주장마다 본문의 해당 문장에 출처 URL을 연결한다. 기사 문장을 복사하지 않는다.
4. WordPress용 HTML 본문, 제목, 요약, 메타 설명과 출처 목록을 작성한다. 직접 실행 결과, 직접 만든 스크린샷, 재현 절차, 비교표, 선택 기준 중 둘 이상을 포함한다.
5. 출처 부족, 최근 90일 내 중복, 제목·본문의 과장, 금융·의료·법률 등 고위험 주장을 발견하면 초안을 만들지 않는다. `pnpm draft:fail -- <inbox 경로> <구체적인 사유>`를 실행한다.
6. 완성본을 먼저 `vault/10-research/<id>.md`에 저장한 뒤 `pnpm draft:finalize -- <inbox 경로> <완성본 경로>`를 실행한다. 이 명령이 `vault/20-drafts`에 저장하고 원본 및 SQLite 작업 상태를 `review`로 바꾼다.
7. WordPress API를 호출하거나 `approved`, `publishing`, `published`로 바꾸지 않는다. `.env`와 인증정보를 읽거나 출력하지 않는다.
8. 처리할 파일이 없으면 파일을 변경하지 않는다.

완료 전 `pnpm test`와 `pnpm typecheck`를 실행한다.
