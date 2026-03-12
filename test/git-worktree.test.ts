import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../src/segments/git";

jest.mock("node:child_process", () => ({
  exec: jest.fn().mockImplementation((cmd: string, _options: any, callback: any) => {
    let result = "";
    if (cmd.includes("git status --porcelain -b")) result = "## main\n";
    else if (cmd.includes("git rev-list --count")) result = "0\n";
    else if (cmd.includes("git branch --show-current")) result = "main\n";

    if (typeof callback === "function") {
      callback(null, { stdout: result, stderr: "" });
    }
    return result;
  }),
}));

function createMockExec(branch: string): (cmd: string, _options: any, callback: any) => string {
  return (cmd: string, _options: any, callback: any) => {
    let result = "";
    if (cmd.includes("git status --porcelain -b")) result = `## ${branch}\n`;
    else if (cmd.includes("git rev-list --count")) result = "0\n";
    else if (cmd.includes("git config --get remote.origin.url")) result = "git@github.com:user/repo.git\n";
    else if (cmd.includes("git branch --show-current")) result = `${branch}\n`;

    if (typeof callback === "function") {
      callback(null, { stdout: result, stderr: "" });
    }
    return result;
  };
}

describe("GitService isWorktree", () => {
  let tempDir: string;
  let projectDir: string | undefined;
  let gitService: GitService;
  let mockExec: jest.Mock;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-worktree-test-"));
    projectDir = undefined;
    gitService = new GitService();

    mockExec = jest.requireMock("node:child_process").exec;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  describe("worktree detection", () => {
    it("should set isWorktree to true when .git is a file (worktree)", async () => {
      writeFileSync(join(tempDir, ".git"), "gitdir: /some/path/.git/worktrees/test");
      mockExec.mockImplementation(createMockExec("main"));

      const info = await gitService.getGitInfo(tempDir, { showRepoName: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(true);
    });

    it("should set isWorktree to false when .git is a directory (normal repo)", async () => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mockExec.mockImplementation(createMockExec("main"));

      const info = await gitService.getGitInfo(tempDir, { showRepoName: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(false);
    });
  });

  describe("gitDir resolution", () => {
    it("should detect isWorktree based on workingDir, not gitDir from projectDir", async () => {
      projectDir = mkdtempSync(join(tmpdir(), "powerline-project-test-"));
      mkdirSync(join(projectDir, ".git"), { recursive: true });

      writeFileSync(join(tempDir, ".git"), "gitdir: /some/path/.git/worktrees/test");
      mockExec.mockImplementation(createMockExec("feature-branch"));

      const info = await gitService.getGitInfo(tempDir, { showRepoName: true }, projectDir);

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(true);
    });
  });
});
