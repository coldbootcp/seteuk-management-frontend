"use client";

/**
 * 비밀번호 입력 중 실시간으로 보여주는 조건 체크리스트.
 *
 * 백엔드 `validate_password_strength`(8자 이상 + 영문 + 숫자)와 조건을
 * 정확히 맞춘다 — 제출해서 실패해야만 알 수 있던 걸 타이핑하는 동안 바로
 * 보여준다(Nielsen "인식이 회상보다 낫다").
 */
export function PasswordHints({ password }: { password: string }) {
  const checks = [
    { label: "8자 이상", ok: password.length >= 8 },
    { label: "영문 포함", ok: /[a-zA-Z]/.test(password) },
    { label: "숫자 포함", ok: /[0-9]/.test(password) },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {checks.map((check) => (
        <span
          className={`text-[11px] font-semibold flex items-center gap-1 transition-colors ${
            check.ok ? "text-emerald-600" : "text-gray-400"
          }`}
          key={check.label}
        >
          <span>{check.ok ? "✓" : "○"}</span>
          {check.label}
        </span>
      ))}
    </div>
  );
}
