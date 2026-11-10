# 07. Claude Code 지시문

## 사용 방법

- 저장소 루트(`dayauto/`)에서 Claude Code를 실행한다. `CLAUDE.md → AGENTS.md`가 자동으로 읽히고, AGENTS.md가 이 폴더를 가리킨다.
- **권장 흐름**: ① 킥오프 프롬프트로 계획만 받기 → ② 계획 확인 후 "일괄 진행" 프롬프트 → ③ 외부 준비물(DB·구글)이 필요한 지점에서 멈추면 `.env.local` 채우고 "재개" 프롬프트.
- 단계마다 커밋이 남으므로, 결과가 이상하면 그 단계 커밋만 되돌리고 해당 단계 프롬프트로 다시 시킬 수 있다.
- 시작 전 사람이 할 일: `develop` 최신화, 02 문서 §7의 외부 준비(가능하면 미리).

---

## ① 킥오프 (계획만, 코드 작성 금지)

```
docs/prototype/ 문서를 README.md의 순서대로 전부 읽어 줘. 이번 작업은 11/30 시연용 프로토타입의 초기 웹을 세팅하는 거야.

이번 메시지에서는 코드를 작성하지 말고 아래만 해 줘.
1. develop에서 feat/ai-prototype-init 브랜치를 만들어 체크아웃.
2. 설치된 Next.js 버전의 node_modules/next/dist/docs/에서 App Router, Server Actions, proxy(구 middleware) 관련 문서를 확인.
3. 설치할 패키지(Auth.js v5, @auth/prisma-adapter, Prisma, date-fns, date-fns-tz, react-big-calendar 등)의 현재 버전과 Next 16·React 19 호환성을 확인하고, 문제가 있으면 대안을 제시.
4. 07 문서의 P1~P6 단계 계획을 네가 이해한 대로 요약하고, 문서끼리 모순되거나 구현이 불가능해 보이는 부분이 있으면 목록으로 알려 줘.
5. .env.local에 어떤 값이 이미 있는지 키 이름만 확인해서 알려 줘 (값은 출력하지 마).
```

## ② 일괄 진행 (P1~P6)

```
docs/prototype/07-claude-code-prompts.md의 P1부터 P6까지 순서대로 진행해 줘.

규칙:
- 각 단계가 끝날 때마다 npm run lint, format:check, typecheck, test, build를 모두 통과시킨 뒤 해당 단계 이름으로 커밋해 (예: "feat: P1 스케줄링 엔진과 단위 테스트"). 통과 못 하면 다음 단계로 넘어가지 마.
- 문서에 없는 결정을 하면 06 문서 §4 표에 한 줄씩 추가하고 같은 커밋에 포함해.
- 범위는 01 문서 §2가 기준이야. 제외 목록에 있는 기능은 만들지 마.
- .env.local에 필요한 값이 없어서 진행할 수 없는 지점(마이그레이션 실행, 구글 로그인 확인 등)에 오면, 그 단계의 코드는 끝까지 작성·커밋하고 멈춘 뒤 내가 채워야 할 값과 확인 방법을 알려 줘.
- 각 단계를 마칠 때 "한 일 / 확인 방법 / 06 문서에 추가한 결정"을 3줄로 보고해.
```

## ③ 재개

```
docs/prototype/ 문서와 git log를 확인해서 어느 단계까지 끝났는지 파악하고, 07 문서 기준으로 다음 단계부터 이어서 진행해 줘. 규칙은 07 문서 ② 일괄 진행과 같아.
```

---

## 단계별 지시 (P1~P6)

각 단계는 위 ②에서 순서대로 읽히지만, 특정 단계만 다시 시킬 때는 해당 블록을 그대로 붙여 넣는다.

### P1. 스케줄링 엔진 + 단위 테스트 (외부 의존 없음)

```
[P1] 04-engine-spec.md 전체를 src/server/engine/에 구현해.
- date-fns, date-fns-tz 설치. 엔진은 순수 함수만, now·timezone은 인자로 받고 new Date()/Date.now() 금지.
- 파일 구성은 02 문서 §3의 engine 하위 구조를 따르고, 타입은 types.ts에. 학습 유형 → 슬롯·청크 규칙 표(03 문서 §3)는 상수 하나로만 둬.
- 04 문서 §8의 테스트 케이스를 전부 Vitest로 작성해. 특히 scenario 테스트(시연 재현)는 05 문서의 기본 시간대와 seed/curriculum.sample.json 데이터를 그대로 써서 만들어.
- DB 없이 엔진만으로 시연 시나리오가 성립하는지 이 단계에서 확인하는 게 목적이야. scenario 테스트 결과(월요일 배분표, 회식 추가 후 제안 내용)를 보고에 표로 보여 줘.
```

### P2. DB 스키마 + 시드

```
[P2] 03-data-model.md대로 Prisma를 세팅해.
- 설치된 Prisma 버전 공식 문서 기준으로 설정 (Supabase: DATABASE_URL은 pooler, DIRECT_URL은 마이그레이션용).
- Auth.js Prisma adapter 표준 모델 + 03 문서의 모델. ERD 대비 변경점 C1~C5를 반영해.
- src/server/db.ts에 Prisma client 싱글턴 (import "server-only").
- prisma/seed.ts: docs/prototype/seed/curriculum.sample.json을 읽어 Exam·ExamSession·CurriculumUnit을 멱등 upsert. package.json에 db:migrate, db:seed, db:reset 스크립트 추가.
- .env.local에 DB 값이 있으면 마이그레이션과 시드까지 실행하고 테이블별 행 수를 보고해. 없으면 실행 직전에 멈추고 알려 줘.
```

