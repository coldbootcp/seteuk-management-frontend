"use client";

import { useState } from "react";
import { ApiError, KAKAO_JS_KEY, login, loginWithKakao, signup } from "../lib/api-client";

/**
 * 로그인 게이트.
 *
 * 예전에는 ChatGPT 헤더로 신원을 받았지만(`oai-authenticated-user-email`), 이 앱은
 * ChatGPT 안에서 돌지 않기로 했다(통합 결정 P-4). 인증은 백엔드 JWT가 맡는다.
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
        {KAKAO_JS_KEY && (
          <button className="signin-kakao" disabled={busy} onClick={submitKakao} type="button">
            카카오로 계속하기
          </button>
        )}
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
