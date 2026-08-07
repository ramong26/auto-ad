---
id: "2026-08-07-windows-pc-backup-1"
status: review
blog: "digital-life"
keyword: "Windows PC 백업"
title: "Windows PC 바꾸기 전 백업 확인 체크리스트"
summary: "OneDrive 폴더 백업 범위와 새 PC 이전 전에 직접 확인할 항목을 정리했습니다."
metaDescription: "Windows PC 교체 전 OneDrive 폴더 백업 상태, 저장 공간, 오프라인 파일을 확인하는 단계별 체크리스트입니다."
createdAt: "2026-08-07T09:30:00+09:00"
testedAt: "2026-08-07"
testEnvironment: "Microsoft Windows 10.0.26200.8875, OneDrive 데스크톱 앱 설치 확인"
---

# Windows PC 바꾸기 전 백업 확인 체크리스트

## WordPress HTML

<article>
  <p><strong>결론:</strong> 새 PC를 켜기 전에 기존 PC와 OneDrive 웹에서 같은 파일이 열리는지 각각 확인하세요. 동기화 아이콘만 보고 기존 PC를 초기화하면, 빠진 폴더나 온라인 전용 파일을 뒤늦게 발견할 수 있습니다.</p>
  <p>Microsoft의 <a href="https://support.microsoft.com/ko-kr/onedrive/back-up-your-folders-with-onedrive">OneDrive 폴더 백업 안내</a>에 따르면 바탕 화면, 문서, 사진 같은 Windows의 중요 폴더는 OneDrive 설정의 <strong>동기화 및 백업 → 백업 관리</strong>에서 선택할 수 있습니다.</p>
  <h2>준비물</h2>
  <ul>
    <li>기존 PC와 전원 어댑터</li>
    <li>기존 PC에서 사용한 Microsoft 계정</li>
    <li>OneDrive 남은 저장 공간</li>
    <li>인터넷 없이도 필요한 파일을 담을 외장 저장장치</li>
  </ul>
  <h2>1. 백업 대상 폴더를 확인합니다</h2>
  <ol>
    <li>작업 표시줄 알림 영역에서 OneDrive 구름 아이콘을 누릅니다.</li>
    <li><strong>도움말 및 설정 → 설정 → 동기화 및 백업 → 백업 관리</strong>로 이동합니다.</li>
    <li>바탕 화면, 문서, 사진 중 필요한 폴더가 켜져 있는지 확인합니다.</li>
  </ol>
  <p>이 목록 밖의 다운로드, 별도 드라이브, 프로그램 전용 데이터는 자동으로 포함된다고 가정하지 말고 직접 위치를 확인하세요. 회사나 학교 PC는 조직 정책이 다를 수 있으므로 관리자 안내를 먼저 따르세요.</p>
  <h2>2. 온라인 전용 파일과 오프라인 파일을 구분합니다</h2>
  <p>파란 구름 아이콘이 붙은 파일은 온라인 전용이라 인터넷이 없으면 열 수 없습니다. 반드시 오프라인에서도 필요한 파일은 마우스 오른쪽 단추를 눌러 <strong>항상 이 장치에 유지</strong>를 선택합니다. 상태별 저장 공간 차이는 <a href="https://support.microsoft.com/ko-kr/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows">OneDrive 요청 기반 파일 공식 안내</a>에서 확인할 수 있습니다.</p>
  <h2>3. OneDrive 웹에서 복원을 시험합니다</h2>
  <ol>
    <li>브라우저의 OneDrive 웹에 기존 PC와 같은 계정으로 로그인합니다.</li>
    <li>최근 문서 1개와 사진 1개를 직접 엽니다.</li>
    <li>파일 이름만 보이는 것이 아니라 내용까지 열리는지 확인합니다.</li>
    <li>중요 폴더의 파일 개수와 최근 수정 파일이 기존 PC와 맞는지 비교합니다.</li>
  </ol>
  <p>새 PC에서는 같은 Microsoft 계정으로 OneDrive에 로그인해야 합니다. 자세한 이전 순서는 <a href="https://support.microsoft.com/ko-kr/onedrive/windows/move-files-to-a-new-windows-pc-using-onedrive">새 Windows PC로 파일 이동 안내</a>에서 확인할 수 있습니다.</p>
  <h2>4. 초기화 전 별도 사본을 남깁니다</h2>
  <p>OneDrive 폴더에서 파일을 삭제하면 웹의 OneDrive에서도 삭제될 수 있습니다. Microsoft의 <a href="https://support.microsoft.com/ko-kr/onedrive/delete-files-or-folders-in-onedrive">파일 및 폴더 삭제 안내</a>도 PC와 OneDrive 양쪽에서 삭제되는 경우를 구분해 설명합니다. 기존 PC 초기화 전에는 가장 중요한 파일을 외장 저장장치에도 복사하고, 복사본을 다른 PC에서 열어 보세요.</p>
  <h2>무엇을 선택할까요?</h2>
  <table>
    <thead><tr><th>목적</th><th>권장 확인</th><th>주의점</th></tr></thead>
    <tbody>
      <tr><td>새 PC에서 파일 이어 쓰기</td><td>OneDrive 웹에서 파일 열기</td><td>같은 Microsoft 계정 필요</td></tr>
      <tr><td>인터넷 없이 파일 사용</td><td>항상 이 장치에 유지</td><td>기존 PC 저장 공간 사용</td></tr>
      <tr><td>삭제·계정 문제에 대비</td><td>외장 저장장치에 별도 복사</td><td>복사 후 실제 열기 필요</td></tr>
    </tbody>
  </table>
