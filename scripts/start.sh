#!/usr/bin/env bash
# Start PowerContext (if not already running) and the GapCoach app in one terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -x .venv/bin/python ]; then
  echo "还没有 .venv，请先运行 ./scripts/setup.sh"
  exit 1
fi
if [ ! -f .env ]; then
  echo "还没有 .env，正在从 .env.example 生成"
  sed "s|__PROJECT_ROOT__|$ROOT|g" .env.example > .env
fi

# shellcheck disable=SC1091
set -a
. ./.env
set +a

mkdir -p data/logs
PC_PID=""

pc_up() {
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${POWERCONTEXT_SERVER_HTTP_PORT:-18080}/" || return 1
}

if pc_up; then
  echo "==> PowerContext 已在 ${POWERCONTEXT_CLIENT_SERVER_URL:-http://127.0.0.1:18080} 运行"
else
  echo "==> 启动 PowerContext"
  .venv/bin/powercontext server run --env-file .env > data/logs/powercontext.log 2>&1 &
  PC_PID=$!
  trap '[ -n "$PC_PID" ] && kill "$PC_PID" 2>/dev/null || true' EXIT INT TERM
  for _ in $(seq 1 60); do
    if pc_up; then break; fi
    sleep 1
  done
  if ! pc_up; then
    echo "PowerContext 启动失败，查看 data/logs/powercontext.log"
    exit 1
  fi
  echo "==> PowerContext 就绪"
fi

echo "==> 打开 http://${GAPCOACH_HOST:-127.0.0.1}:${GAPCOACH_PORT:-8000}"
exec .venv/bin/uvicorn app.backend.api:app \
  --host "${GAPCOACH_HOST:-127.0.0.1}" \
  --port "${GAPCOACH_PORT:-8000}"
