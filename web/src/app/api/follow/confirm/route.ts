import { configured, page, redis } from "@/lib/follow";

// Step 2: the confirm link from the email adds the address to follow:{site}.
export async function GET(req: Request) {
  if (!configured()) return page("Not available", "Following is not switched on for this site yet.", 503);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return page("Link not valid", "This confirm link is not valid.", 400);
  const raw = await redis("GET", `pending:${token}`);
  if (typeof raw !== "string") return page("Link expired", "This confirm link has expired or was already used. Follow the flare again to get a new one.", 410);
  const { email, site } = JSON.parse(raw) as { email: string; site: string };
  await redis("SADD", `follow:${site}`, email);
  await redis("DEL", `pending:${token}`);
  return Response.redirect(new URL(`/flares/${encodeURIComponent(site)}?followed=1`, req.url), 303);
}
