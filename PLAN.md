# NAVER 블로그 원고 자동화 실행 계획

기준 문서: `README.md`

## 원칙

- NAVER API HUB Search Trend, Telegram, Obsidian, Codex, SQLite만 사용한다.
- 승인된 주제만 원고로 작성한다.
- 출처 부족, 최근 90일 중복, 고위험 주제는 실패로 기록한다.
- 비밀정보는 `.env`에만 둔다.
- 네이버 블로그에는 자동 게시하지 않는다.

## 1. 주제 발굴과 승인

- seed keyword별 동일 14일 Search Trend 조회
- 24시간 캐시, 429·5xx·빈 결과 격리
- 위험도와 최근 90일 중복 반영
- 상위 후보 3개 Telegram 전송
- 소유자의 `글 작성` 승인 한 번만 받아 `vault/00-inbox` 생성

완료 기준: 실제 NAVER API HUB와 Telegram으로 후보 3개를 받고 승인된 inbox가 한 번만 생성된다.

## 2. 네이버 블로그용 원고 작성

- Codex는 `inbox`, `revision_requested`만 처리
- persona와 공식 출처를 사용
- 제목, 요약, 본문, 이미지 계획, 태그 3~10개, 출처 작성
- 직접 확인·비교·체크리스트 중 하나 이상 포함
- 성공 시 `vault/20-drafts` 저장과 `review` 전환
- 실패 시 `vault/90-failed` 기록

완료 기준: inbox 1건이 검증 가능한 네이버 원고 또는 추적 가능한 실패 기록으로 끝난다.

## 3. Telegram 검토 알림

- `draft:finalize`가 제목, 요약, 완성본 경로 전송
- 알림 실패는 운영 실패 로그에 기록
- `draft:notify`로 알림 재전송

완료 기준: Telegram에서 원고 완료 알림을 받고 완성본을 찾을 수 있다.

## 4. 수동 발행

- 사용자가 원고를 네이버 블로그 에디터에 붙여넣기
- 이미지, 링크, 줄바꿈, 모바일 미리보기 확인
- 사용자 행동으로만 최종 발행

완료 기준: 프로그램이 네이버 계정이나 에디터를 조작하지 않는다.

## MVP 검증 순서

1. `pnpm test`와 `pnpm typecheck` 통과
2. 실제 `pnpm discover`로 후보 3개 수신
3. `pnpm bot`에서 후보 한 건 승인
4. 생성된 inbox를 Codex 예약 작업이 원고로 처리
5. Telegram 원고 완료 알림 수신
6. 사용자가 네이버 블로그에 직접 붙여넣어 발행

Search Ads, Daum, WordPress, 관리 화면, OpenAI API, Hermes는 실제 병목이 기록되기 전에는 추가하지 않는다.
