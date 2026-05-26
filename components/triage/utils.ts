import type { Section, Band } from "./types";
import { BANDS, UDO_GROUPS, S6_WEIGHT_OVERRIDE } from "./constants";

export function getUdoGroup(tipo: string): string {
  for (const [group, options] of Object.entries(UDO_GROUPS)) {
    if (options.includes(tipo)) return group;
  }
  return "ANZIANI";
}

export function getEffectiveSections(udoGroup: string, base: Section[]): Section[] {
  const s6Override = S6_WEIGHT_OVERRIDE[udoGroup];
  if (!s6Override) return base;
  return base.map(s => {
    if (s.id === "S6") return { ...s, weight_pct: s6Override };
    if (s.id === "S5") return { ...s, weight_pct: Math.max(5, 10 - (s6Override - 10)) };
    return s;
  });
}

export function getSectionAnswers(
  answers: Record<string, number[]>,
  sid: string,
  qCount: number,
): number[] {
  return answers[sid] ?? new Array(qCount).fill(50);
}

export function calcSectionScore(answers: number[], questions: Section["questions"]): number {
  let weighted = 0, totalW = 0;
  questions.forEach((q, i) => {
    weighted += (answers[i] ?? 0) * q.weight;
    totalW += q.weight;
  });
  return totalW > 0 ? weighted / totalW : 0;
}

export function calcTotalScore(
  allAnswers: Record<string, number[]>,
  sections: Section[],
): number {
  let total = 0;
  sections.forEach(s => {
    const ans = getSectionAnswers(allAnswers, s.id, s.questions.length);
    const sScore = calcSectionScore(ans, s.questions);
    total += (1 - sScore / 100) * s.weight_pct;
  });
  return Math.round(Math.min(100, total));
}

export function getSectionRisk(sectionScore: number): number {
  return Math.round((1 - sectionScore / 100) * 100);
}

export function getBand(score: number): Band {
  return BANDS.find(b => score >= b.min) ?? BANDS[BANDS.length - 1];
}
