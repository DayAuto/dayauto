// [인프라] 배치 엔드포인트 (/api/cron). 배치 실행 수단(Vercel Pro / GitHub Actions / pg_cron) 확정 후 스케줄 연결 예정
export function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  console.log("[cron] 실행됨:", new Date().toISOString());
  return Response.json({ ok: true, at: new Date().toISOString() });
}
