import type { NextConfig } from "next";

const apiUrl = process.env.WEBDNA_API_URL ?? "http://127.0.0.1:4100";

const nextConfig: NextConfig = {
  transpilePackages: ["@webdna/shared"],
  // Lets the E2E suite run its own dev server next to a developer's `npm run dev`.
  distDir: process.env.WEBDNA_NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  devIndicators: false,
  // Allow the dev UI to hydrate when opened via 127.0.0.1 as well as localhost (dev only).
  allowedDevOrigins: ["127.0.0.1"],
  // The browser talks only to the web app; /api is proxied to the WebDNA server.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
