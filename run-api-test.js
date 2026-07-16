const BASE = "https://multiagenthealthtechbackend.onrender.com";
const DEMO_KEY = "gh-live-key-001";

let API_KEY = DEMO_KEY;
let HOSPITAL_ID = "";
let EMERGENCY_ID = "";
let CASE_IDS = [];

function headers() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function api(method, path, body) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function log(heading) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${heading}`);
  console.log(`${"=".repeat(60)}`);
}

function show(label, result) {
  const icon = result.ok ? "✓" : "✗";
  console.log(`\n[${icon}] ${label} — HTTP ${result.status}`);
  console.log(JSON.stringify(result.data, null, 2));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════
//  TEST RUNNER
// ════════════════════════════════════════════════════════════════

async function run() {
  console.log(`\nTarget: ${BASE}`);
  console.log(`Starting API test run...\n`);

  // ── 1. Health ─────────────────────────────────────────────
  log("1. GET /health (no auth)");
  show("Health check", await api("GET", "/health"));

  // ── 2. Register ───────────────────────────────────────────
  log("2. POST /hospitals/register (no auth)");
  const reg = await api("POST", "/hospitals/register", {
    name: "API Test Hospital",
    email: `test-${Date.now()}@api-test.com`,
    password: "test123",
  });
  show("Register hospital", reg);

  // ── 3. Login ──────────────────────────────────────────────
  log("3. POST /auth/login (no auth)");
  show("Login", await api("POST", "/auth/login", {
    email: "admin@generalhospital.demo",
    password: "demo1234",
  }));

  // Switch back to demo key for remaining tests
  API_KEY = DEMO_KEY;
  console.log(`\n  → Switched back to demo key: ${API_KEY}`);

  // ── 4. Resources ──────────────────────────────────────────
  log("4. GET /resources");
  const resources = await api("GET", "/resources");
  show("List resources", resources);

  // ── 5. LLM Keys ──────────────────────────────────────────
  log("5. GET /settings/llm-keys");
  show("LLM key status", await api("GET", "/settings/llm-keys"));

  // ── 6. Declare Emergency ──────────────────────────────────
  log("6. POST /emergencies");
  const emergency = await api("POST", "/emergencies", {
    scope: "individual",
    department_reach: ["Emergency", "ICU", "Surgery"],
  });
  show("Declare emergency", emergency);
  if (emergency.ok) {
    EMERGENCY_ID = emergency.data.id;
    console.log(`\n  → Emergency ID: ${EMERGENCY_ID}`);
  }

  // ── 7. Get Emergency State ────────────────────────────────
  log("7. GET /emergencies/:id");
  show("Emergency state", await api("GET", `/emergencies/${EMERGENCY_ID}`));

  // ── 8. Add Cases ──────────────────────────────────────────
  log("8. POST /emergencies/:id/cases (3 cases, triggers negotiation)");

  const casePayloads = [
    { acuity_score: 5, required_resource_types: ["icu_bed", "staff"] },
    { acuity_score: 3, required_resource_types: ["er_bay"] },
    { acuity_score: 4, required_resource_types: ["or_slot", "equipment"] },
  ];

  for (const payload of casePayloads) {
    const c = await api("POST", `/emergencies/${EMERGENCY_ID}/cases`, payload);
    show(`Case (acuity=${payload.acuity_score})`, c);
    if (c.ok) CASE_IDS.push(c.data.id);
    await sleep(500);
  }

  console.log(`\n  → Case IDs: ${CASE_IDS.join(", ")}`);
  console.log(`  → Waiting 15s for Groq negotiation to complete...`);
  await sleep(15000);

  // ── 9. Updated State ─────────────────────────────────────
  log("9. GET /emergencies/:id (after negotiation)");
  const state = await api("GET", `/emergencies/${EMERGENCY_ID}`);
  show("Emergency state (post-negotiation)", state);

  // ── 10. Resolve Emergency ─────────────────────────────────
  log("10. PATCH /emergencies/:id/resolve");
  show("Resolve emergency", await api("PATCH", `/emergencies/${EMERGENCY_ID}/resolve`));
}

run().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
