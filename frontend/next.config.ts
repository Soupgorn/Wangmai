import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  async redirects() {
    if (process.env.NODE_ENV !== "development") return [];
    const origin = `http://localhost:${process.env.PORT ?? "3000"}`;
    // The listener advertises 127.0.0.1; OAuth cookies and trusted origins use localhost.
    // Keep APIs on their existing proxy path and use an absolute page redirect.
    return ["/", "/login", "/schedule", "/settings", "/availability", "/preview/:path*"].map((source) => ({
      source, has: [{ type: "host" as const, value: "127\\.0\\.0\\.1" }],
      destination: `${origin}${source}`, permanent: false,
    }));
  },
  async rewrites() {
    // Production /api traffic goes directly from Caddy to Hono.
    if (process.env.NODE_ENV !== "development") return [];
    const origin = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
  },
};

export default nextConfig;
