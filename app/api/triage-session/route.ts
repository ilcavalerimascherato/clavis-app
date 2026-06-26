import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("triage_anonymous")
    .select("entity_name, entity_type, entity_region, total_beds, answers, flags_triggered, risk_score, context_note")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    entity_name: data.entity_name,
    entity_type: data.entity_type,
    entity_region: data.entity_region,
    total_beds: data.total_beds,
    answers: data.answers,
    flags_triggered: data.flags_triggered,
    risk_score: data.risk_score,
    context_note: data.context_note,
  });
}
