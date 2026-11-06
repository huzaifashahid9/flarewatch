import { configured, page, redis, validSignature } from "@/lib/follow";

// Signed link at the bottom of every follower email.
export async function GET(req: Request) {
  if (!configured()) return page("Not available", "Following is not switched on for this site yet.", 503);
  const q = new URL(req.url).searchParams;
  const email = q.get("email") ?? "", site = q.get("site") ?? "", sig = q.get("sig") ?? "";
  if (!validSignature(email, site, sig)) return page("Link not valid", "This unsubscribe link is not valid.", 400);
  await redis("SREM", `follow:${site}`, email);
  return page("Unsubscribed", "You will not get any more emails about this flare.");
}
