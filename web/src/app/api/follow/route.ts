import { randomBytes } from "node:crypto";
import { EMAIL, SITE_ID, configured, redis, sendMail } from "@/lib/follow";

// Step 1 of following a flare: store a pending request and email a confirm link.
// The address is only added to the follower list after the link is clicked.

const PER_IP_PER_HOUR = 10;

export async function POST(req: Request) {
  if (!configured()) return Response.json({ error: "Following is not switched on for this site yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { email?: string; site?: string; lang?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const site = body?.site ?? "";
  if (!EMAIL.test(email) || !SITE_ID.test(site)) return Response.json({ error: "Check the email address." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const n = Number(await redis("INCR", `rl:follow:${ip}`));
    if (n === 1) await redis("EXPIRE", `rl:follow:${ip}`, 3600);
    if (n > PER_IP_PER_HOUR) return Response.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });

    const token = randomBytes(24).toString("hex");
    await redis("SET", `pending:${token}`, JSON.stringify({ email, site }), "EX", 86400);
    const origin = new URL(req.url).origin;
    const link = `${origin}/api/follow/confirm?token=${token}`;
    const ur = body?.lang === "ur";
    await sendMail(email, ur ? "FlareWatch: فلیئر کو فالو کرنے کی تصدیق کریں" : "FlareWatch: confirm you want to follow this flare",
      `<p>${ur ? "اس لنک پر کلک کریں تاکہ اس فلیئر کا گریڈ بدلنے پر آپ کو ای میل ملے:" : "Click to get an email when this flare's report card grade changes:"}</p>`
      + `<p><a href="${link}">${ur ? "تصدیق کریں" : "Confirm"}</a></p>`
      + `<p style="color:#777">${ur ? "اگر آپ نے یہ نہیں مانگا تو اس ای میل کو نظر انداز کریں۔" : "If you did not ask for this, ignore this email."}</p>`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not send the email. Try again later." }, { status: 502 });
  }
}
