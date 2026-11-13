# DayAuto

자격증·어학 시험을 병행 준비하는 직장인을 위한 AI 학습 일정 관리 서비스 (MVP)

## 기술 스택

- Next.js App Router, TypeScript
- Tailwind CSS / shadcn/ui
- Auth.js v5 (Google 로그인, DB 세션)
- PostgreSQL(Supabase) + Prisma 7 (`@prisma/adapter-pg`)
- Vercel

## 브랜치 전략

- `main`: 안정 브랜치. 직접 push 금지
- `develop`: 작업 합류 브랜치. 모든 기능 PR의 대상
- `feat/이름-작업내용`: 기능 작업 브랜치

기능 PR은 **Squash**, 승격(develop → main) PR은 **Merge commit**으로 머지한다.

## 시작하기

1. Node 24 LTS 설치 (nodejs.org의 LTS 버튼으로 설치)
2. `git clone` 후 폴더로 이동
3. 아래 "프로토타입 실행 방법"을 따른다

## 프로토타입 실행 방법

11/30 시연용 프로토타입을 **처음 받아서 실행하는 순서**다. 범위와 명세는 [docs/prototype/README.md](docs/prototype/README.md)를 본다. (시연 당일 체크리스트는 [08-demo-checklist.md](docs/prototype/08-demo-checklist.md))

### 1. Supabase 프로젝트 만들기 (각자)

DB는 **각자 자기 Supabase 프로젝트**를 만들어 쓴다. (팀원끼리 DB를 공유하면 서로의 시연 데이터를 덮어쓴다)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만든다. (무료 플랜)
2. 프로젝트의 **Connect → Session pooler** 연결 문자열(포트 **5432**)을 복사한다. 비밀번호 칸은 프로젝트 생성 때 정한 DB 비밀번호로 바꾼다.
   - `?pgbouncer=true` 같은 옵션은 붙이지 않는다.
   - Direct connection(`db.<ref>.supabase.co`)은 IPv6 전용인 경우가 많아 쓰지 않는다.

### 2. `.env.local` 만들기

`.env.example`을 복사해 `.env.local`을 만들고 아래 4개를 채운다. 나머지 키는 비워 둬도 동작한다.

| 키                   | 값                                                                              |
| -------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`       | 1번에서 복사한 Session pooler 연결 문자열                                       |
| `AUTH_SECRET`        | `npx auth secret`으로 생성하거나 임의의 32바이트 base64 문자열                  |
| `AUTH_GOOGLE_ID`     | 구글 OAuth 클라이언트 ID (팀 보관소 값을 쓰거나 아래 "구글 설정"으로 직접 생성) |
| `AUTH_GOOGLE_SECRET` | 구글 OAuth 클라이언트 보안 비밀 (위와 같은 출처)                                |

`.env.local`은 커밋하지 않는다. (`.gitignore`에 포함)

### 3. 설치 → 마이그레이션 → 시드 → 실행

```bash
npm install          # postinstall에서 prisma generate가 자동 실행된다
npm run db:migrate   # 테이블 생성 (prisma/migrations 적용)
npm run db:seed      # 종목·회차·커리큘럼 시드 (여러 번 실행해도 중복되지 않는다)
npm run dev          # http://localhost:3000
```

시드의 종목·회차 날짜는 가안이다. 실제 회차가 정해지면 `docs/prototype/seed/curriculum.sample.json`만 고치고 `npm run db:seed`를 다시 실행한다.

### 4. 구글 테스트 사용자 확인

구글 OAuth 동의 화면이 **테스트 모드**이면 등록된 테스트 사용자만 로그인할 수 있다.

- 로그인할 Gmail 계정이 Google Cloud 콘솔 → OAuth 동의 화면 → **테스트 사용자**에 등록되어 있는지 확인한다. (없으면 "액세스 차단됨" 오류가 난다)
- 로그인 중 "확인되지 않은 앱" 경고가 뜨면 **고급 → 계속**으로 진행한다.
- 동의 화면에서 **캘린더 항목 체크를 해제하지 않는다**. 해제하면 동기화가 실패한다.

### 5. 첫 사용 흐름

1. `http://localhost:3000` 접속 → **Google로 시작하기**
2. `/setup/windows`: 생활 시간대 저장 (기본값 그대로 저장해도 된다)
3. `/setup/goals`: 종목과 회차를 골라 목표 등록 (토익, 산업안전기사 필기)
4. `/`: 주간표 확인 → 구글 캘린더에 일정을 추가하고 **[동기화]** → 조정안 카드에서 3택

### 구글 설정 (직접 OAuth 클라이언트를 만드는 경우)

