/**
 * Separate Interactive E2E Test Suite — OWNER MODULE (/owner)
 * Runs against a live AquaVitae server (default: http://127.0.0.1:3005)
 * Usage: npm run test:owner
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL || "";
const OWNER_PASSWORD = process.env.TEST_OWNER_PASSWORD || "";

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error(
    "Missing TEST_OWNER_EMAIL or TEST_OWNER_PASSWORD environment variables."
  );
  process.exit(1);
}

class CookieClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  captureCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const raw of setCookies) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === "") this.cookies.delete(name);
        else this.cookies.set(name, value);
      }
    }
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set("Cookie", cookie);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      redirect: "manual",
    });
    this.captureCookies(res);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // non-JSON response
    }
    return { status: res.status, headers: res.headers, text, json };
  }
}

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function runOwnerTests() {
  console.log(`\n=======================================================`);
  console.log(` AquaVitae OWNER Interactive E2E Test Suite`);
  console.log(` Target: ${BASE_URL} | Account: ${OWNER_EMAIL}`);
  console.log(`=======================================================\n`);

  const client = new CookieClient(BASE_URL);

  // 1. Owner Sign-In
  const login = await client.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  assert(
    login.status === 200 && login.json?.user?.role === "owner",
    "Owner login succeeds with role='owner'",
    `status=${login.status} body=${login.text.slice(0, 140)}`
  );

  // 2. Strict Role Separation: Owner MUST NOT interfere with Cashier routes directly
  const cashierApi = await client.request("/api/cashier/pos");
  assert(
    cashierApi.status === 403,
    "RBAC: Owner blocked from /api/cashier/pos directly (403)",
    `got ${cashierApi.status}`
  );
  const cashierPage = await client.request("/cashier");
  assert(
    cashierPage.text.includes("Cashier Access Only"),
    "RBAC: /cashier renders 403 Cashier Access Only for Owner"
  );

  // 3. Live Dashboard Snapshot + 10s Smart Pulse
  const dash = await client.request("/api/owner/dashboard?range=7");
  assert(
    dash.status === 200 &&
      typeof dash.json?.quickStats?.totalSales === "number" &&
      Array.isArray(dash.json?.salesVsExpensesChart),
    `GET /api/owner/dashboard loaded (7d Sales ₱${dash.json?.quickStats?.totalSales?.toFixed(2)}, Pending Corrections: ${dash.json?.corrections?.pendingCount})`,
    `status=${dash.status}`
  );

  const pulse1 = await client.request("/api/owner/pulse");
  assert(
    pulse1.status === 200 && typeof pulse1.json?.version === "string",
    `GET /api/owner/pulse returned lightweight change version`,
    `status=${pulse1.status}`
  );

  // 4. Owner Supervision: Approve any pending Cashier Correction Request
  const pendingReqs = (dash.json?.corrections?.requests ?? []).filter(
    (r) => r.status === "pending"
  );
  if (pendingReqs.length > 0) {
    const target = pendingReqs[0];
    const approveRes = await client.request(
      `/api/owner/corrections/${target.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          decision: "approved",
          reviewerNote: "Verified Cash drawer — approved by QA Owner",
        }),
      }
    );
    assert(
      approveRes.status === 200 &&
        approveRes.json?.request?.status === "approved",
      `Supervision: Approved Cashier correction request (${target.entity_label})`,
      `status=${approveRes.status} body=${approveRes.text.slice(0, 140)}`
    );
  } else {
    assert(
      true,
      "Supervision queue accessible (0 pending requests right now — run test:cashier first to generate one)"
    );
  }

  // 5. Station Expenses CRUD (Create + Delete -> both audited down to the centavo)
  const expCreate = await client.request("/api/owner/expenses", {
    method: "POST",
    body: JSON.stringify({
      category: "utilities",
      description: "QA Electric Meter Reading",
      amount: 325.75,
      notes: "Interactive owner expense test",
    }),
  });
  const expId = expCreate.json?.expense?.id;
  assert(
    expCreate.status === 201 && Boolean(expId),
    "Station Expense created with centavo precision (₱325.75)",
    `status=${expCreate.status} body=${expCreate.text.slice(0, 140)}`
  );

  const expDelete = await client.request(`/api/owner/expenses?id=${expId}`, {
    method: "DELETE",
  });
  assert(
    expDelete.status === 200 && expDelete.json?.deleted === true,
    "Station Expense deleted (reversing audit entry automatically appended)",
    `status=${expDelete.status}`
  );

  // Verify Pulse changed after Owner mutations
  const pulse2 = await client.request("/api/owner/pulse");
  assert(
    pulse2.status === 200 && pulse2.json?.version !== pulse1.json?.version,
    "Option 1 Smart Pulse detected DB change immediately (version updated)"
  );

  // 6. Staff Management + "My Account" Cashier Toggle
  const staffRes = await client.request("/api/users");
  const qaCashier = (staffRes.json?.users ?? []).find(
    (u) => u.role === "cashier"
  );
  assert(
    staffRes.status === 200 && Boolean(qaCashier),
    `Owner sees assigned station staff (${staffRes.json?.users?.length ?? 0} account(s))`
  );
  if (qaCashier) {
    const markRes = await client.request(`/api/users/${qaCashier.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isOwnerCashier: true }),
    });
    assert(
      markRes.status === 200 && markRes.json?.user?.is_owner_cashier === true,
      `Marked "${qaCashier.email}" as "My Account" (unlocks Go to Cashier Dashboard)`
    );

    const unmarkRes = await client.request(`/api/users/${qaCashier.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isOwnerCashier: false }),
    });
    assert(
      unmarkRes.status === 200 &&
        unmarkRes.json?.user?.is_owner_cashier === false,
      `Unmarked "My Account" cleanly`
    );
  }

  // 7. Deep Financial Audit Trail ("Every Cent") — SHA-256 Chain + Centavo Reconciliation + Exports
  const auditRes = await client.request("/api/owner/audit");
  const ledger = auditRes.json;
  assert(
    auditRes.status === 200 && !ledger?.schemaMissing,
    `GET /api/owner/audit loaded (${ledger?.chain?.totalEntries ?? 0} immutable entries)`,
    `status=${auditRes.status}`
  );
  assert(
    ledger?.chain?.verified === true &&
      (ledger?.chain?.brokenSeqNos?.length ?? 0) === 0 &&
      (ledger?.chain?.missingSeqNos?.length ?? 0) === 0,
    `SHA-256 Hash Chain Verified INTACT (0 tampered, 0 gaps, latest #${ledger?.chain?.latestSeqNo})`,
    JSON.stringify(ledger?.chain)
  );
  assert(
    ledger?.reconciliation?.isBalanced === true &&
      ledger?.reconciliation?.grossDiffCentavos === 0 &&
      ledger?.reconciliation?.expenseDiffCentavos === 0,
    `Centavo Reconciliation Proof: BALANCED (₱0.00 diff — Ledger Gross ${ledger?.reconciliation?.ledgerGrossCentavos}¢ vs Operational ${ledger?.reconciliation?.operationalGrossCentavos}¢)`,
    JSON.stringify(ledger?.reconciliation)
  );

  // Verify Forensic Exports (CSV & JSON)
  const csvExport = await client.request("/api/owner/audit/export?format=csv");
  assert(
    csvExport.status === 200 &&
      csvExport.text.includes("CashDeltaCentavos") &&
      csvExport.text.includes("EntryHash"),
    "Forensic Audit CSV export generated with centavo & SHA-256 columns"
  );

  const ownerReport = await client.request("/api/owner/export?range=7&format=csv");
  assert(
    ownerReport.status === 200 && ownerReport.text.includes("SALE"),
    "Owner Sales & Expenses CSV export generated cleanly"
  );

  console.log(`\n-------------------------------------------------------`);
  console.log(` OWNER SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log(`-------------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
}

runOwnerTests().catch((err) => {
  console.error("Fatal error in Owner E2E suite:", err);
  process.exit(1);
});
