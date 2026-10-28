# 2026-10-28 패치

- 일정 탭 우측 하단에 최상단 이동 버튼을 추가했습니다.
- 관리자 전용 메모 탭에 내용을 바로 보여주는 카드형 메모장을 추가했습니다.
- 빈 공간을 클릭하거나 '+ 메모'를 눌러 메모를 작성할 수 있습니다.
- 카드 손잡이를 끌어 다른 메모 위에 겹치면 이름을 지정해 폴더를 만들 수 있습니다.
- 폴더 이름 변경, 메모 꺼내기, 메모를 보존하는 폴더 해제를 지원합니다.
- 커서 위치에 사진 선택, 붙여넣기, 파일 끌어놓기를 지원합니다.
- 메인 '오늘 완료한 일'에도 입력창을 추가했습니다.
- 기존 공휴일 및 오늘 일정 위치 이동 패치를 유지했습니다.

메모는 편집 후 '저장'을 눌러 반영합니다. 사진은 PNG/JPG/WebP/GIF를 지원하며 원본은 20MB 이하, 저장 파일은 1MB 이하입니다. 큰 이미지는 최대 1600px WebP로 줄이며, 큰 GIF는 정지 이미지가 될 수 있습니다. 메모와 사진은 인증된 관리자 API로만 접근합니다.

## 배포 및 검증

기능 패치는 https://eling-calendar.ielingkk.workers.dev/ 에 배포했습니다.
기존 일정과 기록은 그대로 유지하고 `0002_memos.sql`로 새 테이블만 추가합니다.

```sh
npm ci
npm run check
npm test
npm run deploy
```

문법 검사와 자동 검사 15개를 통과했습니다. 운영 배포 후 기존 기록 109개의 내용이 백업과 동일한지 대조하고 비로그인 메모/사진 접근 차단을 확인했습니다. 실제 로그인 후 브라우저 화면 조작 검증은 도구 중단으로 수행하지 못했습니다.

## 로그인 한 달 유지: 별도 설정 필요

Cloudflare Access 세션 시간은 소스 배포와 별개입니다. 현재 Cloudflare 연결에는 해당 설정 변경 권한이 없어 아직 적용하지 않았습니다.

Cloudflare Zero Trust → Access controls → Applications에서 이 사이트의 앱을 선택한 뒤 Configure → Overview → Session Duration을 **1 month**로 설정합니다. 적용되는 관리자 정책의 Session Duration도 **1 month** 또는 **Same as application**이어야 합니다.

Access settings의 global session duration도 확인하세요. 이는 팀의 다른 Access 앱에도 영향을 줄 수 있습니다. 설정 저장 후 다시 로그인해 새 세션을 발급받습니다.

공식 안내: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
