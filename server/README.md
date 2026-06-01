# qbe-runner — Native QB64-PE Compile-as-a-Service

v1.0.0-Kemeny F1 backend (codename **v0.5.0-Hopper** for this server component).

## Doel

Accepteert `.bas`-uploads via HTTP, compileert binnen Docker-sandbox met vendored QB64-PE, retourneert exit-code + stdout/stderr + (in F2) reference naar VNC-stream URL.

## Architectuur

```
Client ── HTTPS POST /api/compile ──→ qbe-runner (Node :4001 localhost)
                                            │
                                            └──→ docker run --rm --network=none
                                                  --memory 256m --cpus 1.0
                                                  --read-only --user qbe:qbe
                                                  -v /tmp/qbe-XYZ:/work
                                                  qbe-compiler:latest
                                                  -c /work/input.bas -o /work/output
```

## Installatie op HC55

```bash
# 1. Sync repo + npm install
rsync -avz server/ horsecloud55:/opt/qbe-runner/
ssh horsecloud55 'cd /opt/qbe-runner && npm install --production'

# 2. Build Docker image (10-20 min eerste keer)
ssh horsecloud55 'cd /opt/qbe-runner && docker build -t qbe-compiler:latest .'

# 3. Systemd unit
ssh horsecloud55 'cp /opt/qbe-runner/qbe-runner.service /etc/systemd/system/ \
  && systemctl daemon-reload && systemctl enable --now qbe-runner'

# 4. Verify
ssh horsecloud55 'curl -s http://127.0.0.1:4001/api/health | jq'
```

## Endpoints

### `GET /api/health`
Returns service-info + version.

### `POST /api/compile`
Multipart `source` field met `.bas`-file. Max 1MB. Forbidden keywords: SHELL/KILL/POKE/OUT.

Response:
```json
{
  "sessionId": "uuid",
  "ok": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "binSize": 1384912,
  "durationMs": 12345
}
```

## Roadmap

- **v0.5.0-Hopper** (F1, this): backend skeleton, Docker sandbox, compile-only
- **v0.6.0-Lampson** (F2): Xvfb + x11vnc + websockify per session, returns VNC websocket-URL
- **v0.7.0** (F3): frontend integration in `_Web/native/`
- **v1.0.0-Kemeny** (F4 + polish): keyboard/mouse via VNC + production-ready

## Security

- Docker sandbox: `--network none`, `--memory 256m`, `--cpus 1.0`, `--read-only`, `--user qbe:qbe`
- Source-validation: dangerous keywords (SHELL/KILL/POKE/OUT) rejected pre-flight
- Source-size: 1MB limit
- Compile-timeout: 60s
- Rate-limit per IP: planned F4

## Licentie

AGPL-3.0-or-later.
