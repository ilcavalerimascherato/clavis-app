import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Codici interni del campo "framework" di ciascun flag (legal_dictionary.json) → etichetta
// mostrata nei tab-filtro di /documenti. Il framework è dichiarato esplicitamente per flag —
// non derivato dalla sezione (flag.section), che resta un concetto distinto usato solo dal triage.
const FRAMEWORK_LABELS: Record<string, string> = {
  NIS2: "NIS2",
  AI_ACT: "AI Act",
  D231: "D.Lgs. 231",
  GDPR: "GDPR",
  SANITARIO: "Sanitario",
};

export async function GET() {
  const filePath = path.join(process.cwd(), "config", "legal_dictionary.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const dict = JSON.parse(raw);

  const flags = dict.flags as Record<string, any>;
  const catalog: any[] = [];

  for (const [flagKey, flag] of Object.entries(flags)) {
    const framework = FRAMEWORK_LABELS[(flag as any).framework] ?? "Altro";
    const documents: any[] = (flag as any).documents ?? [];
    const requires: string[] = (flag as any).requires ?? [];
    const requiresLabels = requires.map(rk => flags[rk]?.short_label ?? flags[rk]?.label ?? rk);
    for (const doc of documents) {
      catalog.push({ ...doc, flag_key: flagKey, framework, requires, requires_labels: requiresLabels });
    }
  }

  return NextResponse.json(catalog);
}
