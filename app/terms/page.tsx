import Link from "next/link";

/**
 * 이용약관 — 정적 페이지. 사업자 정보(상호)는 실제 값으로 채워져 있다.
 * 전용 문의 이메일은 아직 없어 연락처 전화번호로 대체했다 — 정해지면 채울 것.
 */
export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-surface-bg py-16 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-200/90 p-10 space-y-8 text-sm text-gray-700 leading-relaxed">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-950 mb-1">이용약관</h1>
          <p className="text-xs text-gray-400">시행일: 2026-09-15</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제1조 (목적)</h2>
          <p>
            본 약관은 coldboot("회사")이 제공하는 세특연구소 서비스("서비스")의 이용과
            관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제2조 (서비스의 내용)</h2>
          <p>
            서비스는 이용자가 업로드하거나 직접 입력한 생활기록부·활동 기록을 바탕으로 AI
            분석을 통해 진단, 학기별 로드맵, 후속 탐구 주제를 제안하고, AI 챗봇을 통한 개인화된
            학습 상담을 제공합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제3조 (회원가입 및 계정)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>이용자는 이메일/비밀번호 또는 구글·카카오 계정으로 가입할 수 있습니다.</li>
            <li>
              이메일/비밀번호로 가입한 경우, 이메일 인증을 완료해야 서비스를 정상적으로
              이용할 수 있습니다.
            </li>
            <li>이용자는 본인의 계정과 비밀번호를 안전하게 관리할 책임이 있습니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제4조 (AI 분석 결과의 성격)</h2>
          <p>
            서비스가 제공하는 진단·로드맵·추천·챗봇 답변은 AI가 이용자의 기록을 바탕으로
            생성한 참고 자료이며, 입시 결과나 학업 성취를 보장하지 않습니다. 서비스는 대학
            합격 가능성이나 전형 적합도를 단정적으로 제시하지 않습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제5조 (회원 탈퇴)</h2>
          <p>
            이용자는 언제든지 서비스 내 계정 설정에서 탈퇴를 요청할 수 있습니다. 탈퇴
            요청 시 계정은 즉시 비활성화되며, 30일의 유예 기간이 지나면 계정 및 모든 기록이
            복구할 수 없게 완전히 삭제됩니다. 유예 기간 중에는 재로그인하여 탈퇴를 취소할 수
            있습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제6조 (금지행위)</h2>
          <p>
            이용자는 타인의 계정을 도용하거나, 서비스를 부정한 목적으로 이용하거나, 서비스의
            정상적인 운영을 방해하는 행위를 해서는 안 됩니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">제7조 (문의)</h2>
          <p>본 약관에 관한 문의는 010-4082-7417로 해주시기 바랍니다.</p>
        </section>

        <Link className="inline-block text-xs text-brand-600 font-bold hover:text-brand-700" href="/">
          세특연구소로 돌아가기
        </Link>
      </div>
    </div>
  );
}
