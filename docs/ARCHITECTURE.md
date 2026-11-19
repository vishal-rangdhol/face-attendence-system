# Architecture & System Design Document
## Standalone Personal Face Recognition Attendance System

**Version:** 1.0.0  
**Target:** Expo SDK 54 / React Native 0.81 | Bun + Hono | Couchbase Server 7.x  
**Author:** Lead Software Architect & Senior Full-Stack Developer  

---

## 1. System Overview & Core Objectives

The Standalone Personal Face Recognition Attendance System is an independent, single-user attendance logging tool designed for mobile devices. It allows an individual to:
1. Register with their name and generate a local identity.
2. Enroll their biometric face embedding using the mobile camera.
3. Verify their face and mark daily attendance.
4. Review their personal attendance history.

This is strictly a personal utility—there are no enterprise hierarchies, supervisor approvals, employee roles, GPS geofencing, or external authentication providers (e.g., OAuth, JWT, LDAP).

---

## 2. Security & Trust Model Analysis

### 2.1 Threat Model & Security Limitations
In this personal attendance system prototype, there are no passwords, OAuth tokens, or JWTs. The mobile client generates or receives a `userId` upon initial registration and interacts with the backend REST APIs.

> [!WARNING]
> **Client-Side Face Verification Security Limitation**
> - Face detection and recognition are executed **on-device** to protect biometric privacy (avoiding the transmission or storage of raw photographs).
> - In the absence of server-side biometric verification or hardware-backed attestation (such as Android SafetyNet/Play Integrity or iOS DeviceCheck with cryptographic signing), the client-submitted payload (e.g., `verifiedOnDevice: true`, `similarityScore: 0.92`) **CANNOT be treated as cryptographic proof of identity or non-repudiation**.
> - An actor with direct network access to the backend could theoretically craft and dispatch a `POST /api/attendance` payload directly.
> - **Design Decision:** For this personal attendance prototype, on-device verification serves as a **local integrity and personal accountability gate**, not an adversarial anti-fraud or organizational non-repudiation mechanism. Future enterprise extensions would require server-side cryptographic attestation, hardware enclave signing, or centralized biometric matching.

### 2.2 Server-Authoritative Integrity Boundaries
To maintain consistency and prevent abuse within the personal model:
1. **Server-Generated UTC Timestamps:** The client's clock is never trusted for attendance recording. The backend generates `serverTimestamp` in UTC (`toISOString()`).
2. **Timezone-Aware Date Partitioning:** The user's configured timezone (e.g., `Asia/Kolkata`, `America/New_York`, `UTC`) is sent alongside the attendance submission (or stored in the user profile). The backend converts the UTC server timestamp to the user's local date (`YYYY-MM-DD`).
3. **Atomic Single-Entry Enforcement:** The attendance document key is deterministic: `att::<userId>::<YYYY-MM-DD>`. The server attempts an atomic insert; if a record already exists for that user on that local calendar day, the operation is rejected.
4. **Biometric Decoupling:** Biometric embeddings (128-D float arrays) are stored in a dedicated `biometrics` collection, distinct from user profiles and attendance history. Users can delete their biometric enrollment at any time without deleting their historical attendance records.

---

## 3. Technology Stack & Compatibility Evaluation

### 3.1 Mobile Architecture (Expo SDK 54 + React Native 0.81)
- **Expo SDK 54 / React Native 0.81 (New Architecture):**
  - Requires **Expo Development Builds** (`expo-dev-client`). Standard Expo Go cannot run native C++ ML Kit or TensorFlow Lite binaries.
- **Camera Capture (`expo-camera`):**
  - `expo-camera` (`CameraView`) is utilized in a "guided snapshot" pattern. An on-screen oval guide helps the user frame their face, after which a still image is captured for processing.
- **Face Detection (Google ML Kit):**
  - Google ML Kit native face detection assesses face presence, bounding box coordinates $(x, y, w, h)$, and Euler angles (Pitch, Yaw, Roll).
  - Validation Gates: Exactly 1 face detected, pitch/yaw $\le \pm 15^\circ$, roll $\le \pm 10^\circ$, face area $\ge 25\%$ of viewport, eyes open probability $> 0.5$.
