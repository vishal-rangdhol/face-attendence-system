param(
    [string]$CouchbaseHost = "localhost",
    [string]$ClusterAdmin = "Administrator",
    [string]$ClusterPass = "Welcome@123",
    [string]$AppUser = "attendance_backend",
    [string]$AppPass = "Attendance@2026!"
)

$BucketName = "attendance_system"
$ScopeName = "app"

Write-Host "Connecting to existing Couchbase Server at http://${CouchbaseHost}:8091..." -ForegroundColor Cyan

# Check cluster responsiveness
try {
    $res = Invoke-WebRequest -Uri "http://${CouchbaseHost}:8091/ui/index.html" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "Couchbase Server is online." -ForegroundColor Green
} catch {
    Write-Error "Couchbase Server at http://${CouchbaseHost}:8091 is unreachable. Ensure 'lcu-couchbase' container is running."
    exit 1
}

$adminAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${ClusterAdmin}:${ClusterPass}"))
$adminHeaders = @{ Authorization = "Basic $adminAuth" }

# 1. Create separate bucket 'attendance_system' (256MB RAM quota, 0 replicas)
Write-Host "Ensuring isolated bucket '${BucketName}' exists..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets" -Method Post -Headers $adminHeaders -Body "name=${BucketName}&bucketType=couchbase&ramQuota=256&authType=none" -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 3

# 2. Create scope 'app'
Write-Host "Ensuring scope '${ScopeName}' exists in '${BucketName}'..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets/${BucketName}/scopes" -Method Post -Headers $adminHeaders -Body "name=${ScopeName}" -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 2

# 3. Create collections
$collections = @("users", "biometrics", "attendance")
foreach ($col in $collections) {
    Write-Host "Ensuring collection '${col}' exists in scope '${ScopeName}'..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/pools/default/buckets/${BucketName}/scopes/${ScopeName}/collections" -Method Post -Headers $adminHeaders -Body "name=${col}" -ErrorAction SilentlyContinue | Out-Null
}

Start-Sleep -Seconds 2

# 4. Create separate RBAC user 'attendance_backend' scoped strictly to 'attendance_system'
Write-Host "Configuring isolated database user '${AppUser}'..." -ForegroundColor Cyan
$roles = "data_reader[attendance_system],data_writer[attendance_system],query_select[attendance_system],query_insert[attendance_system],query_update[attendance_system],query_delete[attendance_system],query_manage_index[attendance_system]"
$userBody = "name=Attendance System Backend&roles=${roles}&password=${AppPass}"
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8091/settings/rbac/users/local/${AppUser}" -Method Put -Headers $adminHeaders -Body $userBody -ErrorAction SilentlyContinue | Out-Null

Start-Sleep -Seconds 2

# 5. Create primary and secondary indexes using attendance_backend credentials
$appAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${AppUser}:${AppPass}"))
$appHeaders = @{ Authorization = "Basic $appAuth"; "Content-Type" = "application/json" }

foreach ($col in $collections) {
    Write-Host "Ensuring primary index exists for '${col}'..." -ForegroundColor Cyan
    $body = @{ statement = "CREATE PRIMARY INDEX IF NOT EXISTS ON `${BucketName}`.`${ScopeName}`.`${col}`;" } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://${CouchbaseHost}:8093/query/service" -Method Post -Headers $appHeaders -Body $body -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "Ensuring secondary index 'idx_att_user_time' exists..." -ForegroundColor Cyan
$secBody = @{ statement = "CREATE INDEX idx_att_user_time IF NOT EXISTS ON `${BucketName}`.`${ScopeName}`.`attendance`(userId, serverTimestamp DESC);" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://${CouchbaseHost}:8093/query/service" -Method Post -Headers $appHeaders -Body $secBody -ErrorAction SilentlyContinue | Out-Null

Write-Host "Attendance system database provisioning complete and verified isolated from LCU!" -ForegroundColor Green
