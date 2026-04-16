#!/bin/bash
set -e

# Build and start API server in background on port 8080
echo "Building API server..."
cd /home/runner/workspace/artifacts/api-server
pnpm run build

echo "Starting API server on port 8080..."
PORT=8080 node --enable-source-maps ./dist/index.mjs &
API_PID=$!

# Start frontend on port 5000
echo "Starting frontend on port 5000..."
cd /home/runner/workspace/artifacts/mandimind
PORT=5000 pnpm run dev

# If frontend exits, kill the API server
kill $API_PID 2>/dev/null || true
