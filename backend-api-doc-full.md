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
  "scope": "individual",
  "department_reach": ["Emergency", "ICU"]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `scope` | string | yes | `"individual"` or `"mass"` |
| `department_reach` | string[] | yes | Non-empty array of department names |

`individual` scope: one negotiation round fires after a 3-second debounce (batches rapid case additions).

`mass` scope: negotiation rounds repeat in a loop every 5 seconds until the emergency is resolved or all cases are allocated.

**Response `201`:**
```json
{
  "id": "emo-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "hospital_id": "a1b2c3d4-...",
  "scope": "individual",
  "status": "active",
  "department_reach": ["Emergency", "ICU"],
  "declared_at": "2026-07-16T08:00:00.000Z",
  "resolved_at": null
}
```

**SSE broadcast:** `emergency_declared` is emitted to all clients connected to this emergency's stream.

---

### POST /emergencies/:id/cases

Add a patient case to an active emergency. This triggers the negotiation scheduler.

**Request:**
```json
{
  "acuity_score": 4,
  "required_resource_types": ["icu_bed", "staff"]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `acuity_score` | number | yes | Integer 1–5 (5 = most critical) |
| `required_resource_types` | string[] | yes | Non-empty array. Valid values: `"or_slot"`, `"icu_bed"`, `"staff"`, `"equipment"`, `"er_bay"` |

**Response `201`:**
```json
{
  "id": "case-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "hospital_id": "a1b2c3d4-...",
  "emergency_id": "emo-xxxxxxxx-...",
  "acuity_score": 4,
  "status": "pending",
  "required_resource_types": ["icu_bed", "staff"],
  "created_at": "2026-07-16T08:01:00.000Z"
}
```

**SSE broadcast:** `case_added` is emitted immediately.

**What happens next (automatic):**
1. Scheduler debounces 3s (batches rapid case adds)
2. Loads all pending cases + available resources for this emergency
3. Runs AI negotiation — each available resource gets a Groq agent that bids on cases
4. Bids are streamed via SSE as they arrive
5. Conflict resolution picks the best allocation per resource
6. `round:completed` SSE event fires with the final allocations + explanation

---

### GET /emergencies/:id

Get full state of an emergency — its cases, all hospital resources, and resource dependencies.

**Response `200`:**
```json
{
  "cases": [
    {
      "id": "case-001",
      "hospital_id": "a1b2c3d4-...",
      "emergency_id": "emo-001",
      "acuity_score": 4,
      "status": "pending",
      "required_resource_types": ["icu_bed", "staff"],
      "created_at": "2026-07-16T08:01:00.000Z"
    }
  ],
  "resources": [
    {
      "id": "res-001",
      "hospital_id": "a1b2c3d4-...",
      "type": "icu_bed",
      "label": "ICU Bed A",
      "status": "available",
      "department": "ICU",
      "metadata": { "ventilator": true }
    }
  ],
  "dependencies": [
    {
      "id": "dep-001",
      "resource_id": "res-002",
      "depends_on_resource_id": "res-001",
      "relation": "requires"
    }
  ]
}
```

Note: `resources` returns ALL resources for your hospital (not filtered by the emergency's departments). `cases` is filtered to this specific emergency. `dependencies` are global resource-to-resource dependencies.

---

### PATCH /emergencies/:id/resolve

Manually resolve (close) an active emergency. Stops any running negotiation loop.

**Response `200`:** Returns the updated Emergency object with `status: "resolved"` and `resolved_at` set.

**SSE broadcast:** `emergency_resolved` is emitted.

---

### GET /emergencies/:id/rounds/:roundId

Get the bids and final allocations for a specific negotiation round.

**Response `200`:**
```json
{
  "bids": [
    {
      "id": "bid-001",
      "hospital_id": "a1b2c3d4-...",
      "round_id": "xxxxxxxx-xxxx-...",
      "case_id": "case-001",
      "resource_id": "res-001",
      "bid_score": 92.5,
      "reasoning": "ICU bed with ventilator matches critical patient requiring respiratory support",
      "conditions": [],
      "created_at": "2026-07-16T08:01:05.000Z"
    }
  ],
  "allocations": [
    {
      "id": "alloc-001",
      "hospital_id": "a1b2c3d4-...",
      "case_id": "case-001",
      "resource_id": "res-001",
      "round_id": "xxxxxxxx-xxxx-...",
      "explanation": "ICU Bed A allocated to Case 001 (acuity 4) — best match based on ventilator availability and trauma capability.",
      "created_at": "2026-07-16T08:01:06.000Z"
    }
  ]
}
```

---

## Resources

### GET /resources

List all resources for your hospital.

**Response `200`:** Array of Resource objects.
```json
[
  {
    "id": "res-001",
    "hospital_id": "a1b2c3d4-...",
    "type": "icu_bed",
    "label": "ICU Bed A",
    "status": "available",
    "department": "ICU",
    "metadata": { "ventilator": true }
  }
]
```

Resource types: `"or_slot"` | `"icu_bed"` | `"staff"` | `"equipment"` | `"er_bay"`

Resource statuses: `"available"` | `"occupied"` | `"reserved"` | `"offline"`

---

### PATCH /resources/:id

Manually override a resource's status. Use this to mark a resource as occupied or offline outside of the negotiation flow.

**Request:**
```json
{
  "status": "occupied"
}
```

Valid status values: `"available"`, `"occupied"`, `"reserved"`, `"offline"`

**Response `200`:** Updated Resource object.

**SSE broadcast:** `resource_status_changed` is emitted (globally).

---

## Audit Log

### GET /audit-log

Paginated audit trail of all system events for your hospital.

**Query params:**

| Param | Type | Default | Range |
|-------|------|---------|-------|
| `page` | number | 1 | >= 1 |
| `limit` | number | 20 | 1–100 |

**Response `200`:**
```json
{
  "entries": [
    {
      "id": "audit-001",
      "hospital_id": "a1b2c3d4-...",
      "event_type": "emergency_declared",
      "payload": { "emergency_id": "emo-001", "scope": "individual" },
      "prev_hash": "abc123...",
      "hash": "def456...",
      "created_at": "2026-07-16T08:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 42
}
```

The `prev_hash` / `hash` fields form an append-only chain for tamper evidence.

---

## Settings — LLM Keys (BYOK)

Hospitals can supply their own Groq and/or Mistral API keys. When configured, the AI negotiation engine uses YOUR keys for that hospital's rounds. If you don't configure a key, the platform's default key is used.

Keys are encrypted at rest (AES-256-GCM). The backend never exposes the raw key value.

### GET /settings/llm-keys

Check which LLM providers you have configured.

**Response `200`:**
```json
{
  "groq": { "configured": true },
  "mistral": { "configured": false }
}
```

---

### PUT /settings/llm-keys/:provider

Store or update an API key for a provider.

`:provider` must be `"groq"` or `"mistral"`.

**Request:**
```json
{
  "api_key": "gsk_your_actual_groq_api_key_here"
}
```

**Response `200`:**
```json
{
  "ok": true,
  "provider": "groq",
  "configured": true
}
```

Calling this again with a different `api_key` overwrites the previous key.

---

### DELETE /settings/llm-keys/:provider

Remove a stored API key. The platform's default key will be used from then on.

**Response `200`:**
```json
{
  "ok": true,
  "provider": "mistral",
  "configured": false
}
```

---

## SSE — Real-time Event Stream

### GET /emergencies/:id/stream

Opens a Server-Sent Events connection for live updates during an emergency.

**Important:** Use `EventSource` in the browser. Pass your auth as a query param or use a polyfill that supports headers, since the browser `EventSource` API doesn't support custom headers.

**Recommended approach (if using EventSource):**
```
GET /emergencies/:id/stream?token=<api_key_or_jwt>
```

The backend would need a small modification to read the token from query params for SSE. Currently it only reads from the `Authorization` header. If you can't modify the backend, use a library like `eventsource-parser` with `fetch()`:

```javascript
const response = await fetch(`/emergencies/${emergencyId}/stream`, {
  headers: { Authorization: `Bearer ${apiKey}` }
});
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parse SSE text — see event formats below
}
```

**Connection flow:**
1. Client connects → receives `connected` event
2. Heartbeat comments (`: heartbeat`) arrive every 30s — ignore these
3. Application events arrive as named events (see below)
4. Client disconnects on page close or explicit close

---

### SSE Events

#### `connected`
Fired immediately on connection.
```json
event: connected
data: { "emergencyId": "emo-001" }
```

#### `emergency_declared`
Fired when a new emergency is declared (usually from the same request that opened the SSE stream).
```json
event: emergency_declared
data: { "id": "emo-001", "scope": "individual", "status": "active", ... }
```

#### `case_added`
Fired when a new case is added to the emergency. Fires immediately when `POST /emergencies/:id/cases` is called.
```json
event: case_added
data: { "id": "case-001", "acuity_score": 4, "status": "pending", "required_resource_types": ["icu_bed", "staff"], ... }
```

#### `bid_submitted`
Fired per-resource as the AI negotiation runs. Each resource agent streams its bid independently — you may receive multiple `bid_submitted` events before `round:completed`. This lets you show a live "thinking" UI.
```json
event: bid_submitted
data: {
  "id": "",
  "round_id": "xxxxxxxx-...",
  "case_id": "case-001",
  "resource_id": "res-001",
  "bid_score": 92.5,
  "reasoning": "ICU bed with ventilator matches critical patient",
  "conditions": [],
  "created_at": "2026-07-16T08:01:05.000Z"
}
```

#### `round:completed`
Fired when a negotiation round finishes. Contains the final allocations and AI-generated explanation.
```json
event: round:completed
data: {
  "roundId": "xxxxxxxx-...",
  "emergencyId": "emo-001",
  "allocations": [
    { "case_id": "case-001", "resource_id": "res-001", ... }
  ],
  "explanation": "ICU Bed A allocated to Case 001 (acuity 4) — ..."
}
```

#### `emergency_resolved`
Fired when an emergency is resolved (manually or automatically).
```json
event: emergency_resolved
data: { "id": "emo-001", "status": "resolved", "resolved_at": "2026-07-16T08:10:00.000Z", ... }
```

#### `resource_status_changed`
Fired when a resource's status is manually changed.
```json
event: resource_status_changed
data: { "id": "res-001", "status": "offline", ... }
```

---

## Data Types Reference

### Emergency
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Emergency identifier |
| `hospital_id` | UUID | Owning hospital |
| `scope` | `"individual"` \| `"mass"` | Single-round vs repeating negotiation |
| `status` | `"active"` \| `"resolved"` | Current state |
| `department_reach` | string[] | Departments involved |
| `declared_at` | ISO timestamp | When created |
| `resolved_at` | ISO timestamp \| null | When closed |

### Case
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Case identifier |
| `hospital_id` | UUID | Owning hospital |
| `emergency_id` | UUID | Parent emergency |
| `acuity_score` | number (1-5) | Patient urgency (5 = critical) |
| `status` | `"pending"` \| `"allocated"` \| `"discharged"` | Current state |
| `required_resource_types` | string[] | What resources this case needs |
| `created_at` | ISO timestamp | When created |

### Resource
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Resource identifier |
| `hospital_id` | UUID | Owning hospital |
| `type` | `"or_slot"` \| `"icu_bed"` \| `"staff"` \| `"equipment"` \| `"er_bay"` | Resource category |
| `label` | string | Human-readable name |
| `status` | `"available"` \| `"occupied"` \| `"reserved"` \| `"offline"` | Current state |
| `department` | string | Which department |
| `metadata` | object | Freeform key-value data (ventilator, specialty, bed count, etc.) |

### Bid
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Bid identifier |
| `round_id` | UUID | Which negotiation round |
| `case_id` | UUID | Case being bid on |
| `resource_id` | string | Resource making the bid |
| `bid_score` | number | AI-computed priority score (higher = stronger bid) |
| `reasoning` | string | AI explanation for why this resource wants this case |
| `conditions` | string[] | Any conditions on the allocation |

### Allocation
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Allocation identifier |
| `round_id` | UUID | Which negotiation round |
| `case_id` | UUID | Case being allocated |
| `resource_id` | string | Resource being allocated |
| `explanation` | string | AI-generated human-readable explanation |

---

## Frontend Integration Guide

### Important: The EHR Drives Data, Not the Frontend

**The frontend does NOT create cases, emergencies, or resources directly.** In production, the hospital's EHR system (Electronic Health Record) calls the backend API when clinical events happen:

- EHR declares an emergency → `POST /emergencies`
- EHR admits a patient → `POST /emergencies/:id/cases`
- EHR updates resource status → `PATCH /resources/:id`

**The frontend's job is to:**
1. Connect to the SSE stream to receive live updates
2. Display the current state via polling or on-demand `GET` calls
3. Allow manual actions like resolving emergencies or updating LLM keys

### Recommended Frontend Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│                                                  │
│  1. On page load:                                │
│     - GET /emergencies/:id  → load current state │
│     - Open SSE stream for live updates           │
│                                                  │
│  2. Listen for SSE events:                       │
│     - case_added → update case list in UI        │
│     - bid_submitted → show live "AI thinking"    │
│     - round:completed → show allocations table   │
│     - emergency_resolved → close the dashboard   │
│                                                  │
│  3. Periodically refresh (optional):             │
│     - GET /emergencies/:id  (every 10-30s)       │
│     - GET /audit-log  (on audit tab click)       │
│                                                  │
│  4. User actions:                                │
│     - PATCH /emergencies/:id/resolve             │
│     - PATCH /resources/:id                       │
│     - PUT /settings/llm-keys/:provider           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              EHR System (external)               │
│                                                  │
│  Calls backend API when clinical events happen:  │
│  - POST /emergencies                             │
│  - POST /emergencies/:id/cases                   │
│  - PATCH /resources/:id                          │
└─────────────────────────────────────────────────┘
```

### Typical User Flow

```
1. EHR declares emergency (mass casualty event)
   └─ POST /emergencies { scope: "mass", department_reach: ["ER", "ICU", "Surgery"] }

2. Frontend connects to SSE stream
   └─ GET /emergencies/:id/stream

3. EHR starts adding patients as they arrive
   └─ POST /emergencies/:id/cases  (called by EHR for each patient)

4. Frontend receives case_added events → shows incoming patients in real time

5. After 3s debounce, negotiation fires automatically:
   - bid_submitted events stream in (one per resource, ~3-10 seconds total)
   - round:completed event arrives with final allocations

6. Frontend displays allocation table showing which resource goes to which patient

7. This loop repeats for mass-scope emergencies (every 5 seconds)

8. When the incident commander decides it's over:
   └─ PATCH /emergencies/:id/resolve
   └─ frontend receives emergency_resolved → shows summary
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