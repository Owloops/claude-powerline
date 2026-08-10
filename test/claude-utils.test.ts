import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  findAgentTranscripts,
  collectProjectFiles,
  getOutputStyleName,
  type ClaudeHookData,
} from "../src/utils/claude";
import { CacheManager } from "../src/utils/cache";

describe("getOutputStyleName", () => {
  const base = {
    hook_event_name: "Status",
    session_id: "test",
    transcript_path: "/tmp/test.jsonl",
    cwd: "/test",
    model: { id: "claude-sonnet-4-6", display_name: "Sonnet" },
    workspace: { current_dir: "/test", project_dir: "/test" },
  } as ClaudeHookData;

  const withStyle = (name: unknown): ClaudeHookData =>
    ({ ...base, output_style: { name } }) as ClaudeHookData;

  it("returns the name when output_style.name is a non-empty string", () => {
    expect(getOutputStyleName(withStyle("Explanatory"))).toBe("Explanatory");
  });

  it("trims surrounding whitespace", () => {
    expect(getOutputStyleName(withStyle("  Explanatory  "))).toBe(
      "Explanatory",
    );
  });

  it("returns null for a whitespace-only name", () => {
    expect(getOutputStyleName(withStyle("   "))).toBeNull();
  });

  it("returns null for an empty name", () => {
    expect(getOutputStyleName(withStyle(""))).toBeNull();
  });

  it("returns null for a non-string name", () => {
    expect(getOutputStyleName(withStyle(42))).toBeNull();
    expect(getOutputStyleName(withStyle(null))).toBeNull();
    expect(getOutputStyleName(withStyle(undefined))).toBeNull();
  });

  it("returns null when output_style is absent", () => {
    expect(getOutputStyleName(base)).toBeNull();
  });

  it("preserves internal spaces and punctuation verbatim", () => {
    expect(getOutputStyleName(withStyle("My Custom Style (v2)"))).toBe(
      "My Custom Style (v2)",
    );
  });
});

describe("findAgentTranscripts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-agent-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSubagentsDir(sessionId: string): string {
    const subagentsDir = join(tempDir, sessionId, "subagents");
    mkdirSync(subagentsDir, { recursive: true });
    return subagentsDir;
  }

  function writeAgentFile(
    subagentsDir: string,
    name: string,
    sessionId: string,
  ): string {
    const filePath = join(subagentsDir, name);
    writeFileSync(filePath, JSON.stringify({ sessionId }) + "\n");
    return filePath;
  }

  it("finds agent transcripts in <session-uuid>/subagents/", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    const agentFile = writeAgentFile(
      subagentsDir,
      "agent-a1b2c3.jsonl",
      sessionId,
    );

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]!.replace(/\\/g, "/")).toBe(agentFile.replace(/\\/g, "/"));
  });

  it("returns [] when session has no subagents directory", async () => {
    const sessionId = "abc123";
    mkdirSync(join(tempDir, sessionId)); // session dir exists, but no subagents/ inside

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toEqual([]);
  });

  it("returns [] when session directory does not exist at all", async () => {
    const result = await findAgentTranscripts("no-such-session", tempDir);

    expect(result).toEqual([]);
  });

  it("returns multiple files when session has multiple agent transcripts", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-aaa.jsonl", sessionId);
    writeAgentFile(subagentsDir, "agent-bbb.jsonl", sessionId);

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(2);
  });

  it("skips files whose first-line sessionId does not match (defensive guard)", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-x1y2z3.jsonl", "other-session");

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toEqual([]);
  });

  it("skips non-agent- files and non-.jsonl files in the subagents dir", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-valid.jsonl", sessionId);
    writeFileSync(
      join(subagentsDir, "agent-ignored.txt"),
      JSON.stringify({ sessionId }) + "\n",
    );
    writeFileSync(
      join(subagentsDir, "other.jsonl"),
      JSON.stringify({ sessionId }) + "\n",
    );

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("agent-valid.jsonl");
  });

  it("finds workflow agent transcripts nested under subagents/workflows/", async () => {
    const sessionId = "abc123";
    const subagentsDir = makeSubagentsDir(sessionId);
    writeAgentFile(subagentsDir, "agent-top.jsonl", sessionId);

    const workflowDir = join(subagentsDir, "workflows", "wf_deadbeef");
    mkdirSync(workflowDir, { recursive: true });
    writeAgentFile(workflowDir, "agent-nested.jsonl", sessionId);

    const result = await findAgentTranscripts(sessionId, tempDir);

    expect(result).toHaveLength(2);
    expect(result.some((f) => f.includes("agent-nested.jsonl"))).toBe(true);
  });
});

describe("collectProjectFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "powerline-collect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("collects session transcripts alongside flat and nested agent transcripts", async () => {
    writeFileSync(join(tempDir, "session.jsonl"), "{}\n");

    const subagentsDir = join(tempDir, "session", "subagents");
    mkdirSync(join(subagentsDir, "workflows", "wf_1"), { recursive: true });
    writeFileSync(join(subagentsDir, "agent-flat.jsonl"), "{}\n");
    writeFileSync(
      join(subagentsDir, "workflows", "wf_1", "agent-nested.jsonl"),
      "{}\n",
    );

    const files = await collectProjectFiles(tempDir);
    const names = files.map((f) => f.filePath.split(/[\\/]/).pop());

    expect(names.sort()).toEqual([
      "agent-flat.jsonl",
      "agent-nested.jsonl",
      "session.jsonl",
    ]);
  });
});

describe("CacheManager.getLatestTranscriptMtime", () => {
  let claudeDir: string;
  let projectDir: string;

  beforeEach(() => {
    claudeDir = mkdtempSync(join(tmpdir(), "powerline-mtime-test-"));
    projectDir = join(claudeDir, "projects", "some-project");
    mkdirSync(projectDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = claudeDir;
  });

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    rmSync(claudeDir, { recursive: true, force: true });
  });

  const AGENT_MTIME = new Date("2026-07-21T12:00:00Z");

  function writeAgedFile(filePath: string, mtime: Date): void {
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "{}\n");
    utimesSync(filePath, mtime, mtime);
  }

  beforeEach(() => {
    // An older session transcript, so only an agent file can raise the mtime.
    writeAgedFile(
      join(projectDir, "session.jsonl"),
      new Date("2026-07-21T10:00:00Z"),
    );
  });

  // Regression tests for issue #98: agent usage that lands after the session
  // transcript was last written has to move this timestamp, or the today cache
  // is served stale while session cost keeps climbing past it.
  it("reflects agent transcripts under subagents/", async () => {
    writeAgedFile(
      join(projectDir, "session", "subagents", "agent-flat.jsonl"),
      AGENT_MTIME,
    );

    expect(await CacheManager.getLatestTranscriptMtime()).toBe(
      AGENT_MTIME.getTime(),
    );
  });

  it("reflects workflow agent transcripts nested deeper still", async () => {
    writeAgedFile(
      join(
        projectDir,
        "session",
        "subagents",
        "workflows",
        "wf_1",
        "agent-nested.jsonl",
      ),
      AGENT_MTIME,
    );

    expect(await CacheManager.getLatestTranscriptMtime()).toBe(
      AGENT_MTIME.getTime(),
    );
  });
});
