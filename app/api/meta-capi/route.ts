// app/api/meta-capi/route.ts
import crypto from "crypto";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

function sha256(input: string) {
  return crypto.createHash("sha256").update((input || "").trim().toLowerCase()).digest("hex");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function POST(req: Request) {
  try {
    const {
      event_name,           // e.g., "Purchase"
      event_id,             // MUST match fbq(..., {eventID}) for dedup
      event_time,           // optional; default now
      event_source_url,     // page URL
      client_user_agent,    // navigator.userAgent from browser (optional)
      fbc, fbp,             // from _fbc/_fbp cookies or fbclid parsing (optional)
      user = {},            // { email, phone, first_name, last_name, city, state, country, zip }
      custom_data = {}      // { currency, value, contents:[{id,quantity}], content_type }
    } = await req.json();

    const PIXEL_ID = process.env.META_PIXEL_ID!;
    const TOKEN = process.env.META_CAPI_TOKEN!;
    const TEST_CODE = process.env.META_TEST_EVENT_CODE;

    if (!PIXEL_ID || !TOKEN) {
      return new Response(JSON.stringify({ error: "Server not configured: missing META_PIXEL_ID or META_CAPI_TOKEN" }), { status: 500 });
    }

    // Build user_data (hashed where appropriate)
    const user_data: Record<string, any> = {};
    if (user.email) user_data.em = [sha256(user.email)];
    if (user.phone) user_data.ph = [sha256(user.phone)];
    if (user.first_name) user_data.fn = sha256(user.first_name);
    if (user.last_name) user_data.ln = sha256(user.last_name);
    if (user.city) user_data.ct = sha256(user.city);
    if (user.state) user_data.st = sha256(user.state);
    if (user.zip) user_data.zp = sha256(user.zip);
    if (user.country) user_data.country = sha256(user.country);
    if (client_user_agent) user_data.client_user_agent = client_user_agent;
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    const payload = {
      data: [
        {
          event_name,
          event_time: event_time || nowSeconds(),
          event_id,                           // critical for dedup
          event_source_url,
          action_source: "website",
          user_data,
          custom_data
        }
      ],
      ...(TEST_CODE ? { test_event_code: TEST_CODE } : {})
    };

    const url = `${FB_GRAPH}/${encodeURIComponent(PIXEL_ID)}/events?access_token=${encodeURIComponent(TOKEN)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Meta error", meta: json }), { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, meta: json }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), { status: 500 });
  }
}
