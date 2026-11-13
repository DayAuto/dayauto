# 04. 스케줄링 엔진 명세

위치: `src/server/engine/`. **순수 함수만** (DB·LLM·네트워크·`new Date()`/`Date.now()` 호출 금지, `now`와 `timezone`은 인자로 받음). 모든 함수는 Vitest 테스트를 가진다.

이 문서의 산식은 프로토타입용 **기본 산식**이다. "[가정]" 표시는 원문서에 규정이 없어 정한 값이며 06 문서에 같은 번호로 기록되어 있다.

## 1. 공통 규칙

- 시간 단위는 **청크(15분)**. 모든 배분 연산은 정수만 쓴다. 나눗셈이 필요하면 정수 올림 나눗셈 `ceilDiv(a, b) = Math.floor((a + b - 1) / b)`, 비율 비교는 **교차 곱**으로 한다. (REQ-DT-01)
- 같은 입력이면 항상 같은 출력 (REQ-DT-02). 모든 정렬은 마지막에 `id` 오름차순으로 동률을 깬다.
- 로컬 날짜·시각 ↔ UTC 변환은 `date-fns-tz`(`fromZonedTime`, `toZonedTime`, `formatInTimeZone`)만 사용한다.
- 구간은 반열린 구간 `[start, end)`. 겹침 판정: `a.start < b.end && b.start < a.end` (끝과 시작이 같으면 겹치지 않음).

## 2. 시간 그리드 (`time.ts`)

- `getWeekRange(now, tz)`: `now`가 속한 주의 **월요일 00:00(로컬) ~ 다음 월요일 00:00(로컬)**을 UTC로 반환.
- `buildChunkGrid({ windows, weekRange, tz })`: 주의 각 날짜 `d`, 각 시간대 `w`(`w.weekdays`에 `d`의 요일 포함)에 대해 `w.startMinute`부터 `w.endMinute`까지 15분마다 청크를 만든다.
  - 청크: `{ windowId, windowKind, slotType, localDate, minute, startAt(UTC), endAt(UTC) }`
  - 같은 날짜·같은 시간대 안의 연속 청크 묶음을 "시간대 인스턴스"라 부른다. 집중 배정은 **한 인스턴스 안에서만** 연속으로 잡는다.
- `freeChunks(grid, { now, busyIntervals, occupiedIntervals })`: 다음 조건을 모두 만족하는 청크만 남긴다.
  - `chunk.startAt >= now`
  - 바쁜 외부 일정(`status=ACTIVE && !isAllDay && isBusy`)과 겹치지 않음 **[가정 D-04: 종일 일정은 충돌에서 제외]**
  - 기존 점유 구간(배정, 예약된 제안 목표 시간)과 겹치지 않음

## 3. 긴급도 (`urgency.ts`) — REQ-RA-01, RA-09

입력: 목표별 `{ id, priority, examDate, createdAt, tasks(잔여 청크·slotType) }`, 시간대 목록, `today`(로컬 날짜).

- **잔여 청크** `rem` = 태스크 잔여 청크 합 (03 문서 §6의 산식).
- **잔여 가용일** `days` = `today` 이상 `examDate` 미만인 날짜 중, 그 요일에 시간대가 1개 이상 있는 날의 수. **[가정 D-01: "잔여 일수"를 달력 일수가 아닌 가용일로 해석]**
  - slotType별 계산에는 `daysBySlot[s]` = 그 slotType 시간대가 있는 날의 수.
- 상태 분기 (REQ-RA-09):
  - `examDate < today` → `EXPIRED`, 배분 제외
  - 태스크 0건 또는 `rem = 0` → `ON_HOLD`, 배분 제외
  - `days = 0` (시험 당일이거나 가용 시간대 없음) → 배분 대상 없음, 표시용 긴급도는 `null`
- **긴급도(표시·저장용 실수)** = `rem / days`. 저장 필드 `Goal.urgency`, `urgencyComputedAt`.
- **정렬(배분 순서) — 정수 비교만 사용** **[가정 D-02]**:
  1. `priority` 오름차순
  2. 요구 속도 내림차순: A가 앞 ⇔ `remA * daysB > remB * daysA`
  3. `examDate` 오름차순
  4. `createdAt` 오름차순, `id` 오름차순
