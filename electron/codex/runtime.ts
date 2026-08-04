import { createWriteStream } from "node:fs";
import { existsSync, mkdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

type CodexTarget = {
  packageName: string;
  triple: string;
  executable: string;
  npmTarball: string;
};

/** Keep in sync with package.json dependency `@openai/codex`. */
export const CODEX_RUNTIME_VERSION = "0.144.4";

const TARGETS: Record<string, CodexTarget> = {
  "win32:x64": {
    packageName: "@openai/codex-win32-x64",
    triple: "x86_64-pc-windows-msvc",
    executable: "codex.exe",
    npmTarball: `https://registry.npmjs.org/@openai/codex-win32-x64/-/codex-win32-x64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
  "win32:arm64": {
    packageName: "@openai/codex-win32-arm64",
    triple: "aarch64-pc-windows-msvc",
    executable: "codex.exe",
    npmTarball: `https://registry.npmjs.org/@openai/codex-win32-arm64/-/codex-win32-arm64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
  "darwin:x64": {
    packageName: "@openai/codex-darwin-x64",
    triple: "x86_64-apple-darwin",
    executable: "codex",
    npmTarball: `https://registry.npmjs.org/@openai/codex-darwin-x64/-/codex-darwin-x64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
  "darwin:arm64": {
    packageName: "@openai/codex-darwin-arm64",
    triple: "aarch64-apple-darwin",
    executable: "codex",
    npmTarball: `https://registry.npmjs.org/@openai/codex-darwin-arm64/-/codex-darwin-arm64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
  "linux:x64": {
    packageName: "@openai/codex-linux-x64",
    triple: "x86_64-unknown-linux-musl",
    executable: "codex",
    npmTarball: `https://registry.npmjs.org/@openai/codex-linux-x64/-/codex-linux-x64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
  "linux:arm64": {
    packageName: "@openai/codex-linux-arm64",
    triple: "aarch64-unknown-linux-musl",
    executable: "codex",
    npmTarball: `https://registry.npmjs.org/@openai/codex-linux-arm64/-/codex-linux-arm64-${CODEX_RUNTIME_VERSION}.tgz`,
  },
};

function unpackedAsarPath(value: string) {
  const marker = `${path.sep}app.asar${path.sep}`;
  return value.includes(marker)
    ? value.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`)
    : value;
}

function currentTarget(platform = process.platform, arch = process.arch) {
  const target = TARGETS[`${platform}:${arch}`];
  if (!target) {
    throw new Error(`Codex برای ${platform}/${arch} در دسترس نیست.`);
  }
  return target;
}

export function codexRuntimeRoot(codexHome: string) {
  return path.join(codexHome, "runtime", CODEX_RUNTIME_VERSION);
}

export function codexExecutableInRuntime(codexHome: string) {
  const target = currentTarget();
  return path.join(
    codexRuntimeRoot(codexHome),
    "vendor",
    target.triple,
    "bin",
    target.executable
  );
}

/** Dev / optional bundled path under node_modules. */
export function resolveBundledCodexExecutable(options?: {
  platform?: NodeJS.Platform;
  arch?: string;
  requireFrom?: NodeRequire;
}): string | null {
  const platform = options?.platform ?? process.platform;
  const arch = options?.arch ?? process.arch;
  const target = TARGETS[`${platform}:${arch}`];
  if (!target) return null;

  try {
    const rootRequire = options?.requireFrom ?? createRequire(import.meta.url);
    const codexPackageJson = rootRequire.resolve("@openai/codex/package.json");
    const codexRequire = createRequire(codexPackageJson);
    const platformPackageJson = codexRequire.resolve(
      `${target.packageName}/package.json`
    );
    const packagedPath = path.join(
      path.dirname(platformPackageJson),
      "vendor",
      target.triple,
      "bin",
      target.executable
    );
    const candidates = [unpackedAsarPath(packagedPath), packagedPath];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  } catch {
    return null;
  }
}

export function resolveCodexExecutable(options?: {
  codexHome?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  requireFrom?: NodeRequire;
}) {
  if (options?.codexHome) {
    const local = codexExecutableInRuntime(options.codexHome);
    if (existsSync(local)) return local;
  }
  const bundled = resolveBundledCodexExecutable(options);
  if (bundled) return bundled;
  throw new Error(
    "موتور Codex هنوز دانلود نشده است. یک‌بار از تنظیمات وارد ChatGPT شوید تا دانلود شود."
  );
}

let ensurePromise: Promise<string> | null = null;

async function extractTarball(archivePath: string, destination: string) {
  mkdirSync(destination, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-xzf", archivePath, "-C", destination, "--strip-components=1"],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`استخراج Codex ناموفق بود (${code}): ${stderr}`));
    });
  });
}

/**
 * Ensures Codex native runtime exists under userData (lazy download).
 * Keeps the installer small — the ~325MB binary is fetched only when Codex is used.
 */
export async function ensureCodexRuntime(options: {
  codexHome: string;
  onProgress?: (message: string) => void;
}): Promise<string> {
  const existingHome = codexExecutableInRuntime(options.codexHome);
  if (existsSync(existingHome)) return existingHome;

  const bundled = resolveBundledCodexExecutable();
  if (bundled) return bundled;

  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const target = currentTarget();
    const root = codexRuntimeRoot(options.codexHome);
    const exePath = codexExecutableInRuntime(options.codexHome);
    const staging = `${root}.download`;
    const tarball = path.join(options.codexHome, "runtime", `codex-${CODEX_RUNTIME_VERSION}.tgz`);

    try {
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(path.dirname(tarball), { recursive: true });
      mkdirSync(staging, { recursive: true });

      options.onProgress?.("در حال دانلود موتور Codex…");
      const response = await fetch(target.npmTarball);
      if (!response.ok || !response.body) {
        throw new Error(`دانلود Codex ناموفق بود (${response.status}).`);
      }

      const file = createWriteStream(tarball);
      // Node 22: web ReadableStream works with pipeline
      await pipeline(response.body as unknown as NodeJS.ReadableStream, file);

      options.onProgress?.("در حال نصب موتور Codex…");
      await extractTarball(tarball, staging);

      // Drop optional huge helper (~50MB) — app-server only needs codex.exe.
      const host = path.join(
        staging,
        "vendor",
        target.triple,
        "bin",
        "codex-code-mode-host.exe"
      );
      if (existsSync(host)) {
        try {
          rmSync(host, { force: true });
        } catch {
          // ignore
        }
      }

      rmSync(root, { recursive: true, force: true });
      renameSync(staging, root);
      writeFileSync(path.join(root, ".pst-version"), CODEX_RUNTIME_VERSION, "utf8");

      if (!existsSync(exePath)) {
        throw new Error("پس از دانلود، فایل اجرایی Codex پیدا نشد.");
      }
      options.onProgress?.("موتور Codex آماده است.");
      return exePath;
    } finally {
      try {
        rmSync(tarball, { force: true });
      } catch {
        // ignore
      }
      try {
        rmSync(staging, { recursive: true, force: true });
      } catch {
        // ignore
      }
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

export function isCodexRuntimeReady(codexHome: string) {
  return (
    existsSync(codexExecutableInRuntime(codexHome)) ||
    Boolean(resolveBundledCodexExecutable())
  );
}
