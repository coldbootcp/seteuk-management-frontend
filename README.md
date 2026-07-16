# 세특연구소 Personalized School Coach

`seteuk-ai-harness-v0.2.md`의 Planning, Execution, Reconciliation 루프를 신규 가입부터 실제 활동 기록까지 연결한 전체 제품 프로토타입입니다. 첫 지원 진로군은 반도체공학입니다.

## 작동하는 사용자 흐름

1. 신규 학생 온보딩 인터뷰
2. 잠정 Student DNA와 3개년 로드맵 생성
3. 학생이 로드맵 노드 검토·수정 후 v1 저장
4. 오늘의 미션과 활성 로드맵 노드 확인
5. 수행평가 안내문 조건 분석
6. 학생 기억·로드맵·보완 역량을 반영한 후보 3개 생성
7. 추천 저장·거절 또는 실제 활동으로 전환
8. 완료 활동을 사건 메모리로 저장
9. 활성 노드와 `MATCH / PARTIAL_MATCH / DIVERGE` 정합 판정
10. 노드 완료와 다음 노드 활성화
11. 활동 이력, 정합 로그, Student DNA 자동 갱신
12. 학생 프로필 수정과 로드맵 새 버전 생성

## 3개년 기록 메인 화면

- 앱 진입 시 1·2·3학년이 카드로 끊기지 않고 하나의 3개년 시간축으로 연결됩니다.
- 각 학년은 3월부터 다음 해 2월까지 한 줄로 표시되며, 가운데에서 1학기와 2학기가 자연스럽게 이어집니다.
- 활동은 실제 날짜 비율에 맞춰 선 위·아래에 놓이고, 연결 과목의 색을 가진 선과 카테고리 아이콘을 사용합니다.
- 앞으로의 활동은 하드코딩된 샘플이 아니라 DeepSeek가 학기별 날짜·카테고리·과목·제목을 생성하고 `roadmap_plan_events`에 저장합니다.
- 카테고리는 상장, 대회, 수행평가, 보고서(세특용), 독서, 시험의 여섯 가지입니다.
- 학기 영역을 누르면 6개월을 월별로 펼친 확대 화면에서 활동, 과목, 학기 목표를 구체적으로 확인할 수 있습니다.
- 실제 활동은 채워진 아이콘, 앞으로의 계획은 테두리 아이콘과 점선으로 구분됩니다.
- 학년별 시간축의 세로 공간을 넓혀 실제 기록이 많아도 위·아래 여러 층으로 읽을 수 있습니다.
- 로드맵 보드는 짙은 상단 시간축 헤더, 학년별 은은한 배경 밴드, 과목 색상 이벤트 카드로 시각적 우선순위와 가독성을 강화했습니다.
- 텍스트형 생활기록부 PDF를 실제로 분석해 학년·학기·과목·활동·날짜를 추출합니다.
- 추출 결과는 검토 화면에서 포함 여부, 학년, 학기, 카테고리, 날짜, 과목, 제목을 수정한 뒤 반영합니다.
- 원본 PDF는 저장하지 않고, 확인한 과목·활동과 가져오기 이력만 D1에 저장합니다.
- 정확한 날짜가 없는 항목은 학기 안의 임시 날짜로 표시하며 사용자가 확인해야 합니다.
- 스캔 이미지형 PDF와 HWP/HWPX의 OCR·문서 추출은 아직 지원하지 않습니다.

## 데이터 구조

- `student_workspaces`: 학생이 직접 입력한 사실과 제약
- `roadmaps`, `roadmap_nodes`: 버전 관리되는 계획 메모리
- `roadmap_plan_events`: DeepSeek가 노드별로 생성한 미래 활동 날짜·카테고리·과목·제목
- `student_activities_v2`: 사건 단위 활동 메모리
- `school_record_imports`: 생활기록부 가져오기 이력과 처리 결과
- `school_record_courses`: 학년·학기별 실제 이수 과목
- `school_record_import_items`: 가져온 활동의 날짜 근거와 인식 신뢰도
- `reconciliation_logs`: 계획과 실제 활동의 판정 근거
- `assignment_analyses`: 수행평가 분석과 추천 실행 결과
- `recommendation_feedback_v2`: 저장·거절 신호

D1을 권위 데이터로 사용하고 브라우저에는 현재 학생 ID만 보관합니다. 개발 환경에서는 API가 필요한 테이블을 안전하게 생성하며, 배포용 Drizzle 마이그레이션도 함께 유지합니다.

## 현재 모델 상태

Planning, DNA, Assignment, Reviewer, Reconciler는 구조화된 provider 계약 뒤에서 동작합니다. `DEEPSEEK_API_KEY`를 `.dev.vars`에 넣으면 온보딩 로드맵·Student DNA·수행평가 분석이 DeepSeek JSON API를 사용하고, 키가 없거나 응답 검증에 실패하면 기존 결정론적 mock provider로 자동 복귀합니다. 기본 모델은 `deepseek-v4-flash`이며 `DEEPSEEK_MODEL`로 바꿀 수 있습니다.

DeepSeek 설정 예시는 `.dev.vars.example`에 있습니다. API 키는 저장소에 커밋하지 않습니다.

## 실행과 검증

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

```bash
npm run lint
npm test
```

데이터 모델 변경 후에는 `npm run db:generate`를 실행합니다.

## 문서

- `docs/harness-architecture.md`: 하네스 경계와 기본 구조
- `docs/full-product-prototype.md`: v0.2 기능과 구현 화면·데이터 매핑
- `docs/semiconductor-pilot-v0.3.md`: 반도체 도메인 구현 계약
- `docs/semiconductor-evaluation-set-v0.1.md`: 이후 사용할 평가셋 초안
