import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fonts read from disk by the branded link-preview image (lib/og/intakeImage.tsx).
  outputFileTracingIncludes: {
    '/api/public/og/intake': ['./lib/og/fonts/**/*'],
  },
};

export default nextConfig;
