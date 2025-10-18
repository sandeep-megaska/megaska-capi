import crypto from "crypto"; // keep imports at the very top

// Allowed origins for browser calls (add any others you really use)
const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com"
]);

function addCors(origin, headers) {
  const o = origin && ALLOWED.has(origin) ? origin : "";
  headers.set("Access-Control-Allow-Origin", o);
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  headers.set("Vary", "Origin");
}

function sha256(s) {
  return crypto.createHash("sha256").update((s || "").trim().toLowerCase()).digest("hex");
}

export async function GET(req) {
  const headers = new Headers({ "Content-Type": "application/json" });
  addCors(req.headers.get("Origin"), headers);
  return new Response(JSON.stringify({ ok: true, who: "meta-capi" }), { status: 200, headers });
}

export async function OPTIONS(req) {
  const headers = new Headers();
  addCors(req.headers.get("Origin"), headers);
  return new Response(null, { status: 200, headers });
}

export async function POST(req) {
  const headers = new Headers({ "Content-Type": "application/json" });
  addCors(req.headers.get("Origin"), headers);

  try {
    const FB_GRAPH = "https://graph.facebook.com/v19.0";
    const body = await req.json();

    const PIXEL_ID = process.env.META_PIXEL_ID;
    const TOKEN = process.env.META_CAPI_TOKEN;
    const TEST_CODE = process.env.META_TEST_EVENT_CODE;

    if (!PIXEL_ID || !TOKEN) {
      return new Response(JSON.stringify({ error: "Missing META_PIXEL_ID or META_CAPI_TOKEN" }), { status: 500, headers });
    }

    // Build user_data (hashed where required by Meta)
    const u = body?.user || {};
    const user_data = {};
    if (u.email) user_data.em = [sha256(u.email)];
    if (u.phone) user_data.ph = [sha256(u.phone)];
    if (u.first_name) user_data.fn = sha256(u.first_name);
    if (u.last_name) user_data.ln = sha256(u.last_name);
    if (u.city) user_data.ct = sha256(u.city);
    if (u.state) user_data.st = sha256(u.state);
    if (u.zip) user_data.zp = sha256(u.zip);
    if (u.country) user_data.country = sha256(u.country);
    if (body?.client_user_agent) user_data.client_user_agent = body.client_user_agent;
    if (body?.fbp) user_data.fbp = body.fbp;
    if (body?.fbc) user_data.fbc = body.fbc;

    const payload = {
      data: [{
        event_name: body.event_name || "Purchase",
        event_time: body.event_time || Math.floor(Date.now() / 1000),
        event_id: body.event_id, // send same ID in fbq(...) if you want dedup
        event_source_url: body.event_source_url || "https://megaska.com",
        action_source: "website",
        user_data,
        custom_data: body.custom_data || {}
      }],
      ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}),
      ...(body?.test_event_code ? { test_event_code: body.test_event_code } : {})
    };

    const url = `${FB_GRAPH}/${encodeURIComponent(PIXEL_ID)}/events?access_token=${encodeURIComponent(TOKEN)}`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();

    return new Response(JSON.stringify({ ok: r.ok, meta: j }), { status: r.ok ? 200 : 502, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500, headers });
  }
}
