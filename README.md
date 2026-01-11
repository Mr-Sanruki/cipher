# Cipher

Real-time workspace + channel chat with OTP email verification.

## Repo structure

- `cipher-backend/` (Node.js + Express + Socket.IO + MongoDB)
- `cipher-frontend/` (React Native + Expo Router)

## Prerequisites

- Node.js (recommended: 18+)
- MongoDB (Atlas or local)

## Backend setup

1. Install dependencies:

   - `cd cipher-backend`
   - `npm install`

2. Create env file:

   - Copy `cipher-backend/.env.example` to `cipher-backend/.env`

3. Required env values:

   - `MONGODB_URI`
   - `JWT_SECRET` (use a long random value)

4. OTP email configuration:

   - For local development, keep `EMAIL_PROVIDER=console`.
   - OTP codes will be printed in the backend logs as `OTP issued`.
   - To send real emails, set `EMAIL_PROVIDER=smtp` and fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

5. Start the backend:

   - `npm run dev`

6. Health check:

   - `GET http://localhost:5000/health` (or whatever `PORT` you configured)

## Frontend setup

1. Install dependencies:

   - `cd cipher-frontend`
   - `npm install`

2. Create env file:

   - Copy `cipher-frontend/.env.example` to `cipher-frontend/.env.local`

3. Configure URLs:

   - `EXPO_PUBLIC_API_BASE_URL` should point to the backend HTTP URL.
   - `EXPO_PUBLIC_SOCKET_URL` should point to the backend Socket.IO URL (same host/port as the backend server).

   Examples:

   - Android Emulator:

     - `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000`
     - `EXPO_PUBLIC_SOCKET_URL=http://10.0.2.2:5000`

   - iOS Simulator:

     - `EXPO_PUBLIC_API_BASE_URL=http://localhost:5000`
     - `EXPO_PUBLIC_SOCKET_URL=http://localhost:5000`

   - Physical device (same Wi-Fi as your dev machine):

     - `EXPO_PUBLIC_API_BASE_URL=http://<YOUR_LAN_IP>:5000`
     - `EXPO_PUBLIC_SOCKET_URL=http://<YOUR_LAN_IP>:5000`

4. Start the frontend:

   - `npm start`

## Notes / Troubleshooting

- If you are using a physical phone, make sure:
  - Your backend is reachable from the phone (Windows Firewall may need an allow rule for the backend port).
  - Your phone and dev machine are on the same network.

- CORS:
  - Backend uses `CORS_ORIGIN`.
  - `CORS_ORIGIN=*` is accepted for development.

- No secrets / URLs are hardcoded:
  - Frontend requires `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_SOCKET_URL`.
  - Backend requires `MONGODB_URI` and `JWT_SECRET`.