- **TensorFlow Lite & MobileFaceNet (`react-native-fast-tflite`):**
  - Leverages Nitro Modules for zero-copy memory access with React Native New Architecture.
  - Bundles `mobilefacenet.tflite` as a local asset via Metro configuration.
  - Image Preprocessing: `expo-image-manipulator` crops the face bounding box and resizes it to $112 \times 112$ pixels. A lightweight pixel extractor normalizes RGB values to floating-point numbers: $(pixel - 127.5) / 128.0$.
  - Output: 128-dimensional L2-normalized float embedding.
- **Cosine Similarity Engine:**
  - On-device 1:1 vector dot product: $\text{similarity} = \sum_{i=0}^{127} u_i \cdot v_i$.
  - **Configurable Threshold:** Default baseline is set to `0.88`, exposed via application configuration for experimental calibration.

### 3.2 Backend Architecture (Bun + Hono)
- **Runtime:** Bun 1.4+ (high-speed native TypeScript runtime).
- **Framework:** Hono (lightweight, zero-overhead router and middleware).
- **Validation:** Zod schemas for strict request payload validation.
- **Scope Integrity:** Strictly personal endpoints: `/api/users`, `/api/biometrics`, `/api/attendance`. No Redis, no JWT, no role guards.

### 3.3 Database Architecture (Couchbase Server 7.x)
- Single-node Couchbase Server running inside Docker Compose.
- Structured with Bucket: `attendance_system`, Scope: `app`, and Collections:
  1. `users` — basic profile metadata (`id`, `name`, `timezone`, `createdAt`).
  2. `biometrics` — 128-D float embedding, model version, consent record.
  3. `attendance` — date, server UTC timestamp, similarity score, verification status.

#### Couchbase Access Strategy (Ottoman vs. N1QL REST vs. SDK)
- **Ottoman ODM Evaluation:** Ottoman ODM requires the C++ native `couchbase` Node-API package, which causes segmentation faults and memory unbinding issues under Bun.
- **Validated Operational Model:**
  1. We execute operations via Couchbase's N1QL Query Service (`http://couchbase:8093/query/service`).
  2. **Atomic Document Insertion:**
     ```sql
     INSERT INTO `attendance_system`.`app`.`attendance` (KEY, VALUE)
     VALUES ($key, $document)
     ```
     If `$key` already exists, Couchbase rejects the operation with error code `12009` / `4300` (Key already exists), guaranteeing atomicity without distributed locks or Redis.
  3. **Direct Key Retrieval:**
     ```sql
     SELECT t.* FROM `attendance_system`.`app`.`attendance` t USE KEYS $key
     ```
     `USE KEYS` operates directly via Couchbase's internal key index in sub-millisecond time.
  4. **Atomic Deletion / Upsert:**
     ```sql
     DELETE FROM `attendance_system`.`app`.`biometrics` USE KEYS $key
     ```

---

## 4. Data Models & Schemas

### 4.1 User Document (`users` collection)
**Key:** `usr::<userId>`
```typescript
interface UserDocument {
  id: string;               // e.g. "usr_9d8f7e6a"
  type: "user";
  name: string;             // User's self-registered name
  timezone: string;         // IANA timezone identifier, e.g. "Asia/Kolkata", "America/New_York"
  hasBiometrics: boolean;   // Quick flag indicating active enrollment
  createdAt: string;        // ISO 8601 UTC
  updatedAt: string;        // ISO 8601 UTC
}
```

### 4.2 Biometric Enrollment Document (`biometrics` collection)
**Key:** `bio::<userId>`
```typescript
interface BiometricDocument {
  id: string;               // e.g. "bio_usr_9d8f7e6a"
  userId: string;           // References user.id
  type: "biometric";
  embedding: number[];      // Exactly 128 float32 values
  embeddingDimension: 128;
  modelVersion: string;     // e.g. "MobileFaceNet-v1"
  consentGranted: boolean;  // Explicit consent flag
  consentTimestamp: string; // ISO 8601 UTC
  enrolledAt: string;       // ISO 8601 UTC
}
```

