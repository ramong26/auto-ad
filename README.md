# AI 블로그 자동화 마스터 기획서

작성일: 2026-07-23  
목표: 검색 데이터 기반 콘텐츠를 효율적으로 제작하고 WordPress에서 Google AdSense 수익 가능성을 검증한다.

## 개발 명령

Node.js 24 LTS와 pnpm 10을 사용한다.

```bash
pnpm install
pnpm start
pnpm discover
pnpm bot
pnpm review -- vault/20-drafts/<초안>.md
pnpm wordpress:verify
pnpm mvp:test
pnpm draft:finalize -- <inbox 경로> <완성본 경로>
pnpm draft:fail -- <inbox 경로> <사유>
pnpm test
pnpm typecheck
```

Codex 예약 작업은 데스크톱 앱의 **Scheduled**에서 이 프로젝트를 로컬 모드로 선택하고 `CODEX_DRAFTING.md`의 내용을 프롬프트로 사용한다. 컴퓨터와 앱이 실행 중이어야 로컬 Vault를 처리할 수 있다.

WordPress 연결 전에는 `WORDPRESS_SETUP.md`를 따른다. `pnpm review`는 WordPress에 비공개 draft를 만들고 Telegram 검토 버튼을 보낼 뿐이며, 공개 발행은 소유자의 **발행 승인** 콜백 뒤에만 실행된다.

환경 변수는 `.env.example`을 `.env`로 복사한 뒤 채운다. `pnpm discover`는 NAVER 후보 3개를 Telegram으로 보내고, `pnpm bot`은 승인 버튼을 받아 `vault/00-inbox`를 만든다. `.env`와 `data/`는 Git에 포함하지 않는다.

## MVP 운영과 검증

현재 `.env`가 없으므로 실제 NAVER·Telegram·WordPress 호출은 제외한다. `pnpm mvp:test`는 아래 12단계를 mock REST와 임시 SQLite/Vault로 한 번 연결해 실행하며, `pnpm test`는 제한·timeout·인증 실패를 포함한 전체 실패 경로를 확인한다.

1. 오전 예약 작업 실행
2. NAVER 데이터로 후보 3개 생성
3. Telegram으로 후보 수신
4. 사용자가 하나 승인
5. Obsidian inbox 생성
6. Codex가 초안 작성
7. Telegram으로 초안 알림
8. 사용자가 발행 승인
9. WordPress publish 생성
10. 발행 URL·시각·상태 기록
11. 같은 승인 재실행 시 중복 발행 없음
12. 실패 원인을 Telegram과 `vault/90-failed`에 기록

### 운영 순서

1. `pnpm discover`로 후보를 만들고 Telegram 전송 결과를 확인한다.
2. `pnpm bot`을 계속 실행해 주제·발행 callback을 한 프로세스에서 받는다.
3. Codex 예약 작업은 `CODEX_DRAFTING.md`를 사용한다.
4. 초안이 `review`가 되면 `pnpm review -- vault/20-drafts/<초안>.md`를 실행한다.
5. Telegram에서 WordPress 비공개 초안을 확인하고 발행 여부를 결정한다.
6. 실패는 `vault/90-failed`와 SQLite `job_failures`를 먼저 확인한다. Telegram 자체 장애도 Vault 운영 로그에 남는다.

### 백업과 복원

백업 전 `pnpm bot`과 Codex 예약 작업을 중지한다. `data/` 전체와 `vault/` 전체를 같은 시점의 백업 폴더로 복사한다. `.env`는 Git이나 Vault에 넣지 말고 암호화된 비밀 저장소에 별도로 보관한다. WordPress는 호스팅의 데이터베이스·`wp-content` 백업도 함께 사용한다.

복원할 때도 프로세스를 중지하고 현재 `data/`와 `vault/`를 별도 보관한 뒤, 같은 백업 시점의 두 폴더를 함께 복원한다. 복원 후 `pnpm test`, `pnpm typecheck`, 작업 상태와 최근 발행 URL을 확인한 다음 bot을 다시 시작한다.

### Application Password 폐기와 재발급

WordPress의 **사용자 → 프로필 → Application Passwords**에서 `auto-ad` 암호를 폐기한다. 같은 전용 Author 계정에서 새 `auto-ad` 암호를 생성해 `.env`의 `WP_DIGITAL_APP_PASSWORD`만 교체하고 bot을 재시작한다. 실제 연결 환경에서는 `pnpm wordpress:verify`가 통과한 뒤에만 다시 검토·발행한다. 메인 로그인 비밀번호나 관리자 계정을 자동화에 사용하지 않는다.

---

## 1. 결론 요약

이 프로젝트의 최종 형태는 다음과 같다.

```text
TypeScript 키워드 수집
→ 검색 데이터 분석 및 주제 후보 점수화
→ Telegram으로 후보 전송
→ 사용자가 작성할 주제 승인
→ Obsidian의 inbox에 작업 파일 생성
→ 로컬 Codex 예약 작업이 자료를 읽고 초안 작성
→ Obsidian drafts에 저장
→ Telegram으로 검토 요청
→ 사용자가 발행 승인
→ TypeScript 프로그램이 WordPress REST API로 발행
→ 검색 성과와 광고 수익 수집
→ 다음 주제 선정에 반영
```

초기에는 다음 범위만 만든다.

- WordPress 사이트 1개
- 블로그 콘셉트 1개
- 네이버 Search Trend 중심의 키워드 분석
- Telegram 승인
- Obsidian 작업 관리
- Codex를 이용한 글 작성
- WordPress REST API 발행
- SQLite 작업 기록
- 별도 프론트엔드 없음
- Hermes 없음
- OpenAI 글쓰기 API 없음

초기 성공이 확인된 다음에만 WordPress와 네이버 블로그를 늘린다.

### 현재 실행 결정

- 수익형 WordPress 사이트 1개로 시작한다.
- 2026-09-06까지의 목표는 광고 수익이 아니라 자동화 MVP 완성이다.
- AdSense 신청과 수익 검증은 실제 콘텐츠를 축적한 뒤 별도 운영 단계에서 진행한다.
- 첫 달에는 NAVER Search Trend 한 가지와 사람이 작성한 seed keyword를 사용한다.
- Search Ads, 다음 이슈 수집, 다중 사이트, 별도 대시보드는 MVP 이후로 미룬다.

---

## 2. 프로젝트 목표

### 2.1 최종 목표

WordPress에 유용하고 독창적인 콘텐츠를 꾸준히 발행하여 Google 검색 유입과 AdSense 광고 수익을 만든다.

### 2.2 중간 목표

1. 검색 수요가 있는 주제를 자동으로 발견한다.
2. 사람이 매일 키워드를 직접 조사하는 시간을 줄인다.
3. 사용자가 승인한 주제만 작성한다.
4. Codex 구독 포함 사용량을 활용해 별도 글쓰기 API 비용을 최소화한다.
5. AI가 작성하더라도 출처, 중복, 과장, 위험 정보를 검사한다.
6. WordPress 발행과 이력 기록을 자동화한다.
7. 실제 검색 성과가 있는 주제 유형을 찾아 반복한다.

