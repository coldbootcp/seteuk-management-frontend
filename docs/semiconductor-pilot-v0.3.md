# 반도체 개인화 파일럿 구현 명세 v0.3

## 1. 파일럿 질문

> 반도체공학이라는 동일 진로군을 희망하는 학생에게 동일한 수행평가를 주었을 때, 학생의 실제 활동·강점·보완 역량에 근거해 서로 다른 다음 탐구를 제안할 수 있는가?

이 파일럿은 “반도체 관심 학생에게 반도체 주제를 추천한다”는 수준을 검증하지 않는다. 공정·소재, 회로·소자, 장비·데이터라는 세부 경로 안에서 이전 활동의 다음 단계가 달라지는지를 검증한다.

## 2. 범위

### 포함

- 고등학교 1~2학년 가상 학생
- 물리학, 화학, 수학, 정보, 통합과학 및 과학탐구 활동
- 구조화된 과거 활동 2~3개
- 동일 수행평가 입력
- 후속 탐구 후보 3개
- 학생 근거, 교과 연결, 예상 산출물, 난이도
- 저장·거절 피드백

### 제외

- 실제 반도체 제조 약품이나 고전압 장비를 사용하는 실험
- 대학 수준 공정 실습을 고등학생이 직접 수행한 것처럼 제안하는 활동
- 대학 합격 가능성 예측
- 특정 기업 취업 경로 추천
- 3개년 로드맵 자동 생성과 정합 엔진

3개년 로드맵은 Phase 1 개인화 추천이 통과한 뒤 동일한 도메인 구조 위에 추가한다.

## 3. 도메인 경로

| 경로 | 핵심 질문 | 교과 연결 | 안전한 고교 수준 산출물 |
|---|---|---|---|
| 공정·소재 | 재료와 공정 조건이 소자 특성·수율을 어떻게 바꾸는가 | 화학, 물리학, 수학 | 공개 데이터 분석, 공정 변수 설계, 모의 데이터 |
| 회로·소자 | 반도체의 물리적 성질이 회로 동작으로 어떻게 이어지는가 | 물리학, 정보, 수학 | 회로 시뮬레이션, I-V 그래프, 논리 모델 비교 |
| 장비·데이터 | 센서와 제조 데이터로 공정 안정성과 품질을 어떻게 관리하는가 | 정보, 수학, 통합과학 | 이상 감지, 불량률 분석, 환경·효율 비교 |

2022 개정 교육과정의 고등학교 과학 선택 구조에는 일반 선택 `물리학·화학`, 진로 선택 `전자기와 양자·물질과 에너지`, 융합 선택 `융합과학 탐구` 등이 포함된다. 파일럿은 특정 과목을 이수했다고 가정하지 않고 학생의 실제 수강 정보로 필터링한다.

## 4. 반도체 지식 구조

```text
반도체 기초
├── 물질과 전기적 성질
│   ├── 도체·부도체·반도체
│   ├── 규소 결합 구조
│   └── 도핑과 전하 운반자
├── 소자와 회로
│   ├── p-n 접합
│   ├── 다이오드 I-V 특성
│   ├── 트랜지스터의 스위칭
│   └── 논리 게이트
├── 제조 공정
│   ├── 산화·증착
│   ├── 포토·식각
│   ├── 이온 주입·확산
│   └── 금속화·패키징·테스트
├── 장비와 데이터
│   ├── 센서·보정·드리프트
│   ├── 공정 변수와 관리 한계
│   ├── 결함·수율·품질
│   └── 자동화·예지보전
└── 사회와 환경
    ├── 물·에너지·화학물질
    ├── 안전
    ├── 공급망
    └── 기술 선택의 상충 관계
```

지식 항목마다 `difficulty`, `prerequisites`, `allowed_activity_types`, `safety_level`, `source_id`, `source_version`을 둔다.

## 5. 학생 입력 계약

```json
{
  "student_id": "student-seojin",
  "grade": 2,
  "career_track": "semiconductor",
  "subtrack_hypotheses": ["process_materials"],
  "completed_courses": ["화학", "물리학"],
  "interests": ["재료과학", "미세공정"],
  "strengths": ["물질-성질 연결"],
  "gaps": ["변인 통제", "정량적 데이터 분석"],
  "constraints": ["위험 화학 실험 불가"],
  "activities": [
    {
      "activity_id": "seojin-a1",
      "subject": "화학",
      "title": "규소 결정 구조와 도핑 원소 비교",
      "concepts": ["규소", "도핑"],
      "actions": ["비교", "문헌 조사"],
      "outputs": ["탐구 보고서"]
    }
  ]
}
```

`subtrack_hypotheses`는 확정 사실이 아니라 검색 우선순위다. 추천을 반복적으로 선택·거절하거나 학생이 직접 수정하면 갱신 후보를 만들고, 자동 확정하지 않는다.

## 6. 추천 출력 계약

