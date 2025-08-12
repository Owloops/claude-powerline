import { execSync } from "node:child_process";
import { platform } from "node:os";

export interface GitInfo {
  branch: string;
  status: "clean" | "dirty" | "conflicts";
  ahead: number;
  behind: number;
  sha?: string;
}

export class GitService {
  private sanitizePath(path: string): string {
    return path.replace(/[;&|`$(){}[\]<>'"\\]/g, "");
  }

  private getErrorRedirection(): string {
    return platform() === "win32" ? "2>nul" : "2>/dev/null";
  }

  getGitInfo(workingDir: string, showSha = false): GitInfo | null {
    try {
      const sanitizedDir = this.sanitizePath(workingDir);

      const branch = this.getBranch(sanitizedDir);
      const status = this.getStatus(sanitizedDir);
      const { ahead, behind } = this.getAheadBehind(sanitizedDir);
      const sha = showSha ? this.getSha(sanitizedDir) || undefined : undefined;

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
      // Use rev-parse which is more reliable than branch --show-current
      const errorRedirect = this.getErrorRedirection();
      const result = execSync(`git rev-parse --abbrev-ref HEAD ${errorRedirect}`, {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return result || null;
    } catch (e) {
      return null;
    }
  }

  private getStatus(workingDir: string): "clean" | "dirty" | "conflicts" {
    try {
      const errorRedirect = this.getErrorRedirection();
      const gitStatus = execSync(`git status --porcelain ${errorRedirect}`, {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
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
      const errorRedirect = this.getErrorRedirection();
      const aheadResult = execSync(
        `git rev-list --count @{u}..HEAD ${errorRedirect}`,
        {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 1000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();

      const behindResult = execSync(
        `git rev-list --count HEAD..@{u} ${errorRedirect}`,
        {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 1000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim();

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
      const errorRedirect = this.getErrorRedirection();
      const sha = execSync(`git rev-parse --short=7 HEAD ${errorRedirect}`, {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return sha || null;
    } catch {
      return null;
    }
  }
}
