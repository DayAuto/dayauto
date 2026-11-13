// 표시용 날짜·시각 포맷 (사용자 타임존 기준). 계산이 아니라 화면 표시만 한다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parts(iso: string, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) map[p.type] = p.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    map.weekday,
  );
  return {
    hour: map.hour,
    minute: map.minute,
    month: map.month,
    day: map.day,
    dow,
  };
}

/** "20:00" */
export function formatTime(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${p.hour}:${p.minute}`;
}

/** "월 11/30 20:00" */
export function formatSlot(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${WEEKDAYS[p.dow]} ${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** "11/30(월)" */
export function formatMonthDay(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${p.month}/${p.day}(${WEEKDAYS[p.dow]})`;
}

/** 청크 수 → "45분" / "1시간 30분" */
export function formatChunks(chunks: number): string {
  const min = chunks * 15;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** "토익(TOEIC)" → "토익" (캘린더 블록 라벨용) */
export function shortGoalTitle(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, "").trim() || title;
}

/** 목표별 색 (배정 블록·고스트·목표 현황 공통) */
export const GOAL_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#9333ea",
  "#db2777",
] as const;
export const goalColor = (index: number): string =>
  GOAL_COLORS[index % GOAL_COLORS.length];
