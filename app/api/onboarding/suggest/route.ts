import { suggestOnboardingDirectionWithDeepSeek } from "../../../../lib/deepseek-provider";

function fallbackSuggestions(targetCareer: string) {
  const topic = targetCareer.trim();
  const lower = topic.toLowerCase();
  if (/의학|의료|생명|바이오|뇌|수면|심리/.test(topic)) {
    return {
      majors: ["생명과학과", "의공학과", "간호학과", "심리학과", "뇌인지과학과"],
      keywords: ["생명과학 기반 탐구", "의료 데이터와 진단", "인체 시스템과 질병", "바이오 윤리와 사회", "공학적 의료 문제 해결"],
    };
  }
  if (/ai|인공지능|데이터|소프트웨어|컴퓨터|코딩/.test(lower) || /인공지능|데이터|소프트웨어|컴퓨터/.test(topic)) {
    return {
      majors: ["컴퓨터공학과", "인공지능학과", "데이터사이언스학과", "소프트웨어학과", "산업공학과"],
      keywords: ["데이터 기반 문제 해결", "AI 모델과 의사결정", "소프트웨어 시스템 설계", "AI 윤리와 사회적 영향", "모델 평가와 개선"],
    };
  }
  if (/반도체|전자|공정|회로|소자|웨이퍼/.test(topic)) {
    return {
      majors: ["반도체공학과", "전자공학과", "재료공학과", "화학공학과", "물리학과"],
      keywords: ["반도체 공정 전반", "소자·회로 기초", "재료와 박막 형성", "공정 제어와 품질", "장비·데이터 기반 분석"],
    };
  }
  if (/교육|교사|학습|학교/.test(topic)) {
    return {
      majors: ["교육학과", "초등교육과", "교육공학과", "심리학과", "사회학과"],
      keywords: ["학습 과정과 동기", "교육 격차와 정책", "디지털 학습 환경", "수업 설계와 피드백", "학교 공동체와 성장"],
    };
  }
  return {
    majors: [`${topic} 관련 학과`, "융합전공", "사회문제탐구 관련 전공", "데이터분석 관련 전공", "교육·정책 관련 전공"],
    keywords: [`${topic}의 핵심 원리`, `${topic}의 사회적 영향`, `${topic}과 데이터 분석`, `${topic}의 윤리·정책 쟁점`, `${topic} 기반 문제 해결`],
  };
}

export async function POST(request: Request) {
  try {
    const { targetCareer } = await request.json();
    if (typeof targetCareer !== "string" || targetCareer.trim().length < 2) {
      return Response.json({ majors: [], keywords: [] });
    }
    const ai = await suggestOnboardingDirectionWithDeepSeek(targetCareer);
    const fallback = fallbackSuggestions(targetCareer);
    return Response.json({
      majors: ai?.majors?.length ? ai.majors : fallback.majors,
      keywords: ai?.keywords?.length ? ai.keywords : fallback.keywords,
      provider: ai ? "deepseek" : "fallback",
    });
  } catch {
    return Response.json({ majors: [], keywords: [], provider: "fallback" });
  }
}
