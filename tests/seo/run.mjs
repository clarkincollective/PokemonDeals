// SEO test runner.
//
//   SEO_TEST_BASE_URL=https://…   -> run the suite against that URL as-is.
//   (unset)                       -> boot `next start` on a local port,
//                                     wait for it, run the suite, tear it
//                                     down. Requires a prior `next build`.
//
// Zero dependencies - just node:child_process + fetch.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const CWD = process.cwd();

function runTests(env) {
  return new Promise((resolve) => {
    // Glob pattern rather than a bare directory - `node --test <dir>` is
    // unreliable on Windows (tries to `require` the directory), the glob
    // form works everywhere.
    const child = spawn(process.execPath, ["--test", "tests/seo/*.test.mjs"], {
      cwd: CWD,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (process.env.SEO_TEST_BASE_URL) {
    console.log(`Running SEO suite against ${process.env.SEO_TEST_BASE_URL}`);
    process.exit(await runTests({}));
  }

  if (!existsSync(path.join(CWD, ".next", "BUILD_ID"))) {
    console.error("No production build found. Run `npm run build` first, or set SEO_TEST_BASE_URL to a running server.");
    process.exit(1);
  }

  const port = process.env.SEO_TEST_PORT || "3100";
  const base = `http://localhost:${port}`;
  const nextBin = path.join(CWD, "node_modules", "next", "dist", "bin", "next");

  console.log(`Starting \`next start\` on ${base} ...`);
  const server = spawn(process.execPath, [nextBin, "start", "-p", port], {
    cwd: CWD,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });

  let code = 1;
  try {
    const up = await waitForServer(`${base}/`);
    if (!up) {
      console.error("Server did not become ready within 90s.");
      return;
    }
    code = await runTests({ SEO_TEST_BASE_URL: base });
  } finally {
    server.kill("SIGTERM");
    setTimeout(() => server.kill("SIGKILL"), 3000).unref?.();
  }
  process.exit(code);
}

main();
