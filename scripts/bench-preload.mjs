// Loaded into each render with --import. Counts the file reads, opens and
// child processes the app makes through the public fs and child_process APIs,
// so the counts are the same on every platform and from one run to the next.
// They are written, with peak RSS and CPU time, at exit: a parent cannot read
// a child's counters once it has exited.
import { createRequire, syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const cp = require("node:child_process");

const counts = { bytesRead: 0, opens: 0, spawns: 0 };
const size = (v) =>
  typeof v === "string" ? Buffer.byteLength(v) : (v?.byteLength ?? 0);

// Node's readFileSync calls the public openSync and readSync itself; only the
// outermost call counts, so one file is not counted twice.
let depth = 0;

function wrap(obj, name, measure) {
  const orig = obj[name];
  if (typeof orig !== "function") return;
  obj[name] = counting(orig, measure);
  // exec and execFile carry their own promisified form, which resolves to
  // { stdout, stderr }; without it, promisify(exec) resolves to stdout alone.
  const custom = orig[promisify.custom];
  if (custom) obj[name][promisify.custom] = counting(custom, measure);
}

function counting(orig, measure) {
  return function (...args) {
    if (depth > 0) return orig.apply(this, args);
    depth++;
    let result;
    try {
      result = orig.apply(this, args);
    } finally {
      depth--;
    }
    if (typeof result?.then === "function")
      return result.then((v) => (measure(v), v));
    measure(result);
    return result;
  };
}

function wrapCallback(obj, name, measure) {
  const orig = obj[name];
  obj[name] = function (...args) {
    const cb = args.at(-1);
    if (typeof cb === "function")
      args[args.length - 1] = function (err, ...rest) {
        if (!err) measure(rest);
        return cb.call(this, err, ...rest);
      };
    return orig.apply(this, args);
  };
}

const readWhole = (v) => {
  counts.bytesRead += size(v);
  counts.opens++;
};

wrap(fs, "readFileSync", readWhole);
wrap(fs, "readSync", (n) => (counts.bytesRead += n));
wrap(fs, "openSync", () => counts.opens++);
wrapCallback(fs, "readFile", ([v]) => readWhole(v));
// createReadStream reads through fs.read and opens through fs.open.
wrapCallback(fs, "read", ([n]) => (counts.bytesRead += n));
wrapCallback(fs, "open", () => counts.opens++);
wrap(fsp, "readFile", readWhole);

// A FileHandle's reads go through its prototype, reached from the first open.
const open = fsp.open;
fsp.open = async function (...args) {
  const handle = await open.apply(this, args);
  counts.opens++;
  const proto = Object.getPrototypeOf(handle);
  if (!Object.hasOwn(proto, "__benchCounted")) {
    proto.__benchCounted = true;
    wrap(proto, "read", (r) => (counts.bytesRead += r.bytesRead));
    wrap(proto, "readFile", (v) => (counts.bytesRead += size(v)));
  }
  return handle;
};

for (const name of [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
])
  wrap(cp, name, () => counts.spawns++);

// The bundle imports named exports from node:fs; this makes them the wrappers.
syncBuiltinESMExports();

process.on("exit", () => {
  const usage = process.resourceUsage();
  writeFileSync(
    process.env.BENCH_PRELOAD_OUT,
    JSON.stringify({
      ...counts,
      rss: usage.maxRSS,
      cpu: (usage.userCPUTime + usage.systemCPUTime) / 1000,
    }),
  );
});
