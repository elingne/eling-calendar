# Eling Calendar · Cloudflare 이전판

> **2026-10-28 업데이트:** 메모·사진·폴더, 일정 최상단 버튼, 완료한 일 입력창을 추가했습니다. 사용법과 로그인 유지 설정 상태는 [패치 안내](PATCH_NOTES.md)를 확인하세요. 아래 이전 안내 중 초기 배포 관련 내용은 최초 설치 시의 설명입니다.

기존 캘린더의 연분홍·연파랑 디자인과 일정/기간 일정, 드래그 이동·복사·정렬, 할 일, 완료 기록, 일정 사이 메모, 기분·생리 기록을 유지했습니다. 목표·월별 목표 통계·다꾸·스티커 기능은 제거했고, 사진은 관리자 전용 메모장에서만 사용합니다.

## 공개 범위

| 방문자 | 가능한 일 |
| --- | --- |
| 비로그인 | 메인 캘린더, 일정 제목·날짜·표시색 조회 |
| `ielingkk@gmail.com` 관리자 | 전체 일정·개인 메모·할 일·완료 기록·기분·생리 기록·메모장(폴더·사진) 조회 및 편집 |

일정의 `description` 메모와 개인 기록은 공개 API에 포함되지 않습니다. 메모장의 메모와 사진도 관리자 인증을 통과한 API로만 접근할 수 있습니다. 캘린더에 표시되는 **일정 제목은 공개**됩니다. 기존 Supabase 회원 계정은 이전하지 않습니다. 본인 이메일로 Cloudflare Access 인증번호를 받아 로그인합니다.

## 구성

- `public/`: 브라우저 화면. 외부 SDK와 Supabase 연결 없음.
- `src/worker.js`: Cloudflare Worker API. Access JWT 서명·발급자·대상·만료와 관리자 이메일을 검증.
- `src/memos.js`: 관리자 메모장·사진 API. Worker가 관리자 인증을 통과시킨 요청만 전달받음.
- `migrations/`: Cloudflare D1 데이터 구조. JSON 레코드를 사용해 기존 데이터의 추가 열도 보존. `0002_memos.sql`은 메모 테이블만 추가.
- `scripts/`: CSV/JSON 이전 및 이전 결과 비교 도구. 운영 서버에서는 실행되지 않음.
- `tests/`: 일정 저장·수정·삭제, 공개/관리자 분리, 데이터 이전 검사.

**이 사이트는 이미 Cloudflare에 배포되어 운영 중입니다(배포·검증 상태는 [PATCH_NOTES.md](PATCH_NOTES.md) 참고). 아래 1~5번은 최초 설치와 데이터 이전 때의 절차 기록이며, 이미 설정된 저장소에서는 다시 실행하지 않습니다.**

## 1. 기존 데이터 내보내기

기존 사이트의 편집을 잠시 멈추고 Supabase Dashboard → Table Editor에서 다음 테이블의 **전체 행**을 CSV로 내보냅니다. 필터·페이지 제한이 없는 전체 내보내기인지 확인하세요.

필수: `events.csv`.

다른 기록도 유지하려면: `quick_todos.csv`, `todos.csv`, `schedule_notes.csv`, `moods.csv`, `period_records.csv`.

테이블이 없거나 비어 있다면 해당 파일은 생략할 수 있습니다. 테이블이 있는데 파일을 생략하면 그 기록은 이전되지 않습니다. SQL Editor에서 내보내려면 [DATA_EXPORT.sql](DATA_EXPORT.sql)의 SELECT를 각각 실행해 전체 CSV를 저장하세요.

이 파일들을 이 프로젝트 안의 `data-export/` 폴더에 넣으세요. 원본 파일은 별도로 백업하세요. 데이터 파일은 GitHub에 올리지 마세요. `goals`, `daily_goal_records`, `stickers`, `day_decorations`, `site_settings`와 Auth 계정은 사용하지 않습니다. 제거된 기능의 데이터가 필요하면 Supabase에서 별도 백업하세요. 이 도구는 원본 DB를 변경하거나 삭제하지 않습니다.

## 2. D1 생성과 기본 배포

Node.js 24와 터미널을 사용합니다. 모든 명령은 이 README가 있는 폴더에서 실행합니다.

