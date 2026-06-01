#!/bin/sh
# QB64-PE multi-mode entrypoint.
#   MODE=compile (default) — compileert /work/input.bas naar /work/output binary
#   MODE=run    — start Xvfb + binary + x11vnc + websockify, blokkeert tot WS-port-close
set -e

MODE="${MODE:-compile}"

if [ "$MODE" = "compile" ]; then
    cd /opt/qb64pe
    exec ./qb64pe -x /work/input.bas -o /work/output 2>&1
fi

if [ "$MODE" = "run" ]; then
    BINARY="${BINARY:-/work/output}"
    DISPLAY_NUM="${DISPLAY_NUM:-99}"
    VNC_PORT="${VNC_PORT:-5900}"
    WS_PORT="${WS_PORT:-6900}"

    if [ ! -x "$BINARY" ]; then
        echo "ERROR: binary $BINARY not executable" >&2
        exit 1
    fi

    # Start Xvfb (virtual display)
    Xvfb :${DISPLAY_NUM} -screen 0 800x600x24 -ac +extension GLX +render -noreset &
    sleep 0.4

    export DISPLAY=:${DISPLAY_NUM}

    # Start the binary in background
    cd /work
    "$BINARY" &
    sleep 0.3

    # Start x11vnc (localhost-bound — websockify proxies to it)
    x11vnc -display :${DISPLAY_NUM} -rfbport ${VNC_PORT} -nopw -forever -shared -quiet -bg -localhost
    sleep 0.2

    # Foreground websockify — receives WS, proxies to x11vnc, exits when container kills
    exec websockify --heartbeat=30 0.0.0.0:${WS_PORT} 127.0.0.1:${VNC_PORT}
fi

echo "ERROR: unknown MODE=$MODE (expected 'compile' or 'run')" >&2
exit 2
