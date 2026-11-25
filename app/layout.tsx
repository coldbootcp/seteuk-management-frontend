import type { Metadata } from "next";
import { AnalyticsInit } from "./analytics-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "세특연구소 — 개인 맞춤형 고교 생활기록부 코치",
  description:
    "지난 학기 활동과 이번 학기 수업에서 다음 탐구 주제를 찾아보세요. 세특연구소에서 AI와 상담하고, 탐구 계획과 활동 기록을 학기별로 이어가세요.",
  keywords: ["세특", "생활기록부", "수행평가", "고교", "입시", "탐구", "AI"],
  icons: {
    icon: "/logo.png?v=2",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Pretendard — globals.css가 --font-body의 첫 후보로 지정해 둔 폰트다. 여태
            내려받지 않아 시스템 폰트로 대체되고 있었다. */}
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AnalyticsInit />
        {children}
      </body>
    </html>
  );
}
