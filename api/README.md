# Ecodrive API (MySQL + OTP + KYC)

This API now supports:

- User signup (`POST /api/signup`) saved to **MySQL**
- User login (`POST /api/login`) with blocked-user check
- Admin users list (`GET /api/admin/users`)
- Admin block/unblock user (`POST /api/admin/users/:id/block`, `POST /api/admin/users/:id/unblock`)
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

This creates database `ecodrive_db` and table `users`.

## 3) Configure Environment Variables

Use values from `.env.example`:

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

If SMTP/SMS is not configured, OTP endpoint returns `demoCode` in response.

## 4) Run API

```bash
node kyc-server.js
```

Default URL:

`http://127.0.0.1:5050`

## 5) Frontend API Base

If frontend is on another origin (like Live Server `127.0.0.1:5500`), set this in browser console:

```js
localStorage.setItem("ecodrive_api_base", "http://127.0.0.1:5050");
```

Reload pages afterwards.

## Notes

- Admin login credential in current frontend/API:
  - username: `echodrive`
  - password: `echodriveadmin123`
- Passwords in MySQL are stored as `scrypt` hashes (`password_hash` column).
- This is still a development setup; add proper auth/session/JWT and role protection for production.