```json
{
  "run_id": "uuid",
  "student_id": "student-seojin",
  "task_id": "common-task-01",
  "recommendations": [
    {
      "recommendation_id": "uuid",
      "title": "도핑 원소와 전기적 성질 변화의 정량 비교",
      "student_evidence_ids": ["seojin-a1"],
      "curriculum_source_ids": ["source-id"],
      "domain_concepts": ["도핑", "전기적 성질"],
      "extension_relation": "empirical",
      "gap_addressed": "정량적 데이터 분석",
      "method": "공개 데이터 그래프 비교",
      "expected_output": "그래프가 포함된 탐구 보고서",
      "difficulty": "medium_high",
      "safety_level": "safe_data_only",
      "personalization_reason": "...",
      "uncertainties": []
    }
  ],
  "review": {
    "passed": true,
    "rejected_candidate_count": 2,
    "warnings": []
  }
}
```

추천에는 학생 근거 ID가 최소 하나 있어야 한다. 근거가 없는 경우 범용 추천으로 명시하거나 추가 질문으로 전환한다.

## 7. 실행 상태

```text
INPUT_VALIDATED
→ PROFILE_DIAGNOSED
→ SUBTRACK_HYPOTHESES_RANKED
→ STUDENT_EVIDENCE_RETRIEVED
→ CURRICULUM_AND_DOMAIN_CONTEXT_RETRIEVED
→ CANDIDATES_GENERATED
→ DOMAIN_REVIEWED
→ PERSONALIZATION_REVIEWED
→ RESULT_FORMATTED
→ FEEDBACK_RECORDED
```

실패 상태:

- `INSUFFICIENT_STUDENT_EVIDENCE`
- `CURRICULUM_SOURCE_MISSING`
- `UNSAFE_ACTIVITY_REJECTED`
- `DUPLICATE_ACTIVITY_REJECTED`
- `UNSUPPORTED_DOMAIN_CLAIM`
- `OUTPUT_SCHEMA_INVALID`

## 8. Reviewer 규칙

후보는 다음 조건을 모두 통과해야 한다.

1. 학생 활동 또는 명시적 관심 근거가 존재한다.
2. 이전 활동과 동일한 조사 반복이 아니다.
3. 현재 과목과 학생이 이수한 개념 범위에서 설명할 수 있다.
4. 반도체 연결이 제목 장식이 아니라 탐구 방법과 결과에 반영된다.
5. 실제 제조 약품·클린룸 장비 없이 수행 가능하다.
6. 공개 자료, 시뮬레이션, 저전압 교육용 회로 등 안전한 방법을 우선한다.
7. 학생이 실제로 하지 않은 활동을 완료한 것처럼 표현하지 않는다.
8. 세 후보의 핵심 질문과 탐구 방법이 서로 달라야 한다.

## 9. 모델 공급자 계약

```ts
type RecommendationProvider = {
  generate(input: {
    task: ParsedTask;
    studentProfile: StudentProfile;
    evidence: ActivityEvidence[];
    curriculumContext: CurriculumSource[];
    domainContext: SemiconductorKnowledge[];
    constraints: SafetyConstraint[];
  }): Promise<RecommendationCandidate[]>;
};
```

Claude와 OpenAI는 동일한 입력·출력 계약을 사용한다. 모델별 프롬프트에 제품 규칙을 중복 구현하지 않고, 공통 Reviewer가 결과를 검사한다.

## 10. 통과 기준

| 항목 | Phase 1 통과 기준 |
|---|---|
| 학생 간 근거 혼입 | 0건 |
| 개인화 근거 존재 | 추천의 100% |
| 교과·도메인 근거 존재 | 추천의 100% |
| 기존 활동 단순 반복 | 10% 이하 |
| 위험한 실험 제안 | 0건 |
| 세부 경로별 추천 차이 | 상위 3개 중 핵심 질문 중복 1개 이하 |
| 전문가 적합성 평가 | 평균 4/5 이상 |
| 출력 스키마 통과율 | 98% 이상 |
| 추가 질문·기권 정확성 | 근거 부족 사례의 90% 이상 |

## 11. 구현 순서

1. 가상 학생 10명과 공통 과제 3개 고정
2. JSON Schema와 Reviewer 규칙 구현
3. mock provider로 계약 테스트
4. 공식 교육과정·반도체 기초 자료를 소규모 지식 세트로 구축
5. Claude/OpenAI provider 연결
6. 30개 시나리오 자동 실행
7. 도메인 전문가 블라인드 평가
8. 통과 후 온보딩 로드맵 노드 설계

## 12. 근거 자료

- [교육부 2022 개정 교육과정 확정 발표](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=93459&lev=0)
- [고교학점제 지원센터 2022 개정 과목 구조](https://home.pen.go.kr/hscredit/cm/cntnts/cntntsView.do?cntntsId=3729&mi=17411)
- [한국반도체산업협회 반도체 아카데미 교육 프로그램](https://academy.ksia.or.kr/lecture/curriculum)
- [SK하이닉스 반도체 직무 구조](https://talent.skhynix.com/hub/ko/job/introduce)
- [서울대학교 반도체공동연구소 기본 공정 교육 예시](https://infra.ksia.or.kr/user/Wo/WoUser0101V.do?CURRENT_MENU_CODE=MENU0039&SCH_PRM_GB=001&TAB_ID=1&TOP_MENU_CODE=MENU0039&WO_SEQ=167)

산업 직무 자료는 진로 경로의 분류 근거로만 사용하며 고등학교 활동의 난이도를 결정하는 교육과정 근거로 사용하지 않는다.
