import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../src/segments/git";

jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

function mockStatus(statusOutput: string) {
  return (cmd: string, _options: any, callback: any) => {
    let result = "";
    if (cmd.includes("git status --porcelain -b")) result = statusOutput;
    else if (cmd.includes("git rev-list --count")) result = "0\n";
    callback(null, { stdout: result, stderr: "" });
  };
}

describe("GitService branch parsing", () => {
  let tempDir: string;
  let mockExec: jest.Mock;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-git-status-test-"));
    mkdirSync(join(tempDir, ".git"));
    mockExec = jest.requireMock("node:child_process").exec;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it.each([
    ["## No commits yet on main\n"],
    ["## No commits yet on main...origin/main [gone]\n"],
    // git before 2.17
    ["## Initial commit on main\n"],
  ])("reads the branch of a repo with no commits from %j", async (status) => {
    mockExec.mockImplementation(mockStatus(status));

    const info = await new GitService().getGitInfo(tempDir);

    expect(info?.branch).toBe("main");
  });

  it("reads the branch of a repo with commits", async () => {
    mockExec.mockImplementation(
      mockStatus("## feature/x...origin/feature/x [ahead 1]\n"),
    );

    const info = await new GitService().getGitInfo(tempDir);

    expect(info?.branch).toBe("feature/x");
  });
});