### P3. 인증 + 구글 캘린더 동기화

```
[P3] Auth.js v5로 구글 로그인을 붙이고 캘린더 동기화 서비스를 만들어.
- 05 문서 §2의 스코프와 authorization params(access_type=offline, prompt=consent). DB 세션 + Prisma adapter.
- 로그인 보호가 필요하면 Next 16 문서를 확인해서 proxy.ts로 작성 (middleware.ts 아님).
- src/server/clock.ts의 getNow() (DEMO_NOW 지원, 02 문서 §5). .env.example에 DEMO_NOW 주석 추가.
- src/server/calendar/google.ts: 05 문서 §6 사양 (토큰 갱신, 페이지네이션, 10초 타임아웃, 오류 구분).
- src/server/services/sync.ts: 02 문서 §4 흐름의 1~5단계와 ensureWeekSynced(). 구글 응답 → 엔진 입력 변환은 04 문서 §5.1 표대로. 한 트랜잭션으로 저장하고 결과 요약(추가/변경/삭제/겹침/생성된 제안 수)을 반환.
- 아직 화면은 최소로: /login 페이지와, 로그인 후 동기화 결과를 JSON으로 보여 주는 임시 확인용 버튼 정도만. (P5에서 메인으로 교체)
- .env.local에 구글 값이 없으면 코드까지 작성·커밋하고, 내가 할 확인 절차(로그인 → 동기화 → DB에 ExternalEvent 생성 확인)를 알려 줘.
```

### P4. 설정 화면 + 배분 서비스

```
[P4] 05 문서 §3 생활 시간대 입력, §4 목표 등록 화면과 배분 서비스를 만들어.
- src/server/services/allocation.ts: 04 문서 §4.1 실행 조건대로. 배분 직전에 ensureWeekSynced() 호출. 엔진 결과를 Assignment로 저장하고 Goal.urgency·urgencyComputedAt 갱신.
- 목표 등록 시 CurriculumUnit → Task 복사 (03 문서 §3 규칙). 목표 삭제 시 재배분.
- 시간대 저장 시 05 문서 §3의 검증 전부. 기본값은 D-09.
- / 진입 분기(05 문서 §1)도 이 단계에서 구현.
- shadcn 컴포넌트가 더 필요하면 Base UI 기반으로 추가하고 기존 button.tsx 패턴을 따라.
```

### P5. 메인 화면 + 조정안 3택

```
[P5] 05 문서 §5 메인 화면을 만들어. 프로토타입의 핵심 장면이야.
- 주간 캘린더(월요일 시작, 06:00–24:00, 보기 전용), 외부 일정 회색, 배정은 목표별 색과 마이크로/집중 표시, 겹친 배정 강조, 조정안 고스트 블록.
- 우측 패널: 조정안 카드(§5.4), 목표 현황(§5.5), 동기화 기록(§5.3).
- src/server/services/proposals.ts + actions: acceptProposal / reallocateProposal / rejectProposal. 04 문서 §6.1(다시 배분), §6.2(수락 시 재검증) 규칙 그대로. 소유자·PENDING 상태 검증.
- P3의 임시 확인용 화면은 제거.
- 끝나면 01 문서 §1 시연 시나리오 0~6단계를 DEMO_NOW=2026-11-30T09:00:00+09:00 기준으로 어떻게 확인하면 되는지 단계별로 알려 줘.
```

### P6. 마감 정리

```
[P6] 마감 정리를 해 줘.
- README.md에 "프로토타입 실행 방법" 섹션 추가 (02 문서 §7 외부 준비 → .env.local → db:migrate → db:seed → dev → 시연 순서).
- docs/prototype/08-demo-checklist.md 작성: 시연 전날·당일 체크리스트(테스트 사용자 등록, 시드 회차 날짜, 구글 캘린더에 미리 넣어 둘 회사 일정 예시, DEMO_NOW 해제 여부, 리셋 방법).
- 06 문서 §4에 이번 작업 중 추가한 결정이 빠짐없이 있는지 점검.
- 사용하지 않는 코드·임시 로그 정리, 마지막으로 lint/format:check/typecheck/test/build 통과 확인 후 커밋.
- PR은 만들지 말고, PR 본문 초안(.github/PULL_REQUEST_TEMPLATE.md 형식)을 보고에 포함해 줘.
```

---

## 디버깅 단계용 템플릿 (팀원 사용)

### 버그 수정 요청

```
docs/prototype/ 문서를 기준으로 아래 문제를 고쳐 줘.
- 재현: (DEMO_NOW 값, 누른 버튼, 구글 캘린더에 넣은 일정)
- 기대: (어느 문서 몇 절 기준으로 어떻게 되어야 하는지)
- 실제: (화면/에러 메시지)
먼저 원인을 설명하고, 엔진 문제면 실패하는 테스트를 먼저 추가한 뒤 고쳐 줘.
```

### 팀 결정 변경 반영

```
06 문서의 (D-xx 또는 I-xx)를 팀 회의에서 "(새 결정)"으로 바꾸기로 했어.
1. 06 문서 해당 행의 상태를 '변경'으로 바꾸고 새 결정을 적어.
2. 이 결정에 영향받는 다른 문서(03/04/05) 절을 고쳐.
3. 코드와 테스트를 수정해. 기존 테스트 중 바뀌는 기대값은 왜 바뀌는지 커밋 메시지에 적어.
```
