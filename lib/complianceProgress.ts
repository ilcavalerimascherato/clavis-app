// lib/complianceProgress.ts
// SSOT per il conteggio "documenti obbligatori attivi / conformi" di una entity.
// Estratto da app/documenti/page.tsx (docsObbligatoriAttivi / docsConformi) perché
// era duplicato e disallineato in app/dashboard/page.tsx (blocco "Verso la superficie").

import { createClient } from "@/lib/supabase/client";
import { isSatisfiedStatus } from "@/lib/requiresLabels";

interface CatalogDocSlim {
  key: string;
  obbligatorio: boolean;
  scope: string;
  flag_key: string;
  livello: "company" | "entity";
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
      .maybeSingle(),
  ]);

  const entityItems  = (entityRes.data  ?? []) as { tipo: string; stato: string }[];
  const companyItems = (companyRes.data ?? []) as { tipo: string; stato: string }[];

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

  // Flag company-level (es. registrazione ACN, logging, CdA — vedi campo "livello" nel
  // dizionario legale) attivati da un'altra entity della stessa company: vanno considerati
  // "attivi" indipendentemente dalla sessione di triage specifica di questa entity.
  if (companyId) {
    const { data: companyRemData } = await supabase
      .from("remediation_plans")
      .select("flag_key")
      .eq("company_id", companyId);
    const companyFlags = (companyRemData ?? []).map((r: { flag_key: string | null }) => r.flag_key).filter(Boolean) as string[];
    activeFlags = [...new Set([...activeFlags, ...companyFlags])];
  }

  // Stesso filtro di app/documenti/page.tsx: obbligatorio + (scope ALL, oppure
  // triage non ancora fatto — quindi da considerare finché non si prova il contrario —
  // oppure il flag è stato attivato dal triage più recente).
  const docsObbligatoriAttivi = catalog.filter(d => {
    if (!d.obbligatorio) return false;
    return d.scope === "ALL" ? true : (!triageDone || activeFlags.includes(d.flag_key));
  });

  // Lookup nella tabella corretta secondo il "livello" del documento — un documento
  // company-level va cercato solo tra i company_compliance_items, mai tra quelli
  // dell'entity, altrimenti una riga entity residua/legacy con lo stesso "tipo"
  // falserebbe il conteggio in modo incoerente tra le strutture della stessa società.
  const completati = docsObbligatoriAttivi.filter(d => {
    const items = d.livello === "company" ? companyItems : entityItems;
    const item = items.find(i => i.tipo === d.key);
    return isSatisfiedStatus(item?.stato);
  }).length;

  return { totali: docsObbligatoriAttivi.length, completati };
}
