#!/bin/sh
# opensearch-init.sh — one-shot init container: index templates + connector registration
# Idempotent: safe to re-run on volume reuse.
set -e

OPENSEARCH_URL="http://opensearch:9200"
CONNECT_URL="http://kafka-connect:8083"
DASHBOARDS_URL="http://opensearch-dashboards:5601"

# ── Wait for OpenSearch ────────────────────────────────────────────────────────
echo "[init] Waiting for OpenSearch at ${OPENSEARCH_URL}..."
until curl -sf "${OPENSEARCH_URL}/_cluster/health" | grep -qE '"status":"(green|yellow)"'; do
  sleep 3
done
echo "[init] OpenSearch is ready."

# ── Index templates ────────────────────────────────────────────────────────────

echo "[init] Creating index template: trading-orders"
curl -sf -X PUT "${OPENSEARCH_URL}/_index_template/trading-orders" \
  -H "Content-Type: application/json" -d '{
  "index_patterns": ["trading-orders*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "dynamic": "true",
      "properties": {
        "ts":               { "type": "date", "format": "epoch_millis" },
        "orderId":          { "type": "keyword" },
        "childId":          { "type": "keyword" },
        "parentOrderId":    { "type": "keyword" },
        "algo":             { "type": "keyword" },
        "asset":            { "type": "keyword" },
        "side":             { "type": "keyword" },
        "strategy":         { "type": "keyword" },
        "timeInForce":      { "type": "keyword" },
        "destinationVenue": { "type": "keyword" },
        "accountId":        { "type": "keyword" },
        "quantity":         { "type": "double" },
        "filledQty":        { "type": "double" },
        "totalFilled":      { "type": "double" },
        "totalQty":         { "type": "double" },
        "remainingQty":     { "type": "double" },
        "limitPrice":       { "type": "double" },
        "marketPrice":      { "type": "double" },
        "avgFillPrice":     { "type": "double" },
        "marketImpactBps":  { "type": "double" },
        "algoUrl":          { "type": "keyword", "index": false }
      }
    }
  }
}'
echo ""

echo "[init] Creating index template: trading-algo"
curl -sf -X PUT "${OPENSEARCH_URL}/_index_template/trading-algo" \
  -H "Content-Type: application/json" -d '{
  "index_patterns": ["trading-algo*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "10s"
    },
    "mappings": {
      "dynamic": "true",
      "properties": {
        "ts":            { "type": "date", "format": "epoch_millis" },
        "algo":          { "type": "keyword" },
        "orderId":       { "type": "keyword" },
        "event":         { "type": "keyword" },
        "asset":         { "type": "keyword" },
        "pendingOrders": { "type": "integer" },
        "numSlices":     { "type": "integer" },
        "quantity":      { "type": "double" },
        "filled":        { "type": "double" }
      }
    }
  }
}'
echo ""

echo "[init] Creating index template: trading-sessions"
curl -sf -X PUT "${OPENSEARCH_URL}/_index_template/trading-sessions" \
  -H "Content-Type: application/json" -d '{
  "index_patterns": ["trading-sessions*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.refresh_interval": "30s"
    },
    "mappings": {
      "dynamic": "true",
      "properties": {
        "ts":     { "type": "date", "format": "epoch_millis" },
        "event":  { "type": "keyword" },
        "userId": { "type": "keyword" }
      }
    }
  }
}'
echo ""

# ── Wait for Kafka Connect ─────────────────────────────────────────────────────
echo "[init] Waiting for Kafka Connect at ${CONNECT_URL}..."
until curl -sf "${CONNECT_URL}/connectors" > /dev/null; do
  sleep 5
done
echo "[init] Kafka Connect is ready."

# ── Register connectors (create or update) ────────────────────────────────────

register_connector() {
  NAME="$1"
  FILE="$2"
  echo "[init] Registering connector: ${NAME}"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${CONNECT_URL}/connectors/${NAME}" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    # Already exists — update its config
    curl -sf -X PUT "${CONNECT_URL}/connectors/${NAME}/config" \
      -H "Content-Type: application/json" \
      -d "$(cat "${FILE}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d["config"]))')"
    echo "[init] Updated connector: ${NAME}"
  else
    curl -sf -X POST "${CONNECT_URL}/connectors" \
      -H "Content-Type: application/json" \
      -d @"${FILE}"
    echo "[init] Created connector: ${NAME}"
  fi
}

register_connector "opensearch-sink-orders"   "/scripts/connectors/connector-orders.json"
register_connector "opensearch-sink-algo"     "/scripts/connectors/connector-algo.json"
register_connector "opensearch-sink-sessions" "/scripts/connectors/connector-sessions.json"

# ── Wait for OpenSearch Dashboards ────────────────────────────────────────────
echo "[init] Waiting for OpenSearch Dashboards at ${DASHBOARDS_URL}..."
until curl -sf "${DASHBOARDS_URL}/api/status" | grep -qE '"state":"(green|yellow)"'; do
  sleep 5
done
echo "[init] OpenSearch Dashboards is ready."

# ── Seed index patterns via Saved Objects API ─────────────────────────────────
for INDEX in trading-orders trading-algo trading-sessions; do
  echo "[init] Creating index pattern: ${INDEX}"
  curl -sf -X POST "${DASHBOARDS_URL}/api/saved_objects/index-pattern/${INDEX}?overwrite=true" \
    -H "Content-Type: application/json" \
    -H "osd-xsrf: true" \
    -d "{
      \"attributes\": {
        \"title\": \"${INDEX}*\",
        \"timeFieldName\": \"ts\"
      }
    }" || echo "[init] Index pattern ${INDEX} already exists — skipped"
  echo ""
done

echo "[init] All done. OpenSearch is seeded, connectors registered, Dashboards configured."
echo "[init] Dashboards URL: ${DASHBOARDS_URL}"
