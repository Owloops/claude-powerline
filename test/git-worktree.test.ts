import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../src/segments/git";

jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

const WORKTREE_DIRS = "/repo/.git/worktrees/feature\n/repo/.git\n";
const NORMAL_DIRS = "/repo/.git\n/repo/.git\n";
const SUBMODULE_DIRS = "/repo/.git/modules/vendor\n/repo/.git/modules/vendor\n";

function createMockExec(
  branch: string,
  revParseDirs: string,
  topLevel = "",
): (cmd: string, _options: any, callback: any) => string {
  return (cmd: string, _options: any, callback: any) => {
    let result = "";
    if (cmd.includes("git status --porcelain -b")) result = `## ${branch}\n`;
    else if (cmd.includes("git rev-parse --show-toplevel"))
      result = `${topLevel}\n`;
    else if (cmd.includes("git rev-parse --git-dir")) result = revParseDirs;
    else if (cmd.includes("git rev-list --count")) result = "0\n";
    else if (cmd.includes("git config --get remote.origin.url"))
      result = "git@github.com:user/repo.git\n";
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
    mockExec.mockImplementation(createMockExec("main", NORMAL_DIRS));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  describe("worktree detection", () => {
    it("should set isWorktree to true when the git dir differs from the common dir", async () => {
      writeFileSync(
        join(tempDir, ".git"),
        "gitdir: /repo/.git/worktrees/feature",
      );
      mockExec.mockImplementation(createMockExec("main", WORKTREE_DIRS));

      const info = await gitService.getGitInfo(tempDir, { showWorktree: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(true);
    });

    it("should set isWorktree to false in a normal repo", async () => {
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mockExec.mockImplementation(createMockExec("main", NORMAL_DIRS));

      const info = await gitService.getGitInfo(tempDir, { showWorktree: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(false);
    });

    it("should set isWorktree to false in a submodule, whose .git is also a file", async () => {
      writeFileSync(join(tempDir, ".git"), "gitdir: /repo/.git/modules/vendor");
      mockExec.mockImplementation(createMockExec("main", SUBMODULE_DIRS));

      const info = await gitService.getGitInfo(tempDir, { showWorktree: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(false);
    });

    it("should detect a worktree from a subdirectory, which has no .git of its own", async () => {
      const subDir = join(tempDir, "src", "nested");
      mkdirSync(subDir, { recursive: true });
      mockExec.mockImplementation(
        createMockExec("main", WORKTREE_DIRS, tempDir),
      );

      const info = await gitService.getGitInfo(subDir, { showWorktree: true });

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(true);
    });

    it("should leave isWorktree undefined and skip the git call when not requested", async () => {
      writeFileSync(
        join(tempDir, ".git"),
        "gitdir: /repo/.git/worktrees/feature",
      );
      mockExec.mockImplementation(createMockExec("main", WORKTREE_DIRS));

      const info = await gitService.getGitInfo(tempDir, {});

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBeUndefined();
      expect(
        mockExec.mock.calls.filter(([cmd]) =>
          String(cmd).includes("--git-common-dir"),
        ),
      ).toHaveLength(0);
    });
  });

  describe("gitDir resolution", () => {
    it("should run git in the worktree, not in the project dir", async () => {
      projectDir = mkdtempSync(join(tmpdir(), "powerline-project-test-"));
      mkdirSync(join(projectDir, ".git"), { recursive: true });

      writeFileSync(
        join(tempDir, ".git"),
        "gitdir: /repo/.git/worktrees/feature",
      );
      mockExec.mockImplementation(
        createMockExec("feature-branch", WORKTREE_DIRS),
      );

      const info = await gitService.getGitInfo(
        tempDir,
        { showWorktree: true },
        projectDir,
      );

      expect(info).not.toBeNull();
      expect(info!.isWorktree).toBe(true);
      expect(info!.branch).toBe("feature-branch");
      for (const [, options] of mockExec.mock.calls) {
        expect(options.cwd).toBe(tempDir);
      }
    });
  });
});
