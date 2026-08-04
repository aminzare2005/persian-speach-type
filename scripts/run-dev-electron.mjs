import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.ELECTRON_RENDERER_URL =
  process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173";

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(import.meta.dirname, ".."),
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