- **목표·slotType별 일일 할당량** `need[g][s] = ceilDiv(remBySlot[g][s], daysBySlot[s])` (`daysBySlot[s] = 0`이면 0).

## 4. 주간 배분 (`allocate.ts`) — REQ-RA-03, RA-04, RA-07, GD-03, GD-04

`allocateWeek({ goals, windows, externalEvents, existingAssignments, now, tz }) → { assignments: NewAssignment[], unmet: {...}[] }`

### 4.1 실행 조건 (서비스 계층 책임, ERD 결정 C)

- 이번 주에 `PLANNED`/`DONE` 배정이 하나도 없으면 실행 (메인 화면 진입 시, 주가 바뀌었을 때 포함).
- 목표 추가·삭제, 생활 시간대 저장 시: 이번 주의 **미래(`startAt >= now`) `PLANNED` 배정을 삭제**하고 해당 사용자의 `PENDING` 제안을 `SUPERSEDED`로 바꾼 뒤 실행.
- 그 외 변경(외부 일정 충돌 등)은 재배분안으로만 반영한다. 전체 재계산 금지.

### 4.2 알고리즘

```
grid = buildChunkGrid(...)
free = freeChunks(grid, now, busy=외부일정, occupied=existingAssignments 중 PLANNED/DONE)
order = 긴급도 정렬(배분 대상 목표)
queue[g][s] = 목표 g의 slotType s 태스크 중 잔여>0, sortOrder 오름차순
carry[g][s] = 0

for 날짜 d in 이번 주 (오늘 이후, 시간 순):
  for 목표 g in order:
    for s in [FOCUS, MICRO]:
      q = min(need[g][s] + carry[g][s], g의 s 잔여 합)
      fromCarry = carry[g][s]            # 이월분을 먼저 소진하고 그 배정은 isCarryOver=true
      while q > 0 and queue[g][s] 비어있지 않음:
        t = queue[g][s] 첫 태스크
        if s == MICRO: size = 1
        else:
          lb   = min(t.잔여, t.minChunks)
          size = min(t.잔여, t.maxChunks, max(q, t.minChunks))
        d의 s 시간대 인스턴스들에서, size 청크 연속 빈 구간 중 가장 이른 것을 찾는다.
          (FOCUS는 못 찾으면 size를 1씩 줄이며 lb까지 재시도)
        못 찾으면 break
        배정 생성: {taskId, windowId, windowKind, startAt, endAt, chunkCount=size,
                   splitIndex = 해당 태스크의 기존 배정 수 + 이번 실행에서 만든 수,
                   isCarryOver = (fromCarry > 0)}
        free에서 해당 청크 제거, t.잔여 -= size, q -= size, fromCarry -= size
        t.잔여 == 0 이면 queue에서 제거
      carry[g][s] = max(q, 0) if g의 s 잔여 > 0 else 0
```

### 4.3 규칙 정리

- 태스크는 같은 slotType 시간대에만 배정 (GD-04). 마이크로 배정은 항상 1청크, 집중 배정은 `[minChunks, maxChunks]` (잔여가 min보다 작은 마지막 조각만 예외).
- 긴급도가 높은 목표가 같은 날의 **더 이른 빈 시간**을 먼저 가진다.
- **할당량을 채운 뒤 남는 빈 시간은 채우지 않는다** (FS-RA-02 R4). 따라서 주간표에 빈칸이 남는 것이 정상이다.
- 가용 청크가 0인 날·부족한 날의 미충족분은 `carry`로 다음 날에 이월 (RA-07). 이번 주 안에 못 채운 양은 `unmet`으로 반환하고 화면 우측 패널에 "이번 주 미배정 N청크"로만 표시.
- 활성 목표가 1개면 정렬 비교가 의미 없어 자동으로 "가용 전부 해당 목표"가 된다 (RA-04 충족). 단 R4 때문에 할당량 이상은 채우지 않는다.

## 5. 외부 일정 변경 식별 (`changes.ts`) — REQ-ES-01 [프로토 한정]

