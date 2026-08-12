import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  // Letto con service role, non con il client cookie-based: il chiamante è anonimo per
  // costruzione (prefill onboarding prima del login, vedi app/onboarding/page.tsx) — non ha
  // un ruolo "authenticated" e triage_anonymous non concede più SELECT al ruolo anon.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin
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
