import type { ComponentProps } from "react";
import { cn } from "cn";

/** 브라우저 기본 select에 프로젝트 입력 스타일만 입힌 컴포넌트 (프로토타입용) */
function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
