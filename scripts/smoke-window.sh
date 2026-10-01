#!/usr/bin/env bash
set -euo pipefail

# This wrapper controls only the avatar host. It deliberately does not invoke
# omarchy-shell, so status/start cannot create a second desktop shell.
ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
RUNTIME_DIR=${XDG_RUNTIME_DIR:-${ROOT_DIR}/.oma-runtime}/oma-avatar
PID_FILE=${OMA_AVATAR_PID_FILE:-${RUNTIME_DIR}/window.pid}
LOG_FILE=${OMA_AVATAR_LOG_FILE:-${RUNTIME_DIR}/window.log}
HOST_BIN=${OMA_AVATAR_HOST_BIN:-${ROOT_DIR}/src-tauri/target/debug/oma-avatar-host}

mkdir -p "$RUNTIME_DIR"

read_pid() {
    [[ -s "$PID_FILE" ]] || return 1
    local pid
    pid=$(<"$PID_FILE")
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    printf '%s\n' "$pid"
}

running_pid() {
    local pid
    pid=$(read_pid 2>/dev/null) || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    printf '%s\n' "$pid"
}

status() {
    local pid
    if pid=$(running_pid); then
        printf 'running (pid %s)\n' "$pid"
        return 0
    fi
    rm -f -- "$PID_FILE"
    printf 'stopped\n'
    return 1
}

start() {
    if pid=$(running_pid); then
        printf 'already running (pid %s)\n' "$pid"
        return 0
    fi
    rm -f -- "$PID_FILE"
    [[ -x "$HOST_BIN" ]] || { printf 'host binary not found or not executable: %s\n' "$HOST_BIN" >&2; return 2; }
    "$HOST_BIN" >>"$LOG_FILE" 2>&1 &
    local pid=$!
    printf '%s\n' "$pid" >"$PID_FILE"
    sleep 0.2
    if kill -0 "$pid" 2>/dev/null; then
        printf 'started (pid %s)\n' "$pid"
        return 0
    fi
    rm -f -- "$PID_FILE"
    printf 'host exited during startup; see %s\n' "$LOG_FILE" >&2
    return 1
}

stop() {
    local pid
    if ! pid=$(running_pid); then
        rm -f -- "$PID_FILE"
        printf 'already stopped\n'
        return 0
    fi
    kill -TERM "$pid"
    for _ in {1..50}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f -- "$PID_FILE"
    printf 'stopped (pid %s)\n' "$pid"
}

case "${1:-status}" in
    start) start ;;
    stop) stop ;;
    status) status || true ;;
    *) printf 'usage: %s {start|stop|status}\n' "$0" >&2; exit 2 ;;
esac
