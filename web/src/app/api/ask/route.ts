import Anthropic from "@anthropic-ai/sdk";
import type { Meta, SiteProps } from "@/lib-types";
import { gradeOf } from "@/grade";

// AI analyst: answers questions about the public FlareWatch data only
// (NASA FIRMS + World Bank). It never sees VIIRS Nightfire data.

const MODEL = "claude-opus-5-5";
const MAX_QUESTION_CHARS = 500;
const PER_IP_PER_HOUR = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > PER_IP_PER_HOUR;
}

function compact(sites: SiteProps[]) {
  return sites.map((s) => ({
    id: s.id, lat: s.lat, lon: s.lon, class: s.activity_class,
    active_share: s.active_share, nights: s.nights_detected, last_seen: s.last_seen,
    known_world_bank_flare: s.in_world_bank_catalogue, wb_year: s.baseline_year,
    mmscfd: s.volume ? s.volume.mmscfd : null,
    usd_per_yr_mid: s.impact ? s.impact.value_usd_per_yr.mid : null,
    co2e_t_per_yr_mid: s.impact ? s.impact.co2e_t_per_yr.mid : null,
    monthly_nights: s.monthly_nights,
    nearest_field: s.nearest_field ?? null,
    province: s.province ?? null,
    grade: gradeOf(s)?.letter ?? null,
    world_bank_trend: s.trend ?? null,
    fire_pattern: s.fire_pattern ?? null,
    people_within_5km: s.people_within_5km ?? null,
  }));
}

const INSTRUCTIONS = `You are the FlareWatch analyst. FlareWatch audits gas flaring in Pakistan from satellites.
Answer the user's question using only the JSON data below. Be short, plain and specific: name site ids, numbers and ranges.
Rules:
- Volumes exist only for sites that match the World Bank flare catalogue (yearly estimate, -8%/+29% band). Other sites have no volume; never invent one.
- Sites not in the catalogue are "unconfirmed heat sources" that may be cement, steel or brick plants; say so when relevant.
- Activity classes come from the share of observed months with detections. Cloudy nights are missing, not zero.
- nearest_field is the closest oil or gas field named on OpenStreetMap (within 15 km), not proof of ownership. If asked which company holds a licence, say the data cannot prove it and suggest the DGPC concession map.
- grade is the FlareWatch report card: A (small, rare flare) to F (large flare that burns almost every month); points come from size, how often it burns, and the World Bank trend.
- world_bank_trend compares the flare's latest World Bank year with three years earlier.
- If the question is not about this data, say what you can help with instead.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The AI analyst is not switched on yet (no API key set)." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many questions. Please wait a while." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return Response.json({ error: `Ask a question of up to ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const [geo, meta] = await Promise.all([
    fetch(`${origin}/data/sites.geojson`).then((r) => r.json()),
    fetch(`${origin}/data/meta.json`).then((r) => r.json() as Promise<Meta>),
  ]);
  const data = JSON.stringify({
    generated_at: meta.generated_at, observed_months: meta.observed_months,
    totals: meta.totals, assumptions: meta.assumptions, provinces: meta.provinces,
    sites: compact((geo.features as { properties: SiteProps }[]).map((f) => f.properties)),
  });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: `${INSTRUCTIONS}\n\nDATA:\n${data}`,
      messages: [{ role: "user", content: body?.lang === "ur" ? `${question}\n\n(Reply in simple Urdu, in Urdu script. Keep site ids and numbers as they are.)` : question }],
    });
    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The analyst could not answer that question." }, { status: 422 });
    }
    const answer = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return Response.json({ answer });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "The analyst is busy. Try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ error: "The analyst had a problem answering." }, { status: 502 });
    }
    throw err;
  }
}
