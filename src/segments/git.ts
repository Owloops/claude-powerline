import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { debug } from "../utils/logger";

export interface GitInfo {
  branch: string;
  status: "clean" | "dirty" | "conflicts";
  ahead: number;
  behind: number;
  sha?: string;
  staged?: number;
  unstaged?: number;
  untracked?: number;
  conflicts?: number;
  operation?: string;
  tag?: string;
  timeSinceCommit?: number;
  stashCount?: number;
  upstream?: string;
  repoName?: string;
  isWorktree?: boolean;
}

export class GitService {
  private cache: Map<string, { data: GitInfo | null; timestamp: number }> =
    new Map();
  private readonly CACHE_TTL = 1000;

  private isGitRepo(workingDir: string): boolean {
    try {
      return fs.existsSync(path.join(workingDir, ".git"));
    } catch {
      return false;
    }
  }

  getGitInfo(
    workingDir: string,
    options: {
      showSha?: boolean;
      showWorkingTree?: boolean;
      showOperation?: boolean;
      showTag?: boolean;
      showTimeSinceCommit?: boolean;
      showStashCount?: boolean;
      showUpstream?: boolean;
      showRepoName?: boolean;
    } = {},
    projectDir?: string
  ): GitInfo | null {
    const gitDir =
      projectDir && this.isGitRepo(projectDir) ? projectDir : workingDir;

    const optionsKey = JSON.stringify(options);
    const cacheKey = `${gitDir}:${optionsKey}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    if (!this.isGitRepo(gitDir)) {
      this.cache.set(cacheKey, { data: null, timestamp: now });
      return null;
    }

    try {
      const branch = this.getBranch(gitDir);
      const status = this.getStatus(gitDir);
      const { ahead, behind } = this.getAheadBehind(gitDir);

      const result: GitInfo = {
        branch: branch || "detached",
        status,
        ahead,
        behind,
      };

      if (options.showSha) {
        result.sha = this.getSha(gitDir) || undefined;
      }

      if (options.showWorkingTree) {
        const counts = this.getWorkingTreeCounts(gitDir);
        result.staged = counts.staged;
        result.unstaged = counts.unstaged;
        result.untracked = counts.untracked;
        result.conflicts = counts.conflicts;
      }

      if (options.showOperation) {
        result.operation = this.getOngoingOperation(gitDir) || undefined;
      }

      if (options.showTag) {
        result.tag = this.getNearestTag(gitDir) || undefined;
      }

      if (options.showTimeSinceCommit) {
        result.timeSinceCommit =
          this.getTimeSinceLastCommit(gitDir) || undefined;
      }

      if (options.showStashCount) {
        result.stashCount = this.getStashCount(gitDir);
      }

      if (options.showUpstream) {
        result.upstream = this.getUpstream(gitDir) || undefined;
      }

      if (options.showRepoName) {
        result.repoName = this.getRepoName(gitDir) || undefined;
        result.isWorktree = this.isWorktree(gitDir);
      }

      this.cache.set(cacheKey, { data: result, timestamp: now });
      return result;
    } catch {
      this.cache.set(cacheKey, { data: null, timestamp: now });
      return null;
    }
  }

  private getBranch(workingDir: string): string | null {
    try {
      return (
        execSync("git branch --show-current", {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 5000,
        }).trim() || null
      );
    } catch (error) {
      debug(`Git branch command failed in ${workingDir}:`, error);
      return null;
    }
  }

  private getStatus(workingDir: string): "clean" | "dirty" | "conflicts" {
    try {
      const gitStatus = execSync("git status --porcelain", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
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
    } catch (error) {
      debug(`Git status command failed in ${workingDir}:`, error);
      return "clean";
    }
  }

  private getWorkingTreeCounts(workingDir: string): {
    staged: number;
    unstaged: number;
    untracked: number;
    conflicts: number;
  } {
    try {
      const gitStatus = execSync("git status --porcelain=v1", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      });

      let staged = 0;
      let unstaged = 0;
      let untracked = 0;
      let conflicts = 0;

      if (!gitStatus.trim()) {
        return { staged, unstaged, untracked, conflicts };
      }

      const lines = gitStatus.split("\n");
      for (const line of lines) {
        if (!line || line.length < 2) continue;
        const indexStatus = line.charAt(0);
        const worktreeStatus = line.charAt(1);

        if (indexStatus === "?" && worktreeStatus === "?") {
          untracked++;
          continue;
        }

        const statusPair = indexStatus + worktreeStatus;
        if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(statusPair)) {
          conflicts++;
          continue;
        }

        if (indexStatus !== " " && indexStatus !== "?") {
          staged++;
        }
        if (worktreeStatus !== " " && worktreeStatus !== "?") {
          unstaged++;
        }
      }

      return { staged, unstaged, untracked, conflicts };
    } catch (error) {
      debug(`Git working tree counts failed in ${workingDir}:`, error);
      return { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
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
        timeout: 5000,
      }).trim();

      const behindResult = execSync("git rev-list --count HEAD..@{u}", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      return {
        ahead: parseInt(aheadResult) || 0,
        behind: parseInt(behindResult) || 0,
      };
    } catch (error) {
      debug(`Git ahead/behind command failed in ${workingDir}:`, error);
      return { ahead: 0, behind: 0 };
    }
  }

  private getSha(workingDir: string): string | null {
    try {
      const sha = execSync("git rev-parse --short=7 HEAD", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      return sha || null;
    } catch {
      return null;
    }
  }

  private getOngoingOperation(workingDir: string): string | null {
    try {
      const gitDir = path.join(workingDir, ".git");

      if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) return "MERGE";
      if (fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD")))
        return "CHERRY-PICK";
      if (fs.existsSync(path.join(gitDir, "REVERT_HEAD"))) return "REVERT";
      if (fs.existsSync(path.join(gitDir, "BISECT_LOG"))) return "BISECT";
      if (
        fs.existsSync(path.join(gitDir, "rebase-merge")) ||
        fs.existsSync(path.join(gitDir, "rebase-apply"))
      )
        return "REBASE";

      return null;
    } catch {
      return null;
    }
  }

  private getNearestTag(workingDir: string): string | null {
    try {
      const tag = execSync("git describe --tags --abbrev=0", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      return tag || null;
    } catch {
      return null;
    }
  }

  private getTimeSinceLastCommit(workingDir: string): number | null {
    try {
      const timestamp = execSync("git log -1 --format=%ct", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      if (!timestamp) return null;

      const commitTime = parseInt(timestamp) * 1000;
      const now = Date.now();
      return Math.floor((now - commitTime) / 1000);
    } catch {
      return null;
    }
  }

  private getStashCount(workingDir: string): number {
    try {
      const stashList = execSync("git stash list", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      if (!stashList) return 0;
      return stashList.split("\n").length;
    } catch {
      return 0;
    }
  }

  private getUpstream(workingDir: string): string | null {
    try {
      const upstream = execSync("git rev-parse --abbrev-ref @{u}", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      return upstream || null;
    } catch {
      return null;
    }
  }

  private getRepoName(workingDir: string): string | null {
    try {
      const remoteUrl = execSync("git config --get remote.origin.url", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      if (!remoteUrl) return path.basename(workingDir);

      const match = remoteUrl.match(/\/([^/]+?)(\.git)?$/);
      return match?.[1] || path.basename(workingDir);
    } catch {
      return path.basename(workingDir);
    }
  }

  private isWorktree(workingDir: string): boolean {
    try {
      const gitDir = path.join(workingDir, ".git");
      if (fs.existsSync(gitDir) && fs.statSync(gitDir).isFile()) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
