import { describe, expect, it } from "vitest";
import {
  formatChunks,
  formatMonthDay,
  formatSlot,
  formatTime,
  shortGoalTitle,
} from "./format";

const TZ = "Asia/Seoul";

describe("format", () => {
  it("사용자 타임존 기준으로 시각을 표시한다", () => {
    expect(formatTime("2026-11-30T11:00:00.000Z", TZ)).toBe("20:00");
    expect(formatSlot("2026-11-30T11:00:00.000Z", TZ)).toBe("월 11/30 20:00");
    expect(formatSlot("2026-11-30T15:30:00.000Z", TZ)).toBe("화 12/1 00:30");
    expect(formatMonthDay("2026-12-05T15:00:00.000Z", TZ)).toBe("12/6(일)");
  });

  it("청크 수를 분·시간으로", () => {
    expect(formatChunks(3)).toBe("45분");
    expect(formatChunks(4)).toBe("1시간");
    expect(formatChunks(6)).toBe("1시간 30분");
  });

  it("목표 제목의 괄호 표기를 뺀다", () => {
    expect(shortGoalTitle("토익(TOEIC)")).toBe("토익");
    expect(shortGoalTitle("산업안전기사 필기")).toBe("산업안전기사 필기");
  });
});
