# Personal Face Recognition Attendance System

An independent, standalone personal mobile attendance application with on-device face recognition using Google ML Kit, MobileFaceNet (TensorFlow Lite), Bun, Hono, and Couchbase Server.

## Architecture Highlights
- **Mobile Client:** Expo SDK 54 / React Native 0.81 (New Architecture).
- **On-Device Biometrics:** Google ML Kit for face detection and validation, MobileFaceNet for 128-D embedding extraction, and cosine similarity matching on-device. Zero raw photo transmission.
- **Backend:** Bun runtime + Hono web framework + Zod validation.
- **Database:** Couchbase Server in Docker with `users`, `biometrics`, and `attendance` collections in `attendance_system.app`.
- **Integrity:** Server-authoritative UTC timestamps, user-timezone date calculations, and deterministic document keys (`att::<userId>::<YYYY-MM-DD>`) preventing duplicate daily submissions.

## Repository Layout
```
lcu_face_attendence/
├── mobile/             # React Native Expo SDK 54 mobile application
├── backend/            # Bun + Hono REST API server
├── infrastructure/     # Docker Compose & Couchbase provisioning
├── docs/               # Architecture and technical specifications
├── .gitignore
└── README.md
```

## Quick Start (Development)

### 1. Database Infrastructure
```bash
cd infrastructure
docker compose up -d
# Run the initialization script once Couchbase starts:
./init-couchbase.sh
```
Couchbase Web Console will be accessible at: `http://localhost:8091`  
- **Username:** `Administrator`  
- **Password:** `password`  
- **Bucket:** `attendance_system`  
- **Scope:** `app`  
- **Collections:** `users`, `biometrics`, `attendance`

### 2. Backend Service
```bash
cd backend
bun install
bun run dev
```
The REST API server will run at `http://localhost:3000`.

### 3. Mobile Application
```bash
cd mobile
bun install # or npm install
# Run on Android development build:
npx expo run:android
```
