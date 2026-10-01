# DayAuto

자격증·어학 시험을 병행 준비하는 직장인을 위한 AI 학습 일정 관리 서비스 (MVP)

## 기술 스택

- Next.js App Router, TypeScript
- Tailwind CSS / shadcn/ui
- Auth.js (세팅 예정)
- PostgreSQL(Supabase) + Prisma (세팅 예정)
- Vercel

## 브랜치 전략

- `main`: 안정 브랜치. 직접 push 금지
- `develop`: 작업 합류 브랜치. 모든 기능 PR의 대상
- `feat/이름-작업내용`: 기능 작업 브랜치

기능 PR은 **Squash**, 승격(develop → main) PR은 **Merge commit**으로 머지한다.

## 시작하기

1. Node 24 LTS 설치 (nodejs.org의 LTS 버튼으로 설치)
2. `git clone` 후 폴더로 이동
3. `npm install`
4. `.env.example`을 복사해 `.env.local` 생성 (실제 값은 팀 보관소에서)
5. `npm run dev`

## 주요 스크립트

| 스크립트               | 설명                       |
| ---------------------- | -------------------------- |
| `npm run dev`          | 개발 서버 실행             |
| `npm run build`        | 프로덕션 빌드              |
| `npm run lint`         | ESLint 검사                |
| `npm run format`       | Prettier로 코드 정리       |
| `npm run format:check` | Prettier 포맷 검사         |
| `npm run typecheck`    | 타입 검사 (`tsc --noEmit`) |
| `npm test`             | Vitest 단위 테스트 실행    |

## 폴더 구조

```
src/
├── app/                 # 화면(App Router 페이지)
│   └── api/             # API 라우트
│       └── cron/        # 배치 엔드포인트 (CRON_SECRET 인증)
├── server/              # 서버 전용 로직
│   ├── engine/          # 스케줄링 엔진. 순수 함수만, LLM·DB 호출 금지, 테스트 필수
│   └── llm/             # LLM 호출 전용 (의도 해석·사유 문장·커리큘럼 분해)
├── components/ui/       # shadcn/ui 컴포넌트
└── lib/                 # 공용 타입·유틸
```

## 문서

`docs/` 폴더에 컨벤션·초기세팅 매뉴얼을 추가할 예정이다.
