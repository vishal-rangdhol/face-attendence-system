# Infrastructure: Couchbase Server Configuration

This directory contains the configuration and provisioning scripts for the Standalone Personal Face Recognition Attendance System.

## Architecture & Container Re-use
Per infrastructure requirements, the attendance project **reuses the existing Couchbase Server Enterprise instance** (`lcu-couchbase`) already running on your machine for the LET'S CATCH UP project, rather than running a redundant second container.

### Complete Logical Isolation from LCU:
- **Dedicated Bucket:** `attendance_system` (256 MB RAM quota)
- **Dedicated Scope:** `app`
- **Dedicated Collections:** `users`, `biometrics`, `attendance`
- **Dedicated RBAC User:** `attendance_backend` (password: `Attendance@2026!`)
- **Strict Role Boundaries:** The `attendance_backend` user only possesses data and query privileges on `attendance_system`. It has **zero access to the `lcu-kcs-dev` bucket**.

## Provisioning / Verification

Ensure the `lcu-couchbase` Docker container is running, then run the idempotent setup script:

```powershell
# Windows PowerShell
cd V:\lcu_face_attendence\infrastructure
.\init-couchbase.ps1

# Or on Linux / macOS:
./init-couchbase.sh
```

## Backend Environment Configuration (`backend/.env`)
```env
PORT=3000
COUCHBASE_HOST=localhost
COUCHBASE_QUERY_PORT=8093
COUCHBASE_ADMIN_PORT=8091
COUCHBASE_USER=attendance_backend
COUCHBASE_PASS=Attendance@2026!
COUCHBASE_BUCKET=attendance_system
COUCHBASE_SCOPE=app
DEFAULT_SIMILARITY_THRESHOLD=0.88
```
