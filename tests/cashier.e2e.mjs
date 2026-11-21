/**
 * Separate Interactive E2E Test Suite — CASHIER MODULE (/cashier)
 * Runs against a live AquaVitae server (default: http://127.0.0.1:3005)
 * Usage: npm run test:cashier
 */

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const CASHIER_EMAIL = process.env.TEST_CASHIER_EMAIL || "";
const CASHIER_PASSWORD = process.env.TEST_CASHIER_PASSWORD || "";

if (!CASHIER_EMAIL || !CASHIER_PASSWORD) {
  console.error(
    "Missing TEST_CASHIER_EMAIL or TEST_CASHIER_PASSWORD environment variables."
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

async function runCashierTests() {
  console.log(`\n=======================================================`);
  console.log(` AquaVitae CASHIER Interactive E2E Test Suite`);
  console.log(` Target: ${BASE_URL} | Account: ${CASHIER_EMAIL}`);
  console.log(`=======================================================\n`);

  const client = new CookieClient(BASE_URL);

  // 1. Auth & Role Sign-in
  const login = await client.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: CASHIER_EMAIL, password: CASHIER_PASSWORD }),
  });
  assert(
    login.status === 200 && login.json?.user?.role === "cashier",
    "Cashier login succeeds with role='cashier'",
    `status=${login.status} body=${login.text.slice(0, 140)}`
  );

  // 2. Strict RBAC Separation: Cashier MUST NOT access Owner endpoints or /owner page
  const ownerApi = await client.request("/api/owner/dashboard");
  assert(
    ownerApi.status === 403,
    "RBAC: Cashier blocked from /api/owner/dashboard (403)",
    `got ${ownerApi.status}`
  );
  const auditApi = await client.request("/api/owner/audit");
  assert(
    auditApi.status === 403,
    "RBAC: Cashier blocked from /api/owner/audit (403)",
    `got ${auditApi.status}`
  );
  const ownerPage = await client.request("/owner");
  assert(
    ownerPage.text.includes("Station Owner Access Only"),
    "RBAC: /owner renders 403 Station Owner Access Only for Cashier"
  );

  // 3. Walk-in POS Overview & Default Products (Refill ₱20, Gallon Filled with Water ₱160)
  const posGet = await client.request("/api/cashier/pos");
  assert(
    posGet.status === 200 && Array.isArray(posGet.json?.products),
    "GET /api/cashier/pos loads station products"
  );
  const products = posGet.json?.products ?? [];
  const refill = products.find((p) => p.category === "refill") ?? products[0];
  const filled = products.find((p) => p.category === "container") ?? products[1] ?? refill;
  assert(
    Boolean(refill),
    `Default Walk-in products available (${products.map((p) => `${p.name} ₱${p.unit_price}`).join(", ")})`
  );

  // 4. Walk-in POS — Cash Sale with Discount & Tendered/Change
  const cashSale = await client.request("/api/cashier/pos", {
    method: "POST",
    body: JSON.stringify({
      items: [{ productId: refill.id, quantity: 3 }],
      paymentMethod: "cash",
      discount: 5,
      amountTendered: 100,
      customerName: "QA Walk-in Cash",
      notes: "Interactive cashier test",
    }),
  });
  assert(
    cashSale.status === 201 &&
      cashSale.json?.sale?.total_amount === refill.unit_price * 3 - 5 &&
      cashSale.json?.sale?.change_amount === 100 - (refill.unit_price * 3 - 5),
    `POS Cash sale computes exact discount & change (Receipt ${cashSale.json?.sale?.receipt_no})`,
    `status=${cashSale.status} body=${cashSale.text.slice(0, 140)}`
  );

  // 5. Walk-in POS — GCash Sale (we will request Owner Payment Fix -> Cash!)
  const gcashSale = await client.request("/api/cashier/pos", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { productId: filled.id, quantity: 1 },
        { productId: refill.id, quantity: 2 },
      ],
      paymentMethod: "gcash",
      customerName: "QA Misclick GCash",
    }),
  });
  const gcashSaleId = gcashSale.json?.sale?.id;
  assert(
    gcashSale.status === 201 && Boolean(gcashSaleId),
    `POS GCash sale created (${gcashSale.json?.sale?.receipt_no}, ₱${gcashSale.json?.sale?.total_amount})`,
    `status=${gcashSale.status}`
  );

  // 6. Walk-in POS — Utang Sale
  const utangSale = await client.request("/api/cashier/pos", {
    method: "POST",
    body: JSON.stringify({
      items: [{ productId: refill.id, quantity: 2 }],
      paymentMethod: "utang",
      customerName: "QA Utang Regular",
    }),
  });
  assert(
    utangSale.status === 201 &&
      utangSale.json?.sale?.payment_method === "utang",
    `POS Utang sale created (${utangSale.json?.sale?.receipt_no})`,
    `status=${utangSale.status} body=${utangSale.text.slice(0, 140)}`
  );

  // 7. Walk-in POS — Same-day quick void (Option A allowed)
  const voidRes = await client.request(`/api/cashier/pos/${cashSale.json?.sale?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "void", reason: "QA duplicate tap test" }),
  });
  assert(
    voidRes.status === 200 && voidRes.json?.sale?.status === "voided",
    "Option A: Same-day Walk-in quick-void succeeds",
    `status=${voidRes.status}`
  );

  // 8. Deliveries — Record delivery with Gallon In & Out + Unpaid -> Paid + Direct Cancel Blocked (403)
  const delCreate = await client.request("/api/cashier/deliveries", {
    method: "POST",
    body: JSON.stringify({
      customerName: "QA Ate Linda",
      destination: "Tagum Centro",
      orderType: "refill",
      quantity: 4,
      emptyGallonsReturned: 3,
      unitPrice: 25,
      deliveryFee: 10,
      paymentMethod: "credit",
      paymentStatus: "unpaid",
      deliveredBy: "Kuya Ben",
      saveAsRegularCustomer: true,
    }),
  });
  const deliveryId = delCreate.json?.delivery?.id;
  assert(
    delCreate.status === 201 &&
      delCreate.json?.delivery?.total_amount === 110 &&
      delCreate.json?.delivery?.borrowed_gallons_count === 1,
    `Delivery logged (₱110, 4 out / 3 in = 1 borrowed)`,
    `status=${delCreate.status} body=${delCreate.text.slice(0, 140)}`
  );

  const directCancel = await client.request(`/api/cashier/deliveries/${deliveryId}`, {
    method: "PATCH",
    body: JSON.stringify({ cancelled: true }),
  });
  assert(
    directCancel.status === 403,
    "Option A: Cashier blocked from directly cancelling delivery (403 -> requires Owner approval)",
    `got ${directCancel.status}`
  );

  const settleDel = await client.request(`/api/cashier/deliveries/${deliveryId}`, {
    method: "PATCH",
    body: JSON.stringify({ paymentStatus: "paid", paymentMethod: "cash" }),
  });
  assert(
    settleDel.status === 200 && settleDel.json?.delivery?.payment_status === "paid",
    "Cashier settles unpaid delivery to Paid (Cash)",
    `status=${settleDel.status}`
  );

  // 9. Vendo Collection
  const vendoRes = await client.request("/api/cashier/vendo", {
    method: "POST",
    body: JSON.stringify({
      machineName: "QA Vendo #1",
      periodType: "daily",
      amount: 145.5,
      notes: "QA coin count",
    }),
  });
  assert(
    vendoRes.status === 201 && vendoRes.json?.collection?.amount === 145.5,
    "Vendo daily coin income logged with centavo precision (₱145.50)",
    `status=${vendoRes.status}`
  );

  // 10. Gallon Inventory Restock
  const invRes = await client.request("/api/cashier/inventory", {
    method: "POST",
    body: JSON.stringify({
      gallonType: "slim",
      movementType: "restock",
      quantity: 25,
      notes: "QA initial stock",
    }),
  });
  assert(
    invRes.status === 201,
    "Gallon inventory restock (+25) recorded",
    `status=${invRes.status}`
  );

  // 11. Submit Owner Supervision Correction Request (GCash -> Cash on gcashSaleId)
  const corrRes = await client.request("/api/cashier/corrections", {
    method: "POST",
    body: JSON.stringify({
      entityType: "pos_sale",
      entityId: gcashSaleId,
      correctionType: "change_payment_method",
      reason: "QA test: misclicked GCash, customer paid Cash",
      proposedChanges: { paymentMethod: "cash" },
    }),
  });
  assert(
    corrRes.status === 201 && corrRes.json?.request?.status === "pending",
    `Submitted Owner Supervision Correction Request (${corrRes.json?.request?.entity_label})`,
    `status=${corrRes.status} body=${corrRes.text.slice(0, 140)}`
  );

  // 12. Closing Shift Daily Automatic Tally
  const shiftPreview = await client.request("/api/cashier/shift-closing");
  const expectedCash = shiftPreview.json?.liveTally?.totalCashCollected ?? 0;
  const shiftClose = await client.request("/api/cashier/shift-closing", {
    method: "POST",
    body: JSON.stringify({
      shiftLabel: "QA Interactive Shift",
      openingCash: 500,
      actualCash: 500 + expectedCash,
      notes: "Exact cash count QA test",
    }),
  });
  assert(
    shiftClose.status === 201 && shiftClose.json?.closing?.variance === 0,
    `Closing Shift Tally saved with Exact ₱0.00 variance (Expected ₱${(500 + expectedCash).toFixed(2)})`,
    `status=${shiftClose.status} body=${shiftClose.text.slice(0, 140)}`
  );

  console.log(`\n-------------------------------------------------------`);
  console.log(` CASHIER SUITE RESULT: ${passed} passed, ${failed} failed`);
  console.log(`-------------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
}

runCashierTests().catch((err) => {
  console.error("Fatal error in Cashier E2E suite:", err);
  process.exit(1);
});
