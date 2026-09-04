"use client";

import { useState } from "react";
import { login, signup } from "../lib/api-client";

/**
 * 로그인 게이트.
 *
 * 예전에는 ChatGPT 헤더로 신원을 받았지만(`oai-authenticated-user-email`), 이 앱은
 * ChatGPT 안에서 돌지 않기로 했다(통합 결정 P-4). 인증은 백엔드 JWT가 맡는다.
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await (mode === "signup" ? signup : login)(email, password);
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-shell">
      <form className="signin-card" onSubmit={submit}>
        <p className="signin-eyebrow">세특연구소</p>
        <h1 className="signin-title">
          {mode === "login" ? "다시 오셨네요" : "시작해볼까요"}
        </h1>
        <p className="signin-sub">3년의 세특 활동을 기록하고, 다음 단계를 계획합니다.</p>

        <label className="signin-field">
          <span>이메일</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="signin-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>

        {error && <p className="signin-error">{error}</p>}

        <button className="signin-submit" type="submit" disabled={busy}>
          {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작하기"}
        </button>
        <button
          className="signin-switch"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
}
