# Cipher Pro API Documentation

## Base URL

`http://localhost:5000/api` (development)

## Authentication

Most endpoints require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Auth Endpoints

### POST /auth/signup

Create a new user account.

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:** `201 Created`

```json
{
  "message": "Signup successful. OTP sent.",
  "email": "john@example.com"
}
```

### POST /auth/login

Login with email and password.

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`

```json
{
  "token": "jwt_access_token",
  "user": { ... }
}
```

### POST /auth/verify-otp

Verify email OTP.

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Response:** `200 OK`

```json
{
  "token": "jwt_access_token",
  "user": { ... }
}
```

---

## Workspace Endpoints

### GET /workspaces

List all workspaces the user belongs to.

**Response:** `200 OK`

```json
{
  "workspaces": [
    {
      "_id": "...",
      "name": "My Workspace",
      "description": "...",
      "memberCount": 5,
      "channelCount": 10,
      ...
    }
  ]
}
```

### POST /workspaces

Create a new workspace.

**Request Body:**

```json
{
  "name": "New Workspace",
  "description": "Optional description"
}
```

**Response:** `201 Created`

```json
{
  "workspace": { ... },
  "verificationCode": "ABC123"
}
```

### POST /workspaces/join

Join a workspace using verification code.

**Request Body:**

```json
{
  "verificationCode": "ABC123"
}
```

### GET /workspaces/:workspaceId/members

List workspace members (admin only).

### PUT /workspaces/:workspaceId/members/:userId/role

Update member role (admin only).

**Request Body:**

```json
{
  "role": "admin" | "member" | "guest"
}
```

### DELETE /workspaces/:workspaceId/members/:userId

Remove member from workspace (admin only).

### POST /workspaces/:workspaceId/generate-code

Generate new verification code (admin only).

---

## Channel Endpoints

### GET /channels?workspaceId=...

List channels in workspace.

### POST /channels

Create a channel.

**Request Body:**

```json
{
  "workspaceId": "...",
  "name": "general",
  "description": "...",
  "isPrivate": false
}
```

---

## Message Endpoints

### GET /messages/:channelId

List messages in channel.

**Query Params:**

- `limit` (default: 50, max: 100)
- `offset` (default: 0)

### POST /messages

Create a message.

**Request Body:**

```json
{
  "channelId": "...",
  "text": "Hello world",
  "attachments": [],
  "threadRootId": null
}
```

### PUT /messages/:messageId

Edit a message.

**Request Body:**

```json
{
  "text": "Updated text"
}
```

### DELETE /messages/:messageId

Delete a message.

### POST /messages/:messageId/reactions

Toggle reaction on message.

**Request Body:**

```json
{
  "emoji": "👍"
}
```

### POST /messages/:messageId/pin

Pin a message.

### POST /messages/:messageId/unpin

Unpin a message.

### GET /messages/:channelId/pinned

Get pinned messages for channel.

### GET /messages/search?q=...

Search messages across all accessible channels.

---

## Direct Message Endpoints

### GET /dms

List all direct messages (1:1 and group).

**Query Params:**

- `workspaceId` (optional)

### POST /dms

Create a direct message.

**Request Body (1:1):**

```json
{
  "userId": "...",
  "workspaceId": "..." // optional
}
```

**Request Body (Group):**

```json
{
  "userIds": ["...", "..."],
  "name": "Group Chat", // optional
  "workspaceId": "..." // optional
}
```

### GET /dms/:dmId/messages

List messages in a DM.

### POST /dms/messages

Create a message in a DM.

**Request Body:**

```json
{
  "dmId": "...",
  "text": "Hello",
  "attachments": []
}
```

---

## AI Endpoints

### POST /ai/chat

Chat with AI (non-streaming).

**Request Body:**

```json
{
  "provider": "openai" | "grok",
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "maxTokens": 1000
}
```

### POST /ai/stream

Chat with AI (streaming, SSE format).

Same request body as `/ai/chat`, but returns Server-Sent Events stream.

---

## File Endpoints

### POST /files/upload

Upload a file.

**Request Body:**

```json
{
  "type": "image" | "document" | "video" | "audio"
}
```

**Note:** Currently returns placeholder. Real implementation needed with multer middleware.

### DELETE /files/:fileId

Delete a file.

---

## Interview Endpoints

### POST /interview/run

Execute code in sandbox.

**Request Body:**

```json
{
  "workspaceId": "...",
  "code": "console.log('Hello'); return 1 + 1;",
  "timeoutMs": 1500
}
```

**Response:**

```json
{
  "stdout": "...",
  "result": "2",
  "error": null,
  "durationMs": 50
}
```

---

## Socket.IO Events

### Client → Server

- `join-workspace` - Join workspace room
- `join-channel` - Join channel room
- `send-message` - Send message (real-time)
- `typing` - Indicate typing
- `stop-typing` - Stop typing indicator
- `read-message` - Mark message as read
- `edit-message` - Edit message
- `delete-message` - Delete message
- `react-message` - Add/remove reaction
- `interview-join` - Join interview room
- `interview-leave` - Leave interview room
- `interview-signal` - WebRTC signaling

### Server → Client

- `receive-message` - New message received
- `message-edited` - Message was edited
- `message-deleted` - Message was deleted
- `message-reaction` - Reaction added/removed
- `message-pinned` - Message was pinned
- `message-unpinned` - Message was unpinned
- `message-read` - Message read receipt
- `typing` - User is typing
- `stop-typing` - User stopped typing
- `user-online` - User came online
- `user-offline` - User went offline
- `interview-participant-joined` - Participant joined interview
- `interview-participant-left` - Participant left interview
- `interview-signal` - WebRTC signal data

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "status": 400
}
```

Common status codes:

- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
