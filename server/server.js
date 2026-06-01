// qbe-runner — v1.0.0-Kemeny F1 backend skeleton
//
// Endpoint: POST /api/compile  (multipart/form-data, field "source" = .bas file)
// Spawns a Docker container with QB64-PE, compiles the BAS, returns the result.
//
// v0.5.0-Hopper (this file) is the first iteration: accepts upload, runs docker,
// returns stdout/stderr + exit code. No GUI / Xvfb / noVNC yet — that's F2.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, chmodSync, mkdirSync, chownSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Workdir base: NOT /tmp (would be PrivateTmp-isolated from Docker daemon).
const SESSIONS_DIR = '/var/lib/qbe-runner/sessions';
mkdirSync(SESSIONS_DIR, { recursive: true });
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Busboy from 'busboy';

const PORT = Number(process.env.QBE_RUNNER_PORT ?? 4001);
const BIND = process.env.QBE_RUNNER_BIND ?? '127.0.0.1';
const COMPILE_TIMEOUT_MS = 60_000;
const MAX_SOURCE_BYTES = 1_048_576; // 1 MiB
const DOCKER_IMAGE = process.env.QBE_RUNNER_IMAGE ?? 'qbe-compiler:latest';
const DOCKER_TIMEOUT_S = 90;

const DANGEROUS_KEYWORDS_RE = /\b(SHELL|KILL|POKE|OUT)\b/i;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function logEvent(ev) {
  // Structured JSON log — pipe to journald via systemd
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...ev }));
}

async function handleCompile(req, res) {
  const sessionId = randomUUID();
  const workdir = mkdtempSync(path.join(SESSIONS_DIR, `qbe-${sessionId}-`));

  let sourceBytes = Buffer.alloc(0);
  let filename = 'input.bas';
  let totalBytes = 0;
  let overflowed = false;

  const bb = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_SOURCE_BYTES, files: 1, fields: 5 },
  });

  bb.on('file', (name, file, info) => {
    if (name !== 'source') {
      file.resume();
      return;
    }
    if (info.filename) filename = path.basename(info.filename);
    file.on('data', (chunk) => {
      if (overflowed) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_SOURCE_BYTES) {
        overflowed = true;
        return;
      }
      sourceBytes = Buffer.concat([sourceBytes, chunk]);
    });
    file.on('limit', () => { overflowed = true; });
  });

  bb.on('finish', async () => {
    try {
      if (overflowed) {
        rmSync(workdir, { recursive: true, force: true });
        return json(res, 413, { error: 'source too large', limit: MAX_SOURCE_BYTES });
      }
      if (sourceBytes.length === 0) {
        rmSync(workdir, { recursive: true, force: true });
        return json(res, 400, { error: 'no source provided (use multipart field "source")' });
      }

      const sourceText = sourceBytes.toString('latin1');
      if (DANGEROUS_KEYWORDS_RE.test(sourceText)) {
        const m = sourceText.match(DANGEROUS_KEYWORDS_RE);
        rmSync(workdir, { recursive: true, force: true });
        return json(res, 400, { error: 'forbidden keyword in source', keyword: m?.[0] });
      }

      const inputPath = path.join(workdir, 'input.bas');
      writeFileSync(inputPath, sourceBytes);
      // Container's qbe user (uid 1000) needs WRITE access — qb64pe creates temp
      // files in source-dir during compile. chown the whole workdir to 1000:1000.
      chownSync(workdir, 1000, 1000);
      chownSync(inputPath, 1000, 1000);
      chmodSync(workdir, 0o755);
      chmodSync(inputPath, 0o644);

      logEvent({ event: 'compile-start', sessionId, filename, bytes: sourceBytes.length });

      const result = await runDocker(workdir, sessionId);

      logEvent({ event: 'compile-end', sessionId, exitCode: result.exitCode, ms: result.ms });

      // Cleanup workdir (binary kept in /tmp until next run for F2 to consume)
      const binPath = path.join(workdir, 'output');
      const hasBin = existsSync(binPath);
      const binSize = hasBin ? statSync(binPath).size : 0;

      json(res, 200, {
        sessionId,
        ok: result.exitCode === 0 && hasBin,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 8192),
        stderr: result.stderr.slice(0, 8192),
        binSize,
        durationMs: result.ms,
        runUrl: hasBin ? `/qbe-runner/api/run/${sessionId}` : null,
      });

      // Cleanup after 5min (F2 needs binary available for /api/run)
      setTimeout(() => rmSync(workdir, { recursive: true, force: true }), 300_000);
    } catch (err) {
      logEvent({ event: 'compile-error', sessionId, error: String(err) });
      rmSync(workdir, { recursive: true, force: true });
      json(res, 500, { error: 'internal error', detail: String(err) });
    }
  });

  bb.on('error', (err) => {
    rmSync(workdir, { recursive: true, force: true });
    json(res, 400, { error: 'multipart parse error', detail: String(err) });
  });

  req.pipe(bb);
}

