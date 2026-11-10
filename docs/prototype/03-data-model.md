# 03. 데이터 모델

기준: 팀 ERD 초안 v1. 아래 Prisma 스키마는 **참고용 형태**이며, generator/datasource 블록과 문법 세부는 설치된 Prisma 버전 문서에 맞춘다. 모델·필드·제약은 이 문서를 따른다.

## 1. ERD 초안 대비 변경점 (팀 검토 필요 — 06 문서 I-01, I-08과 동일)

| #   | 변경                                                       | 이유                                                                                               |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1  | `TaskType`의 `LISTENING_READING` → **`SET_PRACTICE`**      | ERD 안에서 열거형(LISTENING_READING)과 범위표(SET_PRACTICE)가 서로 다름. 범위표의 정의가 더 일반적 |
| C2  | `ProposalItem.toStartAt/toEndAt`을 **nullable**로          | "이번 주에 옮길 빈 시간이 없음"을 표현할 방법이 없음. null = 이번 주에서 배정 해제                 |
| C3  | `AssignmentStatus`에 **`UNSCHEDULED`** 추가                | C2를 수락했을 때 배정을 지우지 않고 "배정 해제" 상태로 남겨 이력·잔여량 계산을 유지                |
| C4  | `ProposalItem.toAvailabilityWindowId`, `toWindowKind` 추가 | 수락 시 Assignment의 시간대 참조(`availabilityWindowId`, `windowKind`)도 함께 바꿔야 함            |
| C5  | `ExternalEvent`에 `isBusy` 불리언 추가                     | 구글의 "한가함(transparent)" 일정과 본인이 거절한 일정을 충돌에서 제외하기 위함                    |

## 2. 열거형

| 이름                | 값                                                         |
| ------------------- | ---------------------------------------------------------- |
| TaskType            | CONCEPT, SET_PRACTICE, PRACTICE, REVIEW, MEMORIZE, UNKNOWN |
| SlotType            | MICRO, FOCUS                                               |
| WindowKind          | COMMUTE_TO_WORK, LUNCH, COMMUTE_FROM_WORK, AFTER_WORK      |
| GoalStatus          | ACTIVE, ON_HOLD, EXPIRED                                   |
| AssignmentStatus    | PLANNED, DONE, MISSED, UNSCHEDULED                         |
| ExternalEventStatus | ACTIVE, CANCELLED                                          |
| ProposalStatus      | PENDING, ACCEPTED, REJECTED, SUPERSEDED                    |

## 3. 학습 유형 → 슬롯·청크 규칙 (태스크 생성 시 부여, 커리큘럼에는 저장하지 않음)

| TaskType     | 의미                       | slotType | minChunks | maxChunks |
| ------------ | -------------------------- | -------- | --------- | --------- |
| CONCEPT      | 개념 학습                  | FOCUS    | 2         | 4         |
| SET_PRACTICE | 연속 실전 풀이 (세트 단위) | FOCUS    | 2         | 4         |
| PRACTICE     | 낱문제 풀이                | MICRO    | 1         | 1         |
| REVIEW       | 오답 확인                  | MICRO    | 1         | 1         |
| MEMORIZE     | 암기                       | MICRO    | 1         | 1         |
| UNKNOWN      | 판별 불가                  | FOCUS    | 2         | 4         |

이 표는 `src/server/engine/types.ts`(또는 `rules.ts`)에 상수로 한 곳에만 둔다.

## 4. 시간 저장 규칙

- 특정 시각(`startAt`, `endAt` 등): **UTC `DateTime`**.
- 생활 시간대: **사용자 로컬 기준 "자정부터 몇 분째" 정수** (0~1440, 15의 배수). UTC로 바꾸지 않는다 (매일 반복되는 벽시계 시각이므로).
- 시험일: `@db.Date`.
- 주의 시작: **월요일 00:00 (사용자 타임존)**.
- 요일 숫자: 0=일 ~ 6=토 (JS `getDay()`와 동일).

## 5. 모델 (참고 스키마)

