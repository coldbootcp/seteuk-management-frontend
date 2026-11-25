"use client";

import Image from "next/image";
import Link from "next/link";
import { FAQS, WORKSPACE_TOOLS } from "./landing-content";
import { InquiryPreview } from "./inquiry-preview";
import { Icon } from "./icons";

const container = "mx-auto w-full max-w-[1208px] px-5 sm:px-8 lg:px-10";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600";
const sectionTitle = "text-[1.85rem] leading-[1.24] font-extrabold tracking-[-0.045em] sm:text-[2.45rem]";
const navLinks = [
  { href: "#preview", label: "탐구 예시" },
  { href: "#features", label: "주요 기능" },
  { href: "#faq", label: "자주 묻는 질문" },
];

function Brand() {
  return (
    <a className={`inline-flex items-center gap-2 rounded-lg ${focusRing}`} href="#top" aria-label="세특연구소 첫 화면">
      <Image src="/logo.png?v=2" alt="" width={34} height={34} className="size-8 object-contain" unoptimized />
      <span className="text-[1.22rem] font-extrabold tracking-[-0.055em]">세특연구소</span>
    </a>
  );
}

function LoginButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-brand-600 px-5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-700 ${focusRing}`}
      onClick={onClick}
      type="button"
    >
      로그인하고 시작하기 <Icon name="chevron-right" size={16} />
    </button>
  );
}

export function LandingView({ onGoToLogin }: { onGoToLogin: () => void }) {
  return (
    <div id="top" className="min-h-screen bg-white text-gray-950 break-keep">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/95 backdrop-blur-md">
        <div className={`${container} flex h-16 items-center justify-between gap-4 md:h-[72px]`}>
          <Brand />
          <div className="flex items-center gap-9">
            <nav className="hidden items-center gap-7 text-sm font-semibold text-gray-600 md:flex" aria-label="서비스 소개">
              {navLinks.map(({ href, label }) => (
                <a key={href} className={`inline-flex min-h-11 items-center rounded-md hover:text-brand-700 ${focusRing}`} href={href}>{label}</a>
              ))}
            </nav>
            <button type="button" onClick={onGoToLogin} className={`inline-flex min-h-11 items-center gap-1 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-800 hover:bg-gray-50 ${focusRing}`}>
              로그인 <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section aria-labelledby="landing-title" className={`${container} grid items-center gap-8 pt-9 pb-12 sm:py-14 md:grid-cols-[0.98fr_1.02fr] md:gap-8 lg:gap-12 lg:pt-[72px] lg:pb-20`}>
          <div>
            <p className="flex items-center gap-2.5 text-sm font-bold text-brand-700">
              <span aria-hidden="true" className="h-0.5 w-6 bg-brand-600" />
              고등학생을 위한 생기부 탐구 코치
            </p>
            <h1 id="landing-title" className="mt-4 text-[clamp(2.6rem,4.45vw,4.15rem)] leading-[1.16] font-extrabold tracking-[-0.062em] sm:mt-5">
              지난 탐구가<br />
              <span className="text-brand-600">다음 질문이 되는 곳</span>
            </h1>
            <p className="mt-5 max-w-[29rem] text-base leading-[1.8] text-gray-600 lg:text-lg">
              지난 학기 활동과 이번 학기에 듣는 과목을 AI와 함께 살펴보세요. 해 보고 싶은 주제를 고르고, 직접 해낸 과정과 배운 점을 내 기록에 남겨요.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 sm:mt-8">
              <LoginButton onClick={onGoToLogin} />
              <a href="#preview" className={`inline-flex min-h-12 items-center gap-1.5 rounded-lg px-1 text-[15px] font-bold text-gray-800 hover:text-brand-700 ${focusRing}`}>
                탐구 예시 보기 <Icon name="chevron-right" className="rotate-90" size={15} />
              </a>
            </div>
          </div>
          <figure className="m-0 min-w-0">
            <div className="relative aspect-[1.55] overflow-hidden rounded-2xl md:aspect-[1.23] lg:aspect-[1.42]">
              <Image
                alt="운동장 나무 사진과 시간에 따른 온도 그래프를 함께 펼쳐 둔 탐구 노트"
                className="object-cover"
                src="/inquiry-notebook.webp"
                fill
                sizes="(min-width: 1208px) 550px, (min-width: 768px) 46vw, 100vw"
                preload
              />
            </div>
            <figcaption className="mt-3 flex items-baseline gap-2 text-xs leading-relaxed text-gray-600">
              <span className="shrink-0 font-bold text-brand-700">탐구 노트 예시</span>
              <span className="border-l border-gray-200 pl-2">운동장 햇볕과 나무 그늘의 온도 비교</span>
            </figcaption>
          </figure>
        </section>

        <InquiryPreview />

        <section id="features" aria-labelledby="feature-title" className={`${container} scroll-mt-20 py-14 sm:py-20 lg:py-24`}>
          <h2 id="feature-title" className={sectionTitle}>한 학기씩 쌓아서, 수시 준비까지</h2>
          <div className="mt-7 grid gap-7 md:mt-9 md:grid-cols-[0.94fr_1.06fr] md:gap-9 lg:gap-16">
            <div className="rounded-2xl bg-brand-50 p-6 sm:p-8">
              <h3 className="text-[1.4rem] font-extrabold tracking-tight">고교 3개년 흐름</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-700">이미 해 본 활동과 앞으로 해 보고 싶은 일을 학기 순서로 펼쳐 보세요.</p>
              <ol className="m-0 mt-6 list-none p-0">
                {[
                  ["지난 학기", "실제로 마친 활동과 배운 점"],
                  ["이번 학기", "수업에서 실행할 목표와 탐구 주제"],
                  ["다음 학기", "관심을 넓히거나 더 깊게 살펴볼 방향"],
                ].map(([term, detail], index) => (
                  <li key={term} className="relative flex gap-4 pb-5 last:pb-0">
                    {index < 2 && <span aria-hidden="true" className="absolute top-4 bottom-0 left-[7px] w-px bg-brand-200" />}
                    <span aria-hidden="true" className={`relative mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-full ${index === 1 ? "bg-brand-600" : "border border-brand-300 bg-white"}`}>
                      {index === 1 && <span className="size-[5px] rounded-full bg-white" />}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-brand-700">{term}</p>
                      <p className="mt-1 text-[15px] font-semibold text-gray-900">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col justify-center">
              {WORKSPACE_TOOLS.map((tool) => (
                <article key={tool.title} className="flex gap-4 border-b border-gray-200 py-5 first:pt-0 last:border-0 last:pb-0">
                  <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-brand-700">
                    <Icon name={tool.icon} size={21} />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">{tool.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-[1.7] text-gray-600">{tool.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-gray-200 bg-surface-bg">
          <div className={`${container} grid items-start gap-6 py-12 md:grid-cols-[0.72fr_1.28fr] md:gap-12 md:py-16`}>
            <h2 id="faq-title" className={sectionTitle}>자주 묻는 질문</h2>
            <div>
              {FAQS.map(({ q, a }) => (
                <details key={q} name="landing-faq" className="group border-b border-gray-200 first:border-t">
                  <summary className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-sm py-4 text-[15px] font-bold leading-relaxed sm:text-base [&::-webkit-details-marker]:hidden ${focusRing}`}>
                    {q}
                    <Icon name="chevron-right" size={16} className="shrink-0 rotate-90 text-brand-700 group-open:-rotate-90" />
                  </summary>
                  <p className="pb-5 pr-6 text-[15px] leading-[1.8] text-gray-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="세특연구소 시작하기" className="bg-brand-50">
          <div className={`${container} flex flex-col items-start justify-between gap-5 py-10 sm:flex-row sm:items-center md:py-12`}>
            <div>
              <h2 className="text-[1.5rem] font-extrabold tracking-tight sm:text-[1.85rem]">지금 궁금한 것부터 시작해요.</h2>
              <p className="mt-2 text-[15px] text-gray-600">생기부가 아직 없어도, 관심 있는 과목으로 상담을 시작할 수 있어요.</p>
            </div>
            <div className="shrink-0"><LoginButton onClick={onGoToLogin} /></div>
          </div>
        </section>
      </main>

      <footer className={`${container} flex flex-wrap items-center justify-between gap-4 py-5`}>
        <Brand />
        <nav className="flex flex-wrap gap-x-4 text-xs font-semibold text-gray-600" aria-label="이용 안내">
          <Link className={`inline-flex min-h-11 items-center rounded-sm hover:underline ${focusRing}`} href="/privacy">개인정보처리방침</Link>
          <Link className={`inline-flex min-h-11 items-center rounded-sm hover:underline ${focusRing}`} href="/terms">이용약관</Link>
        </nav>
      </footer>
    </div>
  );
}