팀 공용 클라이언트를 쓴다면 이 단계는 필요 없다. 공용 클라이언트의 **테스트 사용자에 본인 Gmail을 추가**하는 것만 하면 된다.

1. [Google Cloud 콘솔](https://console.cloud.google.com)에서 프로젝트 생성 → **Google Calendar API 사용 설정**
2. OAuth 동의 화면: 유형 **외부**, 게시 상태 **테스트** → 스코프에 `.../auth/calendar.events.readonly` 추가 → 테스트 사용자에 본인 Gmail 등록
3. 사용자 인증 정보 → OAuth 클라이언트 ID(유형: 웹 애플리케이션) → 승인된 리디렉션 URI에 `http://localhost:3000/api/auth/callback/google` 추가
4. 발급된 클라이언트 ID/보안 비밀을 `.env.local`의 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`에 넣는다

> 테스트 모드의 refresh token은 **7일 뒤 만료**된다. 오래 쓰지 않았다면 앱에서 다시 로그인한다.

### 날짜 리허설 (`DEMO_NOW`)

주말·밤에 "월요일 오전 시연"을 재현하려면 `.env.local`에 아래를 추가하고 dev 서버를 재시작한다. (production에서는 무시된다)

```
DEMO_NOW=2026-11-30T09:00:00+09:00
```

앱은 `DEMO_NOW`가 속한 주(11/30~12/6)를 "이번 주"로 보고 **그 주의 구글 일정**을 조회한다. 리허설용 구글 일정도 그 주에 넣어야 한다. 끝나면 `DEMO_NOW`를 지운다.

### 데이터 초기화

| 하고 싶은 것                             | 방법                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| 학습 배정과 대기 중 조정안만 다시 만들기 | `/setup/windows`에서 [저장]을 한 번 누른다 (미래 배정을 지우고 재배분)                        |
| 목표부터 다시                            | `/setup/goals`에서 삭제 후 다시 등록                                                          |
| DB 전체 초기화                           | `npm run db:reset` → 앱에서 다시 로그인 (계정 정보도 지워지므로 구글 동의 화면이 다시 나온다) |

### 자주 겪는 문제

| 증상                                       | 원인·해결                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 목표 등록 화면의 종목 드롭다운이 비어 있다 | 시드가 안 들어갔다. `npm run db:seed`                                                         |
| 회차 드롭다운이 비어 있다                  | 회차는 "오늘 이후"만 보인다. `DEMO_NOW`를 쓰면 그 날짜 기준이다                               |
| 로그인 시 "액세스 차단됨"                  | 구글 테스트 사용자에 등록되지 않았다 (4번)                                                    |
| "구글 연결이 만료되었습니다"               | refresh token 만료. 앱에서 로그아웃 후 다시 로그인                                            |
| DB 연결 오류                               | `DATABASE_URL` 확인. Supabase 무료 프로젝트가 일시정지되지 않았는지 확인 (7일 미사용 시 정지) |

## 주요 스크립트

| 스크립트               | 설명                                                          |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | 개발 서버 실행                                                |
| `npm run build`        | 프로덕션 빌드                                                 |
| `npm run lint`         | ESLint 검사                                                   |
| `npm run format`       | Prettier로 코드 정리                                          |
| `npm run format:check` | Prettier 포맷 검사                                            |
| `npm run typecheck`    | 타입 검사 (`tsc --noEmit`)                                    |
| `npm test`             | Vitest 단위 테스트 실행                                       |
| `npm run db:migrate`   | 마이그레이션 적용 (`prisma migrate dev`)                      |
| `npm run db:seed`      | 종목·회차·커리큘럼 시드 (멱등)                                |
| `npm run db:reset`     | DB 전체 초기화 후 시드 (개발 DB 전용, 데이터가 모두 지워진다) |

## 폴더 구조

```
prisma/                  # 스키마, 마이그레이션, 시드
src/
├── app/                 # 화면(App Router 페이지)
│   ├── api/             # API 라우트 (auth, cron)
│   ├── login/           # 로그인
│   └── setup/           # 생활 시간대·목표 등록
├── server/              # 서버 전용 로직
│   ├── engine/          # 스케줄링 엔진. 순수 함수만, LLM·DB 호출 금지, 테스트 필수
│   ├── services/        # DB 읽기 → 엔진 호출 → DB 쓰기 (동기화·배분·조정안)
│   ├── actions/         # Server Action ("use server")
│   ├── calendar/        # 구글 캘린더 REST 호출
│   └── llm/             # LLM 호출 전용 (프로토타입 범위 밖)
├── components/          # 화면 컴포넌트 (ui/ 는 shadcn/ui)
└── lib/                 # 공용 타입·유틸
```
