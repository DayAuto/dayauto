import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_ROWS,
  chunkCountOf,
  validateWindows,
  type WindowRow,
} from "./windows";

const rows = (patch: (r: WindowRow[]) => void): WindowRow[] => {
  const copy = DEFAULT_WINDOW_ROWS.map((r) => ({
    ...r,
    weekdays: [...r.weekdays],
  }));
  patch(copy);
  return copy;
};

describe("validateWindows", () => {
  it("기본값(D-09)은 통과하고 청크 수가 05 문서 표와 같다", () => {
    expect(validateWindows(DEFAULT_WINDOW_ROWS).ok).toBe(true);
    expect(DEFAULT_WINDOW_ROWS.map(chunkCountOf)).toEqual([3, 2, 3, 12]);
  });

  it("사용 중인 시간대가 없으면 실패", () => {
    const r = validateWindows(
      rows((x) => x.forEach((w) => (w.enabled = false))),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.form).toBeDefined();
  });

  it("시작 ≥ 종료, 15분 단위 위반", () => {
    const r1 = validateWindows(
      rows((x) => (x[0].endMinute = x[0].startMinute)),
    );
    expect(r1.errors.rows.COMMUTE_TO_WORK?.time).toContain("빨라야");
    const r2 = validateWindows(rows((x) => (x[0].startMinute = 452)));
    expect(r2.errors.rows.COMMUTE_TO_WORK?.time).toContain("15분");
  });

  it("요일이 비어 있으면 실패", () => {
    const r = validateWindows(rows((x) => (x[1].weekdays = [])));
    expect(r.errors.rows.LUNCH?.weekdays).toBeDefined();
  });

  it("같은 요일에 겹치면 두 행 모두 오류, 요일이 다르면 통과", () => {
    const overlap = validateWindows(
      rows((x) => (x[3].startMinute = 18 * 60 + 45)),
    );
    expect(overlap.ok).toBe(false);
    expect(overlap.errors.rows.AFTER_WORK?.time).toContain("겹칩니다");
    expect(overlap.errors.rows.COMMUTE_FROM_WORK?.time).toContain("겹칩니다");

    const otherDay = validateWindows(
      rows((x) => {
        x[3].startMinute = 18 * 60 + 45;
        x[3].weekdays = [6, 0];
      }),
    );
    expect(otherDay.ok).toBe(true);
  });

  it("끝=시작은 겹치지 않는다", () => {
    expect(
      validateWindows(rows((x) => (x[3].startMinute = 19 * 60 + 15))).ok,
    ).toBe(true);
  });

  it("사용하지 않는 시간대는 검증하지 않는다", () => {
    const r = validateWindows(
      rows((x) => {
        x[1].enabled = false;
        x[1].weekdays = [];
      }),
    );
    expect(r.ok).toBe(true);
  });
});
