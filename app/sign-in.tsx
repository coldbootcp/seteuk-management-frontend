"use client";

import { useState } from "react";
import {
  ApiError,
  GOOGLE_CLIENT_ID,
  KAKAO_JS_KEY,
  login,
  loginWithGoogle,
  loginWithKakao,
  requestPasswordReset,
  resendVerificationEmail,
  signup,
} from "../lib/api-client";
import { PasswordHints } from "./password-hints";

/**
 * 로그인 게이트.
 *
 * 예전에는 ChatGPT 헤더로 신원을 받았지만(`oai-authenticated-user-email`), 이 앱은
 * ChatGPT 안에서 돌지 않기로 했다(통합 결정 P-4). 인증은 백엔드 JWT가 맡는다.
 *
 * 화면은 목업(preview-3200)의 로그인 카드를 따르되, **백엔드가 받쳐주지 않는 것은
 * 눌리는 버튼으로 두지 않는다.** 애플 로그인은 아직 백엔드에 없으므로 '준비 중'으로
 * 비활성화한다 — 눌러도 아무 일이 없는 버튼은 사용자가 고장으로 읽는다. 구글·
 * 비밀번호 찾기는 이제 실제로 동작한다.
 */

type Mode = "login" | "signup" | "forgot";

/**
 * 인증 실패를 사람이 읽을 말로 옮긴다. 백엔드는 로그인 실패를 한 가지 코드로만
 * 알려 준다 — 어느 쪽이 틀렸는지 밝히면 계정이 있는지 없는지가 새어 나가기
 * 때문이다. 그 의도는 지키되, 다음에 무엇을 해야 하는지는 알려 준다.
 */
