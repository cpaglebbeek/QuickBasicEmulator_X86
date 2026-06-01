// qbe-runner — v1.0.0-Kemeny F1 backend skeleton
//
// Endpoint: POST /api/compile  (multipart/form-data, field "source" = .bas file)
// Spawns a Docker container with QB64-PE, compiles the BAS, returns the result.
//
// v0.5.0-Hopper (this file) is the first iteration: accepts upload, runs docker,
// returns stdout/stderr + exit code. No GUI / Xvfb / noVNC yet — that's F2.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  const workdir = mkdtempSync(path.join(tmpdir(), `qbe-${sessionId}-`));

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
        next: hasBin ? `F2: spawn x11vnc-container with binary (not yet implemented)` : null,
      });

      // Cleanup after returning response (binary lives until next gc-cycle in F2)
      setTimeout(() => rmSync(workdir, { recursive: true, force: true }), 60_000);
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
      '--read-only',
      '--tmpfs', '/tmp:rw,size=64m',
      '--name', `qbe-${sessionId}`,
      '--user', 'qbe:qbe',
      '-v', `${workdir}:/work`,
      '--workdir', '/work',
      DOCKER_IMAGE,
      '-c', '/work/input.bas', '-o', '/work/output',
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

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return handleHealth(req, res);
  if (req.method === 'POST' && req.url === '/api/compile') return handleCompile(req, res);
  json(res, 404, { error: 'not found', endpoints: ['GET /api/health', 'POST /api/compile'] });
});

server.listen(PORT, BIND, () => {
  logEvent({ event: 'startup', port: PORT, bind: BIND, image: DOCKER_IMAGE });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