```powershell
npm ci
npx wrangler login
npx wrangler d1 create eling-calendar
```

마지막 명령으로 받은 `database_id`를 `wrangler.jsonc`의 `database_id`에 넣습니다(현재 저장소에는 운영 DB의 값이 이미 들어 있습니다). `database_name`과 `name`은 `eling-calendar`로 유지합니다.

```powershell
npx wrangler d1 migrations apply eling-calendar --remote
npx wrangler deploy
```

초기에는 데이터가 없는 공개 캘린더가 배포됩니다. 로그인 설정이 끝나기 전에는 관리자 API가 기본 거부됩니다.

## 3. 관리자 이메일 로그인

1. Cloudflare Workers & Pages → `eling-calendar` → Settings → Domains & Routes에서 Cloudflare가 관리하는 도메인/서브도메인을 Custom Domain으로 연결합니다. 예: `calendar.본인도메인`.
2. Cloudflare Zero Trust에서 팀을 만들고 Authentication → Login methods에 **One-time PIN**을 추가합니다.
3. Access → Applications에서 **Self-hosted** 앱 하나를 만들고, **같은 앱 안에** 다음 두 경로를 추가합니다. 전체 도메인을 잠그면 외부인이 캘린더를 볼 수 없으므로 경로를 꼭 지정합니다.
   - `calendar.본인도메인/admin`
   - `calendar.본인도메인/api/private`
   경로 아래 하위 주소도 보호되는지 정책 화면에서 확인합니다. 환경에 따라 하위 경로 와일드카드도 추가하되, 같은 앱의 AUD를 사용합니다.
