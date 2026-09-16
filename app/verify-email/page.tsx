"use client";

/**
 * 이메일 인증 링크가 열리는 화면. 메일의 링크가 이 경로로 오고, 토큰을 꺼내
 * 바로 백엔드에 검증을 요청한다 — 사용자는 버튼을 누를 필요 없이 결과만 본다.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError, verifyEmail } from "../../lib/api-client";
import { Icon } from "../icons";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"verifying" | "success" | "error">(
    token ? "verifying" : "error",
  );
  const [message, setMessage] = useState(token ? "" : "인증 링크가 올바르지 않습니다.");

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => setState("success"))
      .catch((caught) => {
        setState("error");
        setMessage(
          caught instanceof ApiError
            ? caught.message
            : "인증 링크가 만료되었거나 이미 사용되었습니다.",
        );
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200/90 shadow-xl p-8 text-center space-y-4">
        <img alt="세특연구소 로고" className="w-10 h-10 mx-auto object-contain" src="/logo.png?v=2" />
        {state === "verifying" && (
          <p className="text-sm text-gray-600 font-semibold">이메일을 인증하는 중…</p>
        )}
        {state === "success" && (
          <>
            <Icon className="mx-auto text-emerald-600" name="check-circle" size={32} />
            <h1 className="text-lg font-extrabold text-gray-950">이메일 인증이 완료되었습니다</h1>
            <p className="text-xs text-gray-500">이 창을 닫고 원래 탭으로 돌아가 로그인해주세요.</p>
          </>
        )}
        {state === "error" && (
          <>
            <Icon className="mx-auto text-red-600" name="alert" size={32} />
            <h1 className="text-lg font-extrabold text-gray-950">인증에 실패했습니다</h1>
            <p className="text-xs text-gray-500">{message}</p>
          </>
        )}
        <Link
          className="inline-block text-xs text-brand-600 font-bold hover:text-brand-700 pt-2"
          href="/"
        >
          세특연구소로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
