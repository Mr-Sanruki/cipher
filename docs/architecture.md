# Cipher Pro – Architecture Overview

This repository is a monorepo-style project with two independently runnable apps:

- `cipher-frontend/` – React Native (Expo) mobile client using Expo Router
- `cipher-backend/` – Node.js + Express + MongoDB + Socket.IO API server

The current codebase implements end-to-end:

- Email OTP signup/verification + JWT auth
- Workspace + channel chat (REST + Socket.IO real-time)
- Basic DM (REST) data model + endpoints (real-time emission exists but room-join is not wired yet)
- AI chat (OpenAI/Grok) including streaming responses (SSE)
- Interview tab currently uses WebRTC + Socket.IO signaling + a sandboxed code runner endpoint

The target product spec expands this to a production-grade “Slack/Discord style” app with richer chat/DM features, GetStream Video calls, notifications, and broader settings/admin tooling.

---

## 1) High-level system diagram

### Client → Server data flows

- **Auth (REST)**
  - Client calls `/api/auth/*` endpoints.
  - Server returns `token` (JWT access token).
  - Client stores the token + user session in local storage.

- **REST (authenticated)**
  - Client sends `Authorization: Bearer <token>` for protected endpoints.

- **Socket.IO (authenticated)**
  - Client connects to Socket.IO with `auth: { token }`.
  - Server validates the JWT during the Socket.IO handshake (`io.use`).
  - Real-time events are emitted to channel rooms (`<channelId>`) and (planned) to DM rooms.

- **AI streaming (SSE)**
  - Client calls `/api/ai/chat/stream`.
  - Server proxies provider responses using Server-Sent Events (`text/event-stream`).

---

## 2) Repository structure (actual)

### Frontend – `cipher-frontend/`

- `app/`
  - `_(layout).tsx` – root stack + auth gate
  - `(auth)/` – unauthenticated screens
  - `(app)/` – authenticated tab app
- `context/`
  - `AuthContext.tsx` – session + auth actions
  - `SocketContext.tsx` – Socket.IO lifecycle
- `services/`
  - `api.ts` – axios instance + auth header injection + error normalization
  - `socket.ts` – Socket.IO client singleton
  - `workspaces.ts`, `channels.ts`, `messages.ts`, `interview.ts`, `ai.ts` – API wrappers
  - `storage.ts` + `workspaceSelection.ts` – AsyncStorage helpers
- `types/` – shared DTO types used by the app

### Backend – `cipher-backend/`

- `src/server.ts`
  - Express app + `/health`
  - mounts `/api/*`
  - creates Socket.IO server and registers socket events
- `src/config/`
  - `env.ts` – Zod-validated environment variables
  - `database.ts` – MongoDB connection (via Mongoose)
- `src/middleware/`
  - `auth.ts` – JWT bearer auth for REST
  - `validation.ts` – Zod body validation wrapper
  - `errorHandler.ts` – centralized JSON error responses
- `src/routes/` – REST route definitions
- `src/controllers/` – request handlers (business logic)
- `src/models/` – Mongoose models
- `src/events/socketEvents.ts` – Socket.IO event handlers
- `src/utils/` – helpers (JWT, access control, generators, mentions, logging)

---

## 3) Frontend navigation (Expo Router)

### Auth routing rules

- `app/_layout.tsx` gates navigation:
  - unauthenticated → `/(auth)/login`
  - authenticated → `/(app)/chat`

### Screens and routes (actual)

#### `(auth)` group

- `/(auth)` → redirects to `/(auth)/login`
- `/(auth)/login`
- `/(auth)/signup`
- `/(auth)/verify-otp`

#### `(app)` tab group

Tabs are defined in `app/(app)/_layout.tsx`:

- `/(app)/chat`
- `/(app)/interview`
- `/(app)/workspace`
- `/(app)/ai`
- `/(app)/settings`

Nested routes under Chat:

- `/(app)/chat` – workspace selector + channel list
- `/(app)/chat/[channelId]` – channel chat screen
- `/(app)/chat/thread/[threadId]` – thread screen (currently placeholder UI)

---

## 4) Backend REST API surface (actual)

Base path: `/api`

### Health

- `GET /health` (not under `/api`)

### Auth – `/api/auth`

- `POST /api/auth/signup`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### Users – `/api/users`

- `GET /api/users/profile`
- `PUT /api/users/profile`

### Workspaces – `/api/workspaces`

- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/join`
- `PUT /api/workspaces/:workspaceId`
- `GET /api/workspaces/:workspaceId/members`
- `PUT /api/workspaces/:workspaceId/members/:userId/role`
- `DELETE /api/workspaces/:workspaceId/members/:userId`
- `POST /api/workspaces/:workspaceId/generate-code`

### Channels – `/api/channels`

- `GET /api/channels?workspaceId=<workspaceId>`
- `POST /api/channels`
- `PUT /api/channels/:channelId`
- `DELETE /api/channels/:channelId`
- `POST /api/channels/:channelId/members`
- `DELETE /api/channels/:channelId/members/:userId`

### Messages (channels) – `/api/messages`

- `POST /api/messages`
- `GET /api/messages/search?q=<query>`
- `GET /api/messages/:channelId?limit=&offset=`
- `GET /api/messages/:channelId/pinned`
- `PUT /api/messages/:messageId`
- `DELETE /api/messages/:messageId`
- `POST /api/messages/:messageId/reactions`
- `POST /api/messages/:messageId/pin`
- `POST /api/messages/:messageId/unpin`

### Direct Messages – `/api/dms`

- `GET /api/dms?workspaceId=<workspaceId?>`
- `POST /api/dms` (create 1:1 or group)
- `GET /api/dms/:dmId/messages?limit=&offset=`
- `POST /api/dms/messages`

### AI – `/api/ai`

- `POST /api/ai/chat`
- `POST /api/ai/chat/stream` (SSE)

### Interview – `/api/interview`

- `POST /api/interview/run`

### Files – `/api/files`

- `POST /api/files/upload` (currently returns `501 Not Implemented` placeholder)
- `DELETE /api/files/:fileId` (currently returns `501 Not Implemented` placeholder)

---

## 5) Socket.IO events (actual)

### Authentication

- Socket.IO handshake expects a JWT access token via:
  - `socket.handshake.auth.token` (preferred), or
  - `Authorization: Bearer <token>` header

### Client → Server

- `join-channel` `{ channelId }`
- `leave-channel` `{ channelId }`
- `send-message` `{ channelId, message: { text, attachments? } }`
- `edit-message` `{ messageId, text }`
- `delete-message` `{ messageId }`
- `typing` `{ channelId, userId }`
- `stop-typing` `{ channelId, userId }`
- `read-message` `{ messageId }`
- `react-message` `{ messageId, emoji }`
- `user-online` `{ userId, status }`

Interview (currently WebRTC signaling over sockets):

- `interview-join` `{ workspaceId, roomId }`
- `interview-leave` `{ workspaceId, roomId }`
- `interview-signal` `{ workspaceId, roomId, data }`

### Server → Client

- `receive-message` `{ message }`
- `message-edited` `{ messageId, text }`
- `message-deleted` `{ messageId }`
- `message-reaction` `{ messageId, emoji, userId }`
- `message-read` `{ messageId, user }`
- `user-typing` `{ userId }`
- `user-stopped-typing` `{ userId }`
- `user-status-changed` `{ userId, status }`

Interview:

- `interview-participant-joined` `{ workspaceId, roomId, userId }`
- `interview-participant-left` `{ workspaceId, roomId, userId }`
- `interview-signal` `{ workspaceId, roomId, fromUserId, data }`

DM (partially implemented):

- `receive-dm-message` is emitted by the server to rooms named `dm:<userId>`.
- **Note:** the server currently does not auto-join sockets to `dm:<userId>`; wiring this is required for real-time DM delivery.

---

## 6) Data models (actual)

Implemented Mongoose models:

- `User`
  - `email`, `passwordHash`, `name`, `avatarUrl`, `status`, `isEmailVerified`, timestamps
- `EmailOtp`
  - `email`, `otpHash`, `expiresAt`, timestamps (TTL index)
- `Workspace`
  - `name`, `description`, `verificationCode`, `createdBy`, `members[{userId, role, joinedAt}]`, `settings`, timestamps
- `Channel`
  - `workspaceId`, `name`, `description`, `isPrivate`, `members[{userId, joinedAt}]`, timestamps
- `Message`
  - `channelId`, `senderId`, `text`, `attachments[]`, `reactions[]`, `readBy[]`, `threadRootId`, `pinnedAt/pinnedBy`, `mentions[]`, timestamps
- `DirectMessage`
  - `type (direct|group)`, `participants[]`, `name`, `workspaceId?`, `lastMessageAt`, `archivedBy[]`, timestamps
- `DirectMessageContent`
  - `dmId`, `senderId`, `text`, `attachments[]`, `reactions[]`, `readBy[]`, `threadRootId`, `mentions[]`, timestamps

---

## 7) Current gaps vs full product spec (summary)

The current repo provides a solid base, but these spec items are not yet production-complete:

- **GetStream Video**
  - Interview tab currently uses `react-native-webrtc` signaling, not `@stream-io/video-react-native-sdk`.
  - Backend does not yet expose Stream Video token generation endpoints.

- **Attachments**
  - `/api/files/upload` and `/api/files/:id` are placeholders (501). Needs minimal working upload (e.g., multer + local storage) and message attachment wiring.

- **Threads UI + API**
  - Message threads are supported in the message schema and controller, but no REST route is exposed for fetching thread replies, and the frontend thread screen is a placeholder.

- **DM UI + real-time**
  - DM endpoints exist, but the frontend lacks DM screens and socket room joining for DM real-time delivery.

- **Unread counts, mentions notifications, push notifications, admin panel**
  - Not fully implemented yet.

---

## 8) Environment variables

Backend (`cipher-backend/.env`):

- `MONGODB_URI`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `CORS_ORIGIN`
- `EMAIL_PROVIDER` + SMTP vars
- `OPENAI_API_KEY`
- `GROK_API_KEY`, `GROK_BASE_URL`
- `STREAM_API_KEY`, `STREAM_API_SECRET` (planned usage)

Frontend (`cipher-frontend/.env.local`):

- `EXPO_PUBLIC_API_BASE_URL` (or `EXPO_PUBLIC_API_URL`)
- `EXPO_PUBLIC_SOCKET_URL`

---

## 9) Next implementation milestones (planned)

- Replace Interview WebRTC with **GetStream Video** (frontend + backend token endpoints)
- Implement file uploads end-to-end (multer/local storage + client pickers)
- Finish threads end-to-end (REST thread endpoints + UI)
- Add DM screens + real-time (socket DM rooms + events)
- Expand Settings + Workspace admin features per spec