4. Allow 정책은 **Emails → `ielingkk@gmail.com` 한 주소**로 지정합니다. Everyone 또는 이메일 도메인 전체 허용은 사용하지 않습니다. 로그인 방식은 One-time PIN으로 지정합니다. 세션 시간은 [PATCH_NOTES.md의 로그인 유지 안내](PATCH_NOTES.md#로그인-한-달-유지-별도-설정-필요)를 따릅니다.
5. 앱의 Application Audience (AUD)와 팀 도메인 (`팀이름.cloudflareaccess.com`)을 복사해 `wrangler.jsonc`의 `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`에 넣습니다. `OWNER_EMAIL`은 이미 지정되어 있습니다. AUD와 팀 도메인은 비밀 키가 아닙니다.
6. `npm run deploy`로 다시 배포합니다. 방금 연결한 **Custom Domain**에서 관리자 로그인을 누르고 이메일 인증번호로 로그인하세요.

Worker 전체를 잠그는 원클릭 Access 기능은 사용하지 않습니다. Worker 기본 `workers.dev` 주소나 다른 호스트를 이용해도 유효한 JWT 없이는 관리자 데이터에 접근할 수 없습니다. 관리자 로그인은 Access 경로를 설정한 Custom Domain에서 사용합니다. Worker에는 우회용 비밀번호나 개발용 관리자 권한이 없습니다.

공식 문서: [Access 앱 생성](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/), [이메일 인증번호](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [JWT 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 4. 일정 데이터 넣기와 검증

데이터 이전 중에는 새 사이트에서도 편집하지 않습니다. D1이 빈 상태인지 먼저 확인합니다.

```powershell
npx wrangler d1 execute eling-calendar --remote --command "SELECT collection, COUNT(*) AS count FROM records GROUP BY collection"
node scripts/convert-export.mjs data-export migration-output
```

변환 결과에서 파일별 건수와 생략된 테이블을 확인하세요. 변환 도구는 제목, 메모, 줄바꿈, 색상, 순서, 완료 여부, ID와 원본의 추가 열을 보존합니다. JSON을 입력할 경우 테이블 이름의 `.json` 파일에 행 배열을 넣으세요. CSV와 JSON이 둘 다 있으면 JSON을 사용합니다.

**기존 D1 기록이 있다면 가져오기를 멈추고 먼저 백업합니다.** 가져오기는 빈 대상에서 한 번만 실행하세요. 중복 ID를 덮어쓰지 않고 오류로 중단합니다. 파일 전체의 원자적 적용을 전제하지 않으므로 중간 실패 후 같은 파일을 반복 실행하지 마세요. 실패 시에는 새 D1 DB를 만들어 재시도하거나, 확인한 백업으로 복원한 뒤 진행하세요.

```powershell
New-Item -ItemType Directory -Force backups
npx wrangler d1 export eling-calendar --remote --output backups/before-import.sql
npx wrangler d1 execute eling-calendar --remote --file migration-output/import.sql
npx wrangler d1 execute eling-calendar --remote --command "SELECT collection,id,data FROM records ORDER BY collection,id" --json | Out-File -Encoding utf8 backups/d1-records.json
node scripts/verify-export.mjs migration-output/manifest.json backups/d1-records.json
```

모든 테이블이 `일치`인지 확인합니다. 비교 도구는 **행 수뿐 아니라 전체 필드의 SHA-256 값**도 비교합니다. 이 검증은 가져오기 직후, 추가 편집 전에 실행해야 합니다. 누락 파일은 검증 대상에서 제외되므로 원본 테이블 목록과 함께 확인하세요.

기존 일정이 있는 달로 이동해 시작·종료일과 제목을 확인하고, 관리자 로그인 후 비공개 메모와 완료 기록도 확인하세요. 새 일정을 하나 만들어 수정·드래그·삭제하고 로그아웃한 창에서 개인 기록이 안 보이는지도 확인하세요. 이 확인과 전체 데이터 대조가 끝날 때까지 기존 Supabase 프로젝트는 유지하세요. 운영 앱은 Supabase에 접속하지 않습니다.

## 5. GitHub에 올리면 자동 패치

1. 이 프로젝트의 **내용 전체**를 기존 GitHub 저장소의 루트에 올립니다. 기존 루트의 `index.html`, `app.js`, `style.css`, `supabase.js`는 새 구조로 교체해 제거합니다. 새 화면은 `public/`에 있습니다. 원본 소스는 별도 백업하세요. `.gitignore`와 `package-lock.json`도 포함합니다. `node_modules/`, `.wrangler/`, 데이터 내보내기 파일과 백업은 올리지 않습니다.
2. Cloudflare Workers & Pages → `eling-calendar` → Settings → Builds → **Connect**에서 GitHub 저장소를 연결합니다.
3. Production branch는 `main`, Root directory는 `/`, Build command는 `npm run check && npm test`, Deploy command는 `npm run deploy`로 지정합니다. 설치 명령을 지정할 수 있다면 `npm ci`를 사용합니다. Build 환경 변수 `NODE_VERSION`은 `24.14.1`로 지정합니다.
4. 테스트 브랜치의 자동 배포는 끕니다. 별도 미리보기 DB를 설정하기 전에는 테스트 브랜치에 운영 DB를 공유하지 마세요. GitHub Actions를 별도로 중복 연결할 필요는 없습니다.
5. 이후 `main`에 커밋하거나 GitHub에서 파일을 수정하고 Commit changes를 누르면 테스트 → D1의 아직 적용하지 않은 스키마 변경 → Worker·화면 배포가 자동 실행됩니다. 기존 일정 데이터는 코드 패치 시 초기화되지 않습니다. 가져오기 도구는 자동 배포에서 실행되지 않습니다.

Cloudflare 프로젝트 이름과 `wrangler.jsonc`의 `name`이 같아야 합니다. [Git 연결 공식 문서](https://developers.cloudflare.com/workers/ci-cd/builds/).

## 로컬 검사

```powershell
npm ci
npm run check
npm test
npm run db:local
npm run dev
```

로컬은 기본적으로 공개 모드입니다. 관리자 흐름의 실제 이메일 인증·도메인·GitHub 자동 배포는 계정 설정 후 확인해야 합니다. 테스트는 SQLite 기반으로 데이터 보존과 API 권한 거부를 검사하며 실제 Cloudflare 계정 설정을 대체하지 않습니다.

## 되돌리기

코드 문제가 생기면 GitHub의 해당 커밋을 되돌려 재배포합니다. 데이터는 별도이므로 코드 롤백만으로 이전 상태로 돌아가지 않습니다. 데이터 변경 전에는 D1 export 백업을 만들고, 필요 시 새 D1 DB에 백업을 복원한 다음 바인딩을 변경합니다. 코드 자동 배포에는 기존 기록을 삭제하는 쿼리가 포함되어 있지 않습니다.
