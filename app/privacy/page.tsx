import Link from "next/link";

/**
 * 개인정보 처리방침 — 정적 페이지. 사업자 정보(상호·대표자·사업자등록번호·
 * 주소·개인정보보호책임자)는 실제 값으로 채워져 있다. 서술은 실제 코드가
 * 하는 일(수집 항목, DeepSeek·Resend·구글로의 처리위탁, 탈퇴 시 30일
 * 유예 후 파기)을 그대로 반영했다 — 실제로 안 하는 일을 적지 않는다.
 * 아직 남은 [대괄호] 항목: 클라우드/DB 호스팅사(배포 인프라 미확정),
 * 전용 문의 이메일(현재는 연락처 전화번호로 대체) — 정해지면 채울 것.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-surface-bg py-16 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-200/90 p-10 space-y-8 text-sm text-gray-700 leading-relaxed">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-950 mb-1">개인정보 처리방침</h1>
          <p className="text-xs text-gray-400">시행일: 2026-09-15</p>
        </div>

        <p>
          coldboot("회사")은 세특연구소 서비스("서비스")를 제공하며, 이용자의 개인정보를
          중요하게 생각하고 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 회사가
          수집하는 개인정보의 항목, 이용 목적, 보관 기간 및 이용자의 권리를 안내합니다.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">1. 수집하는 개인정보 항목</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원가입 시: 이메일 주소, 비밀번호(암호화 저장)</li>
            <li>소셜 로그인 시: 구글 계정의 이메일, 고유 식별자</li>
            <li>
              서비스 이용 과정에서: 생활기록부(학교생활기록부) 업로드 파일 및 그 안의 학업·
              활동·수상·봉사·독서·출결 기록, 학생이 직접 입력한 활동·계획·대화 내용
            </li>
            <li>자동 수집 항목: 접속 로그, IP 주소(부정 이용 방지 목적)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">2. 개인정보의 수집 및 이용 목적</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 식별 및 로그인, 부정 이용 방지</li>
            <li>생활기록부 및 활동 기록 분석을 통한 진단·로드맵·후속 탐구 추천 제공</li>
            <li>AI 챗봇을 통한 개인화된 학습 상담 제공</li>
            <li>비밀번호 재설정, 이메일 인증 등 계정 보안</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">3. 개인정보의 처리위탁</h2>
          <p>
            회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있으며, 위탁받은
            업체가 개인정보를 안전하게 처리하도록 필요한 사항을 규정하고 있습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 mt-2">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-2 py-1.5 text-left">수탁업체</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left">위탁 업무</th>
                  <th className="border border-gray-200 px-2 py-1.5 text-left">위탁하는 개인정보</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-1.5">DeepSeek</td>
                  <td className="border border-gray-200 px-2 py-1.5">
                    생활기록부 분석, 진단·로드맵 생성, AI 챗봇 응답
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">
                    학업·활동 등 서비스 이용 기록(개인 식별 정보 최소화)
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1.5">Resend</td>
                  <td className="border border-gray-200 px-2 py-1.5">
                    이메일 인증·비밀번호 재설정 메일 발송
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">이메일 주소</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1.5">[클라우드/DB 호스팅사]</td>
                  <td className="border border-gray-200 px-2 py-1.5">서버 및 데이터베이스 운영</td>
                  <td className="border border-gray-200 px-2 py-1.5">전체 개인정보</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">4. 개인정보의 보유 및 이용 기간</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 탈퇴 시 지체 없이 파기하는 것을 원칙으로 합니다.</li>
            <li>
              다만 탈퇴 요청 직후 계정은 비활성화되며, 실수로 탈퇴한 경우를 위해 30일의 유예
              기간을 두고 그 안에는 재로그인하여 탈퇴를 취소할 수 있습니다. 유예 기간이
              지나면 계정 및 모든 기록이 복구 불가능하게 완전히 삭제됩니다.
            </li>
            <li>관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 분리 보관합니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">5. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지를 요구할 수 있습니다.
            서비스 내 프로필 설정 메뉴에서 직접 확인·수정·삭제하거나, 아래 연락처로 요청할 수
            있습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">6. 개인정보보호책임자</h2>
          <p>
            성명: 강필중 · 연락처: 010-4082-7417
            <br />
            개인정보 관련 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 담당자에게
            문의하시기 바랍니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">7. 사업자 정보</h2>
          <p>
            상호: coldboot · 대표자: 강필중
            <br />
            사업자등록번호: 252-09-03289 · 주소: 서울시 동대문구 왕산로 69-2
            <br />
            문의: 010-4082-7417
          </p>
        </section>

        <Link className="inline-block text-xs text-brand-600 font-bold hover:text-brand-700" href="/">
          세특연구소로 돌아가기
        </Link>
      </div>
    </div>
  );
}
