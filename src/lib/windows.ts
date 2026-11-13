// 생활 시간대 입력 규칙 (05 문서 §3). 서버·클라이언트가 같은 검증을 쓴다.

export type WindowKindValue =
  "COMMUTE_TO_WORK" | "LUNCH" | "COMMUTE_FROM_WORK" | "AFTER_WORK";
export type SlotTypeValue = "MICRO" | "FOCUS";

export const WINDOW_KINDS: readonly WindowKindValue[] = [
  "COMMUTE_TO_WORK",
  "LUNCH",
  "COMMUTE_FROM_WORK",
  "AFTER_WORK",
];

export const KIND_LABEL: Record<WindowKindValue, string> = {
  COMMUTE_TO_WORK: "출근",
  LUNCH: "점심",
  COMMUTE_FROM_WORK: "퇴근",
  AFTER_WORK: "퇴근 후",
};

export const SLOT_LABEL: Record<SlotTypeValue, string> = {
  MICRO: "마이크로",
  FOCUS: "집중",
};

/** 화면 표시 순서(월~일). 값은 0=일 ~ 6=토 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABEL = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
] as const;

export interface WindowRow {
  kind: WindowKindValue;
  enabled: boolean;
  startMinute: number;
  endMinute: number;
  slotType: SlotTypeValue;
  weekdays: number[];
}

const h = (hh: number, mm = 0) => hh * 60 + mm;

/** 시연 편의 기본값 (06 문서 D-09) */
export const DEFAULT_WINDOW_ROWS: WindowRow[] = [
  {
    kind: "COMMUTE_TO_WORK",
    enabled: true,
    startMinute: h(7, 30),
    endMinute: h(8, 15),
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    kind: "LUNCH",
    enabled: true,
    startMinute: h(12, 30),
    endMinute: h(13),
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    kind: "COMMUTE_FROM_WORK",
    enabled: true,
    startMinute: h(18, 30),
    endMinute: h(19, 15),
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    kind: "AFTER_WORK",
    enabled: true,
    startMinute: h(20),
    endMinute: h(23),
    slotType: "FOCUS",
    weekdays: [1, 2, 3, 4, 5],
  },
];

export interface RowErrors {
  time?: string;
  weekdays?: string;
}

export interface WindowErrors {
  form?: string;
  rows: Partial<Record<WindowKindValue, RowErrors>>;
}

export function formatMinute(m: number): string {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 15분 단위 선택지. 종료는 24:00(1440)까지 허용 */
export function minuteOptions(): number[] {
  return Array.from({ length: 97 }, (_, i) => i * 15);
}

/** 검증 (05 문서 §3): 사용 1개 이상 / 시작<종료 / 15분 단위 / 요일 1개 이상 / 같은 요일 시간대 겹침 금지 */
export function validateWindows(rows: WindowRow[]): {
  ok: boolean;
  errors: WindowErrors;
} {
  const errors: WindowErrors = { rows: {} };
  const setRow = (kind: WindowKindValue, key: keyof RowErrors, msg: string) => {
    errors.rows[kind] = {
      ...errors.rows[kind],
      [key]: errors.rows[kind]?.[key] ?? msg,
    };
  };

  const enabled = rows.filter((r) => r.enabled);
  if (enabled.length === 0)
    errors.form = "사용할 시간대를 1개 이상 선택해 주세요.";

  for (const r of enabled) {
    const validMinute = (m: number) =>
      Number.isInteger(m) && m >= 0 && m <= 1440 && m % 15 === 0;
    if (!validMinute(r.startMinute) || !validMinute(r.endMinute)) {
      setRow(r.kind, "time", "시간은 15분 단위로 입력해 주세요.");
    } else if (r.startMinute >= r.endMinute) {
      setRow(r.kind, "time", "시작 시각은 종료 시각보다 빨라야 합니다.");
    }
    if (
      r.weekdays.length === 0 ||
      r.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      setRow(r.kind, "weekdays", "요일을 1개 이상 선택해 주세요.");
    }
  }

  // 같은 요일에 시간대끼리 겹치지 않아야 한다
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i];
      const b = enabled[j];
      const shareDay = a.weekdays.some((d) => b.weekdays.includes(d));
      if (
        shareDay &&
        a.startMinute < b.endMinute &&
        b.startMinute < a.endMinute
      ) {
        setRow(a.kind, "time", `${KIND_LABEL[b.kind]} 시간대와 겹칩니다.`);
        setRow(b.kind, "time", `${KIND_LABEL[a.kind]} 시간대와 겹칩니다.`);
      }
    }
  }

  const ok = !errors.form && Object.keys(errors.rows).length === 0;
  return { ok, errors };
}

/** 시간대 길이(청크 수) */
export function chunkCountOf(
  row: Pick<WindowRow, "startMinute" | "endMinute">,
): number {
  return Math.max(0, Math.floor((row.endMinute - row.startMinute) / 15));
}
