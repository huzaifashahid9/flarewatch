import { createHmac, timingSafeEqual } from "node:crypto";

// Follow-a-flare storage: Upstash Redis over REST, email through Resend.
// Every helper returns null when its keys are not set, so the routes can answer 503.

export const SITE_ID = /^PK-\d{1,2}\.\d{1,6}-\d{2,3}\.\d{1,6}$/;
export const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

export function configured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    && process.env.RESEND_API_KEY && process.env.FOLLOW_SECRET);
}

export async function redis(...cmd: (string | number)[]): Promise<unknown> {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return ((await r.json()) as { result: unknown }).result;
}

export async function sendMail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM ?? "FlareWatch <onboarding@resend.dev>", to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}`);
}

/** Same signature as pipeline/flarewatch/mailer.py unsubscribe_url. */
export function signature(email: string, site: string) {
  return createHmac("sha256", process.env.FOLLOW_SECRET ?? "").update(`${email}|${site}`).digest("hex");
}

export function validSignature(email: string, site: string, sig: string) {
  const want = Buffer.from(signature(email, site));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>`
    + `<body style="font-family:system-ui;background:#0a0a0a;color:#eee;max-width:32rem;margin:4rem auto;padding:0 1rem">`
    + `<h1 style="font-size:1.4rem">${title}</h1><p>${body}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