### 5.1 구글 이벤트 → 내부 형식 (서비스 계층에서 변환 후 엔진에 전달)

| 내부 필드         | 구글 필드                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `googleEventId`   | `id`                                                                                     |
| `title`           | `summary ?? "(제목 없음)"`                                                               |
| `isAllDay`        | `start.date`가 있으면 true                                                               |
| `startAt/endAt`   | `start.dateTime`/`end.dateTime` (종일이면 `date`를 사용자 타임존 자정으로)               |
| `isBusy`          | `transparency !== "transparent"` && 본인 참석 응답이 `"declined"`가 아님 **[가정 D-05]** |
| `googleUpdatedAt` | `updated`                                                                                |
| `cancelled`       | `status === "cancelled"`                                                                 |

### 5.2 `diffEvents(stored, fetched) → { added, updated, cancelled, unchanged }`

- `stored`: DB의 이번 주 범위 외부 일정(모든 상태). `fetched`: 이번 주 범위 조회 결과(취소 포함).
- **added**: fetched에서 취소 아님 + stored에 없거나 stored가 `CANCELLED`
- **updated**: fetched에서 취소 아님 + stored가 `ACTIVE` + (`googleUpdatedAt`이 다름 또는 시작·종료·제목·종일·바쁨 중 하나라도 다름)
- **cancelled**: (fetched에서 `cancelled` + stored `ACTIVE`) **또는** (stored `ACTIVE`인데 fetched에 아예 없음 — 다른 주로 옮겨졌거나 삭제됨)
- 나머지 **unchanged**

### 5.3 `findConflicts(event, assignments, now)`

- 대상 이벤트: added·updated 중 `!isAllDay && isBusy`
- 대상 배정: `status=PLANNED && startAt >= now`이고 이벤트 구간과 겹치는 배정
- **cancelled는 충돌 검사·제안을 하지 않는다** (기록만). **[가정 D-06]**
- 충돌 판정은 **변경이 생긴 일정에 대해서만** 한다. 이미 겹쳐 있지만 변경이 없는 일정(예: [원래 일정대로]를 고른 경우)은 다시 제안하지 않는다. **[가정 D-07]**

## 6. 재배분안 생성 (`reallocate.ts`) — REQ-RA-05, ES-05

`buildProposal({ conflicted, goalsOrder, windows, externalEvents, assignments, reserved, excluded, now, tz }) → { items, meta } | null`

- `conflicted`가 비면 `null`.
- 빈 시간 계산: `freeChunks(grid, now, busy=ACTIVE 바쁜 외부 일정(트리거 일정 포함), occupied=PLANNED/DONE 배정 중 conflicted 제외 + reserved)`
  - `reserved`: 다른 `PENDING` 제안들의 목표 시간 (동시 제안끼리 같은 칸을 노리지 않도록)
  - `excluded[assignmentId]`: [다시 배분] 체인에서 **이전에 제안했던 목표 구간들**. 후보가 이 중 하나와 겹치면 탈락.
- 처리 순서: 소속 목표의 긴급도 정렬 순 → `fromStartAt` 오름차순.
- 각 배정에 대해 같은 slotType 시간대 인스턴스 안에서 `chunkCount`만큼 연속인 빈 구간을 찾는다. **분할하지 않는다.** **[가정 D-08]**
  - 1순위: `start >= 원래 시작` 중 가장 이른 것 (미루기 우선)
  - 2순위: `now <= start < 원래 시작` 중 가장 이른 것
  - 범위: **이번 주 안** (ERD 결정 C)
  - 찾으면 해당 청크를 점유 처리하고 item `{ assignmentId, from, to, toWindowId, toWindowKind }`
  - 못 찾으면 item의 `to = null` (수락 시 `UNSCHEDULED`)
- `meta`: 사유 문장용 정보 (트리거 일정 제목, 목표별 이동 건수, 목표별 남은 일수, 배정 해제 건수)

### 6.1 [다시 배분] — "다른 안"의 정의

