import { execSync } from "node:child_process";

export interface GitInfo {
  branch: string;
  status: "clean" | "dirty" | "conflicts";
  ahead: number;
  behind: number;
  sha?: string;
}

export class GitService {
  getGitInfo(workingDir: string, showSha = false): GitInfo | null {
    try {
      const branch = this.getBranch(workingDir);
      const status = this.getStatus(workingDir);
      const { ahead, behind } = this.getAheadBehind(workingDir);
      const sha = showSha ? this.getSha(workingDir) || undefined : undefined;

      return {
        branch: branch || "detached",
        status,
        ahead,
        behind,
        sha,
      };
    } catch {
      return null;
    }
  }

  private getBranch(workingDir: string): string | null {
    try {
      return (
        execSync("git branch --show-current", {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 1000,
        }).trim() || null
      );
    } catch {
      return null;
    }
  }

  private getStatus(workingDir: string): "clean" | "dirty" | "conflicts" {
    try {
      const gitStatus = execSync("git status --porcelain", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
      }).trim();

      if (!gitStatus) return "clean";

      if (
        gitStatus.includes("UU") ||
        gitStatus.includes("AA") ||
        gitStatus.includes("DD")
      ) {
        return "conflicts";
      }

      return "dirty";
    } catch {
      return "clean";
    }
  }

  private getAheadBehind(workingDir: string): {
    ahead: number;
    behind: number;
  } {
    try {
      const aheadResult = execSync("git rev-list --count @{u}..HEAD", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
      }).trim();

      const behindResult = execSync("git rev-list --count HEAD..@{u}", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
      }).trim();

      return {
        ahead: parseInt(aheadResult) || 0,
        behind: parseInt(behindResult) || 0,
      };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  private getSha(workingDir: string): string | null {
    try {
      const sha = execSync("git rev-parse --short=7 HEAD", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
      }).trim();

      return sha || null;
    } catch {
      return null;
    }
  }
}
