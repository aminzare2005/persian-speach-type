import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const watch = process.argv.includes("--watch");

const alias = {
  "@": path.join(root, "src"),
};

const shared = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: true,
  alias,
  external: [
    "electron",
    "sherpa-onnx",
    "koffi",
    "@openai/codex",
    "@openai/codex-win32-x64",
    "@openai/codex-win32-arm64",
    "@openai/codex-darwin-x64",
    "@openai/codex-darwin-arm64",
    "@openai/codex-linux-x64",
    "@openai/codex-linux-arm64",
  ],
  logLevel: "info",
};

const mainConfig = {
  ...shared,
  entryPoints: [path.join(root, "electron/main.ts")],
  outfile: path.join(root, "dist-electron/main.js"),
  format: "esm",
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
};

const preloadConfig = {
  ...shared,
  entryPoints: [path.join(root, "electron/preload.ts")],
  outfile: path.join(root, "dist-electron/preload.cjs"),
  format: "cjs",
};

const shenavaWorkerConfig = {
  ...shared,
  entryPoints: [path.join(root, "electron/shenava/worker.ts")],
  outfile: path.join(root, "dist-electron/shenava-worker.cjs"),
  format: "cjs",
};

async function run() {
  if (watch) {
    const [mainCtx, preloadCtx, shenavaWorkerCtx] = await Promise.all([
      context(mainConfig),
      context(preloadConfig),
      context(shenavaWorkerConfig),
    ]);
    await Promise.all([
      mainCtx.watch(),
      preloadCtx.watch(),
      shenavaWorkerCtx.watch(),
    ]);
    console.log("[esbuild] watching electron main + preload + Shenava worker...");
  } else {
    await Promise.all([
      build(mainConfig),
      build(preloadConfig),
      build(shenavaWorkerConfig),
    ]);
    console.log("[esbuild] built electron main + preload + Shenava worker.");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
