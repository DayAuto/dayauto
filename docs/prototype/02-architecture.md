# 02. 아키텍처

## 1. 현재 저장소 상태 (2026-11-10 기준)

- Next.js **16.3.8** (App Router) + React 19.2 + TypeScript, Tailwind v4, shadcn/ui(**Base UI 기반**, `src/components/ui/button.tsx`만 존재), Vitest, ESLint, Prettier.
- 아직 없는 것: Auth.js, Prisma, DB 스키마, 캘린더 라이브러리, date-fns/date-fns-tz.
- 규칙은 루트 `AGENTS.md`가 기준 (CLAUDE.md가 import). 특히:
  - Next 16은 학습 데이터와 다르다 → **`node_modules/next/dist/docs/`의 해당 가이드를 먼저 읽고** 코드 작성. (예: Next 16에서는 `middleware.ts`가 `proxy.ts`로 바뀜)
  - `src/server/engine`은 순수 함수 + 테스트 필수. 엔진 외 `src/server/**` 파일은 첫 줄 `import "server-only"`.
  - shadcn 컴포넌트 추가 시 Radix 예제를 그대로 쓰지 말고 Base UI 패턴을 따를 것.
- CI(`.github/workflows/ci.yml`): `lint → format:check → typecheck → test → build`. **각 단계 종료 시 이 5개가 모두 통과해야 한다.** (`format:check`는 `docs/` 마크다운도 검사함)

## 2. 프로토타입에서 쓰는 스택

| 영역      | 선택                                                             | 비고                                                                         |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 인증      | Auth.js v5 (`next-auth@beta`) + Google provider + Prisma adapter | `access_type=offline`, `prompt=consent`로 refresh token 확보. 세션은 DB 세션 |
| DB        | PostgreSQL (Supabase) + Prisma                                   | Supabase는 **DB 호스팅만** 사용 (Supabase Auth 미사용)                       |
| 시간      | `date-fns` + `date-fns-tz`                                       | 타임존 계산 직접 구현 금지                                                   |
| 캘린더 UI | `react-big-calendar` (date-fns localizer, 월요일 시작)           | React 19 호환 문제가 있으면 FullCalendar로 대체하고 06 문서에 기록           |
| 구글 API  | `fetch`로 Calendar REST 직접 호출                                | `googleapis` 패키지는 무겁고 필요 기능이 events.list 하나뿐                  |
| 서버 변경 | Server Actions                                                   | 동기화·목표 등록·3택 선택 모두 Server Action. Route Handler는 Auth.js용만    |
| 테스트    | Vitest (엔진만)                                                  |                                                                              |

**설치하지 않는 것**: AI SDK, LLM SDK, Resend, PostHog, Sentry, googleapis.

> 패키지 버전은 설치 시점의 최신 안정판을 쓰되, **Prisma·Auth.js는 설치된 버전의 공식 문서 기준으로 설정**할 것. (Prisma 7은 `prisma.config.ts`·드라이버 어댑터 등 설정 방식이 이전과 다름)

## 3. 폴더 구조 (목표)

```
prisma/
├── schema.prisma
├── seed.ts                      # Exam·ExamSession·CurriculumUnit 시드 (멱등)
└── (migrations/)
docs/prototype/seed/curriculum.sample.json   # 시드 원본 (seed.ts가 읽음)
src/
├── auth.ts                      # Auth.js 설정 (Google, Prisma adapter, 스코프)
├── proxy.ts                     # (필요 시) 로그인 보호. Next 16 문서 확인 후 작성
├── app/
│   ├── api/auth/[...nextauth]/route.ts
│   ├── login/page.tsx
│   ├── setup/windows/page.tsx   # 생활 시간대 입력
│   ├── setup/goals/page.tsx     # 목표 등록
│   └── page.tsx                 # 메인: 주간표 + 우측 패널
├── components/
│   ├── ui/                      # shadcn (Base UI)
│   ├── week-calendar.tsx
│   ├── proposal-card.tsx
│   └── ...
├── server/
│   ├── engine/                  # 순수 함수 (DB·LLM·Date.now() 호출 금지, now는 인자로)
│   │   ├── types.ts
│   │   ├── time.ts              # 주 경계, 청크 그리드, 로컬↔UTC (date-fns-tz)
│   │   ├── urgency.ts
│   │   ├── allocate.ts          # 주간 배분
│   │   ├── changes.ts           # 외부 일정 변경 식별 + 겹침 검사
│   │   ├── reallocate.ts        # 재배분안 생성
│   │   ├── reason.ts            # 사유 문장 템플릿
│   │   ├── index.ts
│   │   └── __tests__/
│   ├── db.ts                    # Prisma client 싱글턴
│   ├── clock.ts                 # getNow(): DEMO_NOW 지원
│   ├── calendar/google.ts       # 토큰 갱신 + events.list
│   ├── services/                # DB 읽기 → 엔진 호출 → DB 쓰기 (트랜잭션)
│   │   ├── allocation.ts
│   │   ├── sync.ts
│   │   └── proposals.ts
│   └── actions/                 # "use server" 액션 (얇게: 인증 확인 + 서비스 호출)
└── lib/
```