### 2.3 하지 않을 것

초기 버전에서는 다음을 만들지 않는다.

- 6개 블로그 동시 운영
- 완전 무인 대량 발행
- 별도 웹 관리 화면
- 모바일 앱
- Redis
- 메시지 큐
- 마이크로서비스
- Kubernetes
- 복잡한 에이전트 오케스트레이션
- Hermes Agent
- 네이버 블로그 완전 자동 발행
- 뉴스 기사 자동 복제
- 실시간 검색어만 이용한 대량 콘텐츠 생성

---

## 3. 가장 먼저 수정해야 할 기존 계획

### 3.1 6개 블로그 동시 시작 금지

최종적으로 여러 블로그를 운영할 수 있지만, 처음부터 6개를 시작하면 다음 문제가 발생한다.

- 사이트별 전문성이 약해진다.
- 품질이 낮은 프롬프트가 여러 사이트를 동시에 오염시킨다.
- 사이트마다 AdSense 검토를 받아야 한다.
- 어느 주제와 작성 방식이 실제로 성공했는지 판단하기 어렵다.
- 관리, 백업, 보안 업데이트 대상이 빠르게 늘어난다.
- 유사한 AI 콘텐츠가 여러 도메인에 반복될 가능성이 높다.

따라서 다음 순서를 적용한다.

```text
WordPress 1개
→ 8~12주 검증
→ 검색 노출 확인
→ 첫 수익 또는 명확한 성장 확인
→ WordPress 2번째
→ 운영 안정화
→ 필요하면 WordPress 3번째
→ 네이버 블로그는 별도 채널로 단계적 추가
```

### 3.2 40·50·60대만을 기준으로 주제를 고르지 않는다

연령은 보조 신호다. 최종 주제 점수에는 다음을 함께 반영해야 한다.

- 검색량
- 최근 증가율
- 상시 검색 가능성
- 광고와 연결될 수 있는 검색 의도
- 경쟁 콘텐츠 수준
- 블로그 콘셉트 적합성
- 우리가 제공할 수 있는 독창적 가치
- 출처 신뢰도
- 정보 오류가 발생했을 때의 위험

### 3.3 “실시간 검색어 자동 요약” 모델을 피한다

실시간 이슈는 트래픽이 빠르게 증가할 수 있지만 수명이 짧고 경쟁이 매우 높다. 단순 뉴스 요약은 Google 검색에서 독창적 가치가 부족하다고 판단될 수 있다.

권장 콘텐츠 비율:

- 오래 검색되는 문제 해결형: 60~70%
- 계절·시기성 콘텐츠: 20~30%
- 실시간 이슈: 10% 이하

---

## 4. 추천 첫 번째 블로그 콘셉트

### 4.1 추천 콘셉트

**40~60대를 위한 디지털·업무 문제 해결 블로그**

다룰 수 있는 주제:

- Windows 및 PC 문제 해결
- 스마트폰 보안 설정
- 스미싱·피싱 예방
- 사진·파일·클라우드 정리
- 프린터·공동인증서·브라우저 오류
- AI를 이용한 문서 작성
- 엑셀·업무 자동화
- 온라인 공공서비스 사용법
- 기기 구매 전 확인 사항

### 4.2 이 콘셉트를 먼저 추천하는 이유

- 문제 해결 검색은 장기간 검색될 가능성이 있다.
- 직접 테스트와 스크린샷으로 독창적 가치를 만들기 쉽다.
- 순수 금융·건강보다 잘못된 정보의 피해 위험이 낮다.
- 40~60대라는 대상 독자가 명확하다.
- IT, 통신, 보안, 소프트웨어, 기기 광고와 연결될 가능성이 있다.
- 사용자가 개발 과정에서 직접 확인한 경험을 글에 넣을 수 있다.

### 4.3 초기에는 피할 주제

- 투자 종목 추천
- 코인 가격 전망
- 질병 진단
- 약 복용법
- 세금 절감 확정 표현
- 법률 판단
- 정부지원금 수령 가능 여부를 단정하는 글
- 확인되지 않은 기업·개인 관련 의혹
- 연예인 루머

금융, 건강, 세금, 법률은 나중에 별도 검토 체계가 있을 때 추가한다.

---

## 5. 수익 모델

### 5.1 WordPress

WordPress는 Google AdSense 수익을 발생시키는 핵심 사이트다.

- 사이트 소유권 보유
- HTML 및 광고 코드 제어
- Search Console 연결
- Google Analytics 연결
- ads.txt 관리
- SEO 구조 제어
- WordPress REST API 자동 발행

Google은 AdSense를 이용하려면 사이트 HTML에 접근하여 광고 코드를 설치할 수 있어야 한다고 안내한다.