### 4.3 Attendance Document (`attendance` collection)
**Key:** `att::<userId>::<YYYY-MM-DD>` *(Deterministic key ensures one entry per calendar day in user timezone)*
```typescript
interface AttendanceDocument {
  id: string;               // e.g. "att::usr_9d8f7e6a::2026-11-19"
  type: "attendance";
  userId: string;
  date: string;             // "YYYY-MM-DD" in user's configured timezone
  serverTimestamp: string;  // Authoritative ISO 8601 UTC timestamp
  status: "PRESENT";
  similarityScore: number;  // Matching score reported by on-device model (e.g. 0.912)
  verifiedOnDevice: boolean;// Local integrity flag
}
```

---

## 5. Repository & Monorepo Structure

```
lcu_face_attendence/
├── mobile/                      # Expo SDK 54 / React Native 0.81 App
│   ├── assets/
│   │   ├── models/              # mobilefacenet.tflite
│   │   └── icon.png
│   ├── src/
│   │   ├── components/          # Reusable UI widgets
│   │   ├── screens/             # Register, Enroll, Verify, History
│   │   ├── services/            # ML Kit, TFLite, biometrics, API client
│   │   ├── types/               # Mobile TypeScript interfaces
│   │   └── config/              # Configurable thresholds & server endpoints
│   ├── app.json                 # Expo config plugin definitions
│   ├── metro.config.js          # .tflite Metro asset resolver
│   ├── package.json
│   └── tsconfig.json
├── backend/                     # Bun + Hono REST API
│   ├── src/
│   │   ├── db/                  # Couchbase N1QL query client
│   │   ├── routes/              # /api/users, /api/biometrics, /api/attendance
│   │   ├── models/              # Zod validation schemas & TS interfaces
│   │   ├── services/            # Timezone-aware date calculation & duplicate checks
│   │   └── index.ts             # Hono app server entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── infrastructure/              # Couchbase Docker Environment
│   ├── docker-compose.yml       # Couchbase Server container definition
│   ├── init-couchbase.sh        # Provisioning script for bucket, scope & collections
│   └── README.md
├── docs/                        # Architecture, tests & milestone logs
│   └── ARCHITECTURE.md
├── .gitignore
└── README.md
```

---

## 6. Implementation Milestones

- **MS1 (Current): Scaffolding & Infrastructure**
  - Monorepo folder initialization and root `.gitignore`.
  - Backend project initialization with Bun + Hono + Zod + Couchbase client.
  - Infrastructure configuration with `docker-compose.yml` and automated initialization script.
  - Mobile project initialization with Expo SDK 54, React Native 0.81, TypeScript, Metro `.tflite` support, and base navigation.
- **MS2: Camera Integration & ML Kit Face Detection**
  - Camera integration using `expo-camera` (`CameraView`) with custom face guide overlay.
  - Google ML Kit face detection module integration and capture quality gate validation.
- **MS3: MobileFaceNet TFLite Inference & Enrollment**
  - Fast-TFLite model loading (`mobilefacenet.tflite`).
  - Face crop + $112 \times 112$ resize + RGB normalization pipeline.
  - 128-D embedding extraction, consent capture, and local/remote enrollment storage.
- **MS4: On-Device Face Recognition & Matching Engine**
  - Cosine similarity matching module with configurable experimental threshold (default: 0.88).
  - Real-time/capture verification workflow with instant visual and audio feedback.
- **MS5: Backend Attendance API & Atomic Duplicate Prevention**
  - Endpoints for user creation, biometric synchronization/deletion, and attendance logging.
  - Server-side UTC timestamping, timezone-adjusted date calculation, and Couchbase atomic duplicate rejection.
- **MS6: Attendance History & Reporting**
  - History screen with chronological list, present badges, and attendance summary metrics.
  - Backend query endpoint for paginated/range history retrieval.
- **MS7: Physical Device Testing, Calibration & MVP Stabilization**
  - Expo Development Build execution on physical Android hardware.
  - Verification threshold calibration under varied lighting and pose angles.
  - End-to-end security check, biometric deletion verification, and stabilization.
