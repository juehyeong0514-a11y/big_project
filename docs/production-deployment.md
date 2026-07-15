# Production Deployment Checklist

## Required DNS

Point both records to the production host before starting Caddy:

- `WEB_DOMAIN`, for example `exam.example.com`
- `API_DOMAIN`, for example `api.exam.example.com`

## Required Environment

```env
WEB_PUBLIC_URL=https://exam.example.com
API_PUBLIC_URL=https://api.exam.example.com
PUBLIC_WEB_BASE_URL=https://exam.example.com
PUBLIC_API_BASE_URL=https://api.exam.example.com
WEB_ORIGIN=https://exam.example.com
TLS_EMAIL=admin@example.com
WEB_DOMAIN=exam.example.com
API_DOMAIN=api.exam.example.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=replace-me
EMAIL_FROM_ADDRESS=no-reply@example.com
KYC_SANDBOX_API_BASE_URL=https://sandbox.kyc-provider.example.com
KYC_SANDBOX_API_KEY=replace-me
PROCTOR_ICE_SERVERS=[{"urls":"turns:turn.example.com:5349","username":"turn-user","credential":"turn-secret"}]
VITE_PROCTOR_ICE_SERVERS=[{"urls":"turns:turn.example.com:5349","username":"turn-user","credential":"turn-secret"}]
DISABLE_DATABASE=0
ALLOW_DEMO_AUTH=0
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=replace-me
INITIAL_ADMIN_NAME=Administrator
INITIAL_ORGANIZATION_NAME=Developer Competency Verification
```

## Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## HTTPS Verification

```bash
curl -I https://exam.example.com
curl https://api.exam.example.com/health
curl https://api.exam.example.com/api/mobile-access
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://api.exam.example.com/api/operations/readiness
```

Expected API response:

```json
{ "ok": true, "service": "dcvp-api" }
```

If TLS fails, confirm DNS points to this host and ports `80` and `443` are reachable from the public internet so Caddy can complete ACME validation.

## Mobile QR and Live Proctoring

- Candidate QR links must resolve to `WEB_PUBLIC_URL` on production so identity capture and mobile auxiliary proctoring work outside the same Wi-Fi.
- The API public URL must be reachable from the phone because the mobile page records camera status and risk events through `API_PUBLIC_URL`.
- WebSocket signaling uses the API origin under the `/proctor` Socket.IO namespace; confirm the HTTPS proxy forwards upgrade requests.
- Configure `PROCTOR_ICE_SERVERS` for the API readiness check and `VITE_PROCTOR_ICE_SERVERS` for the browser WebRTC client. Both should include a real `turn:` or `turns:` URL with `username` and `credential`; STUN-only settings are not enough for reliable mobile LTE or restrictive company networks.
- After deployment, open one candidate exam on a PC and the same invite's mobile auxiliary proctor page on a phone using LTE. Confirm the admin live proctoring screen shows both `PC 캠` and `모바일 보조캠`.
- Repeat the same check from the target company network. If signaling connects but media stays blank, fix TURN reachability, firewall egress, or TURN credentials before production use.

## Operations Readiness

- In the admin console, open `운영 준비도` after setting production environment variables.
- `데이터베이스`, `초대 메일`, `본인확인 KYC`, `Public HTTPS URL`, `실시간 감독`, and `TURN/ICE 서버` should be `준비 완료` before launch.
- A `WARNING` on `TURN/ICE 서버` means the app may work on the same Wi-Fi but fail on mobile LTE or company networks.
- The readiness API intentionally never returns API keys, Resend keys, KYC keys, or TURN credentials.

## Invite Email Delivery

- Production invite email delivery uses Resend by default: `EMAIL_PROVIDER=resend`.
- Store the real `RESEND_API_KEY` only in the server environment or an ignored local `.env` file. Do not commit it.
- `EMAIL_FROM_ADDRESS` must be a verified Resend sender or domain address.
- Smoke test invite delivery from the admin console after DNS/TLS is ready: create a test candidate, click `초대 메일 발송`, and confirm the candidate report records `SENT`, provider `resend`, and a Resend `providerMessageId`.
- SendGrid and webhook adapters remain available for future migrations by changing `EMAIL_PROVIDER`, but they are not the default production path.

## Admin Authentication

- Production must authenticate admins through the database-backed user table.
- Keep `DISABLE_DATABASE=0` and do not set `ALLOW_DEMO_AUTH=1` in production.
- The built-in demo account is only for local development and QA when `ALLOW_DEMO_AUTH=1` or the API is not running with `NODE_ENV=production`.
- `db:seed` creates or updates the initial admin from `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME`, and `INITIAL_ORGANIZATION_NAME`.
- Admin passwords are stored as salted PBKDF2 hashes. Legacy demo SHA-256 hashes are upgraded after a successful database login.
