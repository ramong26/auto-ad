# AdSense 준비 기록

이 문서는 글 개수가 아니라 공개 사이트의 품질과 실제 유입 근거로 신청 여부를 결정하기 위한 운영 원장이다.

## 현재 판정 — 신청 보류

확인일: 2026-08-07

| 근거 | 현재 상태 | 완료 증거 |
| --- | --- | --- |
| 공개 WordPress 사이트 | 미확인 | `.env` 없음 |
| 최근 4주 고품질 발행 | 0개 | `vault/40-published`에 글 없음 |
| 정책 페이지 | 초안만 작성 | `vault/pages` 5개 파일 |
| Search Console | 미연결 | 소유권·sitemap 제출 기록 없음 |
| Google Analytics 4 | 미연결 | 측정 ID·실시간 방문 기록 없음 |
| sitemap·robots.txt | 미확인 | 공개 URL 검사 필요 |
| ads.txt | 발행자 ID 없음 | AdSense에서 받은 행과 공개 URL 필요 |
| 모바일·내부 링크·업데이트 | 미확인 | 공개 글과 모바일 캡처 필요 |
| 검색 노출·직접 방문 | 데이터 없음 | Search Console·GA4 28일 자료 필요 |

현재는 신청 근거가 없으므로 신청하지 않는다.

외부 서비스가 없는 동안에는 WordPress 발행, Search Console, GA4, sitemap, robots.txt, ads.txt와 실제 방문 지표를 작업 범위에서 제외한다. 로컬에서는 초안의 직접 검증, 공식 출처, 비교·복구 절차와 정책 페이지 초안만 축적한다.

## 주간 운영 기록

주 3~5개는 목표량일 뿐 품질 기준을 낮추지 않는다. 기준을 통과하지 못한 글은 발행 수에 포함하지 않는다.

| 주간 | 발행 URL | 직접 테스트·스크린샷 | 공식 출처 | 내부 링크 | 수정일 표시 | 검수자 |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD~YYYY-MM-DD |  |  |  |  |  |  |

각 글은 발행 전에 다음을 모두 확인한다.

- [ ] 독자가 해결하려는 질문과 답이 제목·본문에서 일치한다.
- [ ] 직접 실행 결과, 직접 만든 스크린샷, 재현 절차, 비교표, 선택 기준 중 2개 이상이 있다.
- [ ] 중요한 사실과 수치는 확인일을 적은 공식 출처에 연결된다.
- [ ] 스크린샷에 개인정보·인증정보가 없고 이미지 사용 권한을 확인했다.
- [ ] 관련 글 1개 이상을 자연스러운 문구로 연결하고 깨진 링크가 없다.
- [ ] 작성자, 최초 발행일, 실제 수정 시에만 바뀌는 수정일을 표시한다.
- [ ] 모바일 화면에서 가로 스크롤, 겹침, 읽기 어려운 글자나 버튼이 없다.
- [ ] 복제·과장·근거 없는 경험·금융·의료·법률 고위험 주장이 없다.

Google은 독창적 정보, 충분한 설명, 명확한 출처와 직접 경험이 드러나는 사용자 중심 콘텐츠를 권장한다. 글자 수나 겉보기 최신 날짜는 품질 근거로 쓰지 않는다.

## 사이트 준비

### 정책과 신뢰 페이지

`vault/pages` 초안의 대괄호 값을 실제 정보로 바꾸고 WordPress의 고정 페이지로 발행한다. 다음 5개 페이지로 8개 요구사항을 겹치지 않게 합친다.

- `about.md`: 사이트 소개, 작성자 소개, AI 활용 안내
- `contact.md`: 연락처
- `privacy-policy.md`: 개인정보, 쿠키, Analytics, 광고 안내
- `terms.md`: 이용약관
- `editorial-policy.md`: 출처, 검수, 정정 정책

모든 페이지는 헤더 또는 푸터에서 두 번 이하의 이동으로 접근 가능해야 한다. 개인정보처리방침은 Google 서비스로 인한 쿠키, IP 주소 등 데이터 수집·공유·사용과 제3자 기술을 실제 설치 상태에 맞게 공개한다.

