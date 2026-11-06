#!/usr/bin/env bash
# Create the Python environment and a local .env with absolute paths.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ required"' \
  || { echo "需要 Python 3.11 或更高版本。"; exit 1; }

if [ ! -x .venv/bin/python ]; then
  echo "==> 创建 .venv"
  "$PYTHON" -m venv .venv
fi

echo "==> 安装依赖（首次约 1–3 分钟）"
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt

if [ ! -f .env ]; then
  echo "==> 生成 .env"
  sed "s|__PROJECT_ROOT__|$ROOT|g" .env.example > .env
else
  echo "==> 保留已有 .env（如需重置：mv .env .env.bak 后重跑）"
fi

mkdir -p data/logs data/state data/seekdb
echo
echo "准备完成。下一步："
echo "  ./scripts/start.sh"
echo "然后打开 http://127.0.0.1:8000"