function readableAuthError(caught: unknown, mode: Mode): string {
  if (caught instanceof ApiError) {
    if (caught.errorCode === "INVALID_CREDENTIALS") {
      return "이메일 또는 비밀번호가 맞지 않습니다.";
    }
    if (caught.errorCode === "EMAIL_ALREADY_EXISTS") {
      return "이미 가입된 이메일입니다. 로그인해주세요.";
    }
    if (caught.errorCode === "WEAK_PASSWORD" || caught.errorCode === "RATE_LIMITED") {
      return caught.message;
    }
    if (caught.status === 0) {
      return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
    }
    return caught.message;
  }
  return mode === "signup" ? "가입하지 못했습니다." : "로그인하지 못했습니다.";
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // 로그인이 EMAIL_NOT_VERIFIED로 막혔거나 방금 가입해서, 인증 메일 재발송을
  // 안내해야 할 때 채워진다. null이면 안내를 보여주지 않는다.
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [forgotSent, setForgotSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setVerificationEmail(null);
    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email, password);
        onSignedIn();
      } else if (mode === "login") {
        await login(email, password, rememberMe);
        onSignedIn();
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.errorCode === "EMAIL_NOT_VERIFIED") {
        setVerificationEmail(email);
        setError("이메일 인증을 먼저 완료해주세요.");
      } else {
        setError(readableAuthError(caught, mode));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setForgotSent(true);
    } catch (caught) {
      setError(readableAuthError(caught, mode));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail) return;
    setResendState("sending");
    try {
      await resendVerificationEmail(verificationEmail);
      setResendState("sent");
    } catch {
      setResendState("idle");
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

  async function submitGoogle() {
    setError("");
    setBusy(true);
    try {
      await loginWithGoogle();
      onSignedIn();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!/cancel|popup|closed/i.test(message)) {
        setError(message || "구글 로그인을 마치지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full px-3.5 py-2.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition";

  if (mode === "forgot") {
    return (
      <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <img alt="세특연구소 로고" className="w-9 h-9 object-contain" src="/logo.png?v=2" />
              <span className="text-xl font-extrabold text-gray-950 tracking-tight">세특연구소</span>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight">비밀번호 찾기</h2>
          </div>

          <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-gray-200/90 shadow-xl space-y-5">
            {forgotSent ? (
              <div className="space-y-4 text-center">
                <p className="text-xs text-gray-700 leading-relaxed">
                  <strong className="text-gray-950">{email}</strong>로 가입된 계정이 있다면
                  비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해주세요.
                </p>
                <button
                  className="text-xs text-brand-600 font-bold hover:text-brand-700"
                  onClick={() => {
                    setMode("login");
                    setForgotSent(false);
                  }}
                  type="button"
                >
                  로그인으로 돌아가기
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submitForgotPassword}>
                <p className="text-xs text-gray-500 leading-relaxed">
                  가입할 때 쓴 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
                </p>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor="forgot-email">
                    이메일 주소
                  </label>
                  <input
                    autoComplete="email"
                    className={fieldClass}
                    id="forgot-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                    type="email"
                    value={email}
                  />
                </div>

                {error && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                    {error}
                  </div>
                )}

                <button
                  className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl transition disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "전송 중…" : "재설정 링크 보내기"}
                </button>
                <button
                  className="w-full text-xs text-gray-500 hover:text-gray-700 font-semibold"
                  onClick={() => setMode("login")}
                  type="button"
                >
                  로그인으로 돌아가기
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

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

            <button
              className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-extrabold text-xs rounded-xl border border-gray-300 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || !GOOGLE_CLIENT_ID}
              onClick={submitGoogle}
              title={GOOGLE_CLIENT_ID ? undefined : "구글 로그인 키가 아직 설정되지 않았습니다"}
              type="button"
            >
              <svg className="w-4 h-4 flex-none" viewBox="0 0 24 24">
                <path
                  d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
                  fill="#4285F4"
                />
                <path
                  d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24Z"
                  fill="#34A853"
                />
                <path
                  d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.1Z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
                  fill="#EA4335"
                />
              </svg>
              <span>{GOOGLE_CLIENT_ID ? "Google로 계속하기" : "Google 로그인 (준비 중)"}</span>
            </button>

            <button
              className="w-full py-2.5 px-3 bg-white text-gray-400 font-bold text-xs rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 cursor-not-allowed"
              disabled
              title="준비 중입니다"
              type="button"
            >
              <span>Apple로 계속하기</span>
              <span className="text-[10px] font-semibold">준비 중</span>
            </button>
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
                  <button
                    className="text-[11px] text-brand-600 font-semibold hover:text-brand-700"
                    onClick={() => {
                      setError("");
                      setForgotSent(false);
                      setMode("forgot");
                    }}
                    type="button"
                  >
                    비밀번호 찾기
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className={`${fieldClass} pr-14`}
                  id="auth-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="영문+숫자 포함 8자 이상"
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
              {mode === "signup" && <PasswordHints password={password} />}
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
                  <span className="font-semibold text-gray-800">[필수]</span> 세특연구소{" "}
                  <a className="underline hover:text-brand-600" href="/terms" target="_blank">
                    이용약관
                  </a>{" "}
                  및{" "}
                  <a className="underline hover:text-brand-600" href="/privacy" target="_blank">
                    개인정보 처리방침
                  </a>
                  에 동의합니다.
                </label>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                {error}
              </div>
            )}

            {verificationEmail && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                <p>
                  <strong>{verificationEmail}</strong>로 인증 메일을 보냈습니다. 메일함을
                  확인해 인증을 마쳐주세요.
                </p>
                <button
                  className="font-bold text-amber-900 underline disabled:opacity-50"
                  disabled={resendState !== "idle"}
                  onClick={resendVerification}
                  type="button"
                >
                  {resendState === "sending"
                    ? "보내는 중…"
                    : resendState === "sent"
                      ? "다시 보냈습니다"
                      : "인증 메일 다시 보내기"}
                </button>
              </div>
            )}

            <button
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-60"
              disabled={busy || (mode === "signup" && !agreeTerms)}
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
                setVerificationEmail(null);
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
