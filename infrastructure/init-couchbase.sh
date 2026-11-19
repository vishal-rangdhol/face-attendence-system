#!/bin/bash
set -e

COUCHBASE_HOST="${COUCHBASE_HOST:-localhost}"
ADMIN_USER="${COUCHBASE_USER:-Administrator}"
ADMIN_PASS="${COUCHBASE_PASS:-password}"
BUCKET_NAME="attendance_system"
SCOPE_NAME="app"

echo "Waiting for Couchbase Server at http://${COUCHBASE_HOST}:8091..."
until curl -s "http://${COUCHBASE_HOST}:8091/ui/index.html" > /dev/null; do
    echo "Couchbase is starting up, waiting 5 seconds..."
    sleep 5
done

echo "Couchbase web UI is online. Initializing cluster nodes and credentials..."
# 1. Initialize cluster node settings
curl -s -X POST "http://${COUCHBASE_HOST}:8091/nodes/self/controller/settings" \
    -d "path=%2Fopt%2Fcouchbase%2Fvar%2Flib%2Fcouchbase%2Fdata&index_path=%2Fopt%2Fcouchbase%2Fvar%2Flib%2Fcouchbase%2Fdata" || true

# 2. Setup services (kv, n1ql, index)
curl -s -X POST "http://${COUCHBASE_HOST}:8091/node/controller/setupServices" \
    -d "services=kv%2Cn1ql%2Cindex" || true

# 3. Setup memory quotas
curl -s -X POST "http://${COUCHBASE_HOST}:8091/pools/default" \
    -d "memoryQuota=300&indexMemoryQuota=300" || true

# 4. Setup administrator credentials
curl -s -X POST "http://${COUCHBASE_HOST}:8091/settings/web" \
    -d "username=${ADMIN_USER}&password=${ADMIN_PASS}&port=8091" || true

echo "Waiting 5 seconds for cluster initialization..."
sleep 5

# 5. Create bucket
echo "Creating bucket '${BUCKET_NAME}'..."
curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets" \
    -d "name=${BUCKET_NAME}&bucketType=couchbase&ramQuota=256&authType=none" || true

echo "Waiting 5 seconds for bucket '${BUCKET_NAME}' to become ready..."
sleep 5

# 6. Create scope
echo "Creating scope '${SCOPE_NAME}'..."
curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets/${BUCKET_NAME}/scopes" \
    -d "name=${SCOPE_NAME}" || true

# 7. Create collections
for col in users biometrics attendance; do
    echo "Creating collection '${col}' in scope '${SCOPE_NAME}'..."
    curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -X POST "http://${COUCHBASE_HOST}:8091/pools/default/buckets/${BUCKET_NAME}/scopes/${SCOPE_NAME}/collections" \
        -d "name=${col}" || true
done

echo "Waiting 3 seconds before creating primary indexes..."
sleep 3

# 8. Create primary indexes on each collection for N1QL queries
for col in users biometrics attendance; do
    echo "Creating primary index for collection '${col}'..."
    curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -X POST "http://${COUCHBASE_HOST}:8093/query/service" \
        -d "statement=CREATE PRIMARY INDEX IF NOT EXISTS ON \`${BUCKET_NAME}\`.\`${SCOPE_NAME}\`.\`${col}\`;" || true
done

# 9. Create secondary index for efficient user attendance history queries
echo "Creating secondary index 'idx_att_user_time' on attendance collection..."
curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" -X POST "http://${COUCHBASE_HOST}:8093/query/service" \
    -d "statement=CREATE INDEX idx_att_user_time IF NOT EXISTS ON \`${BUCKET_NAME}\`.\`${SCOPE_NAME}\`.\`attendance\`(userId, serverTimestamp DESC);" || true

echo "Couchbase initialization successfully completed!"
