// bench.ts runs through Node's type stripping, which older Node versions fail
// on with a syntax error that does not say why. Plain JavaScript can still
// say why on any Node the package supports.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `npm run bench needs Node 22.18 or later (this is ${process.version}). ` +
      "The package itself still runs on Node 18; only the benchmark needs the newer Node.",
  );
  process.exit(1);
}

await import("./bench.ts");
