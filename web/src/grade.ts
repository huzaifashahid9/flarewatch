import type { SiteProps } from "@/lib-types";

// Flare report card. Points for size (how much gas) plus points for how
// often it burns, plus or minus one for the World Bank trend. Only flares
// with a volume are graded; unconfirmed heat sources get no grade.
export type Grade = { letter: "A" | "B" | "C" | "D" | "F"; points: number; size: number; burn: number; trend: number };

const SIZE_STEPS = [0.02, 0.1, 0.3, 0.7]; // MMSCFD

export function gradeOf(s: SiteProps): Grade | null {
  if (!s.volume) return null;
  const q = s.volume.mmscfd.mid;
  const size = SIZE_STEPS.filter((x) => q >= x).length; // 0 to 4
  const burn = s.active_share >= 0.8 ? 2 : s.active_share >= 0.5 ? 1 : 0;
  const trend = s.trend?.direction === "worsening" ? 1 : s.trend?.direction === "improving" ? -1 : 0;
  const points = Math.max(0, size + burn + trend);
  const letter = points <= 1 ? "A" : points === 2 ? "B" : points === 3 ? "C" : points === 4 ? "D" : "F";
  return { letter, points, size, burn, trend };
}

export const GRADE_COLOR: Record<Grade["letter"], string> = {
  A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626",
};

/** Worst first: by grade points, then by yearly gas value. */
export function worstSites(sites: SiteProps[], n = 5) {
  return sites
    .map((s) => ({ s, g: gradeOf(s) }))
    .filter((x): x is { s: SiteProps; g: Grade } => x.g !== null)
    .sort((a, b) => b.g.points - a.g.points
      || (b.s.impact?.value_usd_per_yr.mid ?? 0) - (a.s.impact?.value_usd_per_yr.mid ?? 0))
    .slice(0, n);
}
