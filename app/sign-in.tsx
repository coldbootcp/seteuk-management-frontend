"use client";

import { useState } from "react";
import { ApiError, KAKAO_JS_KEY, login, loginWithKakao, signup } from "../lib/api-client";

/**
 * 로그인 게이트.
 *
 * 예전에는 ChatGPT 헤더로 신원을 받았지만(`oai-authenticated-user-email`), 이 앱은
 * ChatGPT 안에서 돌지 않기로 했다(통합 결정 P-4). 인증은 백엔드 JWT가 맡는다.
 *
 * 화면은 목업(preview-3200)의 로그인 카드를 따르되, **백엔드가 받쳐주지 않는 것은
 * 눌리는 버튼으로 두지 않는다.** 구글·애플 로그인과 비밀번호 찾기는 백엔드에 아직
 * 없으므로 '준비 중'으로 비활성화한다 — 눌러도 아무 일이 없는 버튼은 사용자가
 * 고장으로 읽는다.
 */

/**
 * 인증 실패를 사람이 읽을 말로 옮긴다. 백엔드는 로그인 실패를 한 가지 코드로만
 * 알려 준다 — 어느 쪽이 틀렸는지 밝히면 계정이 있는지 없는지가 새어 나가기
 * 때문이다. 그 의도는 지키되, 다음에 무엇을 해야 하는지는 알려 준다.
 */
function readableAuthError(caught: unknown, mode: "login" | "signup"): string {
  if (caught instanceof ApiError) {
    if (caught.errorCode === "INVALID_CREDENTIALS") {
      return "이메일 또는 비밀번호가 맞지 않습니다.";
    }
    if (caught.errorCode === "EMAIL_ALREADY_EXISTS") {
      return "이미 가입된 이메일입니다. 로그인해주세요.";
    }
    if (caught.status === 0) {
      return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
    }
    return caught.message;
  }
  return mode === "signup" ? "가입하지 못했습니다." : "로그인하지 못했습니다.";
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email, password);
      } else {
        await login(email, password, rememberMe);
      }
      onSignedIn();
    } catch (caught) {
      setError(readableAuthError(caught, mode));
    } finally {
      setBusy(false);
    }
  }

  async function submitKakao() {
    setError("");
    setBusy(true);
    try {
      await loginWithKakao();
      onSignedIn();
    } catch (caught) {
      // 사용자가 카카오 창을 그냥 닫은 것은 실패가 아니다 — 조용히 돌아온다.
      const message = caught instanceof Error ? caught.message : "";
      if (!/cancel|popup|closed/i.test(message)) {
        setError(message || "카카오 로그인을 마치지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full px-3.5 py-2.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition";

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <img alt="세특연구소 로고" className="w-9 h-9 object-contain" src="/logo.png?v=2" />
            <span className="text-xl font-extrabold text-gray-950 tracking-tight">세특연구소</span>
            <span className="text-brand-600 font-extrabold text-[11px] px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200/80">
              Pro
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight">
            {mode === "login" ? "로그인" : "회원가입"}
          </h2>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-gray-200/90 shadow-xl space-y-6">
          {/* 소셜 로그인 */}
          <div className="space-y-2.5">
            <button
              className="w-full py-3 px-4 bg-[#FEE500] hover:bg-[#FDD800] text-[#381E1F] font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              disabled={busy || !KAKAO_JS_KEY}
              onClick={submitKakao}
              title={KAKAO_JS_KEY ? undefined : "카카오 로그인 키가 아직 설정되지 않았습니다"}
              type="button"
            >
              <svg className="w-4 h-4 fill-current flex-none" viewBox="0 0 24 24">
                <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.708 4.8 4.27 6.054-.187.707-.677 2.56-.775 2.964-.122.506.186.499.392.363.162-.107 2.573-1.748 3.612-2.456.491.07 1.002.107 1.521.107 4.97 0 9-3.185 9-7.115S16.97 3 12 3z" />
              </svg>
              <span>{KAKAO_JS_KEY ? "카카오로 1초 만에 시작하기" : "카카오 로그인 (준비 중)"}</span>
            </button>

            {/* 구글·애플은 백엔드에 아직 없다 — 눌리지 않게 두고 그렇다고 말한다. */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { key: "google", label: "Google" },
                { key: "apple", label: "Apple" },
              ].map((provider) => (
                <button
                  className="py-2.5 px-3 bg-white text-gray-400 font-bold text-xs rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 cursor-not-allowed"
                  disabled
                  key={provider.key}
                  title="준비 중입니다"
                  type="button"
                >
                  <span>{provider.label}</span>
                  <span className="text-[10px] font-semibold">준비 중</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="grow border-t border-gray-200" />
            <span className="shrink mx-3 text-[11px] text-gray-400 font-medium">또는 이메일로 계속하기</span>
            <div className="grow border-t border-gray-200" />
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor="auth-email">
                이메일 주소
              </label>
              <input
                autoComplete="email"
                className={fieldClass}
                id="auth-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-gray-700" htmlFor="auth-password">
                  비밀번호
                </label>
                {mode === "login" && (
                  <span className="text-[11px] text-gray-400 font-semibold" title="준비 중입니다">
                    비밀번호 찾기 (준비 중)
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className={`${fieldClass} pr-14`}
                  id="auth-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8자 이상"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? "숨김" : "보기"}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor="auth-password-confirm">
                  비밀번호 확인
                </label>
                <input
                  autoComplete="new-password"
                  className={fieldClass}
                  id="auth-password-confirm"
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="비밀번호를 한 번 더 입력해주세요"
                  required
                  type="password"
                  value={passwordConfirm}
                />
              </div>
            )}

            {mode === "login" ? (
              <div className="flex items-center">
                <input
                  checked={rememberMe}
                  className="h-4 w-4 rounded border-gray-300"
                  id="remember-me"
                  onChange={(event) => setRememberMe(event.target.checked)}
                  type="checkbox"
                />
                <label className="ml-2 block text-xs text-gray-600" htmlFor="remember-me">
                  로그인 상태 유지
                </label>
              </div>
            ) : (
              <div className="flex items-start">
                <input
                  checked={agreeTerms}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300"
                  id="agree-terms"
                  onChange={(event) => setAgreeTerms(event.target.checked)}
                  required
                  type="checkbox"
                />
                <label className="ml-2 block text-[11px] text-gray-600 leading-snug" htmlFor="agree-terms">
                  <span className="font-semibold text-gray-800">[필수]</span> 세특연구소 이용약관 및 개인정보
                  처리방침에 동의합니다.
                </label>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                {error}
              </div>
            )}

            <button
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? "처리 중…" : mode === "login" ? "로그인하기" : "회원가입 완료하고 시작하기"}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-gray-100">
            <button
              className="text-xs text-gray-600 hover:text-brand-600 font-semibold transition"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
              type="button"
            >
              {mode === "login" ? (
                <span>
                  아직 계정이 없으신가요? <strong className="text-brand-600 font-bold">무료 회원가입</strong>
                </span>
              ) : (
                <span>
                  이미 계정이 있으신가요? <strong className="text-brand-600 font-bold">로그인하기</strong>
                </span>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400">
          세특연구소는 학생의 개인정보와 학생부 데이터를 안전하게 보관합니다.
        </p>
      </div>
    </div>
  );
}
