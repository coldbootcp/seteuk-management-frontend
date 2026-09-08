"use client";

/**
 * 온보딩과 진단·상담 관문이 함께 쓰는 전체 화면 틀.
 *
 * 두 화면은 사이드바 없이 화면을 통째로 차지하는데, 그동안 여기서 나가는 길이
 * 아예 없었다 — 로그아웃 버튼이 ProductShell 사이드바에만 있어서, 온보딩을
 * 끝내지 못한 계정은 화면에 갇혔다(다른 계정으로 바꿀 수도, 로그아웃할 수도
 * 없었다). 틀이 상단바를 들고 있으므로 두 화면 모두 언제든 빠져나갈 수 있다.
 */

import type { ReactNode } from "react";

export function GateFrame({
  badge,
  children,
  onSignOut,
  width = "narrow",
}: {
  /** 상단바 오른쪽에 붙는 현재 단계 표시. 없으면 그리지 않는다. */
  badge?: string;
  children: ReactNode;
  onSignOut: () => void;
  width?: "narrow" | "wide";
}) {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200/80">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="세특연구소" className="w-7 h-7 object-contain flex-none" src="/logo.png?v=2" />
            <span className="font-extrabold text-sm text-gray-950 tracking-tight truncate">
              세특연구소 <span className="text-brand-500">Pro</span>
            </span>
            {badge && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/80 text-brand-600 text-[11px] font-bold flex-none">
                {badge}
              </span>
            )}
          </div>
          <button
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 text-[11px] font-bold transition flex items-center gap-1.5 flex-none"
            onClick={onSignOut}
            type="button"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </header>

      <main className={`mx-auto px-4 sm:px-5 py-8 ${width === "wide" ? "max-w-6xl" : "max-w-5xl"}`}>
        {children}
      </main>
    </div>
  );
}
