// src/service.ts
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

// src/log-format.ts
var FIELD = "\x1F";
var RECORD = "\x1E";
var LOG_FORMAT = ["%H", "%P", "%D", "%an", "%at", "%s"].join("%x1f") + "%x1e";
var refFromFullName = (full) => {
  if (full.startsWith("refs/heads/"))
    return { name: full.slice("refs/heads/".length), kind: "local", current: false };
  if (full.startsWith("refs/remotes/")) {
    const name = full.slice("refs/remotes/".length);
    return name.endsWith("/HEAD") ? null : { name, kind: "remote", current: false };
  }
  if (full.startsWith("refs/tags/"))
    return { name: full.slice("refs/tags/".length), kind: "tag", current: false };
  return null;
};
var parseDecorations = (value) => {
  const refs = [];
  for (const raw of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (raw === "HEAD") {
      refs.unshift({ name: "HEAD", kind: "head", current: true });
      continue;
    }
    const current = raw.startsWith("HEAD -> ");
    const full = current ? raw.slice("HEAD -> ".length) : raw.startsWith("tag: ") ? raw.slice("tag: ".length) : raw;
    const ref = refFromFullName(full);
    if (!ref)
      continue;
    if (current)
      refs.unshift({ ...ref, current });
    else
      refs.push(ref);
  }
  return refs;
};
var parseLog = (stdout) => stdout.split(RECORD).map((record) => record.replace(/^\n/, "")).filter(Boolean).map((record) => {
  const [hash = "", parents = "", decorations = "", author = "", timestamp = "0", ...subject] = record.split(FIELD);
  return {
    hash,
    parents: parents.split(" ").filter(Boolean),
    refs: parseDecorations(decorations),
    author,
    timestamp: Number.parseInt(timestamp, 10) || 0,
    subject: subject.join(FIELD)
  };
});

// src/service.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!port || !token) {
  console.error("OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required");
  process.exit(1);
}
var LIMIT_DEFAULT = 500;
var LIMIT_MAX = 2000;
var SKIP_MAX = 1e6;
var STATUS = {
  unauthorized: 401,
  "not-found": 404,
  "bad-request": 400,
  "no-directory": 422,
  "not-a-repo": 422,
  "no-git": 500,
  "git-failed": 500
};
var fail = (failure, message) => ({ status: STATUS[failure], body: { error: failure, message } });
var json = (res, { status, body }) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
var git = (directory, args) => new Promise((resolve) => {
  execFile("git", ["-C", directory, "-c", "core.quotepath=off", "-c", "log.showSignature=false", ...args], {
    timeout: 20000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" }
  }, (error, stdout, stderr) => {
    if (!error) {
      resolve({ ok: true, stdout });
      return;
    }
    const message = String(stderr || error.message).trim().split(`
`)[0] ?? "";
    if ("code" in error && error.code === "ENOENT") {
      resolve({ ok: false, failure: "no-git", message: "git is not installed on the OpenChamber host.", unknownRevision: false });
      return;
    }
    if (/not a git repository/i.test(stderr)) {
      resolve({ ok: false, failure: "not-a-repo", message: "This folder is not a git repository.", unknownRevision: false });
      return;
    }
    const unknownRevision = /unknown revision|bad revision|ambiguous argument|does not have any commits/i.test(stderr);
    resolve({ ok: false, failure: "git-failed", message: message || "git failed.", unknownRevision });
  });
});
var checkRepository = async (dir) => {
  if (!dir || !path.isAbsolute(dir) || dir.includes("\x00"))
    return fail("bad-request", "`dir` must be an absolute path.");
  try {
    if (!(await stat(dir)).isDirectory())
      return fail("no-directory", `${dir} is not a folder.`);
  } catch {
    return fail("no-directory", `${dir} does not exist.`);
  }
  const probe = await git(dir, ["rev-parse", "--git-dir"]);
  return probe.ok ? null : fail(probe.failure, probe.message);
};
var parseInteger = (value, fallback, max, min = 0) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
};
var readLog = async (dir, params) => {
  const limit = parseInteger(params.get("limit"), LIMIT_DEFAULT, LIMIT_MAX, 1);
  const skip = parseInteger(params.get("skip"), 0, SKIP_MAX);
  const scope = params.get("scope") === "current" ? "current" : "all";
  const args = [
    "log",
    "--topo-order",
    "--date-order",
    "--decorate=full",
    `--format=${LOG_FORMAT}`,
    `--max-count=${limit + 1}`,
    `--skip=${skip}`
  ];
  args.push(...scope === "all" ? ["--all"] : ["HEAD"], "--");
  const log = await git(dir, args);
  if (!log.ok) {
    if (log.unknownRevision)
      return { status: 200, body: { commits: [], hasMore: false } };
    return fail(log.failure, log.message);
  }
  const commits = parseLog(log.stdout);
  const hasMore = commits.length > limit;
  return { status: 200, body: { commits: commits.slice(0, limit), hasMore } };
};
var readHead = async (dir) => {
  const [branch, sha, status] = await Promise.all([
    git(dir, ["symbolic-ref", "--short", "-q", "HEAD"]),
    git(dir, ["rev-parse", "--verify", "-q", "HEAD"]),
    git(dir, ["status", "--porcelain=v1", "--untracked-files=normal"])
  ]);
  const changes = status.ok ? status.stdout.split(`
`).filter(Boolean).length : 0;
  return {
    status: 200,
    body: {
      branch: branch.ok ? branch.stdout.trim() || null : null,
      sha: sha.ok ? sha.stdout.trim() || null : null,
      dirty: changes > 0,
      changes
    }
  };
};
var ROUTES = {
  "/log": readLog,
  "/head": readHead
};
var server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, fail("unauthorized", "Missing or wrong service token."));
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/health") {
    json(res, { status: 200, body: { ok: true } });
    return;
  }
  const route = ROUTES[url.pathname];
  if (req.method !== "GET" || !route) {
    json(res, fail("not-found", `No route ${req.method} ${url.pathname}.`));
    return;
  }
  const dir = url.searchParams.get("dir");
  checkRepository(dir).then((problem) => problem ?? route(dir, url.searchParams)).catch((error) => fail("git-failed", error instanceof Error ? error.message : String(error))).then((reply) => json(res, reply));
});
server.listen(port, "127.0.0.1");
