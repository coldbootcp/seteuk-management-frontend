# Project rules

이 리포지토리는 **화면만** 담당합니다. 서버 로직·DB·LLM 호출은 전부 백엔드
(`20260826backend`, FastAPI + PostgreSQL)에 있습니다. 통합 결정의 근거는 백엔드
리포의 `docs/INTEGRATION_DECISIONS.md`를 보세요.

## 경계

- **여기에 백엔드를 다시 만들지 마세요.** API 라우트, DB 스키마, 마이그레이션,
  파서, LLM 프롬프트가 이 리포에 생기면 잘못된 것입니다. 예전에 있던
  `app/api/*`, `db/`, `drizzle/`, `worker/`는 통합하면서 전부 제거했습니다.
- **프론트엔드는 DeepSeek을 절대 직접 호출하지 않습니다.** 모든 LLM 호출은
  백엔드를 거칩니다 — 사용량 한도(`usage_events`)가 거기에만 있기 때문입니다.
- **생기부 파싱은 백엔드 하나만 합니다.** 여기 있던 TypeScript 파서는 제거했습니다.
  남은 `lib/school-record-parser.ts`는 백엔드 응답을 화면용 초안으로 빚는
  클라이언트 헬퍼일 뿐입니다.
- API 타입은 손으로 적지 말고 백엔드 `/openapi.json`에서 생성하세요.
- 화면은 `jsonRequest(경로) → { workspace }` 패턴을 씁니다. 그 경로를 백엔드
  호출로 옮기는 것은 `lib/workspace-adapter.ts`이고, **거기에 도메인 판단을 넣지
  마세요** — 무엇을 저장할지·무엇을 제안할지는 백엔드가 정하고 어댑터는 모양만
  바꿉니다.
- 챗봇 스트리밍에 `EventSource`를 쓸 수 없습니다(Authorization 헤더를 못 붙이고
  POST도 안 됩니다). `lib/chat.ts`가 fetch로 열고 SSE 프레임을 직접 파싱합니다.
- Cloudflare Workers·D1·R2는 쓰지 않습니다. 일반 Next.js입니다.

## 제품 규칙

- 학생 이력 전체를 기본으로 모델에 보내지 않습니다. 지금 작업에 필요한 근거만 가져옵니다.
- 모든 추천에는 그 학생의 구체적 근거와 이유가 함께 있어야 합니다.
- 생성된 추천은 후보입니다. 검수 단계가 근거 없는·반복되는·안전하지 않은 출력을
  걸러낼 수 있어야 합니다.
- 피드백은 append-only 신호로 남깁니다. 원래 추천 실행 기록을 덮어쓰지 않습니다.
- **업로드한 생기부 원본은 계정에 보관됩니다**(백엔드 결정 P-1). 화면 문구가 이와
  어긋나지 않게 하세요.
- 실제 학생을 식별할 수 있는 데이터를 샘플·테스트·로그에 넣지 마세요.

## 확인

동작을 바꾼 뒤에는 `npm run typecheck`, `npm run build`, `npm test`를 돌리세요.
파일럿 도메인·추천 루브릭을 건드리기 전에는 `docs/semiconductor-pilot-v0.3.md`와
`docs/semiconductor-evaluation-set-v0.1.md`를 먼저 읽으세요.