- 현재 안과 `replacedBy` 체인의 이전 안들에서 제안한 목표 구간을 `excluded`에 넣고 다시 `buildProposal`.
- 새 안의 모든 item이 `to = null`이면 **"더 이상 다른 배분안이 없습니다"** 를 반환하고 현재 안을 그대로 유지한다 (새 안 저장 안 함). 횟수 상한은 두지 않는다 (ES-05 TBD-1 미정).

### 6.2 수락 시 재검증 (서비스 계층)

- 각 item의 배정이 여전히 `PLANNED`이고 시간이 `from`과 같은지, `to`가 여전히 비어 있고 `>= now`인지 확인.
- 하나라도 실패하면 반영하지 않고 현재 안을 `SUPERSEDED` 처리 후 **새 안을 자동 생성**, 화면에 "그 사이 일정이 바뀌어 조정안을 새로 만들었습니다" 표시.

## 7. 사유 문장 템플릿 (`reason.ts`) — REQ-ES-04

LLM 없음. 아래 템플릿 중 하나를 결정론적으로 고른다. `{days}`는 오늘부터 시험일까지 **달력 일수**(표시용).

| 경우                     | 문장                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전부 이동, 목표 1개      | `'{event}' 일정과 겹치는 학습 {n}건을 이번 주 빈 시간으로 옮기는 안을 제안합니다. 사유: {goal} 시험이 {days}일 남아 이번 주 안에 소화해야 합니다.`                |
| 전부 이동, 목표 2개 이상 | `'{event}' 일정과 겹치는 학습 {n}건을 옮기는 안을 제안합니다. 사유: {goal1} 시험이 {days1}일 남아 {goal2}보다 긴급도가 높아 더 이른 빈 시간에 먼저 배치했습니다.` |
| 일부 배치 불가           | 위 문장 + ` 단, {m}건은 이번 주 빈 시간이 없어 배정을 해제하고 다음 주 배분으로 넘깁니다.`                                                                        |
| 전부 배치 불가           | `'{event}' 일정과 겹치는 학습 {n}건을 옮길 빈 시간이 이번 주에 없습니다. 배정을 해제하고 다음 주 배분으로 넘기는 안을 제안합니다.`                                |
| 기본(예외)               | `외부 일정 변경으로 학습 일정 조정이 필요합니다.`                                                                                                                 |

`{goal1}`, `{goal2}`는 이동 대상이 있는 목표 중 긴급도 1·2위. 목표 3개 이상이어도 2위까지만 언급한다.

## 8. 필수 테스트 케이스

| 파일       | 케이스                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| time       | 서울 기준 주 경계가 월요일 00:00 / 청크 그리드 개수·UTC 변환 / `America/New_York` 서머타임 전환일에도 슬롯 경계가 15분 단위로 맞음 (REQ-CP-02)                                                                                                    |
| urgency    | 우선순위 우선 / 교차 곱 비교 / 동률 시 시험일·생성일·id / EXPIRED·ON_HOLD·days=0 분기 / 가용일 계산(주말 제외)                                                                                                                                    |
| allocate   | 단일 목표 / 두 목표 시 긴급도 높은 쪽이 이른 시간 / 할당량 초과 미배정(R4) / 마이크로 1청크 / 집중 min·max·마지막 조각 / 날짜 넘는 분할과 splitIndex / 과거 청크 제외 / 외부 일정 회피 / 이월(isCarryOver) / 가용 초과 금지 / 같은 입력 같은 결과 |
| changes    | 추가·변경·취소·조회 누락=취소 / 종일·한가함·거절 일정은 충돌 아님 / 경계(끝=시작) 비겹침 / 변경 없는 기존 겹침은 무시                                                                                                                             |
| reallocate | 미루기 우선 / 긴급도 순 처리 / reserved 존중 / excluded로 다른 안 / 빈 곳 없으면 to=null / 결정론                                                                                                                                                 |
| reason     | 템플릿 5종                                                                                                                                                                                                                                        |
| scenario   | **시연 재현**: 05 문서의 기본 시간대 + 시드 목표 2개, 월요일 09:00 배분 후 월 19:00–23:00 일정 추가 → 월요일 저녁 배정이 화요일 이후로 이동하는 제안이 나옴                                                                                       |
