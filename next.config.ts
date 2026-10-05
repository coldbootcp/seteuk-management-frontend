import type { NextConfig } from "next";

// 파일 업로드는 백엔드(FastAPI)로 직접 보내므로, 프론트엔드에는 큰 본문을 받는
// 라우트가 없다. Cloudflare Workers·vinext를 걷어내면서 그 시절의 body limit
// 설정도 함께 제거했다.
const nextConfig: NextConfig = {
  // 개발 모드(next dev)는 HMR이 eval()·인라인 스크립트를 쓰므로 이 헤더를 걸지
  // 않는다 — 운영 빌드에서만 켠다.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];

    const apiOrigin = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();
    // Vercel Preview 배포(dev)는 자체 피드백 툴바(vercel.live)를 주입한다.
    // Production 빌드에는 그 스크립트가 없으니 이 허용은 조용히 쓰이지 않는다.
    const connectSrc = [
      "'self'",
      "https://accounts.google.com",
      "https://vercel.live",
      "wss://ws-us3.pusher.com",
      // Amplitude(lib/analytics.ts): 이벤트 전송, 세션 리플레이 전송과 그 설정 조회.
      "https://api2.amplitude.com",
      "https://api.eu.amplitude.com",
      "https://api-sr.amplitude.com",
      "https://api-sr.eu.amplitude.com",
      "https://sr-client-cfg.amplitude.com",
      "https://sr-client-cfg.eu.amplitude.com",
      apiOrigin,
    ]
      .filter(Boolean)
      .join(" ");

    const csp = [
      "default-src 'self'",
      // Next.js가 hydration 데이터를 인라인 <script>로 심으므로 'unsafe-inline'이
      // 필요하다 — 이 프로젝트는 React만 쓰고 dangerouslySetInnerHTML이 없어
      // 사용자 입력이 그 자리에 꽂힐 경로 자체가 없다(React 이스케이프 처리).
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
      `connect-src ${connectSrc}`,
      "frame-src https://accounts.google.com https://vercel.live",
      // 세션 리플레이가 녹화 데이터를 압축하는 Web Worker를 blob URL로 띄운다.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
