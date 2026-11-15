#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js LTS from nodejs.org, then try again."
  exit 1
fi
exec node tools/run.js dev "$@"
