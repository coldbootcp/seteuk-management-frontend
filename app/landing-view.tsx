"use client";

/**
 * 비로그인 랜딩.
 *
 * 목업(preview-3200)의 첫 화면을 옮긴 것이다. 문구·수치·후기·요금은 전부
 * `landing-content.ts`에 모아 두었고 아직 실제 값이 아니다 — 그래서 화면 곳곳에
 * 예시임을 밝히는 표시를 남긴다(`IS_PLACEHOLDER`).
 *
 * 버튼은 전부 로그인/가입으로만 이어진다. 결제는 백엔드 범위 밖이라 요금 카드도
 * 결제 흐름을 흉내 내지 않고 가입으로 보낸다.
 */

import { useState } from "react";
import {
  FAQS,
  FEATURE_ENGINES,
  HERO_PRINCIPLES,
} from "./landing-content";
import { Icon } from "./icons";

const NAV_LINKS = [
  { href: "#features", label: "핵심 기능" },
  { href: "#faq", label: "자주 묻는 질문" },
];

export function LandingView({ onGoToLogin }: { onGoToLogin: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-surface-bg text-gray-950 overflow-x-hidden">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            className="flex items-center gap-3"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            type="button"
          >
            <img alt="세특연구소 로고" className="w-8 h-8 md:w-9 md:h-9 object-contain flex-none" src="/logo.png?v=2" />
            <span className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg md:text-xl text-gray-950 tracking-tight">세특연구소</span>
              <span className="text-brand-600 font-extrabold text-[11px] px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200/80">
                Pro
              </span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-600">
            {NAV_LINKS.map((link) => (
              <a className="hover:text-brand-600 transition" href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 flex-none">
            <button
              className="px-3.5 py-1.5 text-sm font-semibold text-gray-700 hover:text-gray-950 transition"
              onClick={onGoToLogin}
              type="button"
            >
              로그인
            </button>
            <button
              className="px-4 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition"
              onClick={onGoToLogin}
              type="button"
            >
              무료로 시작하기
            </button>
          </div>
        </div>
      </header>

      {/* 히어로 */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden bg-gradient-to-b from-white via-blue-50/20 to-surface-bg">
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-brand-200/30 via-indigo-100/20 to-purple-100/20 blur-3xl pointer-events-none rounded-full -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200/80 text-brand-600 text-xs md:text-sm font-bold">
              <span className="flex h-2 w-2 rounded-full bg-brand-500" />
              <span>고교 활동 기록부터 수시 준비까지</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-gray-950 tracking-tight leading-[1.15]">
              산발적인 세특 기록을 넘어,
              <br />
              <span className="bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-500 bg-clip-text text-transparent">
                나만의 탐구 흐름을 차분히 쌓아가세요
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
              학생부와 활동 기록을 정리하고, 이번 학기 계획을 실제 학교 기회와 연결해 보세요.
              기록이 아직 없다면 과거를 지어내지 않고, 현재 관심사부터 함께 시작합니다.
            </p>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <button
                className="w-full sm:w-auto px-8 py-4 text-base font-extrabold text-gray-950 bg-[#FEE500] hover:bg-[#FDD800] rounded-2xl transition flex items-center justify-center gap-2.5"
                onClick={onGoToLogin}
                type="button"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.708 4.8 4.27 6.054-.187.707-.677 2.56-.775 2.964-.122.506.186.499.392.363.162-.107 2.573-1.748 3.612-2.456.491.07 1.002.107 1.521.107 4.97 0 9-3.185 9-7.115S16.97 3 12 3z" />
                </svg>
                <span>무료로 시작하기</span>
              </button>
            </div>

            <div className="pt-6 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs md:text-sm text-gray-500 font-medium">
              {HERO_PRINCIPLES.map((stat, index) => (
                <div className="flex items-center gap-2" key={stat.label}>
                  {index > 0 && <span className="h-3 w-px bg-gray-300 hidden sm:block -ml-4 mr-2" />}
                  <span className="font-extrabold text-base md:text-lg text-gray-900">{stat.value}</span>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 워크스페이스 미리보기 — 실제 화면의 구성을 그대로 축소해 보여준다.
              안의 내용은 예시다(로그인 후 자기 기록으로 채워진다). */}
          <div className="mt-14 max-w-5xl mx-auto rounded-3xl bg-white border border-gray-200/90 shadow-2xl p-4 sm:p-6 md:p-8 relative overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4 mb-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-bold text-gray-400 font-mono">SETEUK PRO WORKSPACE · PREVIEW</span>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                ● 화면 예시
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
              <div className="lg:col-span-4 bg-gray-50/90 rounded-2xl p-5 border border-gray-200/80 space-y-4">
                <div className="flex items-center gap-3.5">
                  <span className="w-12 h-12 rounded-2xl bg-brand-600 text-white font-extrabold text-base flex items-center justify-center">
                    민준
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-gray-950 text-sm">김민준</h4>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-brand-700">
                        고2 2학기
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">예시 학생 화면</p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-gray-200/70 text-xs space-y-1.5">
                  <div className="text-[11px] font-bold text-gray-400">목표 전공 &amp; 진로</div>
                  <div className="font-bold text-gray-900">컴퓨터공학 / 시스템 아키텍트</div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                    <span className="text-gray-500">지망 모집단위</span>
                    <span className="font-bold text-brand-600">컴퓨터공학부 (학종)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-gray-400">핵심 학업 키워드 DNA</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["분산컴퓨팅", "CPU캐시", "RISC-V", "선형대수", "커널최적화"].map((tag) => (
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200"
                        key={tag}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-4">
                <div className="bg-gray-50/90 p-4 rounded-2xl border border-gray-200/80 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold text-brand-600 uppercase tracking-wide">
                      THIS SEMESTER GOAL
                    </span>
                    <h4 className="text-sm md:text-base font-extrabold text-gray-950 mt-0.5 leading-snug">
                      분산 컴퓨팅 환경에서의 메모리 병목 및 병렬 연산 최적화 심화 실증
                    </h4>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-gray-500 flex items-center justify-between gap-2 flex-wrap">
                    <span>★ 이번 학기 AI 추천 1순위 탐구 주제 (수행평가·세특 연동)</span>
                    <span className="text-[11px] text-brand-600 font-semibold">교과 직결</span>
                  </div>

                  {[
                    {
                      sub: "물리학Ⅰ",
                      title: "반도체 밴드갭 이론을 활용한 FinFET 구조의 누설 전류 억제 메커니즘",
                      area: "하드웨어·반도체",
                    },
                    {
                      sub: "수학Ⅱ",
                      title: "경사하강법의 학습률에 따른 발산·수렴 거동 수학적 증명",
                      area: "알고리즘 수리",
                    },
                    {
                      sub: "정보과제연구",
                      title: "비동기 이벤트 루프와 논블로킹 I/O 다중화의 동시성 처리 성능 비교",
                      area: "시스템 실증",
                    },
                  ].map((item) => (
                    <div
                      className="p-3.5 rounded-xl bg-gray-50 border border-gray-200/80 flex items-center justify-between gap-3"
                      key={item.title}
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white text-gray-800 border border-gray-200 mr-2 whitespace-nowrap">
                          {item.sub}
                        </span>
                        <span className="text-xs font-bold text-gray-900">{item.title}</span>
                      </div>
                      <span className="text-[11px] font-bold text-brand-600 flex-none bg-white px-2 py-0.5 rounded border border-brand-100 whitespace-nowrap">
                        {item.area}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-gray-500 text-center sm:text-left inline-flex items-start gap-1.5">
                <Icon className="mt-0.5 flex-none text-amber-500" name="lightbulb" size={14} />
                <span>진단과 상담을 마치면 우리 학교 시간표 과목에 맞춘 이번 학기 탐구 주제가 만들어집니다.</span>
              </span>
              <button
                className="w-full sm:w-auto px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
                onClick={onGoToLogin}
                type="button"
              >
                <span>무료로 시작하기</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 핵심 기능 */}
      <section className="py-20 bg-white border-y border-gray-200/70" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl md:text-4xl font-extrabold text-gray-950 tracking-tight leading-snug">
              합격하는 학생부는 무엇이 다를까요?
              <br />
              <span className="text-brand-600">세특연구소의 3대 핵심 엔진</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURE_ENGINES.map((engine) => (
              <div
                className="p-7 rounded-3xl bg-surface-bg border border-gray-200/90 space-y-4 hover:border-brand-300 transition"
                key={engine.tag}
              >
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${engine.iconBg}`}>
                  <Icon name={engine.icon} size={22} />
                </div>
                <div className="space-y-1">
                  <span className={`text-xs font-bold ${engine.tagTone}`}>{engine.tag}</span>
                  <h3 className="text-xl font-extrabold text-gray-950 leading-snug">{engine.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{engine.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white border-t border-gray-200/70" id="faq">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <h2 className="text-2xl md:text-4xl font-extrabold text-gray-950 tracking-tight text-center">
            자주 묻는 질문
          </h2>

          <div className="space-y-3">
            {FAQS.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div className="rounded-2xl border border-gray-200/90 bg-surface-bg overflow-hidden" key={faq.q}>
                  <button
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    onClick={() => setOpenFaq(open ? null : index)}
                    type="button"
                  >
                    <span className="text-sm font-bold text-gray-900">{faq.q}</span>
                    <span className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {open && <p className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 마무리 CTA */}
      <section className="py-20 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-950 tracking-tight leading-snug">
            지금 쌓인 기록으로 이번 학기 계획을 시작하세요
          </h2>
          <p className="text-sm text-gray-600">
            가입 후 진단과 상담을 마치면 이번 학기 목표와 탐구 주제가 바로 만들어집니다.
          </p>
          <button
            className="px-8 py-4 text-base font-extrabold text-white bg-brand-600 hover:bg-brand-700 rounded-2xl transition"
            onClick={onGoToLogin}
            type="button"
          >
            무료로 시작하기 →
          </button>
        </div>
      </section>

      <footer className="py-10 bg-white border-t border-gray-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-gray-400">
          <span>세특연구소 — 개인 맞춤형 고교 생활기록부 코치</span>
          <span>학생의 개인정보와 학생부 데이터를 안전하게 보관합니다.</span>
        </div>
      </footer>
    </div>
  );
}
