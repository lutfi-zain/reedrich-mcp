#!/bin/bash
set -e

LOCAL_PORT=8799
LOCAL_URL="http://localhost:${LOCAL_PORT}"
DEV_SECRET="reedrich_local_dev_jwt_secret_9948271038571204"
PG_TEST_URL="postgres://postgres:3c412f0353f1ec974266c3613f9f9500@127.0.0.1:5432/reedrich_test"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Reedrich MCP — Local PostgreSQL Integration Test (E2E)    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 1. Reset local PostgreSQL test database
echo "📦 Resetting local PostgreSQL test database (reedrich_test)..."
docker exec postgres-primary psql -U postgres -d reedrich_test -c "TRUNCATE users, wallets, categories, budgets, recurring_templates, transactions, debts_loans, feedbacks, goals, goal_wallets CASCADE;" > /dev/null 2>&1 || true
echo "✅ Local PostgreSQL test database ready."
echo ""

# Kill any lingering process on the port before starting
pkill -9 -f "wrangler.*${LOCAL_PORT}" > /dev/null 2>&1 || true
pkill -9 -f "workerd.*${LOCAL_PORT}" > /dev/null 2>&1 || true
sleep 1

# 2. Start wrangler dev in background with Hyperdrive local connection string
echo "🚀 Starting wrangler dev on port ${LOCAL_PORT}..."
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="${PG_TEST_URL}" \
WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="${PG_TEST_URL}" \
DATABASE_URL="${PG_TEST_URL}" \
npx wrangler dev --port ${LOCAL_PORT} --ip 127.0.0.1 > /tmp/wrangler_local_dev.log 2>&1 &
DEV_PID=$!

# Ensure cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping local wrangler dev (PID: ${DEV_PID})..."
  kill -9 $DEV_PID 2>/dev/null || true
  pkill -9 -f "wrangler.*${LOCAL_PORT}" 2>/dev/null || true
  pkill -9 -f "workerd.*${LOCAL_PORT}" 2>/dev/null || true
}
trap cleanup EXIT

# 3. Wait for local server readiness
echo "⏳ Waiting for local server at ${LOCAL_URL}..."
MAX_RETRIES=20
COUNT=0
until curl -s -o /dev/null -w "%{http_code}" "${LOCAL_URL}/health" | grep -q "200"; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Local server failed to start within ${MAX_RETRIES} seconds."
    cat /tmp/wrangler_local_dev.log
    exit 1
  fi
done
echo "✅ Local server is healthy and responding on ${LOCAL_URL}!"
echo ""

# 4. Run integration tests against local server
echo "🧪 Running full E2E user journey against Local PostgreSQL..."
echo ""
WORKER_URL="${LOCAL_URL}" JWT_SECRET="${DEV_SECRET}" DATABASE_URL="${PG_TEST_URL}" npx tsx --test tests/integration.test.ts
TEST_EXIT=$?
echo ""

# 5. Cleanup test data from local PostgreSQL (unless KEEP_DATA=1)
if [ "$KEEP_DATA" = "1" ]; then
  echo "ℹ️  KEEP_DATA=1 detected. Skipping teardown/cleanup so test data stays in Local DB."
else
  echo "🧹 Cleaning up test data from local PostgreSQL..."
  docker exec postgres-primary psql -U postgres -d reedrich_test -c "TRUNCATE users, wallets, categories, budgets, recurring_templates, transactions, debts_loans, feedbacks, goals, goal_wallets CASCADE;" > /dev/null 2>&1 || true
fi

if [ $TEST_EXIT -eq 0 ]; then
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ✅ Local PostgreSQL integration tests PASSED!            ║"
  echo "╚════════════════════════════════════════════════════════════╝"
else
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ❌ Local PostgreSQL integration tests FAILED (code: ${TEST_EXIT}) ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit $TEST_EXIT
fi
