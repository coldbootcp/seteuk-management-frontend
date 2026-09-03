import type { NextConfig } from "next";

// 파일 업로드는 백엔드(FastAPI)로 직접 보내므로, 프론트엔드에는 큰 본문을 받는
// 라우트가 없다. Cloudflare Workers·vinext를 걷어내면서 그 시절의 body limit
// 설정도 함께 제거했다.
const nextConfig: NextConfig = {};

export default nextConfig;
