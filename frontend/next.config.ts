import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
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
    // Rewrites are serialized into standalone output at BUILD time. Runtime env
    // changes cannot repair a release built with a localhost API target.
    const origin = process.env.NODE_ENV === "development"
      ? process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:4000"
      : "http://backend:4000";
    return [
      { source: "/api", destination: `${origin}/api` },
      { source: "/api/:path*", destination: `${origin}/api/:path*` },
    ];
  },
};

export default nextConfig;
