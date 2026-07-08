// lib/complianceProgress.ts
// SSOT per il conteggio "documenti obbligatori attivi / conformi" di una entity.
// Estratto da app/documenti/page.tsx (docsObbligatoriAttivi / docsConformi) perché
// era duplicato e disallineato in app/dashboard/page.tsx (blocco "Verso la superficie").

import { createClient } from "@/lib/supabase/client";

interface CatalogDocSlim {
  key: string;
  obbligatorio: boolean;
  scope: string;
  flag_key: string;
}

export interface ComplianceProgress {
  totali: number;
  completati: number;
}

export async function getComplianceProgress(
  entityId: string,
  companyId: string | null,
): Promise<ComplianceProgress> {
  const supabase = createClient();

  const [catalog, entityRes, companyRes, latestSessRes] = await Promise.all([
    fetch("/api/documents-catalog").then(r => r.json() as Promise<CatalogDocSlim[]>),
    supabase.from("entity_compliance_items").select("tipo, stato").eq("entity_id", entityId),
    companyId
      ? supabase.from("company_compliance_items").select("tipo, stato").eq("company_id", companyId)
      : Promise.resolve({ data: [] as { tipo: string; stato: string }[] }),
    supabase
      .from("triage_sessions")
      .select("id")
      .eq("entity_id", entityId)
      .eq("status", "generated")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const allItems = [
    ...((entityRes.data ?? []) as { tipo: string; stato: string }[]),
    ...((companyRes.data ?? []) as { tipo: string; stato: string }[]),
  ];

  let triageDone = false;
  let activeFlags: string[] = [];
  const latestSess = latestSessRes.data as { id: string } | null;
  if (latestSess) {
    triageDone = true;
    const { data: remData } = await supabase
      .from("remediation_plans")
      .select("flag_key")
      .eq("session_id", latestSess.id);
    activeFlags = (remData ?? []).map((r: { flag_key: string }) => r.flag_key);
  }

  // Stesso filtro di app/documenti/page.tsx: obbligatorio + (scope ALL, oppure
  // triage non ancora fatto — quindi da considerare finché non si prova il contrario —
  // oppure il flag è stato attivato dal triage più recente).
  const docsObbligatoriAttivi = catalog.filter(d => {
    if (!d.obbligatorio) return false;
    return d.scope === "ALL" ? true : (!triageDone || activeFlags.includes(d.flag_key));
  });

  const completati = docsObbligatoriAttivi.filter(d => {
    const item = allItems.find(i => i.tipo === d.key);
    return item != null && (item.stato === "CONFORME" || item.stato === "DICHIARATO");
  }).length;

  return { totali: docsObbligatoriAttivi.length, completati };
}
