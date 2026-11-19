# Infrastructure: Couchbase Server Setup

This directory contains the Docker Compose environment and initialization scripts for running a standalone Couchbase Server instance for the Personal Face Recognition Attendance System.

## Architecture & Configuration
- **Container Name:** `lcu_couchbase_server`
- **Image:** `couchbase/server:community-7.6.2`
- **Web UI & REST API Port:** `8091`
- **N1QL Query REST API Port:** `8093`
- **Data (KV) Port:** `11210`
- **Default Credentials:**
  - Username: `Administrator`
  - Password: `password`
- **Bucket:** `attendance_system`
- **Scope:** `app`
- **Collections:**
  - `users`: User registration and profile details
  - `biometrics`: 128-D face embedding vectors and consent records
  - `attendance`: Date-partitioned attendance records

## Starting Couchbase

```bash
# 1. Start Couchbase in the background
docker compose up -d

# 2. Run initialization script (Linux / macOS)
chmod +x init-couchbase.sh
./init-couchbase.sh

# Or on Windows PowerShell:
.\init-couchbase.ps1
```

Once initialized, you can log in to `http://localhost:8091` to monitor queries, documents, and bucket health.
