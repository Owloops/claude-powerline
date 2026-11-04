// Compares two builds of claude-powerline on generated inputs and prints a
// Markdown table a PR can quote: `npm run bench -- [--base <ref>]
// [--config <file>] [--payload <file>] [--pairs <n>]`.
//
// Needs Node 22.18 or later, which runs this file without a build step. Keep
// to erasable TypeScript syntax: no enums, no parameter properties.
//
// The change is the working tree; the base defaults to the merge base with
// origin/main. Renders of the two alternate in pairs, so a machine slowing
// down mid-run hits both alike, and the run stops at the first pair whose
// outputs differ.

import { spawn, spawnSync, type SpawnSyncOptions } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { loadavg, platform, arch, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";

const { values: args } = parseArgs({
  options: {
    base: { type: "string" },
    config: { type: "string" },
    payload: { type: "string" },
    pairs: { type: "string", default: "15" },
  },
});
const PAIRS = Number(args.pairs);
if (!Number.isInteger(PAIRS) || PAIRS < 1)
  throw new Error("--pairs must be a positive integer");

const WARMUPS = 2;
const PERF_PAIRS = 5;
const APPEND_LINES = 4;
const MiB = 2 ** 20;
const MODEL = { id: "claude-opus-4-5-20251101", display_name: "Opus 4.5" };

const root = fileURLToPath(new URL("..", import.meta.url));
const linux = platform() === "linux";
const windows = platform() === "win32";

const userFile = (path: string | undefined) => {
  if (path === undefined) return undefined;
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`No such file: ${absolute}`);
  return absolute;
};
const configFile = userFile(args.config);
const payloadFile = userFile(args.payload);

