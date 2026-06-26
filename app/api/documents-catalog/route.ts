import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SECTION_TO_FRAMEWORK: Record<string, string> = {
  S1: "NIS2",
  S2: "AI Act",
  S3: "D.Lgs. 231",
  S4: "NIS2",
  S5: "GDPR",
  S6: "Sanitario",
};

export async function GET() {
  const filePath = path.join(process.cwd(), "config", "legal_dictionary.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const dict = JSON.parse(raw);

  const flags = dict.flags as Record<string, any>;
  const catalog: any[] = [];

  for (const [flagKey, flag] of Object.entries(flags)) {
    const framework = SECTION_TO_FRAMEWORK[(flag as any).section] ?? "Altro";
    const documents: any[] = (flag as any).documents ?? [];
    for (const doc of documents) {
      catalog.push({ ...doc, flag_key: flagKey, framework });
    }
  }

  return NextResponse.json(catalog);
}
