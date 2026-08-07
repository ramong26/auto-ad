# AGENTS.md

- Node.js 24 LTS와 pnpm을 사용한다.
- 작업 전 `README.md`와 `PLAN.md`에서 현재 목표 범위를 확인한다.
- 사용자 승인 없이는 WordPress 발행을 실행하지 않는다.
- 비밀값은 `.env`에만 두고 커밋하지 않는다.
- 상태 변경과 발행은 `src/database.ts`의 함수를 통해 처리한다.
- 변경 후 `pnpm test`와 `pnpm typecheck`를 실행한다.
- 실제 Telegram, NAVER, WordPress API는 단위 테스트에서 호출하지 않는다.

## Codex 초안 작업

- `CODEX_DRAFTING.md` 절차를 따른다.
- `vault/00-inbox`에서 `inbox`, `revision_requested` 상태만 처리한다.
- 성공은 `pnpm draft:finalize -- <inbox 경로> <완성본 경로>`, 실패는 `pnpm draft:fail -- <inbox 경로> <사유>`로 기록한다.
- 이 단계에서는 WordPress에 발행하지 않는다.