// Build output goes to stderr, so stdout carries the report alone.
function run(cmd: string, argv: string[], opts: SpawnSyncOptions = {}): string {
  // npm is npm.cmd on Windows, which only a shell can start; a shell takes
  // one command line, and the npm arguments here never need quoting.
  const shell = windows && cmd === "npm";
  const result = spawnSync(
    shell ? `${cmd} ${argv.join(" ")}` : cmd,
    shell ? [] : argv,
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      shell,
      ...opts,
    },
  );

  if (result.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} failed`);
  return String(result.stdout ?? "").trim();
}

const toStderr: SpawnSyncOptions = { stdio: ["ignore", 2, 2] };
const build = (cwd: string) =>
  run("npm", ["run", "build"], { cwd, ...toStderr });

const baseRef = args.base ?? run("git", ["merge-base", "HEAD", "origin/main"]);
const baseSha = run("git", ["rev-parse", "--verify", `${baseRef}^{commit}`]);
const headSha = run("git", ["rev-parse", "HEAD"]);
const dirty =
  run("git", ["status", "--porcelain", "--untracked-files=no"]) !== "";

const baseDist = join(tmpdir(), "claude-powerline-bench", baseSha);
if (!existsSync(baseDist)) {
  console.error(`Building base ${baseSha.slice(0, 7)}...`);

  // git takes an empty directory as the worktree.
  const worktree = mkdtempSync(join(tmpdir(), "cpb-base-"));
  run("git", ["worktree", "add", "--detach", worktree, baseSha], toStderr);
  run("npm", ["ci"], { cwd: worktree, ...toStderr });
  build(worktree);

  // Copied aside and renamed, so the SHA directory always holds a whole build.
  const partial = `${baseDist}.${process.pid}.tmp`;
  cpSync(join(worktree, "dist"), partial, { recursive: true });
  renameSync(partial, baseDist);

  run("git", ["worktree", "remove", "--force", worktree], toStderr);
  // On Windows, git empties the directory but leaves it in place.
  rmSync(worktree, { recursive: true, force: true });
}

console.error("Building change (working tree)...");
build(root);

async function main() {
  const repo = join(tmp, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, "README.md"), "bench\n");

  const git = (...argv: string[]) =>
    run(
      "git",
      ["-c", "user.name=bench", "-c", "user.email=bench@localhost", ...argv],
      { cwd: repo },
    );

  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "bench");

  const pricing = JSON.parse(readFileSync(join(root, "pricing.json"), "utf8"));
  delete pricing._meta;
  const pricingSeed = JSON.stringify({ data: pricing, timestamp: Date.now() });

  const heldBack = (WARMUPS + PAIRS + PERF_PAIRS) * APPEND_LINES;
  console.error("Generating inputs...");
  const stores = {
    small: generateStore(join(tmp, "small"), 5 * MiB, heldBack),
    large: generateStore(join(tmp, "large"), 250 * MiB, heldBack),
  };

  const config = configFile ?? join(tmp, "config.json");
  if (!configFile)
    writeFileSync(config, JSON.stringify({ display: { style: "powerline" } }));

  const preload = join(tmp, "preload.mjs");
  const preloadOut = join(tmp, "preload.json");
  writeFileSync(preload, PRELOAD);

  const extra = payloadFile
    ? JSON.parse(readFileSync(payloadFile, "utf8"))
    : {};

  const builds = [
    { name: "base", dist: baseDist, cache: join(tmp, "cache-base") },
    {
      name: "change",
      dist: join(root, "dist"),
      cache: join(tmp, "cache-change"),
    },
  ];

  type Build = (typeof builds)[number];
  type Store = (typeof stores)["small"];

  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(NODE_OPTIONS|NODE_COMPILE_CACHE|NODE_DISABLE_COMPILE_CACHE)$|^CLAUDE_POWERLINE_/i.test(
          key,
        ),
    ),
  );

  function resetCache(dir: string) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "usage"), { recursive: true });
    writeFileSync(join(dir, "usage", "pricing.json"), pricingSeed);
  }

  function payload(store: Store) {
    const data: Record<string, unknown> = {
      hook_event_name: "Status",
      session_id: store.sessionId,
      transcript_path: store.transcript,
      cwd: repo,
      model: MODEL,
      workspace: { current_dir: repo, project_dir: repo },
      version: "2.1.0",
      context_window: {
        total_input_tokens: 1_200_000,
        total_output_tokens: 90_000,
        context_window_size: 200_000,
        current_usage: {
          input_tokens: 12,
          output_tokens: 800,
          cache_creation_input_tokens: 3_000,
          cache_read_input_tokens: 95_000,
        },
      },
      ...extra,
    };
    for (const key of Object.keys(data))
      if (data[key] === null) delete data[key];

    return JSON.stringify(data);
  }

  interface Sample {
    out: string;
    wall: number;
    rss: number;
    rchar: number | null;
    instructions: number | null;
  }

  function render(b: Build, store: Store, perf: boolean): Promise<Sample> {
    const node = [process.execPath, "--import", pathToFileURL(preload).href];
    const app = [join(b.dist, "index.mjs"), "--config", config];
    const perfOut = join(tmp, "perf.txt");
    const input = payload(store);

    const [cmd, ...argv] = perf
      ? [...PERF, "-o", perfOut, "--", ...node, ...app]
      : [...node, ...app];

    const child = spawn(cmd!, argv, {
      env: {
        ...env,
        CLAUDE_CONFIG_DIR: store.dir,
        CLAUDE_POWERLINE_CACHE_DIR: b.cache,
        COLUMNS: "120",
        BENCH_PRELOAD_OUT: preloadOut,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });

    const start = performance.now();
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stdin.end(input);

    return new Promise((done, fail) => {
      child.on("error", fail);
      child.on("close", (code) => {
        const wall = performance.now() - start;
        if (code !== 0)
          return fail(new Error(`${b.name} render exited ${code}`));

        const { rss, rchar } = JSON.parse(readFileSync(preloadOut, "utf8"));

        // Hybrid CPUs count each core type on its own line (cpu_core, cpu_atom).
        const instructions = perf
          ? readFileSync(perfOut, "utf8")
              .split("\n")
              .filter((l) => l.includes("instructions"))
              .reduce((sum, l) => sum + (Number(l.split(",")[0]) || 0), 0)
          : null;

        done({ out, wall, rss, rchar, instructions });
      });
    });
  }

  const perfReason = probePerf();

  const cases: { name: string; store: Store; warm: boolean }[] = [
    { name: "cold · small", store: stores.small, warm: false },
    { name: "cold · large", store: stores.large, warm: false },
    { name: "warm · small", store: stores.small, warm: true },
    { name: "warm · large", store: stores.large, warm: true },
  ];

  async function pair(c: (typeof cases)[number], i: number, perf: boolean) {
    if (c.warm) c.store.append();

    // Which build goes first alternates, so neither always meets a cooler cache.
    const samples: Sample[] = [];
    for (const k of i % 2 ? [1, 0] : [0, 1]) {
      if (!c.warm) resetCache(builds[k]!.cache);
      samples[k] = await render(builds[k]!, c.store, perf);
    }

    const [base, change] = samples as [Sample, Sample];
    if (base.out !== change.out) {
      console.error(
        `Outputs differ (${c.name}, pair ${i + 1}):\n--- base\n${base.out}\n--- change\n${change.out}`,
      );
      process.exit(1);
    }

    return samples;
  }

  // Each case's perf pass runs before the next case, so the appends of the
  // warm cases never reach a cold case's transcript.
  const rows: { name: string; pairs: Sample[][]; perf: Sample[][] }[] = [];
  for (const c of cases) {
    console.error(`Rendering ${c.name}...`);
    if (c.warm) for (const b of builds) resetCache(b.cache);
    for (let i = 0; i < WARMUPS; i++) await pair(c, i, false);

    const pairs: Sample[][] = [];
    for (let i = 0; i < PAIRS; i++) pairs.push(await pair(c, i, false));

    const perf: Sample[][] = [];
    if (perfReason === null) {
      console.error(`Counting instructions, ${c.name}...`);
      for (let i = 0; i < PERF_PAIRS; i++) perf.push(await pair(c, i, true));
    }

    rows.push({ name: c.name, pairs, perf });
  }

  const statusline = rows[0]!.pairs[0]![1]!.out;

  const columns: {
    name: string;
    unit: string;
    get: (s: Sample) => number | null;
    fmt: (n: number) => string;
    perf?: boolean;
  }[] = [
    { name: "wall", unit: "ms", get: (s) => s.wall, fmt: (n) => n.toFixed(0) },
    {
      name: "peak RSS",
      unit: "MiB",
      get: (s) => s.rss / 1024,
      fmt: (n) => n.toFixed(1),
    },
  ];

  const notes = [
    "%: median of the per-pair changes, so it can differ from the change between the two medians.",
    "Cold renders start from an empty cache with pricing seeded; the first pricing download is not measured.",
  ];

  if (linux)
    columns.push({
      name: "bytes read",
      unit: "MiB",
      get: (s) => s.rchar && s.rchar / MiB,
      fmt: (n) => n.toFixed(2),
    });
  else notes.push("bytes read: dropped, Linux only.");

  if (perfReason === null) {
    columns.push({
      name: "instructions",
      unit: "M",
      perf: true,
      get: (s) => s.instructions && s.instructions / 1e6,
      fmt: (n) => n.toFixed(0),
    });
    notes.push(
      `instructions: \`perf stat -e instructions:u\` over ${PERF_PAIRS} more pairs per case, run on one CPU, child processes (git) included.`,
    );
  } else notes.push(`instructions: dropped, ${perfReason}.`);

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };

  const percent = (p: number) => {
    const size = Math.abs(p).toFixed(1);
    return `${size === "0.0" ? "±" : p < 0 ? "−" : "+"}${size}%`;
  };

  const cell = (row: (typeof rows)[number], col: (typeof columns)[number]) => {
    const values = (col.perf ? row.perf : row.pairs).flatMap((p) => {
      const [b, c] = p.map(col.get);
      return b == null || c == null ? [] : [[b, c] as const];
    });

    const base = median(values.map(([b]) => b));
    const change = median(values.map(([, c]) => c));
    const delta = median(values.map(([b, c]) => (c / b - 1) * 100));
    return `${col.fmt(base)} → ${col.fmt(change)} ${col.unit} (${percent(delta)})`;
  };

  const short = (sha: string) => sha.slice(0, 7);
  const lines = [
    `claude-powerline bench: base ${short(baseSha)} (${args.base ?? "merge base"}) vs change ${short(headSha)}${dirty ? "+dirty" : ""} (working tree)`,
    [
      `config: ${configFile ?? "default (powerline)"}`,
      `node ${process.version}`,
      `${platform()} ${arch()}`,
      ...(windows ? [] : [`load ${loadavg()[0]!.toFixed(2)}`]),
      `${PAIRS} pairs after ${WARMUPS} warm-ups`,
    ].join(" · "),
    "",
    `| case | ${columns.map((c) => c.name).join(" | ")} |`,
    `|---|${columns.map(() => "---").join("|")}|`,
    ...rows.map(
      (r) => `| ${r.name} | ${columns.map((c) => cell(r, c)).join(" | ")} |`,
    ),
    "",
    ...notes,
    "",
    "Change's statusline, first measured pair of cold · small:",
    "",
    "```",
    stripVTControlCharacters(statusline).trimEnd(),
    "```",
  ];

  console.log(lines.join("\n"));
}

