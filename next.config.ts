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
  env: {
    NEXT_PUBLIC_COMMIT_DATE: getGitCommitDate(),
  },
};

export default nextConfig;
