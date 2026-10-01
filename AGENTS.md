<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 프로젝트 규칙

- 화면은 `src/app`, API는 `src/app/api`, 서버 로직은 `src/server`, 공용 타입·유틸은 `src/lib`에 둔다.
- `src/server/engine`은 순수 함수만 작성한다. LLM·DB 직접 호출 금지, 테스트 필수.
- `src/server` 아래 엔진 외 파일은 첫 줄에 `import "server-only"`를 넣는다. (엔진은 Vitest에서 테스트해야 하므로 제외)
- 시간은 15분 정수 청크로 다루고, 타임존 처리는 `date-fns-tz`를 사용한다. 직접 구현 금지.
- 비밀값은 `.env.local`과 배포 플랫폼 환경변수로만 관리하고 커밋하지 않는다.
- 커밋 메시지: `feat/fix/chore/docs/test: 내용` (한글 가능)
- shadcn/ui는 Base UI 기반으로 설치됨. Radix 기반 예제 코드를 그대로 쓰지 말고 기존 src/components/ui의 패턴을 따를 것. 클래스 병합은 cn 패키지 사용