// On one CPU: free to use several, a render's threads spin while waiting on
// each other, which added 30 to 60% to its count and moved it by 15% between
// runs; on one CPU, runs agreed within 0.3%.
const PERF = "taskset -c 0 perf stat -x , -e instructions:u".split(" ");

// Returns why the instructions column is dropped, or null when perf works.
function probePerf(): string | null {
  if (!linux) return "Linux only";
  const [cmd, ...argv] = [...PERF, "--", process.execPath, "-e", "0"];

  const result = spawnSync(cmd!, argv, { encoding: "utf8" });
  if (result.error) return "`taskset` not found";

  // A core type the CPU never ran on reports <not counted>.
  const counted = /^\d+,.*instructions/m.test(result.stderr);
  if (result.status !== 0 || !counted)
    // perf's refusal opens on a bare "Error:" line and names the setting below.
    return /perf_event_paranoid/.test(result.stderr)
      ? "`kernel.perf_event_paranoid` refuses user-space counts"
      : `\`perf stat\` failed: ${result.stderr.trim().split("\n")[0]}`;

  return null;
}

// Peak RSS and, on Linux, bytes read, recorded by each render at its own exit:
// a parent cannot read /proc/<pid>/io once the child has exited.
const PRELOAD = `import { readFileSync, writeFileSync } from "node:fs";
process.on("exit", () => {
  let rchar = null;
  try { rchar = Number(/rchar: (\\d+)/.exec(readFileSync("/proc/self/io", "utf8"))[1]); } catch {}
  writeFileSync(process.env.BENCH_PRELOAD_OUT, JSON.stringify({ rss: process.resourceUsage().maxRSS, rchar }));
});
`;

