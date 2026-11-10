"use client";

// 임시 확인용 (P3). P5에서 메인 화면으로 교체하면서 제거한다.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncCalendarAction } from "@/server/actions/sync";
import type { SyncActionResult } from "@/server/actions/types";

export function SyncDebug() {
  const [result, setResult] = useState<SyncActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await syncCalendarAction()))
        }
      >
        {pending ? "동기화 중…" : "동기화"}
      </Button>
      {result && (
        <pre className="rounded-md bg-muted p-4 text-sm">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
