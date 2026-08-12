"use client";

/**
 * lib/hooks/useRemediationRows.ts
 * SSOT per il calcolo scadenza/stato/requires di una riga remediation_plans —
 * estratto da app/remediation/page.tsx. Usato sia da /remediation che da
 * /scadenze: stessa fonte dati (remediation_plans filtrato su entity_id OR
 * company_id, come già in uso), stesso criterio temporale
 * (lib/remediationDeadlines.ts), stesso badge requires (lib/requiresLabels.ts).
 *
 * Non applica filtri UI (ricerca, stato, priorità, "mostra completate"):
 * quelli restano specifici di ciascuna pagina, applicati sopra `rows`, che è
 * già arricchito e ordinato per prossimità scadenza (scaduti più vecchi in
 * cima, righe senza scadenza in coda).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";
import { RemediationPlan, computeDeadline as computeDeadlineLegacy, daysLeft } from "@/components/ActionModal";
import {
  computeDeadline as computeFixedDeadline,
  computeRecurringWindow,
  isSatisfiedForRecurringCycle,
  type FlagDictEntry,
} from "@/lib/remediationDeadlines";
import { computeFlagCompletionMap, getUnmetRequiresLabels, type CatalogDocForCompletion } from "@/lib/requiresLabels";
import { ensureUnconditionedCompanyFlagsSeeded } from "@/lib/unconditionedFlags";

export type PlanStatus = "aperto" | "in_corso" | "in_scadenza" | "completato" | "scaduto" | "non_applicabile" | "finestra_persa";

/**
 * Stato effettivo di una remediation — SSOT condiviso da /remediation, /scadenze
 * e dalle card NIS2 (app/nis2/page.tsx), così le tre viste non possono più
 * divergere sullo stesso flag_key. Pura: nessuna dipendenza da hook/stato React.
 */
export function computeEffectiveStatus(
  plan: Pick<RemediationPlan, "status" | "completed_at">,
  deadlineISO: string | null,
  flag?: FlagDictEntry | null,
  // Solo per flag "ricorrente_annuale": completedAt letto da compliance_items.dichiarato_at
  // (per quel flag+company/entity) invece di remediation_plans.completed_at, che non ha
  // righe storiche pregresse per questo tipo di flag. undefined (non passato) preserva il
  // vecchio comportamento (fallback su plan.completed_at) per i chiamanti non aggiornati.
  recurringSatisfiedAt?: string | null,
): PlanStatus {
  const raw = plan.status?.toLowerCase() ?? "aperto";

  // Tipo "ricorrente_annuale": diverge dal calcolo "fissa" solo qui — la
  // soddisfazione è legata al ciclo corrente (isSatisfiedForRecurringCycle),
  // non al semplice "completato" grezzo del piano, e il termine passato
  // senza soddisfazione è "finestra_persa" (viola), non "scaduto" (rosso).
  if (flag?.scadenza?.tipo === "ricorrente_annuale") {
    const window = computeRecurringWindow(flag.scadenza);
    const completedAt = recurringSatisfiedAt !== undefined ? recurringSatisfiedAt : plan.completed_at;
    if (isSatisfiedForRecurringCycle(completedAt, window)) return "completato";
    if (raw === "waived") return "non_applicabile";
    const days = daysLeft(deadlineISO);
    if (days !== null && days < 0) return "finestra_persa";
    return "in_corso";
  }

  if (raw === "completato" || raw === "done" || raw === "verified" || raw === "completed") return "completato";
  if (raw === "waived") return "non_applicabile";
  const days = daysLeft(deadlineISO);
  if (days !== null) {
    if (days < 0) return "scaduto";
    if (days <= 30) return "in_scadenza";
  }
  if (raw === "in_corso" || raw === "in_progress") return "in_corso";
  return "aperto";
}

interface Profile { id: string; full_name: string; email: string; tier: string; }

interface CatalogDocSlim extends CatalogDocForCompletion {
  requires?: string[];
  requires_labels?: string[];
}

interface ComplianceItemSlim { tipo: string; stato: string; dichiarato_at: string | null; }

export interface RemediationRow {
  plan: RemediationPlan;
  deadlineISO: string | null;
  days: number | null;
  status: PlanStatus;
  requiresLabels: string[];
  /** "company" se il flag associato è livello:"company" nel dizionario — usato per il gating capofila. */
  livello: "company" | "entity";
  /** Anno della finestra ricorrente rilevante (aperta o l'ultima chiusa) — null se il flag non è "ricorrente_annuale". */
  recurringCycleYear: number | null;
}

/** flag_key → etichetta area (short_label del flag, fallback control_code) — usato da /remediation e /scadenze. */
export function getSection(plan: RemediationPlan): string {
  if (plan.flag_key) {
    const entry = (LEGAL_DICT as { flags?: Record<string, { short_label?: string }> }).flags?.[plan.flag_key];
    if (entry?.short_label) return entry.short_label;
  }
  return plan.control_code ?? "—";
}

