#!/bin/bash
set -e

COUCHBASE_HOST="${COUCHBASE_HOST:-localhost}"
CLUSTER_ADMIN="${COUCHBASE_ADMIN:-Administrator}"
CLUSTER_PASS="${COUCHBASE_PASS:-Welcome@123}"
APP_USER="${APP_USER:-attendance_backend}"
APP_PASS="${APP_PASS:-Attendance@2026!}"
BUCKET_NAME="attendance_system"
SCOPE_NAME="app"

echo "Connecting to existing Couchbase Server at http://${COUCHBASE_HOST}:8091..."
until curl -s "http://${COUCHBASE_HOST}:8091/ui/index.html" > /dev/null; do
    echo "Waiting for Couchbase Server..."
    sleep 3
done

echo "Ensuring isolated bucket '${BUCKET_NAME}' exists..."
curl -s -u "${CLUSTER_ADMIN}:${CLUSTER_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets" \
    -d "name=${BUCKET_NAME}&bucketType=couchbase&ramQuota=256&authType=none" || true

sleep 3

echo "Ensuring scope '${SCOPE_NAME}' exists..."
curl -s -u "${CLUSTER_ADMIN}:${CLUSTER_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets/${BUCKET_NAME}/scopes" \
    -d "name=${SCOPE_NAME}" || true

sleep 2

for col in users biometrics attendance; do
    echo "Ensuring collection '${col}' exists in scope '${SCOPE_NAME}'..."
    curl -s -u "${CLUSTER_ADMIN}:${CLUSTER_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets/${BUCKET_NAME}/scopes/${SCOPE_NAME}/collections" \
        -d "name=${col}" || true
done

sleep 2

echo "Configuring isolated RBAC user '${APP_USER}'..."
ROLES="data_reader[${BUCKET_NAME}],data_writer[${BUCKET_NAME}],query_select[${BUCKET_NAME}],query_insert[${BUCKET_NAME}],query_update[${BUCKET_NAME}],query_delete[${BUCKET_NAME}],query_manage_index[${BUCKET_NAME}]"
curl -s -u "${CLUSTER_ADMIN}:${CLUSTER_PASS}" -X PUT "http://${COUCHBASE_HOST}:8091/settings/rbac/users/local/${APP_USER}" \
    -d "name=Attendance%20System%20Backend&roles=${ROLES}&password=${APP_PASS}" || true

sleep 2

for col in users biometrics attendance; do
    echo "Ensuring primary index exists for '${col}'..."
    curl -s -u "${APP_USER}:${APP_PASS}" -X POST "http://${COUCHBASE_HOST}:8093/query/service" \
        -H "Content-Type: application/json" \
        -d "{\"statement\":\"CREATE PRIMARY INDEX IF NOT EXISTS ON \\\`${BUCKET_NAME}\\\`.\\\`${SCOPE_NAME}\\\`.\\\`${col}\\\`;\"}" || true
done

echo "Ensuring secondary index 'idx_att_user_time' exists..."
curl -s -u "${APP_USER}:${APP_PASS}" -X POST "http://${COUCHBASE_HOST}:8093/query/service" \
    -H "Content-Type: application/json" \
    -d "{\"statement\":\"CREATE INDEX idx_att_user_time IF NOT EXISTS ON \\\`${BUCKET_NAME}\\\`.\\\`${SCOPE_NAME}\\\`.\\\`attendance\\\`(userId, serverTimestamp DESC);\"}" || true

echo "Attendance database provisioning successfully completed!"
