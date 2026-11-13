"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  KIND_LABEL,
  SLOT_LABEL,
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  chunkCountOf,
  formatMinute,
  minuteOptions,
  validateWindows,
  type SlotTypeValue,
  type WindowErrors,
  type WindowRow,
} from "@/lib/windows";
import { saveWindowsAction } from "@/server/actions/setup";

const OPTIONS = minuteOptions();

export function WindowsForm({ initial }: { initial: WindowRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<WindowRow[]>(initial);
  const [errors, setErrors] = useState<WindowErrors>({ rows: {} });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, p: Partial<WindowRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const toggleDay = (i: number, day: number) => {
    const cur = rows[i].weekdays;
    patch(i, {
      weekdays: cur.includes(day)
        ? cur.filter((d) => d !== day)
        : [...cur, day],
    });
  };

  const submit = () => {
    setMessage(null);
    const v = validateWindows(rows);
    setErrors(v.errors);
    if (!v.ok) return;
    startTransition(async () => {
      const res = await saveWindowsAction(rows);
      if (res.ok) {
        router.push(res.data.next);
        return;
      }
      if (res.fieldErrors) setErrors(res.fieldErrors);
      setMessage(res.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {rows.map((r, i) => {
        const e = errors.rows[r.kind];
        return (
          <section key={r.kind} className="rounded-xl border border-border p-4">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(ev) => patch(i, { enabled: ev.target.checked })}
              />
              {KIND_LABEL[r.kind]}
              {r.enabled && !e?.time && (
                <span className="text-xs font-normal text-muted-foreground">
                  {chunkCountOf(r)}청크 · {chunkCountOf(r) * 15}분
                </span>
              )}
            </label>

            {r.enabled && (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label={`${KIND_LABEL[r.kind]} 시작`}
                    aria-invalid={Boolean(e?.time)}
                    value={r.startMinute}
                    onChange={(ev) =>
                      patch(i, { startMinute: Number(ev.target.value) })
                    }
                  >
                    {OPTIONS.filter((m) => m < 1440).map((m) => (
                      <option key={m} value={m}>
                        {formatMinute(m)}
                      </option>
                    ))}
                  </NativeSelect>
                  <span>~</span>
                  <NativeSelect
                    aria-label={`${KIND_LABEL[r.kind]} 종료`}
                    aria-invalid={Boolean(e?.time)}
                    value={r.endMinute}
                    onChange={(ev) =>
                      patch(i, { endMinute: Number(ev.target.value) })
                    }
                  >
                    {OPTIONS.filter((m) => m > 0).map((m) => (
                      <option key={m} value={m}>
                        {formatMinute(m)}
                      </option>
                    ))}
                  </NativeSelect>
                  <span className="ml-2 flex gap-3">
                    {(["MICRO", "FOCUS"] as SlotTypeValue[]).map((s) => (
                      <label key={s} className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`slot-${r.kind}`}
                          checked={r.slotType === s}
                          onChange={() => patch(i, { slotType: s })}
                        />
                        {SLOT_LABEL[s]}
                      </label>
                    ))}
                  </span>
                </div>
                {e?.time && (
                  <p className="text-xs text-destructive">{e.time}</p>
                )}

                <div className="flex flex-wrap gap-3">
                  {WEEKDAY_ORDER.map((d) => (
                    <label key={d} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={r.weekdays.includes(d)}
                        onChange={() => toggleDay(i, d)}
                      />
                      {WEEKDAY_LABEL[d]}
                    </label>
                  ))}
                </div>
                {e?.weekdays && (
                  <p className="text-xs text-destructive">{e.weekdays}</p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
