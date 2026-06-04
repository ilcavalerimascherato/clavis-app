// Shared design tokens and scoring utilities — dark palette CLAVIS.
// Import from here; do not redefine locally.

export const T = {
  // ── Base
  navy:      "#0A0E1A",
  navyLight: "#0F1424",
  slate50:   "#0F1424",
  slate100:  "#141B30",
  slate200:  "rgba(238,241,248,.16)",
  slate400:  "#9AA3BD",
  slate600:  "#9AA3BD",
  slate800:  "#EEF1F8",
  // ── Accent
  bronze:    "#D9B25A",
  bronzeBg:  "rgba(217,178,90,.12)",
  gold:      "#D9B25A",
  // ── Risk bands
  critical:  "#E8634A",
  critBg:    "rgba(232,99,74,.12)",
  high:      "#5E86F5",
  highBg:    "rgba(94,134,245,.12)",
  medium:    "#D9B25A",
  medBg:     "rgba(217,178,90,.12)",
  low:       "#3ECF8E",
  lowBg:     "rgba(62,207,142,.10)",
  // ── Extended semantic
  amber:     "#F59E0B",
  amberBg:   "rgba(245,158,11,.12)",
  warn:      "#F59E0B",
  warnBg:    "rgba(245,158,11,.12)",
  orange:    "#F97316",
  orangeBg:  "rgba(249,115,22,.12)",
  boneDim:   "#9AA3BD",
  boneDimBg: "rgba(154,163,189,.10)",
};

export function getBandTokens(score: number) {
  if (score >= 75) return { color: T.critical, textColor: T.critical, bg: T.critBg, label: "CRITICO",   border: T.critical };
  if (score >= 50) return { color: T.high,     textColor: T.gold,     bg: T.highBg, label: "ALTO",      border: T.high     };
  if (score >= 25) return { color: T.medium,   textColor: T.medium,   bg: T.medBg,  label: "MEDIO",     border: T.medium   };
  return               { color: T.low,      textColor: T.low,      bg: T.lowBg,  label: "CONTENUTO", border: T.low      };
}

export function getBarColor(risk: number): string {
  if (risk >= 70) return T.critical;
  if (risk >= 50) return T.gold;
  if (risk >= 30) return T.medium;
  return T.low;
}
