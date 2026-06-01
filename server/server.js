// qbe-runner — v1.0.0-Kemeny F4 production
//
// Endpoints:
//   GET  /api/health             — status + active-session-count
//   POST /api/compile            — multipart .bas → compile in sandbox
//   POST /api/run/<sessionId>    — start runtime container with Xvfb + x11vnc
//   POST /api/stop/<sessionId>   — kill runtime container
//
// F4 additions:
//   - Per-IP rate-limiting (20 compiles/uur)
//   - Extended source-validation (SHELL/KILL/POKE/OUT + SYSTEM/CHAIN/FILES/RUN)
//   - Active-session-count in health-endpoint

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, chmodSync, mkdirSync, chownSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Workdir base: NOT /tmp (would be PrivateTmp-isolated from Docker daemon).
const SESSIONS_DIR = '/var/lib/qbe-runner/sessions';
mkdirSync(SESSIONS_DIR, { recursive: true });
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import Busboy from 'busboy';

const PORT = Number(process.env.QBE_RUNNER_PORT ?? 4001);
const BIND = process.env.QBE_RUNNER_BIND ?? '127.0.0.1';
const COMPILE_TIMEOUT_MS = 60_000;
const MAX_SOURCE_BYTES = 1_048_576; // 1 MiB
const DOCKER_IMAGE = process.env.QBE_RUNNER_IMAGE ?? 'qbe-compiler:latest';
const DOCKER_TIMEOUT_S = 90;

// F6: security hardening
const DOCKER_RUNTIME = process.env.QBE_RUNNER_RUNTIME ?? 'runsc';  // gVisor by default
const AUDIT_LOG = '/var/log/qbe-runner/audit.log';
function audit(event) {
  try { appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n'); } catch {}
}

// F4: extended dangerous-keywords list (was: SHELL|KILL|POKE|OUT)
const DANGEROUS_KEYWORDS_RE = /\b(SHELL|KILL|POKE|OUT|SYSTEM|CHAIN|FILES|RUN\s+["']|_OS|_OPENCLIENT|_CONNECT|_HTTPS)\b/i;

// F4: per-IP rate-limit (20 compiles per uur)
const RATE_LIMIT_PER_HOUR = 20;
const RATE_WINDOW_MS = 3_600_000;
const rateBuckets = new Map(); // ip -> [timestamps]

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) ?? []).filter((t) => t > now - RATE_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, retryAfterS: Math.ceil((bucket[0] + RATE_WINDOW_MS - now) / 1000) };
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - bucket.length };
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function logEvent(ev) {
  // Structured JSON log — pipe to journald via systemd
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...ev }));
}

async function handleCompile(req, res) {
  // F4: rate-limit per IP (honor X-Forwarded-For from nginx proxy)
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterS));
    return json(res, 429, { error: 'rate limit exceeded', retryAfterS: limit.retryAfterS, limit: RATE_LIMIT_PER_HOUR, windowMin: 60 });
  }
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

      const sourceHash = createHash('sha256').update(sourceBytes).digest('hex').slice(0, 16);
      logEvent({ event: 'compile-start', sessionId, filename, bytes: sourceBytes.length, sourceHash });
      audit({ event: 'compile', sessionId, ip, filename, bytes: sourceBytes.length, sourceHash });

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
      ...(DOCKER_RUNTIME ? ['--runtime', DOCKER_RUNTIME] : []),
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '1.0',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
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
  // F4: active session count + rate-limit-state
  const activeRunSessions = runSessions.size;
  const trackedIps = rateBuckets.size;
  json(res, 200, {
    service: 'qbe-runner',
    version: '1.0.0-Kemeny',
    milestone: 'v1.0.0-Kemeny F6 (security hardening)',
    docker_image: DOCKER_IMAGE,
    port: PORT,
    bind: BIND,
    rate_limit: `${RATE_LIMIT_PER_HOUR}/hour per IP`,
    active_run_sessions: activeRunSessions,
    tracked_ips: trackedIps,
    sandbox: {
      compile_runtime: DOCKER_RUNTIME || 'runc',
      run_runtime: 'runc (host-network needed for VNC)',
      cap_drop: 'ALL',
      no_new_privileges: true,
    },
    audit_log: AUDIT_LOG,
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

  audit({ event: 'run', sessionId, wsPort, containerName });
  const args = [
    'run', '--rm', '-d',
    // NB: gVisor (runsc) incompat with --network=host. Run-containers gebruiken
    // standaard runc + cap-drop + no-new-privileges voor defense-in-depth.
    '--network', 'host',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--memory', '2g',  // geen --cpus = max host-CPU
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
  audit({ event: 'stop', sessionId, containerName: s.containerName });
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
