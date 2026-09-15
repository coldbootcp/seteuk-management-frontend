"use client";

/** 비밀번호 재설정 메일의 링크가 여는 화면. */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError, resetPassword } from "../../lib/api-client";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("재설정 링크가 올바르지 않습니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full px-3.5 py-2.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition";

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200/90 shadow-xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <img alt="세특연구소 로고" className="w-10 h-10 mx-auto object-contain" src="/logo.png?v=2" />
          <h1 className="text-lg font-extrabold text-gray-950">비밀번호 재설정</h1>
        </div>

        {done ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-600">
              비밀번호가 변경되었습니다. 다른 기기의 로그인도 모두 해제되었으니 새 비밀번호로
              다시 로그인해주세요.
            </p>
            <Link className="inline-block text-xs text-brand-600 font-bold hover:text-brand-700" href="/">
              로그인하러 가기
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor="new-password">
                새 비밀번호
              </label>
              <input
                autoComplete="new-password"
                className={fieldClass}
                id="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="영문+숫자 포함 8자 이상"
                required
                type="password"
                value={password}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5" htmlFor="new-password-confirm">
                새 비밀번호 확인
              </label>
              <input
                autoComplete="new-password"
                className={fieldClass}
                id="new-password-confirm"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
                type="password"
                value={passwordConfirm}
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
              {busy ? "변경 중…" : "비밀번호 변경하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
