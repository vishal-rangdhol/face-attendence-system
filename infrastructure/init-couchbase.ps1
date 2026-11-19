param(
    [string]$CouchbaseHost = "localhost",
    [string]$AdminUser = "Administrator",
    [string]$AdminPass = "password"
)

$BucketName = "attendance_system"
$ScopeName = "app"

Write-Host "Waiting for Couchbase Server at http://${CouchbaseHost}:8091..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
$online = $false

while (-not $online -and $attempt -lt $maxAttempts) {
    try {
        $res = Invoke-WebRequest -Uri "http://${CouchbaseHost}:8091/ui/index.html" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($res.StatusCode -eq 200) { $online = $true; break }
    } catch {
        # Waiting
    }
    $attempt++
    Write-Host "Attempt $attempt/$maxAttempts - Couchbase starting up, waiting 4s..."
    Start-Sleep -Seconds 4
}

if (-not $online) {
    Write-Error "Couchbase failed to come online within timeout."
    exit 1
}

Write-Host "Couchbase web UI is online. Initializing cluster nodes and credentials..." -ForegroundColor Green

# 1. Setup path
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/nodes/self/controller/settings" -Method Post -Body "path=%2Fopt%2Fcouchbase%2Fvar%2Flib%2Fcouchbase%2Fdata&index_path=%2Fopt%2Fcouchbase%2Fvar%2Flib%2Fcouchbase%2Fdata" -ErrorAction SilentlyContinue | Out-Null

# 2. Setup services
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/node/controller/setupServices" -Method Post -Body "services=kv%2Cn1ql%2Cindex" -ErrorAction SilentlyContinue | Out-Null

# 3. Memory quotas
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default" -Method Post -Body "memoryQuota=300&indexMemoryQuota=300" -ErrorAction SilentlyContinue | Out-Null

# 4. Administrator credentials
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/settings/web" -Method Post -Body "username=${AdminUser}&password=${AdminPass}&port=8091" -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 4

$base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${AdminUser}:${AdminPass}"))
$headers = @{ Authorization = "Basic $base64Auth" }

# 5. Create bucket
Write-Host "Creating bucket '${BucketName}'..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets" -Method Post -Headers $headers -Body "name=${BucketName}&bucketType=couchbase&ramQuota=256&authType=none" -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 5

# 6. Create scope
Write-Host "Creating scope '${ScopeName}'..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets/${BucketName}/scopes" -Method Post -Headers $headers -Body "name=${ScopeName}" -ErrorAction SilentlyContinue | Out-Null

# 7. Create collections
$collections = @("users", "biometrics", "attendance")
foreach ($col in $collections) {
    Write-Host "Creating collection '${col}'..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets/${BucketName}/scopes/${ScopeName}/collections" -Method Post -Headers $headers -Body "name=${col}" -ErrorAction SilentlyContinue | Out-Null
}

Start-Sleep -Seconds 3

# 8. Create primary indexes
foreach ($col in $collections) {
    Write-Host "Creating primary index for '${col}'..." -ForegroundColor Cyan
    $body = @{ statement = "CREATE PRIMARY INDEX IF NOT EXISTS ON `${BucketName}`.`${ScopeName}`.`${col}`;" }
    Invoke-RestMethod -Uri "http://${CouchbaseHost}:8093/query/service" -Method Post -Headers $headers -Body $body -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "Couchbase initialization successfully completed!" -ForegroundColor Green
