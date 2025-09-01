import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  shims: false,
  splitting: false,
  sourcemap: process.env.NODE_ENV === 'development',
  clean: true,
  minify: true,
  treeshake: true,
  target: "node18",
});
