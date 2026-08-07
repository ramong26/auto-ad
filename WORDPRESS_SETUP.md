# WordPress MVP 설정

1. 사이트 주소와 WordPress 주소를 HTTPS로 설정하고 인증서 자동 갱신을 켠다.
2. WordPress 기본 블록 테마처럼 가벼운 테마를 사용하고 불필요한 플러그인은 설치하지 않는다.
3. **설정 → 고유주소**에서 글 이름 기반 구조를 선택한다.
4. 글에 사용할 카테고리를 미리 만들고 REST API에서 확인한 숫자 ID를 `WP_DIGITAL_CATEGORY_ID`에 넣는다.
5. 자동화 전용 **글쓴이(Author)** 사용자를 만든다. 관리자 계정을 사용하지 않는다.
6. 전용 사용자의 **사용자 → 프로필 → Application Passwords**에서 `auto-ad` 암호를 하나 만들고 `.env`에만 저장한다.
7. `WP_DIGITAL_URL`, `WP_DIGITAL_USERNAME`, `WP_DIGITAL_APP_PASSWORD`를 채우고 `pnpm wordpress:verify`로 HTTPS, Author 역할, 카테고리, REST 연결을 확인한다.
8. `pnpm review -- vault/20-drafts/<파일>.md`로 비공개 초안을 생성한다.

Application Password는 메인 로그인 비밀번호가 아니며 언제든 개별 폐기할 수 있다. 초안 링크를 검토한 뒤 Telegram의 **발행 승인**을 눌러야 공개된다.
