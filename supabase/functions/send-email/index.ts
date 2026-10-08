// supabase/functions/send-email/index.ts
// Sends email using Resend. Called by the frontend via `supabase.functions.invoke('send-email', ...)`.

// CORS: set CORS_ALLOWED_ORIGINS env var to restrict origins (comma-separated).
// Leave unset (or '*') to allow all origins — lock this down in production.
const _CORS_RAW = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "*";
const _CORS_WILDCARD = _CORS_RAW === "*";
const _CORS_LIST = _CORS_WILDCARD ? [] : _CORS_RAW.split(",").map((s) => s.trim());
function buildCors(origin: string | null): Record<string, string> {
  const ao = _CORS_WILDCARD ? "*" : (origin && _CORS_LIST.includes(origin) ? origin : "");
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(ao && ao !== "*" ? { Vary: "Origin" } : {}),
  };
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type SendEmailRequest = {
  to: string;
  subject: string;
  html: string;
};

Deno.serve(async (req) => {
  const cors = buildCors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    const { RESEND_API_KEY, RESEND_FROM_EMAIL } = Deno.env.toObject();

    if (!RESEND_API_KEY) return json(500, { error: "RESEND_API_KEY is missing" }, cors);
    if (!RESEND_FROM_EMAIL) return json(500, { error: "RESEND_FROM_EMAIL is missing" }, cors);

    const body = (await req.json().catch(() => null)) as Partial<SendEmailRequest> | null;
    if (!body) return json(400, { error: "Invalid JSON body" }, cors);

    const to = String(body.to ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "").trim();

    if (!to) return json(400, { error: "`to` is required" }, cors);
    if (!subject) return json(400, { error: "`subject` is required" }, cors);
    if (!html) return json(400, { error: "`html` is required" }, cors);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    const resendJson = (await resendRes.json().catch(() => ({}))) as any;

    if (!resendRes.ok) {
      return json(502, {
        error: "Resend send failed",
        details: resendJson,
      }, cors);
    }

    const messageId = resendJson?.id ?? resendJson?.messageId ?? null;

    return json(200, {
      success: true,
      messageId,
      providerRef: messageId ?? undefined,
    }, cors);
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? "Unknown error" }, cors);
  }
});