// Writes a Claude Code store under `dir`: one session of about `bytes`, with
// agent transcripts and a compact boundary, plus about 20 other sessions of
// today, the same in every store. Message bodies are filler; the fields the
// parser reads are realistic. `heldBack` more session lines are kept for
// append(), which warm cases call before each pair.
function generateStore(dir: string, bytes: number, heldBack: number) {
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };

  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo));
  const hex = (n: number) =>
    Array.from({ length: n }, () => int(0, 16).toString(16)).join("");
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

  const words =
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(
      " ",
    );
  const lorem = Array.from(
    { length: 2000 },
    () => words[int(0, words.length)],
  ).join(" ");

  const filler = () => {
    const start = int(0, lorem.length - 4000);
    return lorem.slice(start, start + int(200, 4000));
  };

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const span = Date.now() - dayStart.getTime();
  const AVG_LINE = 2400;

  // Lines of one transcript, `count` of them, timestamps spread over today.
  function* transcript(
    sessionId: string,
    count: number,
    sidechain: string | null,
  ) {
    let parent: string | null = null;
    let context = 0;
    const compactAt = sidechain ? -1 : Math.floor(count * 0.6);
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(
        dayStart.getTime() + (span * i) / count,
      ).toISOString();
      const uuid_ = uuid();

      const common = {
        parentUuid: parent,
        isSidechain: sidechain !== null,
        ...(sidechain ? { agentId: sidechain } : {}),
        sessionId,
        cwd: "/home/bench/project",
        version: "2.1.0",
        uuid: uuid_,
        timestamp,
      };

      if (i === compactAt) {
        context = 0;
        yield {
          ...common,
          parentUuid: null,
          logicalParentUuid: parent,
          type: "system",
          subtype: "compact_boundary",
          content: "Conversation compacted",
          compactMetadata: { trigger: "auto", preTokens: 160_000 },
        };
      } else if (i % 2 === 0) {
        yield {
          ...common,
          type: "user",
          message: { role: "user", content: filler() },
        };
      } else {
        const creation = int(0, 5000);
        context = Math.min(context + creation, 180_000);
        yield {
          ...common,
          type: "assistant",
          requestId: `req_${hex(24)}`,
          message: {
            id: `msg_${hex(24)}`,
            type: "message",
            role: "assistant",
            model: MODEL.id,
            content: [{ type: "text", text: filler() }],
            stop_reason: "end_turn",
            usage: {
              input_tokens: int(1, 50),
              output_tokens: int(50, 2000),
              cache_creation_input_tokens: creation,
              cache_read_input_tokens: context,
              cache_creation: {
                ephemeral_5m_input_tokens: creation,
                ephemeral_1h_input_tokens: 0,
              },
            },
          },
        };
      }

      parent = uuid_;
    }
  }

  // Writes the lines to `path`, all but the last `keep`, which it returns.
  function write(
    path: string,
    lines: Generator<object>,
    count: number,
    keep = 0,
  ) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "");

    let chunk = "";
    const kept: string[] = [];
    let i = 0;

    for (const line of lines) {
      const text = JSON.stringify(line) + "\n";
      if (i++ >= count - keep) kept.push(text);
      else chunk += text;
      if (chunk.length > MiB) {
        appendFileSync(path, chunk);
        chunk = "";
      }
    }
    appendFileSync(path, chunk);
    return kept;
  }

  for (let s = 0; s < 20; s++) {
    const id = uuid();
    const count = Math.floor((50 * MiB) / 20 / AVG_LINE);
    write(
      join(dir, "projects", `-home-bench-project-${s % 4}`, `${id}.jsonl`),
      transcript(id, count, null),
      count,
    );
  }

  const sessionId = uuid();
  const project = join(dir, "projects", "-home-bench-project");
  for (let a = 0; a < 3; a++) {
    const agentId = hex(17);
    const count = Math.floor((bytes * 0.02) / AVG_LINE);
    write(
      join(project, sessionId, "subagents", `agent-${agentId}.jsonl`),
      transcript(sessionId, count, agentId),
      count,
    );
  }

  const path = join(project, `${sessionId}.jsonl`);
  const count = Math.floor(bytes / AVG_LINE) + heldBack;
  const kept = write(path, transcript(sessionId, count, null), count, heldBack);

  return {
    dir,
    sessionId,
    transcript: path,
    append: () => appendFileSync(path, kept.splice(0, APPEND_LINES).join("")),
  };
}

// Removes the generated inputs however the run ends: done, a mismatch, an
// error, or Ctrl-C, which would otherwise kill the process without an exit.
const tmp = mkdtempSync(join(tmpdir(), "cpb-run-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
process.on("SIGINT", () => process.exit(130));

await main();