- [AdSense 사이트 소유권 요구사항](https://support.google.com/adsense/answer/91205?hl=en)
- [WordPress에 AdSense 광고 코드 설치](https://support.google.com/adsense/answer/9579688?hl=en)

### 5.2 네이버 블로그

네이버 블로그는 Google AdSense 사이트가 아니다. 네이버 블로그의 직접 광고 수익은 네이버 애드포스트 영역이다.

권장 역할:

- 네이버 검색 사용자 확보
- 브랜드 인지도
- 별도 관점의 콘텐츠
- 네이버 애드포스트 가능성 검증

WordPress 원문을 그대로 네이버에 복사하지 않는다. 같은 주제라도 구조와 목적을 다르게 작성한다.

### 5.3 수익 계산

```text
월 광고 수익 = 월 페이지뷰 ÷ 1,000 × 페이지 RPM
```

아래는 보장 수익이 아닌 손익 검토용 가상 계산이다.

| 월 페이지뷰 | RPM 3,000원 | RPM 8,000원 | RPM 15,000원 |
|---:|---:|---:|---:|
| 10,000 | 30,000원 | 80,000원 | 150,000원 |
| 50,000 | 150,000원 | 400,000원 | 750,000원 |
| 100,000 | 300,000원 | 800,000원 | 1,500,000원 |

월 운영비가 100,000원이고 페이지 RPM이 8,000원이라면 가상의 손익분기점은 약 12,500 페이지뷰다.

실제 RPM은 주제, 국가, 방문 기기, 광고 수요, 계절, 사용자 행동에 따라 크게 달라진다.

---

## 6. 콘텐츠 정책과 품질 기준

Google은 AI 사용 자체를 금지하지 않지만, 사용자에게 추가 가치를 주지 않는 페이지를 대량 생성하면 스팸 정책의 scaled content abuse에 해당할 수 있다고 안내한다.

- [Google 생성형 AI 콘텐츠 지침](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content?hl=en)
- [사람 중심 콘텐츠 가이드](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google 검색 스팸 정책](https://developers.google.com/search/docs/essentials/spam-policies)

### 6.1 발행 가능한 글의 최소 기준

각 글에는 다음 중 최소 두 가지가 포함되어야 한다.

- 직접 계산한 데이터
- 직접 실행한 결과
- 직접 촬영하거나 만든 스크린샷
- 독자가 따라 할 수 있는 절차
- 흔한 실패 원인
- 비교표
- 선택 기준
- 체크리스트
- 공식 자료에 기반한 해석
- 기존 검색 결과에서 찾기 어려운 정리

### 6.2 발행 금지 조건

다음 중 하나라도 해당하면 자동 발행하지 않는다.

- 공식 출처가 필요한데 찾지 못함
- 중요한 주장이 출처와 연결되지 않음
- 출처에 없는 숫자나 인용문이 있음
- 최근 글과 핵심 내용이 중복됨
- 제목이 본문보다 과장됨
- 의료·금융·법률 고위험 주장
- 특정 개인이나 기업에 대한 확인되지 않은 부정적 주장
- 기사 원문을 길게 재작성하거나 복사
- 이미지 사용 권한을 확인할 수 없음
- AI가 “전문가 경험”을 허위로 서술

### 6.3 필수 사이트 페이지

AdSense 신청 전에 다음 페이지를 준비한다.

- 사이트 소개
- 작성자 소개
- 연락처
- 개인정보처리방침
- 이용약관
- 쿠키 및 광고 안내
- AI 활용 안내
- 출처 및 정정 정책

Google Publisher 정책은 광고와 관련된 쿠키, IP 주소, 데이터 사용을 개인정보처리방침에 공개하도록 요구한다.

- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938?hl=en)

---

## 7. 사용자 경험 및 전체 작업 흐름

### 7.1 매일 아침 흐름

```text
05:30 데이터 수집 시작
05:40 키워드 정규화 및 중복 제거
05:45 검색 추이와 경쟁도 계산
05:50 블로그 콘셉트 적합성 계산
06:00 Telegram 후보 전송
사용자 승인 대기
승인 후 Obsidian inbox 파일 생성
Codex 예약 작업이 초안 작성
초안 완성 시 Telegram 알림
사용자가 발행 승인
WordPress API 발행
발행 URL 알림
```

정확히 오전 6시에 실행해야 하는 것은 Telegram 후보 전달까지다. 글 작성과 발행은 사용자 승인 이후 진행한다.

### 7.2 Telegram 버튼

키워드 후보 메시지:

```text
[오늘의 주제 후보]

키워드: AI PC 교체 시기
전주 대비: +38%
예상 주요 연령: 40~59세
검색 의도: 구매 전 비교
경쟁도: 중간
상시성: 중간
관련 공식 자료: 2개
관련 뉴스: 5개

[글 작성]
[다른 주제]
[보류]
[오늘 건너뛰기]
```

초안 메시지:

```text
[초안 완성]

제목: AI PC, 50대 사용자가 지금 교체할 필요가 있을까?
분량: 2,400자
출처: 4개
위험도: 낮음
중복 검사: 통과

[전체 보기]
[발행 승인]
[수정 요청]
[폐기]
```

### 7.3 Telegram 명령

```text
/status     현재 작업 상태
/pending    승인 대기
/drafts     검토 대기 초안
/failed     실패 작업
/pause      자동 수집 일시 중지
/resume     자동 수집 재개
/report     최근 7일 운영 보고서
/cost       예상 API 및 운영 비용
```

---

## 8. Obsidian 설계

Obsidian은 로컬 Markdown 파일을 사용하므로 Codex가 직접 읽고 작성하기 쉽다. 혼자 운영하는 초기 버전에서는 Notion보다 구조가 단순하다.

### 8.1 Vault 폴더

```text
vault/
├─ 00-inbox/
├─ 10-research/
├─ 20-drafts/
├─ 30-approved/
├─ 40-published/
├─ 50-updates/
├─ 90-failed/
├─ personas/
├─ templates/
└─ reports/
```

### 8.2 상태

```text
candidate
→ selected
→ inbox
→ drafting
→ review
→ approved
→ publishing
→ published

실패:
→ failed

수정:
review
→ revision_requested
→ inbox
```

### 8.3 작업 파일 예시

```markdown
---
id: "2026-07-23-ai-pc"
status: inbox
blog: digital-life
keyword: "AI PC"
targetAge: "40-59"
trendGrowth: 38
searchVolume: 12500
competition: medium
risk: low
createdAt: "2026-07-23T06:10:00+09:00"
---

# 작성 요청

## 검색 데이터

- 전주 대비 증가율: 38%
- 모바일 검색 비중: 71%
- 월간 검색량: 12,500
- 주요 연령대: 40~59세

## 출처 후보

- 공식 문서 URL
- 관련 뉴스 URL
- 제조사 자료 URL

## 반드시 답할 질문

1. 기존 PC 사용자는 꼭 교체해야 하는가?
2. AI PC가 실제로 도움이 되는 작업은 무엇인가?
3. 사양보다 먼저 확인할 것은 무엇인가?
4. 교체하지 않아도 되는 경우는 무엇인가?
```

### 8.4 비밀정보 금지

Obsidian Vault에는 다음을 저장하지 않는다.

- WordPress Application Password
- Telegram Bot Token
- NAVER API Secret
- Search Ads Secret
- Google 관련 비밀키
- 로그인 쿠키

Vault를 동기화하거나 GitHub에 올려도 비밀정보가 유출되지 않는 구조를 유지한다.

---

## 9. Codex 설계

### 9.1 Codex의 역할

- 프로젝트 개발
- TypeScript 코드 작성
- 테스트
- 장애 원인 분석
- 프롬프트 개선
- Obsidian inbox 확인
- 초안 작성
- 출처와 주장 정리
- 수정 요청 반영
- 성과 분석 보고서 작성

### 9.2 Codex가 하지 않을 일

- 사용자 승인 없이 발행
- 광고 클릭 또는 공개 페이지 자동 방문
- 비밀번호 출력
- CAPTCHA 우회
- 출처 없는 숫자 생성
- 기사 원문 복제
- 승인 없이 고위험 금융·의료 글 작성

### 9.3 예약 작업

Codex 앱의 로컬 예약 작업이 프로젝트의 `vault/00-inbox`를 주기적으로 확인한다.

로컬 예약 작업 조건:

- 사용자 컴퓨터가 켜져 있어야 한다.
- Codex 앱이 실행 중이어야 한다.
- 프로젝트 폴더에 접근할 수 있어야 한다.
- Codex 사용량을 소비한다.

- [Codex 예약 작업 공식 문서](https://learn.chatgpt.com/docs/automations.md)

### 9.4 예약 작업 지시문

```text
vault/00-inbox에서 status가 inbox 또는 revision_requested인 파일을 찾는다.

각 파일에 대해:
1. personas에서 해당 블로그 콘셉트를 읽는다.
2. 제공된 공식 자료와 참고 자료를 확인한다.
3. 중요한 주장마다 출처 URL을 연결한다.
4. 출처가 부족하면 글을 작성하지 말고 90-failed에 사유를 기록한다.
5. 독자가 실제로 해결할 수 있는 절차, 비교, 주의점 또는 체크리스트를 포함한다.
6. 단순 뉴스 요약을 만들지 않는다.
7. 출처에 없는 수치나 직접 인용문을 만들지 않는다.
8. WordPress용 HTML 본문, 제목 후보, 요약문, 메타 설명을 작성한다.
9. 결과를 vault/20-drafts에 저장한다.
10. 원본 파일 status를 review로 변경한다.
11. WordPress 발행은 하지 않는다.
12. .env 또는 인증정보를 읽거나 출력하지 않는다.
```

### 9.5 AGENTS.md에 넣을 운영 규칙

```text
- 모든 콘텐츠 작업은 vault의 상태 규칙을 따른다.
- 사용자가 승인하지 않은 글은 발행하지 않는다.
- 공식 출처가 필요한 사실은 반드시 확인한다.
- 뉴스 기사 문장을 복사하지 않는다.
- 의료·법률·세금·투자 조언은 자동 발행하지 않는다.
- WordPress 자격 증명을 출력하지 않는다.
- 테스트에서 실제 WordPress 발행 API를 호출하지 않는다.
- 기존 Markdown front matter 필드를 보존한다.
- 초안 생성 후 출처 목록과 검토 필요 항목을 남긴다.
```

---

## 10. 데이터 수집 설계

### 10.1 데이터 출처

초기 우선순위:

1. NAVER Search Trend
2. NAVER Search API의 뉴스·블로그 검색
3. NAVER Search Ads 키워드 도구
4. 다음 공개 이슈 페이지
5. Google Trends 보조 확인

### 10.2 다음 데이터

Daum 공식 Search API는 블로그·뉴스 등의 검색 결과 API다. 안정적인 실시간 검색어 트렌드 API로 가정하지 않는다.

다음 페이지 수집은 보조 신호로만 사용한다.

```text
다음 이슈 키워드 발견
→ 네이버 Search Trend로 증가 확인
→ 네이버 뉴스 검색으로 최신성 확인
→ Search Ads 데이터로 검색 규모 확인
→ 블로그 적합성 계산
```

다음 스크래핑이 실패해도 네이버 데이터만으로 시스템이 계속 실행되어야 한다.

### 10.3 Search Trend

사용 항목:

- 일간 검색 추이
- 전주 대비
- 성별
- 연령대
- PC·모바일
- 요일별 패턴

Search Trend 결과는 절대 검색 횟수가 아니라 상대 비율이다.

전주 비교는 동일한 14일 응답 안에서 계산한다.

```text
전주 증가율 =
(최근 7일 합계 - 이전 7일 합계)
÷ 이전 7일 합계
```

서로 다른 두 요청의 비율을 직접 비교하지 않는다.

### 10.4 Search Ads 키워드 도구

사용 항목:

- 월간 PC 검색량
- 월간 모바일 검색량
- 연관 키워드
- 경쟁 정도
- 평균 클릭 수

호출 원칙:

- 동시 실행 1개
- 요청 간격 1~2초로 시작
- 429 발생 시 지수 백오프
- 반복 429 발생 시 최소 5분 중단
- 신규 seed 키워드만 조회
- 결과 7~14일 재사용

### 10.5 API 한도와 예상 사용량

NAVER API HUB 공식 안내 기준:

- Search API: 월 775,000회
- Search Trend: 월 50,000회
- Shopping Insight: 월 50,000회
- API Key당 최대 50 RPS
- 현재 한시적 무료

- [NAVER API HUB 개요와 호출 한도](https://guide.ncloud-docs.com/docs/apihub-overview)

예상 Search Trend 사용:

```text
후보 100개 기본 분석: 20회
상위 20개 연령 분석: 약 16회
성별 분석: 약 8회
기기 분석: 약 8회
재시도 여유: 약 8회

합계 약 60회/일
월 약 1,800회
```

월 50,000회 한도보다 충분히 낮다.

### 10.6 캐시 기간

| 데이터 | 캐시 |
|---|---:|
| 다음 이슈 | 30분~1시간 |
| 네이버 뉴스 결과 | 1~3시간 |
| Search Trend | 12~24시간 |
| 연령·성별·기기 분석 | 3~7일 |
| Search Ads 검색량 | 7~14일 |
| 경쟁도 | 7~14일 |
| 발행 기록 | 영구 |
| 중복 주제 기록 | 최소 1년 |
| 원본 응답 | 14~30일 |
| 가공된 일별 지표 | 장기 저장 |

`7~14일 저장`은 검색광고처럼 변화가 느린 데이터에 적용한다. 실시간 이슈와 뉴스에는 적용하지 않는다.

---

## 11. 주제 점수

### 11.1 기본 점수

```text
최종 점수 =
최근 증가율             20%
+ 검색량                15%
+ 블로그 콘셉트 적합성  20%
+ 문제 해결 가능성      15%
+ 상시 검색 가능성      10%
+ 광고 의도             10%
+ 목표 연령 적합성       5%
+ 경쟁 콘텐츠 부족도     5%
```

### 11.2 감점

```text
- 이미 최근 90일 안에 다룬 주제
- 다른 블로그와 중복 가능성
- 공식 출처 부족
- 단순 사건·사고 속보
- 연예인·루머
- 고위험 금융·건강
- 검색량은 높지만 콘셉트와 무관
- 대형 언론사와 공식기관이 검색 결과를 완전히 장악
```

### 11.3 주제 유형

각 후보에 다음 분류를 붙인다.

```text
evergreen
seasonal
trending
commercial
problem_solving
high_risk
update_required
```

### 11.4 자동 선정 조건

초기에는 자동 선정하지 않고 상위 3개를 Telegram으로 보여준다.

운영 데이터가 쌓인 뒤 다음 조건을 만족하면 낮은 위험도 주제만 자동으로 초안 생성할 수 있다.

- 최소 8주 운영
- 최근 30개 초안 중 출처 오류 0건
- 중복 발행 0건
- 발행 실패율 2% 미만
- 사용자가 제안 주제의 60% 이상 승인

발행은 계속 사용자 승인을 유지한다.

---

## 12. 글 생성 포맷

Codex 결과는 Markdown front matter와 HTML 본문을 함께 저장한다.

```markdown
---
id: "2026-07-23-ai-pc"
status: review
blog: digital-life
title: "AI PC, 50대 사용자가 지금 교체할 필요가 있을까?"
slug: "ai-pc-buying-guide"
category: "PC 활용"
risk: low
draftedAt: "2026-07-23T06:30:00+09:00"
---

# 제목

## 요약

## WordPress HTML

<p>...</p>

## 출처

- 공식 자료
- 제품 문서
- 관련 기사

## 주장과 출처

- 주장: ...
  출처: ...

## 검토 필요

- 가격은 발행일에 다시 확인
```

### 12.1 기본 글 구조

```text
1. 독자가 겪는 문제
2. 결론 요약
3. 판단 기준
4. 단계별 해결 또는 비교
5. 하지 않아도 되는 경우
6. 주의점
7. 체크리스트
8. FAQ
9. 출처
10. 업데이트 날짜
```

단어 수를 억지로 맞추지 않는다. 문제를 충분히 해결하는 데 필요한 만큼만 쓴다.

---

## 13. WordPress 발행

### 13.1 인증

각 사이트에 자동화 전용 WordPress 사용자를 만든다.

- 관리자 계정 사용 금지
- 작성 또는 발행에 필요한 최소 권한
- 사이트별 별도 Application Password
- HTTPS 필수
- 비밀번호는 환경변수로만 저장

- [WordPress Application Password](https://developer.wordpress.org/advanced-administration/security/application-passwords/)

### 13.2 API

글 생성:

```text
POST /wp-json/wp/v2/posts
```

이미지 업로드:

```text
POST /wp-json/wp/v2/media
```

- [WordPress Posts REST API](https://developer.wordpress.org/rest-api/reference/posts/)

### 13.3 발행 정책

초기:

```text
Telegram 발행 승인
→ WordPress draft 생성
→ 사용자 확인
→ publish
```

안정화 후 저위험 주제:

```text
Telegram 발행 승인
→ 즉시 publish
```

### 13.4 중복 발행 방지

- 글마다 고유 slug
- 발행 전 같은 slug 조회
- SQLite에 WordPress post ID 저장
- 네트워크 타임아웃 후 재발행 전에 WordPress 조회
- 동일 approval ID는 한 번만 처리
- WordPress 성공 응답을 받기 전 파일 이동 금지

---

## 14. 기술 스택

### 14.1 필수

| 영역 | 기술 |
|---|---|
| 언어 | TypeScript |
| 실행 | Node.js 24 LTS |
| 패키지 | pnpm |
| HTTP | Node.js 기본 fetch |
| Telegram | grammY |
| 검증 | Zod |
| 스케줄 | croner 또는 Windows 작업 스케줄러 |
| DB | SQLite + better-sqlite3 |
| 로그 | Pino |
| 테스트 | Vitest |
| 동적 페이지 | Playwright |
| 콘텐츠 저장 | Markdown + Obsidian |
| 발행 | WordPress REST API |
| 코드 관리 | 비공개 GitHub 저장소 |

### 14.2 초기에는 사용하지 않음

- NestJS
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Docker 필수화
- Next.js 관리자 화면
- 유료 WordPress SEO 플러그인

필요가 실제로 생길 때 추가한다.

---

## 15. 저장소 구조

```text
blog-automation/
├─ src/
│  ├─ index.ts
│  ├─ scheduler.ts
│  │
│  ├─ collectors/
│  │  ├─ daum.ts
│  │  ├─ naver-search-trend.ts
│  │  ├─ naver-search.ts
│  │  └─ naver-search-ad.ts
│  │
│  ├─ topics/
│  │  ├─ normalize.ts
│  │  ├─ score.ts
│  │  ├─ deduplicate.ts
│  │  └─ select.ts
│  │
│  ├─ telegram/
│  │  ├─ bot.ts
│  │  ├─ send-candidates.ts
│  │  └─ handle-actions.ts
│  │
│  ├─ obsidian/
│  │  ├─ create-inbox.ts
│  │  ├─ find-drafts.ts
│  │  └─ update-status.ts
│  │
│  ├─ wordpress/
│  │  ├─ upload-media.ts
│  │  ├─ create-post.ts
│  │  └─ find-by-slug.ts
│  │
│  ├─ db/
│  │  ├─ database.ts
│  │  └─ schema.sql
│  │
│  ├─ config/
│  │  ├─ env.ts
│  │  └─ blogs.ts
│  │
│  └─ shared/
│     ├─ logger.ts
│     └─ errors.ts
│
├─ vault/
│  ├─ 00-inbox/
│  ├─ 10-research/
│  ├─ 20-drafts/
│  ├─ 30-approved/
│  ├─ 40-published/
│  ├─ 90-failed/
│  ├─ personas/
│  └─ templates/
│
├─ tests/
│  ├─ score.test.ts
│  ├─ deduplicate.test.ts
│  └─ wordpress.test.ts
│
├─ AGENTS.md
├─ .env.example
├─ .gitignore
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
└─ README.md
```

실제 구현에서는 기능이 생길 때만 파일을 만든다. 위 구조를 한 번에 빈 파일로 생성할 필요는 없다.

---

## 16. 데이터베이스

초기 테이블:

### keyword_snapshots

```text
id
source
keyword
captured_at
trend_ratio
search_volume_pc
search_volume_mobile
competition
raw_hash
```

### topic_candidates

```text
id
blog_id
keyword
score
status
risk
evidence_json
created_at
```

### approvals

```text
id
topic_id
telegram_user_id
action
created_at
```

### posts

```text
id
topic_id
vault_path
title
slug
status
wordpress_post_id
wordpress_url
created_at
published_at
```

### publish_attempts

```text
id
post_id
attempt
status
error_code
error_message
created_at
```

SQLite로 시작한다. 동시 사용자 또는 여러 서버가 생길 때만 PostgreSQL로 이동한다.

---

## 17. 환경변수

```dotenv
TZ=Asia/Seoul
DATABASE_PATH=./data/app.db
VAULT_PATH=./vault

TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=

NAVER_API_KEY_ID=
NAVER_API_KEY=

NAVER_SEARCH_AD_CUSTOMER_ID=
NAVER_SEARCH_AD_ACCESS_LICENSE=
NAVER_SEARCH_AD_SECRET_KEY=

WP_DIGITAL_URL=
WP_DIGITAL_USERNAME=
WP_DIGITAL_APP_PASSWORD=
```

규칙:

- `.env`는 GitHub에 올리지 않는다.
- `.env.example`에는 키 이름만 둔다.
- 로그에 secret을 출력하지 않는다.
- WordPress 사이트별 자격 증명을 분리한다.
- 키가 노출되면 즉시 폐기하고 재발급한다.

---

## 18. 프론트엔드 결정

### 18.1 초기에는 만들지 않음

이미 필요한 화면이 있다.

- Telegram: 승인과 알림
- Obsidian: 작업과 초안
- WordPress 관리자: 발행 결과
- Search Console: 검색 성과
- Google Analytics: 방문 분석
- AdSense: 수익
- NAVER Cloud: API 사용량

별도 프론트엔드는 로그인, 권한, 보안, 배포, 유지보수를 추가한다.

### 18.2 추가 기준

다음 중 두 가지 이상이 발생하면 최소 관리자 화면을 검토한다.

- WordPress 3개 이상
- 운영자 2명 이상
- 하루 작업 10개 이상
- 실패 작업을 Telegram에서 관리하기 어려움
- 사이트별 비용과 성과를 한 화면에서 비교해야 함
- 월간 보고서 자동 시각화가 필요

그때도 Next.js 한 개의 내부 대시보드면 충분하다.

---

## 19. Hermes 결정

### 19.1 초기에는 사용하지 않음

현재 작업은 고정된 파이프라인이다.

```text
수집
→ 점수 계산
→ 승인
→ 글 작성
→ 검증
→ 발행
```

이런 작업은 TypeScript 프로그램과 Codex 예약 작업으로 충분하다.

### 19.2 추가 기준

다음이 필요할 때 Hermes를 검토한다.

- Telegram에서 자연어로 장애 조사
- 여러 서버와 여러 자동화를 한 에이전트가 관리
- 작업 순서를 상황에 따라 동적으로 변경
- 에이전트 메모리와 반복 학습
- 복잡한 브라우저 작업 조율

Hermes를 추가하더라도 WordPress 최종 발행 권한은 deterministic TypeScript 프로그램이 통제한다.

---

## 20. 비용

가격은 제공업체, 환율, 세금에 따라 달라진다. 아래는 예산 범위다.

### 20.1 가장 저렴한 MVP

사용자 PC가 자동화와 Codex를 실행하고 WordPress만 외부 호스팅하는 구성:

| 항목 | 예상 |
|---|---:|
| Codex Plus | 월 $20, 기존 구독이면 추가 0원 |
| OpenAI 글쓰기 API | 0원 |
| Hermes | 0원 |
| Telegram | 0원 |
| Obsidian 로컬 | 0원 |
| GitHub 비공개 저장소 | 무료 범위 |
| NAVER API HUB | 현재 한시적 무료 |
| 도메인 1개 | 연 15,000~30,000원 수준 예상 |
| WordPress 호스팅 | 월 5,000~20,000원 수준 예상 |
| SSL | 무료 가능 |
| WordPress 테마 | 무료 |
| SEO 플러그인 | 무료 |
| 백업 | 무료~월 수천 원 |

기존 Codex 비용을 제외한 최소 추가 비용은 대략 월 6,000~25,000원 수준으로 시작할 수 있다.

### 20.2 자동화 서버 사용

PC를 계속 켜두기 싫다면:

| 항목 | 예상 |
|---|---:|
| 소형 VPS | 월 $10~30 |
| WordPress와 자동화 통합 VPS | 월 $20~40 |
| 백업 | 월 $0~5 |

단, Codex 로컬 예약 작업은 사용자 컴퓨터와 Codex 앱이 켜져 있어야 한다. VPS가 키워드 수집과 WordPress는 처리해도 Codex 글 작성 부분은 로컬 컴퓨터가 담당한다.

### 20.3 향후 OpenAI API 자동 작성

나중에 Codex 수동·예약 작성 대신 API로 완전 자동화하면:

- 하루 2개: 월 약 $5~20
- 하루 6개: 월 약 $15~60

현재 OpenAI 모델 공식 방향:

- Luna: 비용 민감한 대량 작업
- Terra: 비용과 품질 균형
- Sol: 복잡한 전문 작업

- [OpenAI 모델과 가격](https://developers.openai.com/api/docs/models)

### 20.4 Hermes 추가

Hermes 자체 설치는 오픈소스이지만 추론과 클라우드 비용은 별도다.

초기 예상 추가:

- Hermes Cloud: 월 약 $10~34
- 모델 및 도구: 월 $5~30 이상

현재 프로젝트에는 불필요하다.

---

## 21. 단계별 개발 계획

### 한 달 MVP 범위

목표 기간: 2026-08-10 ~ 2026-09-06

첫 주에는 계정과 운영 환경을 준비하고, 이후 자동화 구현과 전체 흐름 검증을 진행한다.

MVP 포함:

- 첫 블로그 콘셉트와 금지 주제
- 비공개 TypeScript 저장소
- SQLite 작업 상태와 중복 방지
- NAVER Search Trend 기반 후보 생성
- Telegram 후보 승인
- Obsidian inbox와 drafts
- Codex 예약 초안 작성
- Telegram 발행 승인
- WordPress draft 생성과 발행 URL 기록
- 실패 사유 기록과 재실행 안전성

MVP 제외:

- Search Ads와 다음 이슈 수집
- 네이버 블로그
- 여러 WordPress 사이트
- 별도 프론트엔드
- 자동 품질 평가 에이전트
- AdSense 승인과 수익 달성

한 달 MVP는 아래 Phase 0~3, 6~10의 최소 기능만 구현한다. Phase 4~5와 고급 품질 자동화는 운영 데이터가 생긴 뒤 진행한다.

## Phase 0. 사업 및 콘텐츠 정의

예상 기간: 1~2일

해야 할 일:

- 첫 WordPress 콘셉트 확정
- 목표 독자 정의
- 다룰 주제와 금지 주제 정의
- 글의 고유 가치 정의
- 블로그 이름 후보
- 도메인 후보
- 수익·비용 목표 설정
- 발행 빈도 결정

산출물:

- `vault/personas/digital-life.md`
- 금지 주제 목록
- 글 템플릿
- 첫 30개 evergreen 주제 후보

완료 조건:

- “누구에게 어떤 문제를 해결해 주는 사이트인가?”를 한 문장으로 설명할 수 있다.
- 다룰 수 있는 주제와 다루지 않을 주제가 분리되어 있다.

## Phase 1. GitHub와 TypeScript 프로젝트

예상 기간: 1일

해야 할 일:

- 비공개 GitHub 저장소 생성
- Node.js 24 LTS
- pnpm
- TypeScript
- Vitest
- Zod
- Pino
- 기본 `.gitignore`
- `.env.example`
- `AGENTS.md`
- README

초기 패키지:

```bash
pnpm add grammy zod croner better-sqlite3 pino
pnpm add -D typescript tsx vitest @types/node @types/better-sqlite3
```

Playwright는 다음 페이지가 동적 렌더링임을 확인한 뒤 추가한다.

완료 조건:

- `pnpm test` 성공
- `pnpm typecheck` 성공
- 환경변수 누락 시 명확한 오류
- secret이 Git에 포함되지 않음

## Phase 2. SQLite와 상태 관리

예상 기간: 1~2일

해야 할 일:

- DB 파일 생성
- 최소 테이블 생성
- 작업 상태 전환 함수
- 동일 작업 중복 생성 방지
- publish idempotency 키

완료 조건:

- 같은 keyword/date/blog 조합이 중복 생성되지 않음
- 잘못된 상태 전환이 거부됨
- DB 백업 방법이 README에 기록됨

## Phase 3. NAVER Search Trend

예상 기간: 2~3일

해야 할 일:

- NAVER API HUB 신청
- Client ID/Secret 환경변수 등록
- Search Trend 호출
- 14일 동일 응답에서 전주 증가율 계산
- API 응답 저장
- 24시간 캐시
- 429와 5xx 처리

테스트:

- 정상 응답
- 빈 결과
- 429
- 잘못된 자격 증명
- 이전 7일 합계 0
- 날짜 경계

완료 조건:

- 키워드 목록을 넣으면 전주 증가율이 계산됨
- 동일 키워드 재실행 시 캐시 사용
- API 장애가 전체 프로그램을 종료시키지 않음

## Phase 4. Search API와 키워드 도구

예상 기간: 2~4일

해야 할 일:

- 네이버 뉴스 검색
- 공식 출처 후보 분류
- Search Ads 키워드 도구 연동
- 검색량과 경쟁도 캐시
- 동시 요청 1개
- 429 백오프

완료 조건:

- 후보별 뉴스 개수, 검색량, 경쟁도 확보
- 같은 seed는 7~14일 내 재호출하지 않음
- 연속 429 발생 시 5분 중단

## Phase 5. 다음 이슈 수집

예상 기간: 1~3일

해야 할 일:

- 공개 페이지 구조 확인
- 정적 HTML이면 기본 fetch
- 동적이면 Playwright
- 키워드 텍스트만 추출
- 30~60분 캐시
- 실패 시 네이버 데이터만 사용

금지:

- CAPTCHA 우회
- 로그인 자동화
- 탐지 회피
- 과도한 요청

완료 조건:

- 다음 수집 실패가 전체 후보 생성에 영향을 주지 않음
- 같은 키워드가 여러 출처에서 발견되면 하나로 정규화됨

## Phase 6. 점수와 Telegram 후보

예상 기간: 2~3일

해야 할 일:

- 점수 함수 구현
- 콘셉트 필터
- 최근 주제 중복 필터
- 상위 3개 선정
- Telegram Bot
- 소유자 ID 화이트리스트
- 버튼 만료
- 승인 중복 처리 방지

완료 조건:

- 오전 브리핑 메시지 생성
- 본인 계정만 승인 가능
- 승인 한 번만 처리
- `[글 작성]` 선택 시 Obsidian inbox 생성

## Phase 7. Obsidian 연동

예상 기간: 1~2일

해야 할 일:

- Vault 폴더 생성
- front matter 스키마
- inbox 템플릿
- 상태 이동
- 파일명 정규화
- Windows 경로 테스트

완료 조건:

- Telegram 승인 후 Markdown 생성
- Obsidian에서 파일 확인 가능
- 비밀정보가 포함되지 않음

## Phase 8. Codex 예약 작성

예상 기간: 2~4일

해야 할 일:

- `AGENTS.md` 작성
- persona 작성
- 작성 템플릿
- 예약 작업 지시문
- drafts 결과 스키마
- 실패 사유 기록
- 수정 요청 루프

완료 조건:

- inbox 작업 1개를 drafts로 처리
- 출처 부족 시 실패 처리
- WordPress 발행은 하지 않음
- 수정 요청을 반영할 수 있음
- 앱 재시작 후에도 상태가 유지됨

## Phase 9. WordPress 준비

예상 기간: 2~5일

해야 할 일:

- 도메인
- WordPress 설치
- HTTPS
- 가벼운 테마
- permalink 설정
- 카테고리
- 자동화 전용 사용자
- Application Password
- REST API 연결 테스트
- draft 작성 테스트
- 이미지 업로드 테스트

완료 조건:

- API로 draft 1개 생성
- 같은 slug 재실행 시 중복 생성되지 않음
- Application Password 폐기·재발급 방법 기록

## Phase 10. Telegram 발행 승인

예상 기간: 2일

해야 할 일:

- draft 발견 알림
- 전체 보기 링크 또는 파일 전송
- 발행 승인
- 수정 요청
- 폐기
- WordPress 성공 URL 기록

완료 조건:

- 승인 없이 발행 불가
- 발행 성공 후 Obsidian 상태 변경
- 실패하면 approved 상태를 보존하고 원인 알림

## Phase 11. 콘텐츠 및 AdSense 준비

예상 기간: 4~8주

해야 할 일:

- 주 3~5개 고품질 글
- 작성자 및 정책 페이지
- 직접 테스트와 스크린샷
- Search Console
- Google Analytics
- sitemap
- robots.txt
- ads.txt 준비
- 모바일 속도 확인
- 깨진 링크 검사
- 저품질 글 수정

AdSense 신청 시점은 글 개수만으로 결정하지 않는다.

신청 전 확인:

- 사이트 주제가 명확함
- 탐색 구조가 정상
- 빈 카테고리 없음
- 복제 콘텐츠 없음
- 작성자 정보 있음
- 정책 페이지 있음
- 실제 사용자가 읽을 가치가 있음
- 검색 또는 직접 방문이 발생하기 시작함

## Phase 12. 성과 피드백

예상 기간: 지속

수집할 지표:

- 노출수
- 클릭수
- CTR
- 평균 검색 위치
- 색인 여부
- 페이지뷰
- 체류 관련 지표
- 페이지 RPM
- 글별 수익
- 주제 유형별 성과
- 작성부터 노출까지 걸린 시간

매주 보고:

```text
발행 글 수
색인 글 수
검색 노출 증가
클릭 상위 글
노출은 있지만 클릭이 낮은 글
업데이트가 필요한 글
실패한 자동화
API 사용량
예상 비용
```

---

## 22. 테스트 전략

### 22.1 필수 단위 테스트

- 전주 증가율
- 0으로 나누기
- 키워드 정규화
- 점수 계산
- 중복 판정
- 상태 전환
- slug 생성
- Telegram 소유자 확인

### 22.2 통합 테스트

- NAVER API 모의 응답
- Telegram callback
- Obsidian 파일 생성
- WordPress draft 생성
- WordPress 네트워크 타임아웃
- 재시도 전 slug 조회

### 22.3 실제 운영 테스트

실제 WordPress 운영 사이트에 바로 발행하지 않는다.

```text
로컬 또는 테스트 WordPress
→ draft
→ 테스트 카테고리
→ 사용자 확인
→ 실제 운영 사이트
```

### 22.4 최소 품질 체크

- 제목과 본문 내용 일치
- 출처 URL 접근 가능
- 중요 숫자 출처 존재
- 최근 90일 중복 없음
- HTML 깨짐 없음
- 대표 이미지 권리 확인
- 모바일에서 표가 깨지지 않음

---

## 23. 보안 및 운영

### 23.1 WordPress

- 자동 업데이트 또는 정기 업데이트
- 사용하지 않는 플러그인 삭제
- 관리자 계정과 자동화 계정 분리
- 자동화 사용자는 최소 권한
- HTTPS
- 정기 백업
- 로그인 시도 제한

### 23.2 광고

자동화 브라우저나 테스트가 광고가 설치된 공개 페이지를 반복 방문하지 않게 한다.

절대 금지:

- 본인 광고 클릭
- 가족·지인 클릭 요청
- 봇 트래픽
- 저가 트래픽 구매
- 자동 새로고침
- 광고와 버튼을 혼동시키는 배치

- [AdSense 무효 트래픽 정책](https://support.google.com/adsense/answer/2660562)

### 23.3 장애 처리

| 장애 | 처리 |
|---|---|
| 다음 수집 실패 | 네이버 데이터만 사용 |
| Search Trend 429 | 백오프 후 재시도 |
| Search Ads 연속 429 | 5분 중단 |
| Telegram 실패 | 다음 주기 재전송 |
| Codex 초안 실패 | 90-failed 이동 |
| WordPress timeout | slug 조회 후 재시도 판단 |
| WordPress 인증 실패 | 즉시 중단, 사용자 알림 |
| 중복 가능성 | 발행 금지 |

---

## 24. 확장 조건

### 24.1 두 번째 WordPress

다음 조건을 대부분 만족하면 추가한다.

- 첫 사이트 운영 8~12주 이상
- 최소 30개 이상의 검토된 콘텐츠
- 검색 노출 증가 추세
- 자동화 발행 중복 0건
- WordPress 발행 성공률 98% 이상
- 유지할 가치가 있는 주제 유형을 확인
- 월 운영비를 감당할 수 있음
- 두 번째 사이트 콘셉트가 첫 사이트와 명확히 다름

### 24.2 네이버 블로그

다음 기준으로 추가한다.

- WordPress 글 복제가 아닌 별도 콘텐츠 전략
- 네이버 사용자를 위한 포맷
- 최종 발행 수동 확인
- 네이버 자동화 정책 위험 수용
- 애드포스트 또는 브랜드 채널 목적 명확화

### 24.3 프론트엔드

운영 복잡성이 실제로 발생했을 때만 추가한다.

### 24.4 OpenAI API

다음 조건이면 Codex 예약 작업 대신 API 자동화를 검토한다.

- PC를 계속 켜두기 어려움
- 하루 작성 요청이 많아짐
- Codex 예약 주기만으로 부족
- 월 예상 수익이 API 비용보다 충분히 큼
- 품질 평가 자동화가 안정됨

---

## 25. 12주 실행 일정

첫 4주는 자동화 MVP, 이후 8주는 콘텐츠 운영과 수익 가능성 검증이다. 개발 완료일과 AdSense 성과 확인일을 같은 마감으로 취급하지 않는다.

### 1주차

- 콘셉트 확정
- 도메인 검토
- WordPress 호스팅과 Telegram Bot 준비
- NAVER API HUB 신청
- GitHub 저장소
- TypeScript 프로젝트
- SQLite
- AGENTS.md

### 2주차

- Search Trend
- 캐시
- 기본 점수
- Telegram 후보 메시지와 승인
- Obsidian inbox 생성

### 3주차

- Codex 예약 작업
- 초안 작성
- WordPress REST API 연결
- draft 생성
- 발행 승인

### 4주차

- 중복 방지
- 실패 복구
- 전체 시나리오 검증
- 첫 실제 글 발행
- 운영 문서 정리

### 5~6주차

- 필요할 때만 다음 이슈와 Search Ads 검토
- 출처 검사 강화
- 주 3~5개 운영

### 7~8주차

- 글 성과 확인
- 제목과 구조 개선
- 실패 주제 분석
- 문제 해결형 글 확대

### 9~10주차

- 사이트 정책 페이지
- 작성자 페이지
- Search Console
- Analytics
- 속도와 모바일 개선

### 11~12주차

- AdSense 신청 가능성 판단
- 저품질 글 수정
- 성과 보고서
- 두 번째 사이트 여부 결정

---

## 26. 당장 해야 할 일

순서는 다음이 가장 좋다.

### 첫 번째

첫 블로그 콘셉트를 확정한다.

추천:

```text
40~60대를 위한 디지털·업무 문제 해결
```

### 두 번째

첫 30개 evergreen 주제를 사람이 직접 작성한다.

예:

- 스마트폰에서 스팸 문자 차단
- Windows 로그인 비밀번호 분실 예방
- 사진 자동 백업
- 카카오톡 저장공간 정리
- 공동인증서 위치 찾기
- 프린터 연결 오류
- PDF 글자 복사 문제
- AI로 회의록 정리
- 엑셀에서 중복 제거
- 부모님 휴대폰 보안 설정

이 목록은 자동 키워드 수집 결과를 평가할 기준이 된다.

### 세 번째

비공개 GitHub 저장소와 TypeScript 프로젝트를 만든다.

### 네 번째

NAVER Search Trend 한 가지만 먼저 연결한다.

### 다섯 번째

Telegram으로 후보 3개를 보내는 기능을 만든다.

### 여섯 번째

승인 시 Obsidian inbox 파일을 생성한다.

### 일곱 번째

Codex 예약 작업으로 inbox 한 개를 drafts 한 개로 바꾸는 데 성공한다.

### 여덟 번째

WordPress draft 발행을 연결한다.

이 시점까지 성공하면 MVP가 완성된 것이다.

---

## 27. MVP 완료 정의

다음 시나리오가 한 번 끝까지 성공하면 MVP 완료다.

```text
1. 오전 예약 작업 실행
2. NAVER 데이터로 후보 3개 생성
3. Telegram으로 후보 수신
4. 사용자가 하나 승인
5. Obsidian inbox 생성
6. Codex가 초안 작성
7. Telegram으로 초안 알림
8. 사용자가 발행 승인
9. WordPress draft 또는 publish 생성
10. 발행 URL 기록
11. 같은 작업 재실행 시 중복 발행 없음
12. 실패 시 원인을 Telegram과 파일에 남김
```

---

## 28. 최종 추천

가장 좋은 초기 구성:

```text
WordPress 1개
+ 네이버 Search Trend
+ TypeScript
+ Telegram
+ Obsidian
+ Codex 예약 작업
+ SQLite
+ WordPress REST API
```

제외:

```text
Hermes
Notion
별도 프론트엔드
OpenAI 글쓰기 API
6개 동시 운영
네이버 완전 자동 발행
```

이 구성이 가장 저렴하고, 실패했을 때 손실이 작고, 성공했을 때 확장하기 쉽다.

첫 번째 목표는 “완전 자동화”가 아니라 “검색되는 고품질 글을 반복 생산할 수 있는지 검증”하는 것이다. 자동화는 그 검증을 돕는 수단이며 수익 자체를 보장하지 않는다.