`src/server/llm/index.ts`와 `src/app/api/cron/route.ts`는 **건드리지 않는다** (프로토타입 범위 밖, 기존 자리 유지).

## 4. 데이터 흐름

```
[동기화 클릭]
 → actions/sync → services/sync
    1. Google events.list (이번 주 범위, singleEvents=true, showDeleted=true)
    2. DB의 ExternalEvent(이번 주)와 함께 engine/changes.diffEvents() → 추가/변경/삭제
    3. ExternalEvent upsert / CANCELLED 처리
    4. 추가·변경 일정마다 engine/changes.findConflicts() → 겹친 PLANNED 배정
    5. 겹침이 있으면 engine/reallocate.buildProposal() → Proposal(PENDING) + ProposalItem 저장
       (Assignment는 바꾸지 않음 = 제안 상태)
 → 화면 revalidate → 우측 패널에 조정안 카드

[3택 클릭]
 → actions/proposals → services/proposals
    - 이대로 진행: 대상 시간이 여전히 비어 있는지 재검증 → Assignment 이동 → ACCEPTED
    - 다시 배분: 기존 안 SUPERSEDED, 이전 안들의 목표 시간을 제외하고 새 안 생성
    - 원래 일정대로: REJECTED (배정 변경 없음)
```

## 5. 시각(now) 처리

- 엔진 함수는 `now: Date`를 **인자로 받는다**. 엔진 안에서 `new Date()` 금지 (결정론·테스트).
- `src/server/clock.ts`의 `getNow()`: `process.env.DEMO_NOW`(ISO 문자열)가 있고 `NODE_ENV !== "production"`이면 그 값을, 아니면 현재 시각을 반환. 주말·밤에 개발할 때 "월요일 오전"을 재현하는 용도.
- 사용자 타임존은 `User.timezone`(기본 `Asia/Seoul`).

## 6. 환경변수 (`.env.example`에 추가할 것만)

```
# --- 개발 편의 (production에서 무시) ---
# DEMO_NOW=2026-11-30T09:00:00+09:00
```

기존 키 중 프로토타입이 쓰는 것: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. 나머지는 비워 둬도 동작해야 한다.

## 7. 사람이 미리 해야 하는 외부 준비 (Claude Code는 할 수 없음)

| 항목             | 내용                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase         | 프로젝트 생성 → `DATABASE_URL`(pooler, `?pgbouncer=true`)과 `DIRECT_URL`(직접 연결)을 `.env.local`에                                                                        |
| Google Cloud     | 프로젝트 생성 → **Google Calendar API 사용 설정** → OAuth 동의 화면(외부, **테스트 모드**) → 스코프에 `calendar.events.readonly` 추가 → **테스트 사용자에 팀원 Gmail 등록** |
| OAuth 클라이언트 | 유형 "웹 애플리케이션", 승인된 리디렉션 URI `http://localhost:3000/api/auth/callback/google` → ID/Secret을 `AUTH_GOOGLE_ID/SECRET`에                                        |
| AUTH_SECRET      | `npx auth secret` 또는 임의 32바이트 base64                                                                                                                                 |

테스트 모드에서는 민감 스코프 검증 없이 등록된 테스트 사용자(최대 100명)만 로그인 가능하다. 시연 계정을 반드시 테스트 사용자에 넣을 것.
