import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The school-record uploader sends a multipart PDF to an App Router route.
  // Vinext applies the server-action body limit to multipart POSTs before the
  // route handler runs. Leave a little room for multipart headers so a PDF
  // that is exactly 50MB still reaches the app-level file-size check.
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
