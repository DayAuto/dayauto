import "server-only";

/**
 * 현재 시각. 엔진 밖(서비스 계층)에서만 호출하고 엔진에는 인자로 넘긴다.
 * production이 아닐 때 DEMO_NOW(ISO 문자열)가 있으면 그 값을 쓴다 (시연 재현용).
 */
export function getNow(): Date {
  const demo = process.env.DEMO_NOW;
  if (demo && process.env.NODE_ENV !== "production") {
    const d = new Date(demo);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
