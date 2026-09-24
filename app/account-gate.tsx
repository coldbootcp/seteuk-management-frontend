"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  cancelWithdrawal,
  getAccountStatus,
  resendVerificationEmail,
  withdrawAccount,
  type AccountStatus,
} from "../lib/api-client";
import { GateFrame } from "./gate-frame";
import { Icon } from "./icons";

/** 인증 여부를 몇 초 간격으로 조용히 확인하는 주기(ms). 사용자가 다른
 * 탭에서 메일의 링크를 누르면, 이 화면을 새로고침하지 않아도 자동으로
 * 넘어간다. */
const VERIFICATION_POLL_INTERVAL_MS = 4000;

/**
 * 이메일 인증 대기 화면.
 *
 * 로그인은 됐지만(토큰은 있다) 이메일 인증을 안 마친 계정이 여기서 멈춘다.
 */
export function EmailVerificationGate({
  email,
  onVerified,
  onSignOut,
}: {
  email: string;
  /** 다른 탭에서 인증을 마친 게 폴링으로 감지되면 부른다 — 상위가 관문을 다시 평가한다. */
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const timer = window.setInterval(() => {
      getAccountStatus()
        .then((status) => {
          if (status.email_verified) onVerified();
        })
        .catch(() => {
          /* 폴링 실패는 조용히 넘어간다 — 다음 주기에 다시 시도된다 */
        });
    }, VERIFICATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [onVerified]);

  async function resend() {
    setState("sending");
    try {
      await resendVerificationEmail(email);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <GateFrame badge="이메일 인증" onSignOut={onSignOut}>
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200/80 p-8 text-center space-y-4">
        <Icon className="mx-auto text-brand-600" name="mail" size={32} />
        <h2 className="text-lg font-extrabold text-gray-950">이메일 인증을 완료해주세요</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong className="text-gray-950">{email}</strong>로 인증 메일을 보냈습니다. 메일함(스팸함
          포함)에서 링크를 누르면 이 화면이 자동으로 넘어갑니다.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl transition disabled:opacity-60"
            disabled={state === "sending"}
            onClick={resend}
            type="button"
          >
            {state === "sending"
              ? "보내는 중…"
              : state === "sent"
                ? "다시 보냈습니다"
                : "인증 메일 다시 보내기"}
          </button>
          <button
            className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition"
            onClick={() => window.location.reload()}
            type="button"
          >
            인증했어요, 새로고침
          </button>
        </div>
        {state === "error" && (
          <p className="text-[11px] text-red-600 font-semibold">
            메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.
          </p>
        )}
        <div className="pt-2 border-t border-gray-100">
          <button
            className="text-[11px] text-gray-400 hover:text-gray-600 font-medium underline"
            onClick={onSignOut}
            type="button"
          >
            이메일을 잘못 입력하셨나요? 로그아웃하고 다시 가입하기
          </button>
        </div>
      </div>
    </GateFrame>
  );
}

/**
 * 탈퇴 유예 화면.
 *
 * 탈퇴를 요청한 계정은 로그인은 되지만 일반 기능은 막고, 오직 "탈퇴 취소"만
 * 할 수 있게 한다 — 실수로 누른 탈퇴를 되돌릴 마지막 기회다.
 */
export function WithdrawalPendingGate({
  status,
  onCancelled,
  onSignOut,
}: {
  status: AccountStatus;
  onCancelled: () => void;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scheduledDate = status.scheduled_deletion_at
    ? new Date(status.scheduled_deletion_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await cancelWithdrawal();
      onCancelled();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "탈퇴 취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GateFrame badge="탈퇴 예정" onSignOut={onSignOut}>
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-200/80 p-8 text-center space-y-4">
        <Icon className="mx-auto text-amber-600" name="timer" size={32} />
        <h2 className="text-lg font-extrabold text-gray-950">탈퇴가 예약되어 있습니다</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          {scheduledDate && (
            <>
              <strong className="text-gray-950">{scheduledDate}</strong>에 계정과 모든 기록이
              완전히 삭제됩니다.
              <br />
            </>
          )}
          그 전까지는 언제든 탈퇴를 취소하고 계속 이용할 수 있습니다.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl transition disabled:opacity-60"
            disabled={busy}
            onClick={cancel}
            type="button"
          >
            {busy ? "처리 중…" : "탈퇴 취소하고 계속 이용하기"}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
      </div>
    </GateFrame>
  );
}

/**
 * 프로필 설정 탭 하단에 붙는 계정 관리 카드 — 로그인 수단 표시와 회원 탈퇴.
 *
 * 탈퇴 성공 뒤에는 새로고침으로 최상위 게이트(WithdrawalPendingGate)가 다시
 * 평가하게 한다 — 이 컴포넌트가 상위 상태를 직접 건드리지 않아도 되게 하는
 * 가장 단순한 방법이다.
 */
export function AccountSection() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAccountStatus()
      .then(setStatus)
      .catch(() => {
        /* 계정 카드는 부가 정보라 실패해도 나머지 화면을 막지 않는다 */
      });
  }, []);

  async function submitWithdraw() {
    setBusy(true);
    setError("");
    try {
      await withdrawAccount(status?.has_password ? password : undefined);
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "탈퇴 요청을 처리하지 못했습니다.",
      );
      setBusy(false);
    }
  }

  if (!status) return null;

  const linkedMethods = [
    status.has_password && "이메일/비밀번호",
    status.google_linked && "Google",
  ].filter(Boolean) as string[];

  return (
    <div className="data-priority-card">
      <span className="kicker">ACCOUNT</span>
      <h2>계정 관리</h2>
      <div className="mt-3 space-y-2 text-xs text-gray-600">
        <div className="flex items-center justify-between">
          <span>이메일</span>
          <span className="font-semibold text-gray-900">{status.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>로그인 방법</span>
          <span className="font-semibold text-gray-900">{linkedMethods.join(", ") || "-"}</span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        {!confirming ? (
          <button
            className="text-[11px] text-red-500 hover:text-red-600 font-bold"
            onClick={() => setConfirming(true)}
            type="button"
          >
            회원 탈퇴
          </button>
        ) : (
          <div className="space-y-2.5 bg-red-50/60 border border-red-200 rounded-xl p-3.5">
            <p className="text-[11px] text-red-800 leading-relaxed">
              탈퇴하면 즉시 로그아웃되고, 30일 뒤 계정과 모든 기록이 완전히 삭제됩니다. 그
              전까지는 다시 로그인해 탈퇴를 취소할 수 있습니다.
            </p>
            {status.has_password && (
              <input
                className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 focus:outline-none focus:ring-2 focus:ring-red-400"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 확인"
                type="password"
                value={password}
              />
            )}
            {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold disabled:opacity-60"
                disabled={busy || (status.has_password && !password)}
                onClick={submitWithdraw}
                type="button"
              >
                {busy ? "처리 중…" : "탈퇴 확정"}
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-[11px] font-bold"
                onClick={() => {
                  setConfirming(false);
                  setError("");
                  setPassword("");
                }}
                type="button"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
