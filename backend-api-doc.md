<USER_REQUEST>
# Siege Backend API Documentation

Base URL: `http://localhost:3000`

All request/response bodies are JSON (`Content-Type: application/json`).

---

## Authentication

Every endpoint below `/hospitals/register` and `/auth/login` requires an `Authorization` header.

```
Authorization: Bearer <api_key_or_jwt>
```

- Use the `api_key` returned from registration
- OR use a JWT token from `/auth/login`
- The backend identifies your hospital from this credential

All data returned is scoped to your hospital. You will never see another hospital's data.

---

## Error Format

All errors return:

```json
{ "error": "Human-readable message" }
```

Common HTTP codes used:

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing or invalid parameters |
| 401 | Invalid or missing credentials |
| 404 | Resource not found (or belongs to another hospital) |
| 409 | Conflict (e.g. email already registered) |
| 500 | Internal server error |

---

## Public Endpoints (No Auth)

### POST /hospitals/register

Register a new hospital. Returns credentials for future API calls.

**Request:**
```json
{
  "name": "City General Hospital",
  "email": "admin@citygeneral.com",
  "password": "securepassword123"
}
```

**Response `201`:**
```json
{
  "hospital_id": "a1b2c3d4-...",
  "name": "City General Hospital",
  "api_key": "hosp-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Save the `api_key` — it is used for all subsequent requests. It cannot be retrieved later.

---

### POST /auth/login

Login with email + password. Returns a JWT token (valid 24h).

**Request:**
```json
{
  "email": "admin@citygeneral.com",
  "password": "securepassword123"
}
```

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "hospital_id": "a1b2c3d4-...",
  "name": "City General Hospital"
}
```

---

### GET /health

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Emergency Management

### POST /emergencies

Declare a new emergency. Opens a negotiation cycle.

**Request:**
```json
{
  "scope": "individua
<truncated 16519 bytes>
end receives emergency_resolved → shows summary
```

### SSE Connection Tips

- **Reconnection:** `EventSource` auto-reconnects. If using `fetch()` streaming, implement your own retry with exponential backoff.
- **No headers with EventSource:** The browser `EventSource` API doesn't support custom headers. Options:
  - Use `fetch()` with ReadableStream (recommended)
  - Add a `?token=` query param to the SSE endpoint (requires backend change)
  - Use an SSE library that supports headers
- **Heartbeats:** The server sends `: heartbeat` comments every 30 seconds. These are not events — ignore them in your handler.
- **Multiple tabs:** Each tab opens its own SSE connection. The server broadcasts to all connected clients.

### Polling vs SSE

| Approach | Use Case |
|----------|----------|
| SSE | Live updates during active emergency — show bids arriving in real time |
| GET polling | Dashboard view, historical data, audit log |
| Both | Connect SSE for live events, poll GET for initial state + periodic refresh |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `DATA_LAYER` | No | `"fake"` for in-memory dev, `"live"` for PostgreSQL |
| `DATABASE_URL` | Yes (live) | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT token signing |
| `GROQ_API_KEY` | No | Platform-level Groq key (fallback if hospital has no BYOK) |
| `MISTRAL_API_KEY` | No | Platform-level Mistral key (fallback if hospital has no BYOK) |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes (live BYOK) | AES-256-GCM key for encrypting stored LLM keys |
| `DEBOUNCE_MS` | No | Scheduler debounce delay (default: 3000) |
| `ROUND_COOLDOWN_MS` | No | Cooldown between mass-scope rounds (default: 5000) |
| `MAX_RETRIES` | No | Max retry attempts per round (default: 3) |
url actual server:https://multiagenthealthtechbackend.onrender.com
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-07-16T14:14:46+05:30.
</ADDITIONAL_METADATA>