function runDocker(workdir, sessionId) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [
      'run', '--rm',
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '1.0',
      // NB: --read-only removed (qb64pe writes to internal/temp/ at startup).
      // Sandboxing remains via --network none + --memory + --cpus + non-root user.
      '--tmpfs', '/tmp:rw,size=64m',
      '--name', `qbe-${sessionId}`,
      '--user', 'qbe:qbe',
      '-v', `${workdir}:/work`,
      DOCKER_IMAGE,
    ];
    const proc = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      spawn('docker', ['kill', `qbe-${sessionId}`]).on('error', () => {});
    }, COMPILE_TIMEOUT_MS);
    proc.stdout.on('data', (b) => { stdout += b.toString(); });
    proc.stderr.on('data', (b) => { stderr += b.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, ms: Date.now() - startedAt });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout: '', stderr: `spawn-error: ${err}`, ms: Date.now() - startedAt });
    });
  });
}

function handleHealth(req, res) {
  json(res, 200, {
    service: 'qbe-runner',
    version: '0.5.0-Hopper',
    milestone: 'v1.0.0-Kemeny F1 (backend skeleton)',
    docker_image: DOCKER_IMAGE,
    port: PORT,
    bind: BIND,
  });
}

// F2: per-session run state
const runSessions = new Map(); // sessionId -> {containerName, wsPort, expiresAt}

function findWorkdir(sessionId) {
  const prefix = `qbe-${sessionId}-`;
  const dirs = (existsSync(SESSIONS_DIR) ? readdirSync(SESSIONS_DIR) : []);
  const match = dirs.find((d) => d.startsWith(prefix));
  return match ? path.join(SESSIONS_DIR, match) : null;
}

function handleRun(req, res, sessionId) {
  const workdir = findWorkdir(sessionId);
  if (!workdir) return json(res, 404, { error: 'session not found or expired', sessionId });
  const binPath = path.join(workdir, 'output');
  if (!existsSync(binPath)) return json(res, 404, { error: 'binary missing', sessionId });

  // Deterministic port from sessionId
  let h = 0;
  for (const c of sessionId) h = (h * 31 + c.charCodeAt(0)) | 0;
  const wsPort = 6901 + (Math.abs(h) % 99);
  const vncPort = wsPort - 1000;

  const existing = runSessions.get(sessionId);
  if (existing && existing.expiresAt > Date.now()) {
    return json(res, 200, { sessionId, wsPort: existing.wsPort, expiresAt: existing.expiresAt, vncPath: `/qbe-vnc/${existing.wsPort}/websockify` });
  }

  const containerName = `qbe-run-${sessionId}`;
  spawn('docker', ['rm', '-f', containerName]).on('error', () => {});

  const args = [
    'run', '--rm', '-d',
    '--network', 'host',
    '--memory', '1g', '--cpus', '4.0',
    '--name', containerName,
    '--user', 'qbe:qbe',
    '-v', `${workdir}:/work`,
    '-e', 'MODE=run',
    '-e', `WS_PORT=${wsPort}`,
    '-e', `VNC_PORT=${vncPort}`,
    '-e', `DISPLAY_NUM=${wsPort - 6800}`,  // unieke display per sessie (101-199)
    '-e', 'BINARY=/work/output',
    DOCKER_IMAGE,
  ];

  const proc = spawn('docker', args);
  let stderr = '';
  proc.stderr.on('data', (b) => { stderr += b.toString(); });
  proc.on('close', (code) => {
    if (code !== 0) {
      logEvent({ event: 'run-spawn-error', sessionId, code, stderr });
      return json(res, 500, { error: 'spawn failed', stderr, exitCode: code });
    }
    const expiresAt = Date.now() + 300_000;
    runSessions.set(sessionId, { containerName, wsPort, expiresAt });
    setTimeout(() => {
      spawn('docker', ['kill', containerName]).on('error', () => {});
      runSessions.delete(sessionId);
    }, 300_000);
    logEvent({ event: 'run-started', sessionId, wsPort, containerName });
    json(res, 200, { sessionId, wsPort, expiresAt, vncPath: `/qbe-vnc/${wsPort}/websockify` });
  });
}

function handleStop(req, res, sessionId) {
  const s = runSessions.get(sessionId);
  if (!s) return json(res, 404, { error: 'no running session', sessionId });
  spawn('docker', ['kill', s.containerName]).on('error', () => {});
  runSessions.delete(sessionId);
  json(res, 200, { ok: true, stopped: sessionId });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return handleHealth(req, res);
  if (req.method === 'POST' && req.url === '/api/compile') return handleCompile(req, res);
  let m = req.url.match(/^\/api\/run\/([0-9a-f-]+)$/);
  if (m && req.method === 'POST') return handleRun(req, res, m[1]);
  m = req.url.match(/^\/api\/stop\/([0-9a-f-]+)$/);
  if (m && req.method === 'POST') return handleStop(req, res, m[1]);
  json(res, 404, { error: 'not found', endpoints: ['GET /api/health', 'POST /api/compile', 'POST /api/run/<sessionId>', 'POST /api/stop/<sessionId>'] });
});

server.listen(PORT, BIND, () => {
  logEvent({ event: 'startup', port: PORT, bind: BIND, image: DOCKER_IMAGE });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
