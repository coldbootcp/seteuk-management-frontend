import Link from "next/link";

/**
 * 개인정보 처리방침 — 정적 페이지. 서술은 실제 코드·배포가 하는 일을 그대로 반영한다 —
 * 실제로 안 하는 일을 적지 않는다(예: 생기부 개인정보 가리기는 아직 운영에 나가지 않아
 * 적지 않았다). 수집 범위가 바뀌면(새 외부 서비스, 새 수집 항목) 이 페이지도 같이 고칠 것:
 * - 서버·DB: Fly.io 도쿄(nrt) 리전 / 화면: Vercel
 * - AI: DeepSeek(중국) / 메일: Resend / 이용 분석·세션 녹화: Amplitude(US 데이터센터,
 *   lib/analytics.ts — 글자·입력 가림, 이메일 대신 사용자 UUID)
 * 아직 남은 [대괄호] 항목은 확인되는 대로 채울 것.
 */

const cell = "border border-gray-200 px-2 py-1.5 align-top";
const head = "border border-gray-200 px-2 py-1.5 text-left";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-surface-bg py-16 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-200/90 p-10 space-y-8 text-sm text-gray-700 leading-relaxed">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-950 mb-1">개인정보 처리방침</h1>
          <p className="text-xs text-gray-400">시행일: 2026-10-05</p>
        </div>

        <p>
          coldboot(“회사”)은 세특연구소 서비스(“서비스”)를 제공하며, 이용자의 개인정보를
          중요하게 생각하고 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 회사가
          처리하는 개인정보의 항목, 이용 목적, 보유 기간, 외부 위탁과 국외 이전, 이용자의
          권리를 안내합니다.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">1. 처리하는 개인정보 항목</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>회원가입·로그인(필수)</strong>: 이메일 주소, 비밀번호(복원할 수 없게
              암호화하여 저장). 구글 로그인을 쓰는 경우 구글 계정의 이메일과 고유 식별자
            </li>
            <li>
              <strong>서비스 이용(필수)</strong>: 이름, 학년·학기, 고교 입학 연도, 진로 희망과
              관심 분야, 이번 학기 수강 과목과 시간표, 업로드한 생활기록부(학교생활기록부) 파일과
              그 안의 학업·활동·봉사·출결 기록, 학생이 직접 입력한 활동·계획·일정,
              AI 챗봇·상담 대화 내용
            </li>
            <li>
              <strong>서비스 소식 받기(선택)</strong>: 이메일 주소 — 서비스 준비 중 화면에서
              직접 남긴 경우에만
            </li>
            <li>
              <strong>자동 수집</strong>: 접속 기록, IP 주소, 브라우저·기기 종류, 서비스 이용
              기록(방문한 화면, 누른 버튼의 이름, 화면 이동·스크롤, 오류가 난 요청), 화면 이용
              녹화(아래 설명)
            </li>
          </ul>
          <p className="text-xs text-gray-500">
            화면 이용 녹화(세션 리플레이)는 화면 배치와 마우스·스크롤 움직임만 기록하며, 화면에
            표시된 글자와 입력한 내용은 모두 가려진 상태로 기록되고 이미지는 기록하지
            않습니다. 이용 기록은 이메일이나 이름이 아니라 무작위로 만든 회원 번호로
            구분합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">2. 개인정보의 이용 목적</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 식별과 로그인, 부정 이용 방지, 이메일 인증·비밀번호 재설정 등 계정 보안</li>
            <li>생활기록부와 활동 기록 분석을 통한 진단·3개년 로드맵·탐구 주제 추천 제공</li>
            <li>AI 챗봇을 통한 개인화된 학습 상담 제공</li>
            <li>서비스 소식 안내(소식 받기를 신청한 경우에 한함)</li>
            <li>서비스 이용 통계 분석, 오류 파악과 화면 개선</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">3. 개인정보의 보유 및 이용 기간</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원 정보와 서비스 이용 기록: 회원 탈퇴 시까지</li>
            <li>
              탈퇴를 요청하면 계정은 즉시 비활성화되고, 실수로 탈퇴한 경우를 위해 30일의 유예
              기간을 둡니다. 그 안에는 다시 로그인해 탈퇴를 취소할 수 있으며, 유예 기간이 지나면
              계정과 모든 기록을 복구할 수 없게 삭제합니다.
            </li>
            <li>생활기록부 파일: 가장 최근에 올린 1개만 보관하며, 새 파일을 올리면 이전 파일은 삭제합니다.</li>
            <li>서비스 소식 받기 이메일: 서비스 정식 출시 안내를 보낸 뒤 또는 삭제를 요청할 때까지</li>
            <li>자동 수집된 이용 기록(분석 도구): 수집일로부터 [보관 기간]</li>
            <li>관계 법령에 따라 보존해야 하는 경우에는 해당 기간 동안 분리하여 보관합니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">4. 개인정보 처리의 위탁</h2>
          <p>
            회사는 서비스 제공을 위해 아래 업체에 개인정보 처리를 위탁하며, 위탁받은 업체가
            개인정보를 안전하게 처리하도록 관리하고 있습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 mt-2">
              <thead>
                <tr className="bg-gray-50">
                  <th className={head}>수탁업체</th>
                  <th className={head}>위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={cell}>Fly.io, Inc.</td>
                  <td className={cell}>서버와 데이터베이스 운영(개인정보 저장)</td>
                </tr>
                <tr>
                  <td className={cell}>Vercel Inc.</td>
                  <td className={cell}>웹 화면 제공(접속 기록 처리)</td>
                </tr>
                <tr>
                  <td className={cell}>DeepSeek</td>
                  <td className={cell}>생활기록부 분석, 진단·로드맵 생성, AI 챗봇 응답</td>
                </tr>
                <tr>
                  <td className={cell}>Resend, Inc.</td>
                  <td className={cell}>이메일 인증·비밀번호 재설정 메일 발송</td>
                </tr>
                <tr>
                  <td className={cell}>Amplitude, Inc.</td>
                  <td className={cell}>서비스 이용 통계 분석, 화면 이용 녹화</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">5. 개인정보의 국외 이전</h2>
          <p>
            위 수탁업체는 모두 국외에서 개인정보를 처리하므로, 「개인정보 보호법」에 따라 아래와
            같이 국외 이전 사항을 알려 드립니다. 개인정보는 서비스를 이용하는 시점에 암호화된
            네트워크로 전송되며, 위탁 계약이 끝나거나 이용 목적을 달성하면 지체 없이
            파기됩니다(단, 3항의 보유 기간에 따름).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 mt-2">
              <thead>
                <tr className="bg-gray-50">
                  <th className={head}>이전받는 자(연락처)</th>
                  <th className={head}>이전 국가</th>
                  <th className={head}>이전 항목</th>
                  <th className={head}>이전 목적</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={cell}>Fly.io, Inc. ([연락처])</td>
                  <td className={cell}>일본(도쿄 데이터센터)</td>
                  <td className={cell}>1항의 전체 개인정보</td>
                  <td className={cell}>서버·데이터베이스 운영</td>
                </tr>
                <tr>
                  <td className={cell}>Vercel Inc. (privacy@vercel.com)</td>
                  <td className={cell}>미국</td>
                  <td className={cell}>접속 기록, IP 주소</td>
                  <td className={cell}>웹 화면 제공</td>
                </tr>
                <tr>
                  <td className={cell}>DeepSeek (privacy@deepseek.com)</td>
                  <td className={cell}>중국</td>
                  <td className={cell}>
                    생활기록부의 학업·활동 기록, 진로 희망, 학생이 입력한 기록과 대화 내용
                  </td>
                  <td className={cell}>AI 분석·진단·상담 응답 생성</td>
                </tr>
                <tr>
                  <td className={cell}>Resend, Inc. ([연락처])</td>
                  <td className={cell}>미국</td>
                  <td className={cell}>이메일 주소</td>
                  <td className={cell}>인증·재설정 메일 발송</td>
                </tr>
                <tr>
                  <td className={cell}>Amplitude, Inc. (privacy@amplitude.com)</td>
                  <td className={cell}>미국</td>
                  <td className={cell}>
                    회원 번호, 서비스 이용 기록, 화면 이용 녹화(글자·입력 가림), IP 주소,
                    브라우저·기기 정보, 학년·학기 등 이용 상태
                  </td>
                  <td className={cell}>이용 통계 분석, 오류 파악과 화면 개선</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            국외 이전을 원하지 않으면 서비스 이용을 중단하고 회원 탈퇴를 요청할 수 있습니다.
            다만 서버 운영과 AI 분석은 서비스의 핵심 기능이라, 이 이전을 거부하면 서비스를 이용할
            수 없습니다. Amplitude로의 이용 기록 전송은 브라우저의 추적 방지 기능으로 막을 수
            있으며, 막아도 서비스 이용에는 지장이 없습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">6. 개인정보의 제3자 제공</h2>
          <p>
            회사는 이용자의 개인정보를 1~5항에서 밝힌 범위를 넘어 제3자에게 제공하지 않습니다.
            다만 법령에 근거가 있거나 수사기관이 법령에 정한 절차에 따라 요청하는 경우는
            예외로 합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">7. 개인정보의 파기 절차 및 방법</h2>
          <p>
            보유 기간이 끝나거나 이용 목적을 달성한 개인정보는 지체 없이 파기합니다. 전자적
            파일은 복구할 수 없는 방법으로 삭제하며, 회원 계정을 삭제하면 그 계정에 연결된
            생활기록부 파일·기록·대화가 함께 삭제됩니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">
            8. 자동 수집 장치의 설치·운영 및 거부
          </h2>
          <p>
            서비스는 로그인 상태 유지를 위해 브라우저 저장소에 로그인 정보를 보관하고, 이용 통계
            분석을 위해 Amplitude의 쿠키·브라우저 저장소에 무작위 기기 번호를 저장합니다.
            이용자는 브라우저 설정에서 쿠키와 사이트 데이터를 삭제하거나 차단할 수 있습니다.
            로그인 정보 저장을 막으면 로그인이 유지되지 않으며, 분석용 저장을 막아도 서비스
            이용에는 지장이 없습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">9. 만 14세 미만 아동의 개인정보</h2>
          <p>
            서비스는 고등학생을 대상으로 하며, 만 14세 미만 아동의 회원가입을 받지 않습니다.
            만 14세 미만 아동의 개인정보가 수집된 사실을 알게 되면 지체 없이 파기합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">10. 개인정보의 안전성 확보 조치</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>비밀번호는 복원할 수 없는 방식(bcrypt)으로 암호화하여 저장합니다.</li>
            <li>이용자와 서비스 사이의 모든 통신은 HTTPS로 암호화합니다.</li>
            <li>
              이메일 인증·비밀번호 재설정 링크는 1회용이며, 서버에는 원래 값을 알 수 없는 형태로만
              저장합니다.
            </li>
            <li>개인정보에 접근할 수 있는 사람을 최소한으로 제한합니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">11. 이용자의 권리와 행사 방법</h2>
          <p>
            이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지를 요구할 수 있습니다.
            서비스 내 프로필 설정 메뉴에서 직접 확인·수정하거나 회원 탈퇴를 할 수 있고, 아래
            개인정보 보호책임자에게 요청할 수도 있습니다. 서비스 소식 받기 이메일 삭제도 같은
            방법으로 요청할 수 있습니다. 회사는 요청을 받으면 지체 없이 조치합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">12. 개인정보 보호책임자</h2>
          <p>
            성명: 강필중 · 연락처: 010-4082-7417
            <br />
            개인정보 관련 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 담당자에게
            문의하시기 바랍니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">13. 권익침해 구제 방법</h2>
          <p>개인정보 침해에 대한 상담이나 신고가 필요하면 아래 기관에 문의할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청: 1301 (www.spo.go.kr)</li>
            <li>경찰청: 182 (ecrm.police.go.kr)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">14. 사업자 정보</h2>
          <p>
            상호: coldboot · 대표자: 강필중
            <br />
            사업자등록번호: 252-09-03289 · 주소: 서울시 동대문구 왕산로 69-2
            <br />
            문의: 010-4082-7417
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-gray-950">15. 처리방침의 변경</h2>
          <p>
            이 방침은 2026년 10월 5일부터 적용됩니다. 내용이 바뀌면 시행 7일 전에 서비스
            화면으로 알립니다. 이전 방침은 2026년 9월 15일부터 적용되었습니다.
          </p>
        </section>

        <Link className="inline-block text-xs text-brand-600 font-bold hover:text-brand-700" href="/">
          세특연구소로 돌아가기
        </Link>
      </div>
    </div>
  );
}
