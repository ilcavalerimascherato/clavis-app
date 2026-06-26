// lib/tier.ts — SSOT tier system

export type UserTier = "free" | "silver" | "gold" | "premium" | "super_admin";

export const TIER_RANK: Record<UserTier, number> = {
  free: 0,
  silver: 1,
  gold: 2,
  premium: 3,
  super_admin: 99,
};

export const FEATURE_GATES: Record<string, UserTier> = {
  ai_document_analysis: "silver",
  remediation_active:   "silver",
  nis2_module:          "silver",
  fornitori_dpa:        "silver",
  multi_struttura:      "gold",
  export_report:        "gold",
  api_access:           "premium",
};

export function useFeatureGate(feature: string, userTier: UserTier): boolean {
  const required = FEATURE_GATES[feature];
  if (!required) return true;
  return TIER_RANK[userTier] >= TIER_RANK[required];
}