```prisma
// Auth.js Prisma adapter 표준 모델 (User, Account, Session, VerificationToken)은
// 설치된 @auth/prisma-adapter 문서의 스키마를 그대로 쓰고, User에만 아래 필드를 추가한다.
model User {
  // ... adapter 표준 필드 (id, name, email, emailVerified, image, accounts, sessions)
  timezone           String               @default("Asia/Seoul")
  lastSyncedAt       DateTime?
  availabilityWindows AvailabilityWindow[]
  externalEvents     ExternalEvent[]
  goals              Goal[]
  proposals          Proposal[]
}

model Exam {
  id               String           @id @default(cuid())
  name             String           @unique
  sessions         ExamSession[]
  curriculumUnits  CurriculumUnit[]
  goals            Goal[]
}

model ExamSession {
  id       String   @id @default(cuid())
  examId   String
  exam     Exam     @relation(fields: [examId], references: [id], onDelete: Cascade)
  name     String
  examDate DateTime @db.Date
  goals    Goal[]
  @@unique([examId, examDate])
}

model CurriculumUnit {
  id              String   @id @default(cuid())
  examId          String
  exam            Exam     @relation(fields: [examId], references: [id], onDelete: Cascade)
  subject         String
  unitName        String
  taskType        TaskType
  estimatedChunks Int
  sortOrder       Int
  tasks           Task[]
  @@unique([examId, sortOrder])
}

model Goal {
  id                String       @id @default(cuid())
  userId            String
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  examId            String?
  exam              Exam?        @relation(fields: [examId], references: [id])
  examSessionId     String?
  examSession       ExamSession? @relation(fields: [examSessionId], references: [id])
  title             String
  examDate          DateTime     @db.Date
  priority          Int          @default(100)   // 작을수록 높음. 프로토타입은 입력받지 않음
  status            GoalStatus   @default(ACTIVE)
  urgency           Float?                        // 표시·기록용. 정렬은 엔진의 정수 비교로
  urgencyComputedAt DateTime?
  createdAt         DateTime     @default(now())
  tasks             Task[]
}

model Task {
  id               String          @id @default(cuid())
  goalId           String
  goal             Goal            @relation(fields: [goalId], references: [id], onDelete: Cascade)
  curriculumUnitId String?
  curriculumUnit   CurriculumUnit? @relation(fields: [curriculumUnitId], references: [id], onDelete: SetNull)
  subject          String
  unitName         String
  taskType         TaskType
  slotType         SlotType
  minChunks        Int
  maxChunks        Int
  estimatedChunks  Int
  sortOrder        Int
  assignments      Assignment[]
}

model AvailabilityWindow {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind        WindowKind
  startMinute Int          // 0~1440, 15의 배수, start < end (애플리케이션 검증)
  endMinute   Int
  slotType    SlotType
  weekdays    Int[]        // 0=일 ~ 6=토, 최소 1개
  assignments Assignment[]
}

model ExternalEvent {
  id              String              @id @default(cuid())
  userId          String
  user            User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  googleEventId   String
  title           String
  startAt         DateTime
  endAt           DateTime
  isAllDay        Boolean
  isBusy          Boolean             @default(true)   // C5
  status          ExternalEventStatus @default(ACTIVE)
  googleUpdatedAt DateTime
  lastSeenAt      DateTime
  proposals       Proposal[]
  @@unique([userId, googleEventId])
}

model Assignment {
  id                   String              @id @default(cuid())
  taskId               String
  task                 Task                @relation(fields: [taskId], references: [id], onDelete: Cascade)
  availabilityWindowId String?
  availabilityWindow   AvailabilityWindow? @relation(fields: [availabilityWindowId], references: [id], onDelete: SetNull)
  windowKind           WindowKind
  startAt              DateTime
  endAt                DateTime
  chunkCount           Int
  splitIndex           Int                 @default(0)
  status               AssignmentStatus    @default(PLANNED)
  isCarryOver          Boolean             @default(false)
  proposalItems        ProposalItem[]
  @@index([startAt])
}

model Proposal {
  id                      String         @id @default(cuid())
  userId                  String
  user                    User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  triggerExternalEventId  String?
  triggerExternalEvent    ExternalEvent? @relation(fields: [triggerExternalEventId], references: [id], onDelete: SetNull)
  replacedById            String?        @unique
  replacedBy              Proposal?      @relation("ProposalReplacement", fields: [replacedById], references: [id])
  replaces                Proposal?      @relation("ProposalReplacement")
  status                  ProposalStatus @default(PENDING)
  reason                  String
  createdAt               DateTime       @default(now())
  decidedAt               DateTime?
  items                   ProposalItem[]
}

model ProposalItem {
  id                     String      @id @default(cuid())
  proposalId             String
  proposal               Proposal    @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  assignmentId           String
  assignment             Assignment  @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  fromStartAt            DateTime
  fromEndAt              DateTime
  toStartAt              DateTime?   // C2: null = 이번 주 배치 불가 → 배정 해제
  toEndAt                DateTime?
  toAvailabilityWindowId String?     // C4
  toWindowKind           WindowKind? // C4
}
```

## 6. 애플리케이션이 보장하는 규칙

- 같은 `triggerExternalEventId`에 `PENDING` 제안은 최대 1개. 새로 만들 때 기존 PENDING은 `SUPERSEDED`.
- 잔여 청크(태스크) = `estimatedChunks` − (status가 `PLANNED` 또는 `DONE`인 배정의 `chunkCount` 합). `UNSCHEDULED`·`MISSED`는 잔여로 돌아간다.
- 목표 총 학습량은 저장하지 않는다 (태스크 합으로 계산).
- 목표 삭제는 프로토타입에서 허용 (시연 리셋용). Cascade로 태스크·배정·제안 항목이 함께 삭제된다.

## 7. 시드

- `prisma/seed.ts`가 `docs/prototype/seed/curriculum.sample.json`을 읽어 Exam·ExamSession·CurriculumUnit을 **upsert**(멱등)한다.
- JSON의 회차 날짜는 **가상 값**이다. 실제 회차 확인 후 JSON만 고치면 되도록 한다.
- 팀이 LLM으로 생성·검수한 커리큘럼이 준비되면 같은 형식의 JSON으로 교체한다.
