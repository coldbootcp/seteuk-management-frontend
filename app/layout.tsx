import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "세특연구소 — 개인 맞춤형 고교 생활기록부 코치",
  description:
    "AI 기반 세부능력 및 특기사항 분석 · 3개년 로드맵 · 수행평가 정합 시스템. 학생 개인의 강점과 목표에 맞춘 전략적 학교생활을 설계합니다.",
  keywords: ["세특", "생활기록부", "수행평가", "고교", "입시", "로드맵", "AI"],
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
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