export interface UseRemediationRowsResult {
  loading: boolean;
  profile: Profile | null;
  entityId: string | null;
  companyId: string | null;
  userId: string | null;
  entityFullData: EntityData | null;
  companyData: CompanyData | null;
  plans: RemediationPlan[];
  rows: RemediationRow[];
  refresh: (silent?: boolean) => Promise<void>;
}

export function useRemediationRows(): UseRemediationRowsResult {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeEntityId, entityVersion } = useActiveEntity();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [entityFullData, setEntityFullData] = useState<EntityData | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [catalog, setCatalog] = useState<CatalogDocSlim[]>([]);
  const [entityItems, setEntityItems] = useState<ComplianceItemSlim[]>([]);
  const [companyItems, setCompanyItems] = useState<ComplianceItemSlim[]>([]);

  // ─── LOAD
  const loadData = useCallback(async (silent = false) => {
    if (!activeEntityId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      const { data: profRow } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profRow) setProfile(profRow as Profile);

      const { data: entityData } = await supabase
        .from("entities").select("id").eq("id", activeEntityId).single();
      if (!entityData) { router.push("/onboarding"); return; }
      setEntityId(entityData.id);

      // Carica entity + company
      const { data: entityRow } = await supabase
        .from("entities")
        .select("name, entity_type, region, total_beds, company_id, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, responsabile_it, email_responsabile_it, referente_breach, website_url")
        .eq("id", entityData.id)
        .single();

      const cid = entityRow?.company_id ?? null;

      // Flag incondizionati a livello company (es. ecoreati 231) non passano
      // dal triage: senza questo, non comparirebbero mai in remediation_plans.
      await ensureUnconditionedCompanyFlagsSeeded(supabase, entityData.id, cid, LEGAL_DICT as unknown as { flags: Record<string, { control_code?: string; remediation?: { action?: string } }> });

      const plansQuery = cid
        ? supabase.from("remediation_plans").select("*").or(`entity_id.eq.${entityData.id},company_id.eq.${cid}`)
        : supabase.from("remediation_plans").select("*").eq("entity_id", entityData.id);
      const { data: plansData } = await plansQuery.order("severity", { ascending: false });
      setPlans((plansData as RemediationPlan[]) ?? []);

      // Catalogo + stato compliance — stessa fonte di /documenti per il badge
      // requires (flagCompletionMap) e per il criterio temporale di scadenza.
      const [catalogData, entityComplianceRes, companyComplianceRes] = await Promise.all([
        fetch("/api/documents-catalog").then(r => r.json() as Promise<CatalogDocSlim[]>),
        supabase.from("entity_compliance_items").select("tipo, stato, dichiarato_at").eq("entity_id", entityData.id),
        cid
          ? supabase.from("company_compliance_items").select("tipo, stato, dichiarato_at").eq("company_id", cid)
          : Promise.resolve({ data: [] as ComplianceItemSlim[] }),
      ]);
      setCatalog(catalogData);
      setEntityItems((entityComplianceRes.data ?? []) as ComplianceItemSlim[]);
      setCompanyItems((companyComplianceRes.data ?? []) as ComplianceItemSlim[]);

      if (entityRow) {
        setCompanyId(entityRow.company_id ?? null);
        setEntityFullData({
          entity_name:           entityRow.name          ?? "",
          entity_type:           entityRow.entity_type   ?? "",
          region:                entityRow.region        ?? "",
          total_beds:            entityRow.total_beds    ?? null,
          nome_dpo:              entityRow.nome_dpo              ?? null,
          email_dpo:             entityRow.email_dpo             ?? null,
          dpo_qualifica:         entityRow.dpo_qualifica         ?? null,
          dpo_telefono:          entityRow.dpo_telefono          ?? null,
          responsabile_it:       entityRow.responsabile_it       ?? null,
          email_responsabile_it: entityRow.email_responsabile_it ?? null,
          referente_breach:      entityRow.referente_breach      ?? null,
          website_url:           entityRow.website_url           ?? null,
        });
        if (entityRow.company_id) {
          const { data: compRow } = await supabase
            .from("companies")
            .select("name, vat_number, legal_address, codice_fiscale, pec, legale_rappresentante, fatturato_fascia, n_dipendenti_fascia, modello_231, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono")
            .eq("id", entityRow.company_id)
            .single();
          if (compRow) setCompanyData({
            name:                  compRow.name                  ?? "",
            vat_number:            compRow.vat_number            ?? null,
            legal_address:         compRow.legal_address         ?? null,
            codice_fiscale:        compRow.codice_fiscale        ?? null,
            pec:                   compRow.pec                   ?? null,
            legale_rappresentante: compRow.legale_rappresentante ?? null,
            fatturato_fascia:      compRow.fatturato_fascia      ?? null,
            n_dipendenti_fascia:   compRow.n_dipendenti_fascia   ?? null,
            modello_231:           compRow.modello_231           ?? null,
            nome_dpo:              compRow.nome_dpo              ?? null,
            email_dpo:             compRow.email_dpo             ?? null,
            dpo_qualifica:         compRow.dpo_qualifica         ?? null,
            dpo_telefono:          compRow.dpo_telefono          ?? null,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router, activeEntityId]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── CRITERIO TEMPORALE + BADGE REQUIRES
  const companyItemMap = useMemo(() => Object.fromEntries(companyItems.map(i => [i.tipo, i])), [companyItems]);
  const entityItemMap  = useMemo(() => Object.fromEntries(entityItems.map(i  => [i.tipo, i])),  [entityItems]);

  const flagCompletionMap = useMemo(
    () => computeFlagCompletionMap(catalog, companyItemMap, entityItemMap),
    [catalog, companyItemMap, entityItemMap]
  );

  const flagRequiresMap = useMemo(() => {
    const m: Record<string, { requires: string[]; requires_labels: string[] }> = {};
    for (const d of catalog) {
      if (!(d.flag_key in m)) m[d.flag_key] = { requires: d.requires ?? [], requires_labels: d.requires_labels ?? [] };
    }
    return m;
  }, [catalog]);

  // Scadenza: postponed_until (override utente) > "scadenza" fissa dal dizionario
  // (lib/remediationDeadlines.ts) > vecchia euristica su deadline_label (legacy,
  // per i flag senza "scadenza" nel dizionario — nessuna modifica di comportamento).
  const effectiveDeadlineISO = useCallback((plan: RemediationPlan): string | null => {
    if (plan.postponed_until) return plan.postponed_until;
    const flag = plan.flag_key
      ? ((LEGAL_DICT as { flags?: Record<string, FlagDictEntry> }).flags?.[plan.flag_key] ?? null)
      : null;
    const fixed = computeFixedDeadline(flag, entityFullData, companyData, plan);
    if (fixed) return fixed.toISOString().split("T")[0];
    return computeDeadlineLegacy(plan);
  }, [entityFullData, companyData]);

  const getPlanRequiresLabels = useCallback((plan: RemediationPlan): string[] => {
    if (!plan.flag_key) return [];
    const flagDef = flagRequiresMap[plan.flag_key];
    if (!flagDef) return [];
    return getUnmetRequiresLabels(flagDef, flagCompletionMap);
  }, [flagRequiresMap, flagCompletionMap]);

  // Solo per flag "ricorrente_annuale" (oggi solo Flag_NIS2_Categorizzazione): risolve il
  // documento obbligatorio del catalogo associato al flag e legge il suo dichiarato_at dalla
  // tabella compliance_items corretta secondo "livello" — stessa fonte satisfied-since usata
  // da /documenti, per non divergere tra le due viste.
  const getRecurringSatisfiedAt = useCallback((flagKey: string | null, livello: "company" | "entity"): string | null => {
    if (!flagKey) return null;
    const doc = catalog.find(d => d.flag_key === flagKey && d.obbligatorio) ?? catalog.find(d => d.flag_key === flagKey);
    if (!doc) return null;
    const item = livello === "company" ? companyItemMap[doc.key] : entityItemMap[doc.key];
    return item?.dichiarato_at ?? null;
  }, [catalog, companyItemMap, entityItemMap]);

  // ─── RIGHE ARRICCHITE — ordinate per prossimità scadenza (scaduti/più
  // vicini prima, senza scadenza in coda)
  const rows = useMemo<RemediationRow[]>(() => {
    const built = plans.map(plan => {
      const deadlineISO = effectiveDeadlineISO(plan);
      const days = daysLeft(deadlineISO);
      const dictFlag = plan.flag_key
        ? (LEGAL_DICT as { flags?: Record<string, FlagDictEntry & { livello?: string }> }).flags?.[plan.flag_key]
        : undefined;
      const livello: "company" | "entity" = dictFlag?.livello === "company" ? "company" : "entity";
      const recurringSatisfiedAt = dictFlag?.scadenza?.tipo === "ricorrente_annuale"
        ? getRecurringSatisfiedAt(plan.flag_key, livello)
        : undefined;
      const status = computeEffectiveStatus(plan, deadlineISO, dictFlag ?? null, recurringSatisfiedAt);
      const requiresLabels = getPlanRequiresLabels(plan);
      const recurringCycleYear = dictFlag?.scadenza?.tipo === "ricorrente_annuale"
        ? computeRecurringWindow(dictFlag.scadenza).cycleYear
        : null;
      return { plan, deadlineISO, days, status, requiresLabels, livello, recurringCycleYear };
    });

    built.sort((a, b) => {
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });

    return built;
  }, [plans, effectiveDeadlineISO, getPlanRequiresLabels, getRecurringSatisfiedAt]);

  return {
    loading, profile, entityId, companyId, userId, entityFullData, companyData,
    plans, rows, refresh: loadData,
  };
}