</article>

## 직접 확인

- 확인 환경: Microsoft Windows `10.0.26200.8875`
- 로컬 확인 결과: OneDrive 데스크톱 앱과 바탕 화면·문서·사진 폴더가 존재함
- 개인정보 보호를 위해 계정 로그인 상태, 파일 내용, 동기화 상태는 열지 않음
- 독자 재현 항목: OneDrive 웹에서 최근 문서 1개와 사진 1개를 열고 기존 PC와 비교

## 비교

| 방식 | 확인 가능한 것 | 단독 사용 시 놓칠 수 있는 것 |
| --- | --- | --- |
| OneDrive 폴더 백업 | 선택한 중요 폴더의 동기화 | 선택하지 않은 폴더·프로그램 데이터 |
| 항상 이 장치에 유지 | 오프라인 파일 사용 | 별도 장치의 독립 사본 |
| 외장 저장장치 복사 | 클라우드 계정과 분리된 사본 | 복사 이후 변경된 파일 |

## 출처

- [OneDrive를 사용하여 폴더 백업 — Microsoft Support](https://support.microsoft.com/ko-kr/onedrive/back-up-your-folders-with-onedrive)
- [OneDrive 요청 기반 파일 관리 — Microsoft Support](https://support.microsoft.com/ko-kr/onedrive/save-disk-space-with-onedrive-files-on-demand-for-windows)
- [OneDrive를 사용하여 새 Windows PC로 파일 이동 — Microsoft Support](https://support.microsoft.com/ko-kr/onedrive/windows/move-files-to-a-new-windows-pc-using-onedrive)
- [OneDrive에서 파일 또는 폴더 삭제 — Microsoft Support](https://support.microsoft.com/ko-kr/onedrive/delete-files-or-folders-in-onedrive)

## 검수

- 출처 확인일: 2026-08-07
- 과장·고위험 주장: 없음
- 실용적 가치: 복원 시험 절차, 방식 비교표, 삭제 전 복구 불가 위험 보강
- 내부 링크: 관련 공개 글이 없어 미삽입
- 스크린샷: 계정 정보 없는 UI 캡처 환경이 없어 미첨부
- 발행 여부: 발행하지 않음
