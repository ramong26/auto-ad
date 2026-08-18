# NAVER 블로그 원고 자동화

NAVER API HUB 검색 트렌드에서 후보 3개를 고르고, Telegram에서 승인한 주제만 Codex가 네이버 블로그용 원고로 작성한다. 네이버 게시물은 사용자가 직접 검토하고 발행한다.

## 범위

```text
NAVER API HUB Search Trend
→ 후보 3개 선정
→ Telegram 주제 승인
→ Obsidian inbox 생성
→ Codex 원고 작성
→ Telegram 검토 알림
→ 사용자가 네이버 블로그에 직접 붙여넣고 발행
```

- 블로그 콘셉트: 40~60대를 위한 디지털·업무 문제 해결
- 데이터: NAVER API HUB Search Trend와 사람이 관리하는 seed keyword
- 승인·알림: Telegram 소유자 계정
- 작업 기록: SQLite와 Obsidian Vault
- 작성: 로컬 Codex 예약 작업
- 게시: 사용자 수동 발행
- 제외: 네이버 자동 게시, 브라우저 매크로, 비공식 API, WordPress, Search Ads, OpenAI 글쓰기 API, 별도 관리 화면

네이버 블로그 글쓰기 API는 종료되었으므로 프로그램이 네이버 계정이나 에디터를 조작하지 않는다.

## 환경 설정

Node.js 24 LTS와 pnpm 10을 사용한다.

```bash
pnpm install
Copy-Item .env.example .env
```

`.env`에 다음 값만 설정한다.

```dotenv
TZ=Asia/Seoul
DATABASE_PATH=./data/app.db
VAULT_PATH=./vault
BLOG_ID=digital-life
SEED_KEYWORDS=스마트폰 저장공간,윈도우 업데이트,PDF 합치기,이메일 피싱,사진 백업
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=
NAVER_API_KEY_ID=
NAVER_API_KEY=
```

Telegram Bot을 연 뒤 `/start`를 보내고 아래 명령으로 본인 사용자 ID를 확인한다. Bot ID를 `TELEGRAM_OWNER_ID`에 넣으면 메시지를 보낼 수 없다.

```bash
pnpm telegram:whoami
```

비밀값은 `.env`에만 두고 Git, Vault, 로그에 기록하지 않는다.

## 실행

```bash
pnpm discover
pnpm bot
```

1. `pnpm discover`가 NAVER 트렌드를 조회하고 Telegram으로 후보 3개를 보낸다.
2. `pnpm bot`을 실행해 둔 상태에서 Telegram의 `글 작성`을 누른다.
3. 승인된 작업이 `vault/00-inbox`에 생성된다.
4. Codex 예약 작업은 [CODEX_DRAFTING.md](./CODEX_DRAFTING.md)를 사용한다.
5. 원고 작성이 끝나면 `draft:finalize`가 `vault/20-drafts` 저장과 Telegram 알림을 함께 처리한다.
6. 사용자가 원고를 네이버 블로그 에디터에 붙여넣고 이미지, 링크, 모바일 미리보기를 확인한 뒤 발행한다.

Codex 초안 처리 명령:

```bash
pnpm draft:finalize -- <inbox 경로> <완성본 경로>
pnpm draft:notify -- <완성본 경로>
pnpm draft:fail -- <inbox 경로> <사유>
```

`draft:notify`는 저장된 원고의 Telegram 알림만 다시 보낼 때 사용한다.

## 원고 형식

완성본은 [vault/templates/draft.md](./vault/templates/draft.md)를 따른다.

- 제목과 검토용 요약
- `네이버 블로그 원고` 본문
- 직접 확인·비교·체크리스트 중 하나 이상
- 이미지 계획
- 태그 3~10개
- 중요 주장에 연결된 공식 출처 URL

출처 부족, 최근 90일 중복, 과장, 의료·금융·법률 등 고위험 주장은 원고를 만들지 않고 `vault/90-failed`에 기록한다.

## 상태 흐름

```text
candidate → selected → inbox → drafting → review
                                  ↑          ↓
                                  └ revision_requested
```

현재 MVP는 `review`에서 끝난다. `approved`, `publishing`, `published`는 네이버 자동화에서 사용하지 않는다.

## 검증

```bash
pnpm mvp:test
pnpm test
pnpm typecheck
```

`pnpm mvp:test`는 mock NAVER·Telegram과 임시 SQLite/Vault를 사용해 후보 생성, 승인, inbox, 원고 저장, 검토 알림, 자동 게시 없음까지 확인한다. 단위 테스트에서는 실제 NAVER·Telegram API를 호출하지 않는다.

## 운영과 복구

- 실패는 SQLite `job_failures`와 `vault/90-failed`에서 확인한다.
- Telegram 장애도 Vault 운영 실패 로그에 남긴다.
- 백업 전 `pnpm bot`과 Codex 예약 작업을 중지한다.
- 같은 시점의 `data/`와 `vault/`를 함께 백업하고 복원한다.
- 복원 후 `pnpm test`, `pnpm typecheck`, 최근 작업 상태를 확인한 뒤 bot을 다시 시작한다.
