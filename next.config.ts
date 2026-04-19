import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitCommitDate(): string {
  try {
    return execSync("git log -1 --format=%ad --date=short", { stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Standalone output bundles a self-contained server for Electron packaging.
  output: "standalone",
  env: {
    NEXT_PUBLIC_COMMIT_DATE: getGitCommitDate(),
  },
  // Keep pdfkit external so its __dirname-based AFM font resolution works at runtime.
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
