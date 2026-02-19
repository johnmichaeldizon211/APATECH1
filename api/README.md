# Ecodrive API (MySQL + OTP + KYC)

This API now supports:

- User signup (`POST /api/signup`) saved to **MySQL**
- User login (`POST /api/login`) with blocked-user check
- Session auth:
  - `GET /api/auth/me`
  - `POST /api/logout`
- Admin users list (`GET /api/admin/users`)
- Admin block/unblock user (`POST /api/admin/users/:id/block`, `POST /api/admin/users/:id/unblock`)
- Profile settings and password:
  - `GET /api/profile/settings?email=...`
  - `POST /api/profile/settings`
  - `POST /api/profile/password`
- Bookings:
  - `POST /api/bookings`
  - `GET /api/bookings?email=...`
  - `POST /api/bookings/:orderId/cancel`
  - `GET /api/admin/dashboard`
  - `GET /api/admin/bookings?scope=pending|all`
  - `GET /api/admin/bookings/:orderId`
  - `POST /api/admin/bookings/:orderId/approve`
  - `POST /api/admin/bookings/:orderId/reject`
- Forgot password OTP:
  - `POST /api/forgot/send-code`
  - `POST /api/forgot/verify-code`
  - `POST /api/reset-password`
- KYC endpoints:
  - `POST /api/kyc/verify-id`
  - `POST /api/kyc/verify-face`

## 1) Install Dependencies

From `api` folder:

```bash
cd api
npm install
```

## 2) Create MySQL Database

Run the schema:

```bash
mysql -u root -p < mysql-schema.sql
```

This creates database `ecodrive_db` with `users` and `bookings` tables.

## 3) Configure Environment Variables

Use values from `.env.example` (or create `api/.env`):

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Optional OTP delivery config:

- Email SMTP:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
  - `SMTP_SECURE`
- SMS webhook:
  - `SMS_WEBHOOK_URL`
  - `SMS_WEBHOOK_TOKEN`

Optional auth/OTP behavior:

- `AUTH_SESSION_TTL_MS` (default: `86400000` / 24h)
- `ALLOW_DEMO_OTP=true` only for local development fallback OTP
- If `ALLOW_DEMO_OTP` is not `true`, SMTP/SMS provider must be configured for forgot-password OTP.

## 4) Run API

```bash
node kyc-server.js
```

On startup, the server tries to auto-load `api/.env` and auto-create missing DB schema pieces (`users.avatar_data_url`, `bookings` table).

Default URL:

`http://127.0.0.1:5050`

## 5) Frontend API Base

If frontend is on another origin (like Live Server `127.0.0.1:5500`), set this in browser console:

```js
localStorage.setItem("ecodrive_api_base", "http://127.0.0.1:5050");
```

Reload pages afterwards.

## 6) Domain / Production Setup

If you deploy with a real domain, use one of these:

- Same domain for frontend + API (recommended): keep API paths under `/api/*` on that domain.
  Example:
  - Frontend: `https://ecodrive.example.com`
  - API: `https://ecodrive.example.com/api/*`
- Separate API domain:
  - Frontend: `https://ecodrive.example.com`
  - API: `https://api.ecodrive.example.com`
  - Set in browser once:
    ```js
    localStorage.setItem("ecodrive_api_base", "https://api.ecodrive.example.com");
    ```

Optional server log label:

- Set `PUBLIC_API_BASE` in `api/.env` so startup logs show your public API URL:
  - `PUBLIC_API_BASE=https://api.ecodrive.example.com`

## Notes

- Admin login credential in current frontend/API:
  - username: `echodrive`
  - password: `echodriveadmin123`
- Passwords in MySQL are stored as `scrypt` hashes (`password_hash` column).
- `POST /api/login` and `POST /api/signup` now return:
  - `token` (Bearer token)
  - `expiresInMs`
  - `expiresAt`
- Protected endpoints require `Authorization: Bearer <token>`:
  - `/api/admin/*`
  - `/api/profile/*`
  - `/api/bookings*`
