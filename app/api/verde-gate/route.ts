import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "Missing company_id" }, { status: 400 });

  const supabase = await createClient();

  // Legge company
  const { data: company, error } = await supabase
    .from("companies")
    .select("verde_doc_count, vat_number, id, subscription_tier")
    .eq("id", company_id)
    .single();

  if (error || !company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // TEMPORANEAMENTE DISABILITATO — beta
  // Check P.IVA cross-account
  let effectiveCount = company.verde_doc_count ?? 0;
  // if (company.vat_number && !company.vat_number.startsWith("TEMP-")) {
  //   const { data: vatRows } = await supabase
  //     .from("companies")
  //     .select("verde_doc_count")
  //     .eq("vat_number", company.vat_number);
  //   if (vatRows && vatRows.length > 0) {
  //     effectiveCount = Math.max(...vatRows.map(r => r.verde_doc_count ?? 0));
  //   }
  // }

  // TEMPORANEAMENTE DISABILITATO — beta
  // const paidTiers = ["silver", "gold", "premium"];
  // if (paidTiers.includes(company.subscription_tier ?? "")) {
  //   return NextResponse.json({ allowed: true, count: effectiveCount });
  // }

  // TEMPORANEAMENTE DISABILITATO — beta
  // if (effectiveCount >= 3) {
  //   return NextResponse.json({ allowed: false, count: effectiveCount });
  // }

  // Incrementa (solo tracciamento)
  await supabase
    .from("companies")
    .update({ verde_doc_count: effectiveCount + 1 })
    .eq("id", company_id);

  return NextResponse.json({ allowed: true, count: effectiveCount + 1 });
}