### Search Console·Analytics·크롤링

1. Search Console에서 가능하면 도메인 속성을 만들고 DNS로 소유권을 확인한다.
2. WordPress 기본 `/wp-sitemap.xml`이 로그인 없이 HTTP 200으로 열리는지 확인하고 Search Console에 제출한다.
3. `/robots.txt`가 공개 글과 `/ads.txt`를 막지 않고 `Sitemap: https://실제도메인/wp-sitemap.xml`을 포함하는지 확인한다. robots.txt를 검색 제외 수단으로 사용하지 않는다.
4. WordPress Site Kit에 GA4 측정 ID를 연결한다. 중복 태그가 없는지와 본인 접속 1건이 실시간 보고서에 잡히는지 확인한다.
5. AdSense가 발급한 발행자 ID만 사용해 루트 `/ads.txt`에 안내된 행을 그대로 넣고 HTTP 200과 UTF-8 평문을 확인한다. 예시 ID를 공개하지 않는다.
6. 대표 글 3개를 휴대전화 실제 기기 또는 브라우저 모바일 모드로 열어 위 체크리스트와 캡처를 주간 기록에 남긴다.

설정 후 `pnpm site:check`를 실행해 정책 페이지 탐색, viewport, GA4 태그, sitemap, robots.txt, ads.txt를 한 번에 재검사한다. 이 명령은 공개 응답만 읽으며 Google 계정에는 접근하지 않는다.

WordPress가 이미 만드는 sitemap에는 별도 생성기를 추가하지 않는다. Search Console 제출은 발견과 오류 확인을 돕지만 색인을 보장하지 않는다.

## 신청 판정

Google이 공개하지 않은 최소 글 수나 트래픽 수치를 임의의 승인 조건으로 주장하지 않는다. 이 프로젝트는 아래 조건을 모두 충족할 때만 신청한다.

- [ ] 최근 4주 동안 주 3~5개 목표로 운영했고, 모든 발행 글이 품질 체크를 통과했다.
- [ ] 빈 카테고리·복제 글·깨진 링크가 없고 오래된 글은 내용 검토 후에만 수정일을 갱신했다.
- [ ] 5개 신뢰 페이지가 실제 정보로 공개되어 전역 탐색에서 접근된다.
- [ ] Search Console 소유권, sitemap 성공, 대표 URL의 색인 가능 상태를 확인했다.
- [ ] GA4 실시간 수집과 28일 직접 방문 자료를 확인했다.
- [ ] 최근 28일 Search Console에 검색 노출 또는 클릭이 기록되거나, GA4에 봇·본인 테스트를 제외한 직접 방문이 반복해서 기록됐다.
- [ ] sitemap, robots.txt, ads.txt, 모바일 표시를 공개 URL에서 재검사했다.
- [ ] Google 게시자 정책과 개인정보 공개 내용을 최종 확인했다.

판정일, `신청/보류`, Search Console 28일 노출·클릭, GA4 28일 사용자·직접 방문, 품질 미달 글 수와 판단 이유를 아래에 기록한다.

| 판정일 | 결정 | 검색 노출/클릭 | 사용자/직접 방문 | 품질 미달 | 이유 |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | 보류 |  |  |  |  |

## 공식 기준

- [사용자 중심 콘텐츠](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=ko)
- [sitemap 생성 및 제출](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ko)
- [robots.txt 안내](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=ko)
- [Search Console sitemap 보고서](https://support.google.com/webmasters/answer/7451001?hl=ko)
- [CMS 사이트의 GA4 설정](https://support.google.com/analytics/answer/10447272?hl=ko)
- [Google 게시자 정책](https://support.google.com/adsense/answer/10502938?hl=ko)
- [ads.txt 크롤링 요구사항](https://support.google.com/adsense/answer/7679060?hl=ko)
- [Google 파트너 사이트의 데이터 사용](https://policies.google.com/technologies/partner-sites?hl=ko)
