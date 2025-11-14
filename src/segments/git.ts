import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { debug } from "../utils/logger";

const execAsync = promisify(exec);

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
  private isGitRepo(workingDir: string): boolean {
    try {
      return fs.existsSync(path.join(workingDir, ".git"));
    } catch {
      return false;
    }
  }

  private async execGitAsync(
    command: string,
    options: { cwd: string; encoding: string; timeout: number }
  ): Promise<{ stdout: string }> {
    return execAsync(command, {
      ...options,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
  }

  private async findGitRoot(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git rev-parse --show-toplevel", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const gitRoot = result.stdout.trim();
      return gitRoot || null;
    } catch {
      return null;
    }
  }

  async getGitInfo(
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
  ): Promise<GitInfo | null> {
    let gitDir: string;

    if (projectDir && this.isGitRepo(projectDir)) {
      gitDir = projectDir;
    } else if (this.isGitRepo(workingDir)) {
      gitDir = workingDir;
    } else {
      const foundGitRoot = await this.findGitRoot(workingDir);
      if (!foundGitRoot) {
        return null;
      }
      gitDir = foundGitRoot;
    }

    try {
      const statusWithBranch = await this.getStatusWithBranchAsync(gitDir);
      const aheadBehind = await this.getAheadBehindAsync(gitDir);

      const result: GitInfo = {
        branch: statusWithBranch.branch || "detached",
        status: statusWithBranch.status,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
      };

      if (options.showWorkingTree && statusWithBranch.workingTree) {
        result.staged = statusWithBranch.workingTree.staged;
        result.unstaged = statusWithBranch.workingTree.unstaged;
        result.untracked = statusWithBranch.workingTree.untracked;
        result.conflicts = statusWithBranch.workingTree.conflicts;
      }

      const heavyOperations: Record<string, Promise<any>> = {};
      const lightOperations: Record<string, Promise<any>> = {};

      if (options.showSha) {
        heavyOperations.sha = this.getShaAsync(gitDir);
      }

      if (options.showTag) {
        heavyOperations.tag = this.getNearestTagAsync(gitDir);
      }

      if (options.showTimeSinceCommit) {
        heavyOperations.timeSinceCommit =
          this.getTimeSinceLastCommitAsync(gitDir);
      }

      if (options.showStashCount) {
        lightOperations.stashCount = this.getStashCountAsync(gitDir);
      }

      if (options.showUpstream) {
        lightOperations.upstream = this.getUpstreamAsync(gitDir);
      }

      if (options.showRepoName) {
        lightOperations.repoName = this.getRepoNameAsync(gitDir);
      }

      const resultMap = new Map<string, any>();

      for (const [key, promise] of Object.entries(heavyOperations)) {
        try {
          const value = await promise;
          resultMap.set(key, value);
        } catch {}
      }

      if (Object.keys(lightOperations).length > 0) {
        const lightResults = await Promise.allSettled(
          Object.entries(lightOperations).map(async ([key, promise]) => ({
            key,
            value: await promise,
          }))
        );

        lightResults.forEach((result) => {
          if (result.status === "fulfilled") {
            resultMap.set(result.value.key, result.value.value);
          }
        });
      }

      if (options.showSha) {
        result.sha = resultMap.get("sha") || undefined;
      }

      if (options.showOperation) {
        result.operation = this.getOngoingOperation(gitDir) || undefined;
      }

      if (options.showTag) {
        result.tag = resultMap.get("tag") || undefined;
      }

      if (options.showTimeSinceCommit) {
        result.timeSinceCommit = resultMap.get("timeSinceCommit") || undefined;
      }

      if (options.showStashCount) {
        result.stashCount = resultMap.get("stashCount") || 0;
      }

      if (options.showUpstream) {
        result.upstream = resultMap.get("upstream") || undefined;
      }

      if (options.showRepoName) {
        result.repoName = resultMap.get("repoName") || undefined;
        result.isWorktree = this.isWorktree(gitDir);
      }

      return result;
    } catch {
      return null;
    }
  }

  private async getShaAsync(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git rev-parse --short=7 HEAD", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const sha = result.stdout.trim();

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

  private async getNearestTagAsync(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git describe --tags --abbrev=0", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const tag = result.stdout.trim();

      return tag || null;
    } catch {
      return null;
    }
  }

  private async getTimeSinceLastCommitAsync(
    workingDir: string
  ): Promise<number | null> {
    try {
      const result = await this.execGitAsync("git log -1 --format=%ct", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const timestamp = result.stdout.trim();

      if (!timestamp) return null;

      const commitTime = parseInt(timestamp) * 1000;
      const now = Date.now();
      return Math.floor((now - commitTime) / 1000);
    } catch {
      return null;
    }
  }

  private async getStashCountAsync(workingDir: string): Promise<number> {
    try {
      const result = await this.execGitAsync("git stash list", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const stashList = result.stdout.trim();

      if (!stashList) return 0;
      return stashList.split("\n").length;
    } catch {
      return 0;
    }
  }

  private async getUpstreamAsync(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git rev-parse --abbrev-ref @{u}", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const upstream = result.stdout.trim();

      return upstream || null;
    } catch {
      return null;
    }
  }

  private async getRepoNameAsync(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git config --get remote.origin.url", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const remoteUrl = result.stdout.trim();

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

  private async getStatusWithBranchAsync(workingDir: string): Promise<{
    branch: string | null;
    status: "clean" | "dirty" | "conflicts";
    workingTree?: {
      staged: number;
      unstaged: number;
      untracked: number;
      conflicts: number;
    };
  }> {
    try {
      debug(`[GIT-EXEC] Running git status in ${workingDir}`);
      const result = await this.execGitAsync("git status --porcelain -b", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const output = result.stdout;
      const lines = output.split("\n");

      let branch: string | null = null;
      let status: "clean" | "dirty" | "conflicts" = "clean";
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;
      let conflicts = 0;

      for (const line of lines) {
        if (!line) continue;

        if (line.startsWith("## ")) {
          const branchLine = line.substring(3);
          const branchMatch = branchLine.split("...")[0];
          if (branchMatch && branchMatch !== "HEAD (no branch)") {
            branch = branchMatch;
          }
          continue;
        }

        if (line.length >= 2) {
          const indexStatus = line.charAt(0);
          const worktreeStatus = line.charAt(1);

          if (indexStatus === "?" && worktreeStatus === "?") {
            untracked++;
            if (status === "clean") status = "dirty";
            continue;
          }

          const statusPair = indexStatus + worktreeStatus;
          if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(statusPair)) {
            conflicts++;
            status = "conflicts";
            continue;
          }

          if (indexStatus !== " " && indexStatus !== "?") {
            staged++;
            if (status === "clean") status = "dirty";
          }
          if (worktreeStatus !== " " && worktreeStatus !== "?") {
            unstaged++;
            if (status === "clean") status = "dirty";
          }
        }
      }

      return {
        branch: branch || (await this.getFallbackBranch(workingDir)),
        status,
        workingTree: { staged, unstaged, untracked, conflicts },
      };
    } catch (error) {
      debug(`Git status with branch command failed in ${workingDir}:`, error);
      return {
        branch: await this.getFallbackBranch(workingDir),
        status: "clean",
      };
    }
  }

  private async getFallbackBranch(workingDir: string): Promise<string | null> {
    try {
      const result = await this.execGitAsync("git branch --show-current", {
        cwd: workingDir,
        encoding: "utf8",
        timeout: 2000,
      });
      const branch = result.stdout.trim();
      if (branch) {
        return branch;
      }
    } catch {
      try {
        const result = await this.execGitAsync("git symbolic-ref --short HEAD", {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 2000,
        });
        const branch = result.stdout.trim();
        if (branch) {
          return branch;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  private async getAheadBehindAsync(workingDir: string): Promise<{
    ahead: number;
    behind: number;
  }> {
    try {
      debug(`[GIT-EXEC] Running git ahead/behind in ${workingDir}`);
      const [aheadResult, behindResult] = await Promise.all([
        this.execGitAsync("git rev-list --count @{u}..HEAD", {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 2000,
        }),
        this.execGitAsync("git rev-list --count HEAD..@{u}", {
          cwd: workingDir,
          encoding: "utf8",
          timeout: 2000,
        }),
      ]);

      return {
        ahead: parseInt(aheadResult.stdout.trim()) || 0,
        behind: parseInt(behindResult.stdout.trim()) || 0,
      };
    } catch (error) {
      debug(`Git ahead/behind command failed in ${workingDir}:`, error);
      return { ahead: 0, behind: 0 };
    }
  }
}
