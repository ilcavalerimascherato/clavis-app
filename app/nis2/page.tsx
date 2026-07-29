"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useFeatureGate } from "@/lib/tier";
import { type UserTier } from "@/lib/tier";
import { useActiveEntity } from "@/contexts/EntityContext";
import { useAnchorEntity } from "@/lib/hooks/useAnchorEntity";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import AppShell from "@/components/layout/AppShell";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import { DocumentoModal, type AdempimentoDef } from "@/components/DocumentoModal";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";
import type { ComplianceStato } from "@/lib/types";
import { isSatisfiedStatus, getSequenceBlockLabel, type CatalogDocForSequence } from "@/lib/requiresLabels";
import { computeEffectiveStatus, type PlanStatus } from "@/lib/hooks/useRemediationRows";
import { computeDeadline as computeFixedDeadline, computeRecurringWindow, type FlagDictEntry } from "@/lib/remediationDeadlines";
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw,
  Upload, FileText, CheckCircle2, AlertTriangle,
  Lock, ExternalLink, Info,
  Building2, ClipboardList, Siren, FileCode2,
  ChevronUp, ChevronDown, Network,
} from "lucide-react";

// ─── TOKENS (allineati al design system CLAVIS)
const T = {
  ink:      "#080c14",
  ink2:     "#0F1424",
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.10)",
  slate400: "#9AA3BD",
  bone:     "#f0ece0",
  boneDim:  "#c8c2b4",
  shield:   "#2563eb",
  shieldBg: "rgba(37,99,235,.12)",
  gold:     "#D9B25A",
  goldBg:   "rgba(217,178,90,.10)",
  emerald:  "#3ECF8E",
  emeraldBg:"rgba(62,207,142,.10)",
  amber:    "#F59E0B",
  amberBg:  "rgba(245,158,11,.10)",
  red:      "#EF4444",
  redBg:    "rgba(239,68,68,.10)",
  violet:   "#8B5CF6",
  violetBg: "rgba(139,92,246,.12)",
  line:     "rgba(238,241,248,.08)",
};

// ─── TIPI
type Nis2Tier = "soggetto_essenziale" | "borderline" | "non_soggetto";
type OverrideTipo = "blu" | "ambra";

interface Nis2Assessment {
  id: string;
  esito_calcolato: Nis2Tier;
  motivazioni: string[];
  esito_effettivo: Nis2Tier;
  override_tipo: OverrideTipo | null;
  override_esito: Nis2Tier | null;
  override_motivazione: string | null;
  override_at: string | null;
  parere_legale_file_url: string | null;
  parere_legale_professionista: string | null;
  parere_legale_data: string | null;
  ai_analysis: { esito: string; reasoning: string; confidence: string } | null;
  snapshot_dipendenti: string | null;
  snapshot_fatturato: string | null;
  snapshot_is_pa: boolean | null;
  dati_aggregati_gruppo: boolean | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  tier: UserTier;
}

// ─── HELPERS
function esitoLabel(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return "Soggetto Essenziale NIS2";
    case "borderline":          return "Valutazione richiesta";
    case "non_soggetto":        return "Non soggetto NIS2";
  }
}

function esitoColor(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return T.shield;
    case "borderline":          return T.amber;
    case "non_soggetto":        return T.slate400;
  }
}

function esitoColorBg(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return T.shieldBg;
    case "borderline":          return T.amberBg;
    case "non_soggetto":        return "rgba(154,163,189,.08)";
  }
}

function esitoIcon(esito: Nis2Tier, size = 20) {
  switch (esito) {
    case "soggetto_essenziale": return <ShieldCheck size={size} />;
    case "borderline":          return <ShieldAlert size={size} />;
    case "non_soggetto":        return <ShieldX size={size} />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── CRITICITÀ SUPPLY CHAIN (allineato a /sistemi)
type CriticitaNis2Type = "non_valutata" | "bassa" | "media" | "alta" | "critica";

const CRITICITA_LABEL: Record<CriticitaNis2Type, string> = {
  non_valutata: "Da valutare",
  bassa:        "Bassa",
  media:        "Media",
  alta:         "Alta",
  critica:      "Critica",
};

const CRITICITA_COLORI: Record<CriticitaNis2Type, { border: string; bg: string; text: string }> = {
  non_valutata: { border: "#3f3f46", bg: "rgba(63,63,70,0.3)",  text: "#a1a1aa" },
  bassa:        { border: "#14532d", bg: "rgba(20,83,45,0.3)",  text: "#86efac" },
  media:        { border: "#78350f", bg: "rgba(120,53,15,0.3)", text: "#fcd34d" },
  alta:         { border: "#7c2d12", bg: "rgba(124,45,18,0.3)", text: "#fdba74" },
  critica:      { border: "#7f1d1d", bg: "rgba(127,29,29,0.3)", text: "#fca5a5" },
};

// ─── FASCE ORGANICO (conferma pre-valutazione soggettività)
const FASCIA_FATTURATO_OPTIONS = [
  { value: "sotto_1M",  label: "Meno di 1M€" },
  { value: "1M_5M",     label: "1M-5M€" },
  { value: "5M_20M",    label: "5M-20M€" },
  { value: "20M_50M",   label: "20M-50M€" },
  { value: "oltre_50M", label: "Oltre 50M€" },
] as const;

// ─── BADGE STATO REMEDIATION (remediation_plans, via computeEffectiveStatus — stessa
// SSOT di /remediation e /scadenze: le card NIS2 non possono più divergere da quelle
// pagine sullo stesso flag_key, a differenza del vecchio ScadenzeBox hardcoded).
const PLAN_STATUS_BADGE: Record<PlanStatus, { label: string; color: string; bg: string }> = {
  completato:       { label: "✓ Completato",      color: T.emerald,  bg: T.emeraldBg },
  in_corso:         { label: "◐ In corso",         color: T.shield,   bg: T.shieldBg },
  in_scadenza:      { label: "⚠ In scadenza",      color: T.amber,    bg: T.amberBg },
  scaduto:          { label: "✕ Scaduto",          color: T.red,      bg: T.redBg },
  non_applicabile:  { label: "— Non applicabile",  color: T.slate400, bg: "rgba(154,163,189,.12)" },
  finestra_persa:   { label: "Finestra persa",     color: T.violet,   bg: T.violetBg },
  aperto:           { label: "⚠ Da sanare",        color: T.amber,    bg: T.amberBg },
};

// ─── MODULI OPERATIVI (4 box) → flag/documento primario in config/legal_dictionary.json
// Mapping verificato a mano sul dizionario. "policy" usa policy_sicurezza_nis2 (non
// il primo obbligatorio in ordine di sequenza, che sarebbe pacchetto_cda) perché è
// il documento semanticamente corretto per "Policy Generator" — ora generabile,
// dato che buildPolicySicurezzaNis2()/FLAG_OUTPUT_TYPE sono stati aggiunti in
// lib/documentTemplates.ts (in precedenza cadeva nel default null di buildDocument()).
const NIS2_MODULO_DOC: Record<string, { flagKey: string; docKey: string }> = {
  acn:             { flagKey: "Flag_NIS2_Registration",    docKey: "scheda_registrazione_acn" },
  incident:        { flagKey: "Flag_NIS2_IRP",             docKey: "irp" },
  policy:          { flagKey: "Flag_NIS2_CdA",             docKey: "policy_sicurezza_nis2" },
  checklist:       { flagKey: "Flag_NIS2_Logging",         docKey: "procedura_logging" },
  categorizzazione: { flagKey: "Flag_NIS2_Categorizzazione", docKey: "categorizzazione_attivita_servizi" },
};

// Sotto-catalogo (solo i documenti dei 4 flag sopra) nella stessa forma richiesta
// da getSequenceBlockLabel — costruito dal dizionario, non da una lista inventata.
type Nis2CatalogDoc = CatalogDocForSequence & { revisione_mesi: number | null; relazionale: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NIS2_DICT = LEGAL_DICT as any;
const NIS2_LAUNCHER_CATALOG: Nis2CatalogDoc[] = Object.values(NIS2_MODULO_DOC)
  .map(m => m.flagKey)
  .filter((fk, i, arr) => arr.indexOf(fk) === i)
  .flatMap((fk) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (NIS2_DICT.flags?.[fk]?.documents ?? []).map((d: any) => ({
      key: d.key as string,
      flag_key: fk,
      livello: d.livello as "company" | "entity",
      obbligatorio: !!d.obbligatorio,
      label: d.label as string,
      revisione_mesi: d.revisione_mesi ?? null,
      relazionale: !!d.relazionale,
    }))
  );

// ─── DOCUMENTI "FULL FLOW" — riuso DocumentoModal (stesso meccanismo BLU/AMBRA/VERDE già
// usato da /documenti per es. Nomina DPO) invece del solo GenerateDocModal, per i moduli
// che offrono anche Autocertifica/Carica e analizza, non solo la generazione guidata.
// Oggi: Registrazione ACN (Flag_NIS2_Registration), Categorizzazione ACN
// (Flag_NIS2_Categorizzazione, producibile:false — CLAVIS non genera nulla, solo
// Autocertifica dopo il passaggio sul portale) e Policy Generator (Flag_NIS2_CdA). Il
// gating di sequenza (policy_sicurezza_nis2 è idx1 dopo pacchetto_cda idx0) resta invariato:
// sequenceLockedLabel in ModuloBox blocca il rendering del bottone fullFlow prima ancora
// che arrivi qui, indipendentemente da quale modulo lo usi. Non tocca gli altri moduli.
function buildAdempimentoDef(flagKey: string, docKey: string): AdempimentoDef | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = NIS2_DICT.flags?.[flagKey]?.documents?.find((d: any) => d.key === docKey);
  if (!raw) return null;
  return {
    tipo: raw.key,
    label: raw.label,
    norma: raw.norma,
    descrizione: raw.descrizione,
    producibile: !!raw.producibile,
    obbligatorio: !!raw.obbligatorio,
    maxPagine: raw.max_pagine,
    cosaCaricare: raw.cosa_caricare,
    modalKey: raw.key,
    flagKey,
    condizionale: !!raw.condizionale,
    condizioneLabel: raw.condizione_label ?? undefined,
  };
}

const FULL_FLOW_DOCS: Record<string, AdempimentoDef | null> = {
  scheda_registrazione_acn:          buildAdempimentoDef("Flag_NIS2_Registration", "scheda_registrazione_acn"),
  categorizzazione_attivita_servizi: buildAdempimentoDef("Flag_NIS2_Categorizzazione", "categorizzazione_attivita_servizi"),
  policy_sicurezza_nis2:             buildAdempimentoDef("Flag_NIS2_CdA", "policy_sicurezza_nis2"),
};

// ─── OVERRIDE VISIVO SCADENZE RICORRENTI (es. Flag_NIS2_Categorizzazione) — stessa logica
// di getRecurringFinestraOverride() in app/documenti/page.tsx (non esportata da lì, quindi
// re-implementata qui sulle stesse primitive SSOT: computeRecurringWindow + isSatisfiedStatus).
// Se lo stato del documento non è già soddisfatto e la finestra annuale è chiusa, il badge
// diventa viola "Finestra {anno} persa" invece del grigio "Da avviare".
function getRecurringFinestraOverride(catalogDoc: Nis2CatalogDoc, item: { stato: string } | null | undefined): { detail: string } | null {
  const flag = (NIS2_DICT.flags?.[catalogDoc.flag_key] ?? null) as FlagDictEntry | null;
  if (flag?.scadenza?.tipo !== "ricorrente_annuale") return null;
  if (isSatisfiedStatus(item?.stato)) return null;
  const window = computeRecurringWindow(flag.scadenza);
  if (window.isOpen) return null;
  return { detail: `Finestra ${window.cycleYear} persa — prossima 1 mag-30 giu ${window.cycleYear + 1}` };
}

// ─── BADGE STATO DOCUMENTO (entity_compliance_items / company_compliance_items.stato)
const DOC_STATO_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  CONFORME:     { label: "✓ Conforme",             color: T.emerald,  bg: T.emeraldBg },
  DICHIARATO:   { label: "Autocertificato",        color: T.shield,   bg: T.shieldBg },
  GENERATO:     { label: "Generato — da firmare",  color: T.amber,    bg: T.amberBg },
  IN_CORSO:     { label: "In scadenza",             color: T.amber,    bg: T.amberBg },
  NON_CONFORME: { label: "Non conforme",            color: T.red,      bg: T.redBg },
  SCADUTO:      { label: "Scaduto",                 color: T.red,      bg: T.redBg },
  MANCANTE:     { label: "Da avviare",              color: T.slate400, bg: "rgba(154,163,189,.12)" },
};

// ─── COMPONENTE PRINCIPALE
export default function Nis2Page() {
  const router   = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const { activeEntityId, entityVersion } = useActiveEntity();
  const { anchorEntity, isAnchor, loading: anchorLoading } = useAnchorEntity();

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [companyId,  setCompanyId]  = useState<string | null>(null);
  const [entityId,   setEntityId]   = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Nis2Assessment | null>(null);
  const [remediationStatus, setRemediationStatus] = useState<Record<string, { status: string; completed_at: string | null }>>({});
  const [hasGruppo,  setHasGruppo]  = useState(false);
  const [loading,    setLoading]    = useState(true);

  // ─── DATI PER I LAUNCHER GenerateDocModal (moduli operativi NIS2)
  const [userId,          setUserId]          = useState<string>("");
  const [entityFullData,  setEntityFullData]  = useState<EntityData | null>(null);
  const [companyFullData, setCompanyFullData] = useState<CompanyData | null>(null);
  const [entityDocItems,  setEntityDocItems]  = useState<Record<string, { stato: string }>>({});
  const [companyDocItems, setCompanyDocItems] = useState<Record<string, { stato: string }>>({});
  const [openDocKey,      setOpenDocKey]      = useState<string | null>(null);
  // Moduli "full flow" (ACN, Categorizzazione) — riusano DocumentoModal (BLU/AMBRA/VERDE)
  // invece del solo GenerateDocModal. Valore = docKey in FULL_FLOW_DOCS, null = chiuso.
  const [fullFlowDocKey,  setFullFlowDocKey]  = useState<string | null>(null);
  const [rivalutando, setRivalutando] = useState(false);
  const [showConfermaOrganico, setShowConfermaOrganico] = useState(false);

  // override state
  const [showOverride,      setShowOverride]      = useState(false);
  const [overrideTipo,      setOverrideTipo]      = useState<OverrideTipo>("ambra");
  const [overrideEsito,     setOverrideEsito]     = useState<"soggetto_essenziale" | "non_soggetto">("soggetto_essenziale");
  const [overrideMotivazione, setOverrideMotivazione] = useState("");
  const [overrideLegale,    setOverrideLegale]    = useState("");
  const [overrideFile,      setOverrideFile]      = useState<File | null>(null);
  const [overrideSaving,    setOverrideSaving]    = useState(false);
  const [overrideError,     setOverrideError]     = useState("");

  // accordion moduli rimosso — layout 2x2 sempre espanso

  const isPro = useFeatureGate("nis2_module", profile?.tier ?? "free");

  // Anno della finestra Categorizzazione ACN rilevante oggi (aperta o l'ultima chiusa) —
  // stessa SSOT di /remediation e /scadenze, usata solo per il testo "Finestra 1 mag-30 giu {anno}".
  const categorizzazioneCycleYear = computeRecurringWindow(
    NIS2_DICT.flags?.["Flag_NIS2_Categorizzazione"]?.scadenza as { finestra_apertura: string; finestra_chiusura: string }
  ).cycleYear;

  // ─── LOAD
  const load = useCallback(async (): Promise<Nis2Assessment | null> => {
    if (!activeEntityId) return null;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return null; }

    setUserId(user.id);

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof) { router.push("/login"); return null; }
    setProfile(prof);

    const { data: entityRow } = await supabase
      .from("entities").select("id, company_id").eq("id", activeEntityId).maybeSingle();

    const resolvedEntityId = entityRow?.id ?? null;
    setEntityId(resolvedEntityId);

    const cid = entityRow?.company_id ?? null;
    setCompanyId(cid);
    if (!cid) { router.push("/onboarding"); return null; }

    // ── Dati completi società/struttura + stato documenti — per i launcher
    // GenerateDocModal dei moduli operativi (stesse colonne/pattern di /documenti).
    const { data: companyFull } = await supabase
      .from("companies")
      .select("id, name, vat_number, legal_address, codice_fiscale, pec, legale_rappresentante, fatturato_fascia, n_dipendenti_fascia, modello_231, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, legale_esterno, firmatario_dpa")
      .eq("id", cid).single();
    if (companyFull) setCompanyFullData({
      name:                companyFull.name ?? "",
      vat_number:          companyFull.vat_number ?? null,
      legal_address:       companyFull.legal_address ?? null,
      codice_fiscale:      companyFull.codice_fiscale ?? null,
      pec:                 companyFull.pec ?? null,
      legale_rappresentante: companyFull.legale_rappresentante ?? null,
      fatturato_fascia:    companyFull.fatturato_fascia ?? null,
      n_dipendenti_fascia: companyFull.n_dipendenti_fascia ?? null,
      modello_231:         companyFull.modello_231 ?? null,
      nome_dpo:            companyFull.nome_dpo ?? null,
      email_dpo:           companyFull.email_dpo ?? null,
      dpo_qualifica:       companyFull.dpo_qualifica ?? null,
      dpo_telefono:        companyFull.dpo_telefono ?? null,
      legale_esterno:      companyFull.legale_esterno ?? null,
      firmatario_dpa:      companyFull.firmatario_dpa ?? null,
    });

    const { data: companyItems } = await supabase
      .from("company_compliance_items")
      .select("tipo, stato")
      .eq("company_id", cid)
      .in("tipo", ["scheda_registrazione_acn", "pacchetto_cda", "policy_sicurezza_nis2", "categorizzazione_attivita_servizi"]);
    setCompanyDocItems(Object.fromEntries((companyItems ?? []).map((i: { tipo: string; stato: string }) => [i.tipo, { stato: i.stato }])));

    if (resolvedEntityId) {
      const { data: entityFull } = await supabase
        .from("entities")
        .select("name, entity_type, region, total_beds, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, responsabile_it, email_responsabile_it, referente_breach, website_url, direttore_sanitario, responsabile_formazione, indirizzo, rto, rpo, frequenza_backup, tipo_backup, ubicazione_backup, fornitore_backup, ubicazione_registro_cartaceo, ubicazione_stampa_terapie, telefono_responsabile_it, telefono_direttore_sanitario, responsabile_ripristino, direttore_struttura, telefono_direttore_struttura, canale_segnalazione_incidenti, referente_nis2_nome, referente_nis2_cognome, referente_nis2_email, referente_nis2_telefono")
        .eq("id", resolvedEntityId).single();
      if (entityFull) setEntityFullData({
        entity_name:                  entityFull.name ?? "",
        entity_type:                  entityFull.entity_type ?? "",
        region:                       entityFull.region ?? "",
        total_beds:                   entityFull.total_beds ?? null,
        nome_dpo:                     entityFull.nome_dpo ?? null,
        email_dpo:                    entityFull.email_dpo ?? null,
        dpo_qualifica:                entityFull.dpo_qualifica ?? null,
        dpo_telefono:                 entityFull.dpo_telefono ?? null,
        responsabile_it:              entityFull.responsabile_it ?? null,
        email_responsabile_it:        entityFull.email_responsabile_it ?? null,
        referente_breach:             entityFull.referente_breach ?? null,
        website_url:                  entityFull.website_url ?? null,
        direttore_sanitario:          entityFull.direttore_sanitario ?? null,
        responsabile_formazione:      entityFull.responsabile_formazione ?? null,
        indirizzo:                    entityFull.indirizzo ?? null,
        rto:                          entityFull.rto ?? null,
        rpo:                          entityFull.rpo ?? null,
        frequenza_backup:             entityFull.frequenza_backup ?? null,
        tipo_backup:                  entityFull.tipo_backup ?? null,
        ubicazione_backup:            entityFull.ubicazione_backup ?? null,
        fornitore_backup:             entityFull.fornitore_backup ?? null,
        ubicazione_registro_cartaceo: entityFull.ubicazione_registro_cartaceo ?? null,
        ubicazione_stampa_terapie:    entityFull.ubicazione_stampa_terapie ?? null,
        telefono_responsabile_it:     entityFull.telefono_responsabile_it ?? null,
        telefono_direttore_sanitario: entityFull.telefono_direttore_sanitario ?? null,
        responsabile_ripristino:      entityFull.responsabile_ripristino ?? null,
        direttore_struttura:          entityFull.direttore_struttura ?? null,
        telefono_direttore_struttura: entityFull.telefono_direttore_struttura ?? null,
        canale_segnalazione_incidenti: entityFull.canale_segnalazione_incidenti ?? null,
        referente_nis2_nome: entityFull.referente_nis2_nome ?? null,
        referente_nis2_cognome: entityFull.referente_nis2_cognome ?? null,
        referente_nis2_email: entityFull.referente_nis2_email ?? null,
        referente_nis2_telefono: entityFull.referente_nis2_telefono ?? null,
      });

      const { data: entityItems } = await supabase
        .from("entity_compliance_items")
        .select("tipo, stato")
        .eq("entity_id", resolvedEntityId)
        .in("tipo", ["irp", "procedura_logging"]);
      setEntityDocItems(Object.fromEntries((entityItems ?? []).map((i: { tipo: string; stato: string }) => [i.tipo, { stato: i.stato }])));
    } else {
      setEntityDocItems({});
    }

    const { data: ass } = await supabase
      .from("v_nis2_last_assessment")
      .select("*")
      .eq("company_id", cid)
      .maybeSingle();
    setAssessment(ass ?? null);
    // "Tipo soggetto" in Scheda Registrazione ACN (lib/documentTemplates.ts) — stessa
    // fonte già letta sopra, solo propagata al CompanyData passato ai builder.
    setCompanyFullData(prev => prev ? { ...prev, nis2_esito_calcolato: ass?.esito_calcolato ?? null } : prev);

    // ── GRUPPO: la company fa parte di un gruppo se gruppo_id è valorizzato
    // e un'altra company del portfolio dell'utente condivide lo stesso gruppo_id.
    const { data: companyRow } = await supabase
      .from("companies")
      .select("gruppo_id")
      .eq("id", cid)
      .maybeSingle();
    const gruppoId = companyRow?.gruppo_id ?? null;
    if (gruppoId) {
      const { data: userEntities } = await supabase
        .from("entities")
        .select("company_id")
        .eq("created_by", user.id);
      const portfolioCompanyIds = [...new Set((userEntities ?? []).map(e => e.company_id).filter(Boolean))] as string[];
      if (portfolioCompanyIds.length > 0) {
        const { count } = await supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("gruppo_id", gruppoId)
          .neq("id", cid)
          .in("id", portfolioCompanyIds);
        setHasGruppo((count ?? 0) > 0);
      } else {
        setHasGruppo(false);
      }
    } else {
      setHasGruppo(false);
    }

    if (resolvedEntityId) {
      const remFlagKeys = ["Flag_NIS2_Registration", "Flag_NIS2_IRP", "Flag_NIS2_CdA", "Flag_NIS2_Logging", "Flag_NIS2_Categorizzazione"];
      const remQuery = cid
        ? supabase.from("remediation_plans").select("flag_key, status, completed_at").or(`entity_id.eq.${resolvedEntityId},company_id.eq.${cid}`)
        : supabase.from("remediation_plans").select("flag_key, status, completed_at").eq("entity_id", resolvedEntityId);
      const { data: remPlans } = await remQuery.in("flag_key", remFlagKeys);
      const map: Record<string, { status: string; completed_at: string | null }> = {};
      (remPlans ?? []).forEach((r: { flag_key: string | null; status: string; completed_at: string | null }) => {
        if (r.flag_key) map[r.flag_key] = { status: r.status, completed_at: r.completed_at };
      });
      setRemediationStatus(map);
    } else {
      setRemediationStatus({});
    }

    setLoading(false);
    return ass ?? null;
  }, [supabase, router, activeEntityId]);

  useEffect(() => { load(); }, [load, entityVersion]);

  // ─── RIVALUTA
  async function rivaluta(aggregatoGruppo: boolean = false) {
    if (!profile || !companyId) return;
    setRivalutando(true);
    await supabase.rpc("fn_verifica_soggettivita_nis2", { p_company_id: companyId });
    let freshAssessment = await load();

    if (freshAssessment?.id) {
      const { error: aggErr } = await supabase
        .from("nis2_assessments")
        .update({ dati_aggregati_gruppo: aggregatoGruppo })
        .eq("id", freshAssessment.id);
      if (aggErr) console.error("Errore salvataggio dati_aggregati_gruppo:", aggErr);
      freshAssessment = await load();
    }

    if (freshAssessment?.esito_calcolato === "soggetto_essenziale" && entityId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dict = LEGAL_DICT as any;
      const flagsToSeed = ["Flag_NIS2_Registration", "Flag_NIS2_Logging", "Flag_NIS2_CdA", "Flag_NIS2_Categorizzazione"];
      const { data: existing } = await supabase
        .from("remediation_plans")
        .select("flag_key")
        .eq("company_id", companyId)
        .in("flag_key", flagsToSeed);
      const existingKeys = new Set((existing ?? []).map((r: { flag_key: string | null }) => r.flag_key));
      const missing = flagsToSeed.filter(f => !existingKeys.has(f));
      if (missing.length > 0) {
        const { error: seedError } = await supabase.from("remediation_plans").insert(
          missing.map(flag_key => ({
            entity_id: entityId,
            company_id: dict.flags?.[flag_key]?.livello === "company" ? companyId : null,
            flag_key,
            status: "open",
            session_id: null,
            control_code: dict.flags?.[flag_key]?.control_code ?? null,
            planned_action: dict.flags?.[flag_key]?.remediation?.action ?? null,
          }))
        );
        if (seedError) console.error("Errore insert remediation_plans (seed flag NIS2):", seedError);
      }
    } else if (freshAssessment?.esito_calcolato === "non_soggetto" && companyId) {
      const flagsCompanyLevel = ["Flag_NIS2_Registration", "Flag_NIS2_Logging", "Flag_NIS2_CdA", "Flag_NIS2_Categorizzazione"];
      const { error: downgradeError } = await supabase
        .from("remediation_plans")
        .update({ status: "waived" })
        .eq("company_id", companyId)
        .in("flag_key", flagsCompanyLevel)
        .not("status", "in", "(completato,waived)");
      if (downgradeError) console.error("Errore downgrade remediation_plans a waived:", downgradeError);
      await load();
    }

    setRivalutando(false);
  }

  // ─── APRI CONFERMA ORGANICO (step intermedio prima di rivaluta)
  function apriConfermaOrganico() {
    setShowConfermaOrganico(true);
  }

  // ─── SALVA OVERRIDE
  async function salvaOverride() {
    if (!assessment || !profile || !companyId) return;
    if (!overrideMotivazione.trim()) { setOverrideError("La motivazione è obbligatoria."); return; }
    if (overrideTipo === "blu" && !overrideFile) { setOverrideError("Carica il documento del parere legale."); return; }
    setOverrideError("");
    setOverrideSaving(true);

    let fileUrl: string | null = null;

    // Upload file se strada blu
    if (overrideTipo === "blu" && overrideFile) {
      const path = `nis2-pareri/${companyId}/${Date.now()}_${overrideFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, overrideFile, { upsert: false });
      if (uploadError) { setOverrideError("Errore upload file: " + uploadError.message); setOverrideSaving(false); return; }
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      fileUrl = urlData?.publicUrl ?? null;
    }

    const { error } = await supabase
      .from("nis2_assessments")
      .update({
        override_tipo:               overrideTipo,
        override_esito:              overrideEsito,
        override_motivazione:        overrideMotivazione,
        override_by:                 profile.id,
        override_at:                 new Date().toISOString(),
        ...(overrideTipo === "blu" ? {
          parere_legale_file_url:         fileUrl,
          parere_legale_professionista:   overrideLegale,
          parere_legale_data:             new Date().toISOString().split("T")[0],
        } : {}),
      })
      .eq("id", assessment.id);

    if (error) { setOverrideError("Errore salvataggio: " + error.message); setOverrideSaving(false); return; }
    setShowOverride(false);
    setOverrideMotivazione("");
    setOverrideLegale("");
    setOverrideFile(null);
    await load();
    setOverrideSaving(false);
  }

  // ─── RENDER LOADING
  if (loading) {
    return (
      <AppShell profile={profile} activeRoute="/nis2">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin" style={{ color: T.shield }} />
            <p className="text-sm leading-relaxed" style={{ color: T.slate400 }}>Caricamento modulo NIS2…</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const esito = assessment?.esito_effettivo ?? null;
  const isGated = !isPro;

  return (
    <>
    <AppShell profile={profile} activeRoute="/nis2">
      <div className="max-w-7x1 mx-auto px-4 py-8 flex flex-col gap-6">

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black leading-relaxed" style={{ color: T.bone }}>
              Modulo NIS2
              <span className="block text-sm font-normal mt-0.5" style={{ color: T.slate400 }}>
                (Network and Information Security — D.Lgs. 138/2024)
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {esito && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ backgroundColor: esitoColorBg(esito), color: esitoColor(esito), border: `1px solid ${esitoColor(esito)}33` }}
              >
                {esitoIcon(esito, 15)}
                {esitoLabel(esito)}
              </div>
            )}
            <button
              onClick={apriConfermaOrganico}
              disabled={rivalutando || anchorLoading || !isAnchor}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: T.slate200, color: T.boneDim, border: `1px solid ${T.line}` }}
            >
              <RefreshCw size={13} className={rivalutando ? "animate-spin" : ""} />
              {rivalutando ? "Rivalutazione…" : "Rivaluta"}
            </button>
          </div>
        </div>

        {/* ── GATING ÀNCORA (se l'entity attiva non è l'àncora della company) ── */}
        {!anchorLoading && !isAnchor && anchorEntity && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ backgroundColor: T.amberBg, border: `1px solid rgba(245,158,11,.25)`, color: T.boneDim }}
          >
            <AlertTriangle size={15} style={{ color: T.amber, flexShrink: 0 }} />
            <span>Le valutazioni a livello società si gestiscono da {anchorEntity.nome}.</span>
          </div>
        )}

        {/* ── GRUPPO (banner informativo permanente se la company fa parte di un gruppo) ── */}
        {hasGruppo && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
          >
            <Building2 size={15} style={{ color: T.shield, flexShrink: 0 }} />
            <span>
              Questa società fa parte di un gruppo. Il calcolo dimensionale NIS2 (dipendenti FTE e fatturato) va effettuato
              su dati aggregati delle imprese associate e collegate ex Racc. 2003/361/CE, art. 3 D.Lgs. 138/2024.
            </span>
          </div>
        )}

        {/* ── WARNING DATI NON AGGREGATI (se gruppo e ultima rivalutazione non dichiarata aggregata) ── */}
        {hasGruppo && assessment && !assessment.dati_aggregati_gruppo && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ backgroundColor: T.amberBg, border: `1px solid rgba(245,158,11,.25)`, color: T.boneDim }}
          >
            <AlertTriangle size={15} style={{ color: T.amber, flexShrink: 0 }} />
            <span>Esito calcolato su dati non aggregati: la soggettività potrebbe essere sottostimata.</span>
          </div>
        )}

        {/* ── PRO NUDGE (se free) ── */}
        {isGated && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
          >
            <Lock size={15} style={{ color: T.shield, flexShrink: 0 }} />
            <span>
              I moduli operativi NIS2 richiedono il piano Silver o superiore.{" "}
              <button
                onClick={() => router.push("/upgrade")}
                className="font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
                style={{ color: T.shield }}
              >
                Vedi i piani →
              </button>
            </span>
          </div>
        )}

        {/* ── BOX 1: VERIFICA SOGGETTIVITÀ + SUPPLY CHAIN (fianco a fianco) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start mx-auto lg:max-w-[75%]">
          <SoggetivitaBox
            assessment={assessment}
            onRivaluta={apriConfermaOrganico}
            rivalutando={rivalutando}
            showOverride={showOverride}
            setShowOverride={setShowOverride}
            overrideTipo={overrideTipo}
            setOverrideTipo={setOverrideTipo}
            overrideEsito={overrideEsito}
            setOverrideEsito={setOverrideEsito}
            overrideMotivazione={overrideMotivazione}
            setOverrideMotivazione={setOverrideMotivazione}
            overrideLegale={overrideLegale}
            setOverrideLegale={setOverrideLegale}
            overrideFile={overrideFile}
            setOverrideFile={setOverrideFile}
            overrideSaving={overrideSaving}
            overrideError={overrideError}
            onSalvaOverride={salvaOverride}
          />

          <SupplyChainModuloBox
            modulo={{
              id:    "supply_chain",
              icon:  <Network size={18} />,
              title: "Supply Chain — Fornitori & Sistemi",
              sub:   "(Third-Party Risk — Flag_NIS2_SC_01)",
              desc:  "Censimento fornitori e sistemi digitali con classificazione della criticità NIS2 lungo la catena di fornitura.",
              retroattivo: false,
            }}
            esito={esito}
            isPro={isPro}
            onUpgrade={() => router.push("/upgrade")}
            supabase={supabase}
            entityId={entityId}
            onVaiASistemi={() => router.push("/sistemi")}
          />
        </div>

        {/* ── MODULI OPERATIVI (5 box gated — griglia responsive) ── */}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}
        >
          {[
            {
              id:    "acn",
              icon:  <Building2 size={18} />,
              title: "Registrazione ACN",
              sub:   "(Registration — ACN Portal)",
              // Nota informativa sulla "Notifica inserimento NIS" (Aprile 2025): evento passivo
              // (ACN notifica la soggettività alla struttura), non un adempimento da compiere —
              // non ha una card propria, ma resta menzionato qui perché è il contesto immediatamente
              // successivo alla registrazione ACN.
              desc:  "Workflow guidato per la registrazione obbligatoria sul portale dell'Agenzia per la Cybersicurezza Nazionale. Dopo la registrazione, l'ACN notifica formalmente la soggettività (Aprile 2025) — nessuna azione richiesta da parte della struttura.",
              fullFlow: true,
              deadlineLabel: "Febbraio 2025 · retroattivo",
            },
            {
              id:    "incident",
              icon:  <Siren size={18} />,
              title: "Incident Reporting",
              sub:   "(Incident Notification — CSIRT Italia)",
              desc:  "Modulo di notifica incidenti con tassonomia ACN. Pre-notifica entro 24h, notifica completa entro 72h.",
              deadlineLabel: "Gennaio 2026 · retroattivo",
            },
            {
              id:    "policy",
              icon:  <FileCode2 size={18} />,
              title: "Policy Generator",
              sub:   "(Security Policy — NIS2 Compliant)",
              desc:  "Genera le policy di sicurezza informatica richieste dalla NIS2, calibrate sulla tipologia di struttura.",
              fullFlow: true,
              // Nessuna scadenza fissa per questo flag nel dizionario legale — a differenza
              // delle altre card, non viene mostrata alcuna data.
            },
            {
              id:    "checklist",
              icon:  <ClipboardList size={18} />,
              title: "Checklist Misure Tecniche",
              sub:   "(Technical Measures — October 2026)",
              desc:  "Verifica e documenta l'adozione delle misure tecniche e organizzative obbligatorie entro ottobre 2026.",
              deadlineLabel: "Ottobre 2026",
            },
            {
              id:    "categorizzazione",
              icon:  <ClipboardList size={18} />,
              title: "Categorizzazione ACN",
              sub:   "(Categorizzazione Attività e Servizi — Annuale)",
              desc:  "Categorizzazione annuale delle attività e dei servizi sul portale ACN. Finestra 1 maggio-30 giugno.",
              fullFlow: true,
              deadlineLabel: `Finestra 1 mag-30 giu ${categorizzazioneCycleYear}`,
            },
          ].map((modulo) => (
            <ModuloBox
              key={modulo.id}
              modulo={modulo}
              esito={esito}
              isPro={isPro}
              onUpgrade={() => router.push("/upgrade")}
              entityDocItems={entityDocItems}
              companyDocItems={companyDocItems}
              remediationStatus={remediationStatus}
              onOpenDoc={setOpenDocKey}
              onOpenFullFlow={setFullFlowDocKey}
            />
          ))}
        </div>

      </div>
    </AppShell>

    {/* ── MODAL GENERAZIONE DOCUMENTO (moduli operativi NIS2) ── */}
    {openDocKey && entityFullData && companyFullData && (() => {
      const doc = NIS2_LAUNCHER_CATALOG.find(d => d.key === openDocKey);
      return (
        <GenerateDocModal
          flagKey={openDocKey}
          entity={{ ...entityFullData, legale_rappresentante: companyFullData.legale_rappresentante ?? entityFullData.legale_rappresentante }}
          company={companyFullData}
          entityId={entityId ?? undefined}
          companyId={companyId ?? undefined}
          livello={doc?.livello}
          revisioneMesi={doc?.revisione_mesi}
          userId={userId}
          relazionale={doc?.relazionale ?? false}
          onClose={() => { setOpenDocKey(null); load(); }}
        />
      );
    })()}

    {/* ── MODAL FULL-FLOW (BLU/AMBRA/VERDE) — Registrazione ACN o Categorizzazione ACN ── */}
    {fullFlowDocKey && FULL_FLOW_DOCS[fullFlowDocKey] && companyId && entityFullData && (
      <DocumentoModal
        def={FULL_FLOW_DOCS[fullFlowDocKey]!}
        livello="company"
        entityId={entityId ?? ""}
        companyId={companyId}
        userId={userId}
        entityFullData={entityFullData}
        companyData={companyFullData}
        currentStato={(companyDocItems[fullFlowDocKey]?.stato as ComplianceStato | undefined) ?? "MANCANTE"}
        onClose={() => setFullFlowDocKey(null)}
        onUpdate={() => load()}
        userTier={profile?.tier}
      />
    )}

    {showConfermaOrganico && companyId && (
      <ModalConfermaOrganico
        companyId={companyId}
        supabase={supabase}
        hasGruppo={hasGruppo}
        onClose={() => setShowConfermaOrganico(false)}
        onConfermato={rivaluta}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────
// BOX 1: SOGGETTIVITÀ
// ─────────────────────────────────────────────
function SoggetivitaBox({
  assessment,
  onRivaluta,
  rivalutando,
  showOverride,
  setShowOverride,
  overrideTipo,
  setOverrideTipo,
  overrideEsito,
  setOverrideEsito,
  overrideMotivazione,
  setOverrideMotivazione,
  overrideLegale,
  setOverrideLegale,
  overrideFile,
  setOverrideFile,
  overrideSaving,
  overrideError,
  onSalvaOverride,
}: {
  assessment: Nis2Assessment | null;
  onRivaluta: () => void;
  rivalutando: boolean;
  showOverride: boolean;
  setShowOverride: (v: boolean) => void;
  overrideTipo: OverrideTipo;
  setOverrideTipo: (v: OverrideTipo) => void;
  overrideEsito: "soggetto_essenziale" | "non_soggetto";
  setOverrideEsito: (v: "soggetto_essenziale" | "non_soggetto") => void;
  overrideMotivazione: string;
  setOverrideMotivazione: (v: string) => void;
  overrideLegale: string;
  setOverrideLegale: (v: string) => void;
  overrideFile: File | null;
  setOverrideFile: (v: File | null) => void;
  overrideSaving: boolean;
  overrideError: string;
  onSalvaOverride: () => void;
}) {
  const esito = assessment?.esito_effettivo ?? null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: T.ink2, border: `1px solid ${T.line}` }}
    >
      {/* Header box */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Shield size={18} style={{ color: T.shield }} />
        <div>
          <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>
            Verifica Soggettività NIS2
          </p>
          <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
            (Applicability Check — D.Lgs. 138/2024 art. 3)
          </p>
        </div>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">

        {/* Nessuna valutazione */}
        {!assessment && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <ShieldAlert size={36} style={{ color: T.slate400, opacity: 0.4 }} />
            <div>
              <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>
                Nessuna valutazione effettuata
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: T.slate400 }}>
                Avvia la verifica per determinare se la tua organizzazione è soggetta alla normativa NIS2.
              </p>
            </div>
            <button
              onClick={onRivaluta}
              disabled={rivalutando}
              className="px-5 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
            >
              {rivalutando ? "Analisi in corso…" : "Avvia verifica soggettività →"}
            </button>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400, opacity: 0.6 }}>
              Assicurati di aver compilato i dati societari in Anagrafica prima di procedere.
            </p>
          </div>
        )}

        {/* Esito presente */}
        {assessment && esito && (
          <>
            {/* Badge esito */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg"
              style={{ backgroundColor: esitoColorBg(esito), border: `1px solid ${esitoColor(esito)}33` }}
            >
              <span style={{ color: esitoColor(esito) }}>{esitoIcon(esito, 22)}</span>
              <div>
                <p className="text-sm font-black leading-relaxed" style={{ color: esitoColor(esito) }}>
                  {esitoLabel(esito)}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Valutazione del {formatDate(assessment.created_at)}
                  {assessment.override_at && ` · Confermato il ${formatDate(assessment.override_at)}`}
                </p>
              </div>
            </div>

            {/* Override badge */}
            {assessment.override_tipo && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: T.emeraldBg, color: T.emerald, border: `1px solid rgba(62,207,142,.2)` }}
              >
                <CheckCircle2 size={13} />
                {assessment.override_tipo === "blu"
                  ? `Parere legale acquisito${assessment.parere_legale_professionista ? ` — ${assessment.parere_legale_professionista}` : ""}`
                  : "Soggettività autocertificata"}
                {assessment.parere_legale_file_url && (
                  <a
                    href={assessment.parere_legale_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 hover:opacity-80"
                    style={{ color: T.emerald }}
                  >
                    <ExternalLink size={11} /> Documento
                  </a>
                )}
              </div>
            )}

            {/* Motivazioni */}
            <div className="flex flex-col gap-2">
              {assessment.motivazioni.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Info size={13} style={{ color: T.slate400, flexShrink: 0, marginTop: 2 }} />
                  <p className="text-xs leading-relaxed" style={{ color: T.boneDim }}>{m}</p>
                </div>
              ))}
              {assessment.override_motivazione && (
                <div className="flex items-start gap-2 mt-1">
                  <FileText size={13} style={{ color: T.amber, flexShrink: 0, marginTop: 2 }} />
                  <p className="text-xs leading-relaxed" style={{ color: T.boneDim }}>
                    <span style={{ color: T.amber }}>Motivazione dichiarata: </span>
                    {assessment.override_motivazione}
                  </p>
                </div>
              )}
            </div>

            {/* Snapshot dati */}
            <div
              className="flex gap-4 px-3 py-2 rounded-lg flex-wrap"
              style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.line}` }}
            >
              {assessment.snapshot_dipendenti && (
                <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Dipendenti: <span style={{ color: T.boneDim }}>{assessment.snapshot_dipendenti}</span>
                </span>
              )}
              {assessment.snapshot_fatturato && (
                <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Fatturato: <span style={{ color: T.boneDim }}>{assessment.snapshot_fatturato}</span>
                </span>
              )}
              {assessment.snapshot_is_pa && (
                <span className="text-xs leading-relaxed" style={{ color: T.amber }}>
                  Ente Pubblico / PA
                </span>
              )}
            </div>

            {/* Pannello override borderline */}
            {esito === "borderline" && (
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: `1px solid ${T.amber}44` }}
              >
                <button
                  onClick={() => setShowOverride(!showOverride)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.amberBg, color: T.amber }}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Registra decisione sulla soggettività
                  </span>
                  {showOverride ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showOverride && (
                  <div className="px-4 py-4 flex flex-col gap-4" style={{ backgroundColor: "rgba(245,158,11,.04)" }}>

                    {/* Scelta strada */}
                    <div className="flex gap-2">
                      {(["ambra", "blu"] as OverrideTipo[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setOverrideTipo(t)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: overrideTipo === t ? (t === "blu" ? T.shieldBg : T.amberBg) : "transparent",
                            color: overrideTipo === t ? (t === "blu" ? T.shield : T.amber) : T.slate400,
                            border: `1px solid ${overrideTipo === t ? (t === "blu" ? "rgba(37,99,235,.35)" : "rgba(245,158,11,.35)") : T.line}`,
                          }}
                        >
                          {t === "ambra" ? "🟡 Autocertifica" : "🔵 Carica parere legale"}
                        </button>
                      ))}
                    </div>

                    {/* Scelta esito */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold" style={{ color: T.slate400 }}>Decisione *</label>
                      <div className="flex gap-2">
                        {([
                          { v: "soggetto_essenziale", label: "Soggetto NIS2" },
                          { v: "non_soggetto",         label: "Non soggetto NIS2" },
                        ] as const).map(({ v, label }) => (
                          <button
                            key={v}
                            onClick={() => setOverrideEsito(v)}
                            className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: overrideEsito === v ? T.shieldBg : "transparent",
                              color: overrideEsito === v ? T.shield : T.slate400,
                              border: `1px solid ${overrideEsito === v ? "rgba(37,99,235,.35)" : T.line}`,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Motivazione */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold" style={{ color: T.slate400 }}>
                        Motivazione * {overrideTipo === "ambra" && <span style={{ color: T.amber }}>(dichiarazione sotto tua responsabilità)</span>}
                      </label>
                      <textarea
                        value={overrideMotivazione}
                        onChange={(e) => setOverrideMotivazione(e.target.value)}
                        rows={3}
                        placeholder="Es. Verificato con Studio Legale Rossi — organico FTE reale sotto soglia 50 unità…"
                        className="rounded-lg px-3 py-2 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}` }}
                      />
                    </div>

                    {/* Strada blu: upload + nome legale */}
                    {overrideTipo === "blu" && (
                      <>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold" style={{ color: T.slate400 }}>Nome professionista / studio legale</label>
                          <input
                            type="text"
                            value={overrideLegale}
                            onChange={(e) => setOverrideLegale(e.target.value)}
                            placeholder="Es. Studio Legale Rossi, Avv. Mario Rossi"
                            className="rounded-lg px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}` }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold" style={{ color: T.slate400 }}>Documento parere legale (PDF) *</label>
                          <label
                            className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
                            style={{ backgroundColor: T.shieldBg, border: `1px dashed rgba(37,99,235,.35)`, color: T.shield }}
                          >
                            <Upload size={15} />
                            <span className="text-xs font-bold">
                              {overrideFile ? overrideFile.name : "Seleziona file PDF…"}
                            </span>
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => setOverrideFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {/* Disclaimer */}
                    <p className="text-xs leading-relaxed" style={{ color: T.slate400, opacity: 0.7 }}>
                      {overrideTipo === "ambra"
                        ? "⚠️ Questa dichiarazione è sotto la tua esclusiva responsabilità. CLAVIS ne traccia l'autore, la data e la motivazione per finalità di audit."
                        : "Il documento caricato sarà conservato a fini di audit. CLAVIS non esprime pareri legali."}
                    </p>

                    {/* Error */}
                    {overrideError && (
                      <p className="text-xs font-bold" style={{ color: T.red }}>{overrideError}</p>
                    )}

                    {/* Azioni */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowOverride(false)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                        style={{ color: T.slate400, border: `1px solid ${T.line}` }}
                      >
                        Annulla
                      </button>
                      <button
                        onClick={onSalvaOverride}
                        disabled={overrideSaving}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                        style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
                      >
                        {overrideSaving ? "Salvataggio…" : "Conferma decisione →"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BOX MODULO OPERATIVO (gated)
// ─────────────────────────────────────────────
function ModuloBox({
  modulo,
  esito,
  isPro,
  onUpgrade,
  entityDocItems,
  companyDocItems,
  remediationStatus,
  onOpenDoc,
  onOpenFullFlow,
}: {
  modulo: { id: string; icon: React.ReactNode; title: string; sub: string; desc: string; fullFlow?: boolean; deadlineLabel?: string };
  esito: Nis2Tier | null;
  isPro: boolean;
  onUpgrade: () => void;
  entityDocItems: Record<string, { stato: string }>;
  companyDocItems: Record<string, { stato: string }>;
  remediationStatus: Record<string, { status: string; completed_at: string | null }>;
  onOpenDoc: (docKey: string) => void;
  onOpenFullFlow: (docKey: string) => void;
}) {
  const isNonSoggetto    = esito === "non_soggetto";
  const nessunValutazione = esito === null;
  const isLocked         = !isPro || nessunValutazione;

  // ─── Documento primario del flag associato a questo modulo (config/legal_dictionary.json)
  const docInfo    = NIS2_MODULO_DOC[modulo.id];
  const catalogDoc = docInfo ? NIS2_LAUNCHER_CATALOG.find(d => d.key === docInfo.docKey) ?? null : null;
  const docItem    = catalogDoc
    ? (catalogDoc.livello === "company" ? companyDocItems[catalogDoc.key] : entityDocItems[catalogDoc.key])
    : undefined;
  const docStato    = docItem?.stato ?? "MANCANTE";
  const docSatisfied = isSatisfiedStatus(docItem?.stato);
  const sequenceLockedLabel = catalogDoc
    ? getSequenceBlockLabel(catalogDoc, NIS2_LAUNCHER_CATALOG, companyDocItems, entityDocItems)
    : null;
  // Scadenze ricorrenti (Flag_NIS2_Categorizzazione): finestra chiusa senza completamento →
  // badge viola "Finestra {anno} persa", coerente con /remediation e /scadenze.
  const recurringOverride = catalogDoc ? getRecurringFinestraOverride(catalogDoc, docItem ?? null) : null;
  // Flag_NIS2_Registration (modulo "acn") non richiede firma: il documento generato è un
  // promemoria da portare sul portale ACN, non un modulo da firmare e ricaricare — la label
  // generica GENERATO ("da firmare") sarebbe fuorviante. Override scoped a questo solo flag,
  // le altre card moduli (che generano documenti da firmare) restano con la label generica.
  const docBadge = recurringOverride
    ? { label: recurringOverride.detail, color: T.violet, bg: T.violetBg }
    : docStato === "GENERATO" && docInfo?.flagKey === "Flag_NIS2_Registration"
      ? { ...DOC_STATO_BADGE.GENERATO, label: "Generato — da completare" }
      : DOC_STATO_BADGE[docStato] ?? DOC_STATO_BADGE.MANCANTE;

  // ─── Stato reale remediation_plans per il flag di questo modulo — stessa SSOT di
  // /remediation e /scadenze (computeEffectiveStatus), mostrato sotto il titolo insieme
  // alla scadenza normativa. Sostituisce il vecchio Cronoprogramma NIS2 hardcoded.
  const remFlagKey    = docInfo?.flagKey;
  const remFlagDict   = remFlagKey ? (NIS2_DICT.flags?.[remFlagKey] as FlagDictEntry | undefined) : undefined;
  const remPlan       = remFlagKey ? remediationStatus[remFlagKey] : undefined;
  const remDeadlineISO = remFlagDict ? computeFixedDeadline(remFlagDict, null, null, null)?.toISOString().split("T")[0] ?? null : null;
  const planStatus: PlanStatus | null = remFlagKey
    ? computeEffectiveStatus(remPlan ?? { status: "aperto", completed_at: null }, remDeadlineISO, remFlagDict ?? null)
    : null;
  const planBadge = planStatus ? PLAN_STATUS_BADGE[planStatus] : null;

  // ─── Mini-percorso sequenza flag (solo se il flag ha >1 documento obbligatorio)
  // Stessa costruzione della catena usata in getSequenceBlockLabel — SSOT.
  const flagChain = catalogDoc
    ? NIS2_LAUNCHER_CATALOG.filter(d => d.flag_key === catalogDoc.flag_key && d.obbligatorio)
    : [];
  const showChainSteps = flagChain.length > 1;
  const firstUnsatisfiedChainIdx = flagChain.findIndex(d => {
    const item = d.livello === "company" ? companyDocItems[d.key] : entityDocItems[d.key];
    return !isSatisfiedStatus(item?.stato);
  });

  // colore header in base allo stato
  const headerColor = isNonSoggetto
    ? T.slate400
    : isLocked
      ? T.slate400
      : T.bone;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: T.ink2,
        border: `1px solid ${T.line}`,
        opacity: isNonSoggetto ? 0.55 : 1,
        minHeight: "220px",
      }}
    >
      {/* Barra stato non soggetto */}
      {isNonSoggetto && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold"
          style={{ backgroundColor: "rgba(154,163,189,.08)", color: T.slate400, borderBottom: `1px solid ${T.line}` }}
        >
          <ShieldX size={13} />
          Non soggetto NIS2 — modulo non applicabile
        </div>
      )}

      {/* Header modulo */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${T.line}` }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: isNonSoggetto ? T.slate400 : isLocked ? T.slate400 : T.shield }}>
            {isLocked && !isNonSoggetto ? <Lock size={18} /> : modulo.icon}
          </span>
          <div>
            <p className="text-sm font-bold leading-relaxed" style={{ color: headerColor }}>
              {modulo.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>{modulo.sub}</p>
            {!isNonSoggetto && (modulo.deadlineLabel || planBadge) && (
              <p className="mt-1 flex items-center gap-2 flex-wrap text-xs leading-relaxed" style={{ color: T.slate400 }}>
                {modulo.deadlineLabel && <span>{modulo.deadlineLabel}</span>}
                {planBadge && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                    style={{ backgroundColor: planBadge.bg, color: planBadge.color }}
                  >
                    {planBadge.label}
                  </span>
                )}
              </p>
            )}
            {showChainSteps && (
              <ol className="mt-1.5 flex flex-col gap-0.5">
                {flagChain.map((d, i) => {
                  const item = d.livello === "company" ? companyDocItems[d.key] : entityDocItems[d.key];
                  const satisfied = isSatisfiedStatus(item?.stato);
                  const isActive = !satisfied && i === firstUnsatisfiedChainIdx;
                  const stepIcon = satisfied ? "✅" : isActive ? "●" : "🔒";
                  const stepColor = satisfied ? T.emerald : isActive ? T.shield : T.slate400;
                  return (
                    <li
                      key={d.key}
                      className="text-xs leading-relaxed flex items-center gap-1.5"
                      style={{ color: stepColor }}
                    >
                      <span aria-hidden="true">{stepIcon}</span>
                      <span>{i + 1}. {d.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* Contenuto — sempre visibile */}
      {!isNonSoggetto && (
        <div className="flex-1 px-5 py-5 flex flex-col gap-4">
          <p className="text-sm leading-relaxed" style={{ color: T.boneDim }}>{modulo.desc}</p>

          {/* Gate Pro */}
          {!isPro && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
            >
              <Lock size={14} style={{ color: T.shield, flexShrink: 0 }} />
              <span>
                Funzione disponibile dal piano Silver.{" "}
                <button
                  onClick={onUpgrade}
                  className="font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: T.shield }}
                >
                  Vedi i piani →
                </button>
              </span>
            </div>
          )}

          {/* Gate nessuna valutazione */}
          {isPro && nessunValutazione && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: T.amberBg, border: `1px solid rgba(245,158,11,.25)`, color: T.boneDim }}
            >
              <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
              Completa prima la verifica di soggettività per sbloccare i moduli operativi.
            </div>
          )}

          {/* Contenuto Pro attivo — stato reale documento primario + launcher GenerateDocModal */}
          {isPro && !nessunValutazione && catalogDoc && (
            <div className="mt-auto flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                  style={{ backgroundColor: docBadge.bg, color: docBadge.color }}
                >
                  {docBadge.label}
                </span>
                {docSatisfied && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: T.emerald }}>
                    <CheckCircle2 size={13} /> {catalogDoc.label}
                  </span>
                )}
              </div>

              {sequenceLockedLabel ? (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                  style={{ backgroundColor: "rgba(154,163,189,.08)", color: T.slate400, border: `1px solid ${T.line}` }}
                  title={`Completa prima: ${sequenceLockedLabel}`}
                >
                  <Lock size={13} style={{ flexShrink: 0 }} />
                  Completa prima: {sequenceLockedLabel}
                </div>
              ) : modulo.fullFlow ? (
                <button
                  onClick={() => onOpenFullFlow(catalogDoc.key)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
                >
                  {docSatisfied ? "Rivedi documento →" : `Completa ${catalogDoc.label} →`}
                </button>
              ) : (
                <button
                  onClick={() => onOpenDoc(catalogDoc.key)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
                >
                  {docSatisfied ? "Rivedi documento →" : `Genera ${catalogDoc.label} →`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BOX MODULO SUPPLY CHAIN (dati reali da supplier_systems)
// ─────────────────────────────────────────────
function SupplyChainModuloBox({
  modulo,
  esito,
  isPro,
  onUpgrade,
  supabase,
  entityId,
  onVaiASistemi,
}: {
  modulo: { id: string; icon: React.ReactNode; title: string; sub: string; desc: string; retroattivo: boolean };
  esito: Nis2Tier | null;
  isPro: boolean;
  onUpgrade: () => void;
  supabase: ReturnType<typeof createClient>;
  entityId: string | null;
  onVaiASistemi: () => void;
}) {
  const nessunValutazione = esito === null;
  const isLocked          = !isPro || nessunValutazione;

  const [counts, setCounts] = useState<Record<CriticitaNis2Type, number> | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    if (isLocked || !entityId) return;
    let cancelled = false;
    (async () => {
      setLoadingCounts(true);
      const { data } = await supabase
        .from("supplier_systems")
        .select("criticita_nis2")
        .eq("entity_id", entityId);
      if (cancelled) return;
      const c: Record<CriticitaNis2Type, number> = { non_valutata: 0, bassa: 0, media: 0, alta: 0, critica: 0 };
      (data ?? []).forEach((r: { criticita_nis2: string }) => {
        const liv = r.criticita_nis2 as CriticitaNis2Type;
        if (liv in c) c[liv] += 1;
      });
      setCounts(c);
      setLoadingCounts(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, entityId, isLocked]);

  const headerColor = isLocked ? T.slate400 : T.bone;
  const totaleClassificati = counts ? counts.bassa + counts.media + counts.alta + counts.critica : 0;
  const totaleSistemi = counts ? totaleClassificati + counts.non_valutata : 0;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{ backgroundColor: T.ink2, border: `1px solid ${T.line}`, minHeight: "220px" }}
    >
      {/* Header modulo */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-3">
          <span style={{ color: isLocked ? T.slate400 : T.shield }}>
            {isLocked ? <Lock size={18} /> : modulo.icon}
          </span>
          <div>
            <p className="text-sm font-bold leading-relaxed" style={{ color: headerColor }}>
              {modulo.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>{modulo.sub}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 flex flex-col gap-4">
        <p className="text-sm leading-relaxed" style={{ color: T.boneDim }}>{modulo.desc}</p>

        {/* Gate Pro */}
        {!isPro && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
            style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
          >
            <Lock size={14} style={{ color: T.shield, flexShrink: 0 }} />
            <span>
              Funzione disponibile dal piano Silver.{" "}
              <button
                onClick={onUpgrade}
                className="font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
                style={{ color: T.shield }}
              >
                Vedi i piani →
              </button>
            </span>
          </div>
        )}

        {/* Gate nessuna valutazione */}
        {isPro && nessunValutazione && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
            style={{ backgroundColor: T.amberBg, border: `1px solid rgba(245,158,11,.25)`, color: T.boneDim }}
          >
            <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
            Completa prima la verifica di soggettività per sbloccare i moduli operativi.
          </div>
        )}

        {/* Contenuto Pro attivo — dati reali aggregati da supplier_systems */}
        {isPro && !nessunValutazione && (
          <>
            {loadingCounts && !counts && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <RefreshCw size={15} className="animate-spin" style={{ color: T.slate400 }} />
                <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>Caricamento dati…</span>
              </div>
            )}

            {counts && (
              <div className="flex flex-col gap-2">
                {(["bassa", "media", "alta", "critica"] as const).map((liv) => (
                  <div
                    key={liv}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ backgroundColor: CRITICITA_COLORI[liv].bg, border: `1px solid ${CRITICITA_COLORI[liv].border}` }}
                  >
                    <span className="text-xs font-bold leading-relaxed" style={{ color: CRITICITA_COLORI[liv].text }}>
                      {CRITICITA_LABEL[liv]}
                    </span>
                    <span className="text-sm font-black" style={{ color: CRITICITA_COLORI[liv].text }}>
                      {counts[liv]}
                    </span>
                  </div>
                ))}

                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg mt-1"
                  style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.line}` }}
                >
                  <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>Sistemi classificati</span>
                  <span className="text-xs font-bold leading-relaxed" style={{ color: T.boneDim }}>
                    {totaleClassificati} / {totaleSistemi}
                  </span>
                </div>

                {counts.non_valutata > 0 && (
                  <div className="flex items-center gap-2 text-xs leading-relaxed" style={{ color: T.amber }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                    {counts.non_valutata} sistem{counts.non_valutata === 1 ? "a" : "i"} ancora da valutare
                  </div>
                )}

                {totaleSistemi === 0 && (
                  <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                    Nessun sistema censito per questa struttura.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={onVaiASistemi}
              className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
            >
              Vai a Sistemi →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MODAL CONFERMA ORGANICO (step intermedio prima di lanciare la verifica soggettività)
// ─────────────────────────────────────────────
function ModalConfermaOrganico({
  companyId,
  supabase,
  hasGruppo,
  onClose,
  onConfermato,
}: {
  companyId: string;
  supabase: ReturnType<typeof createClient>;
  hasGruppo: boolean;
  onClose: () => void;
  onConfermato: (aggregatoGruppo: boolean) => void;
}) {
  const [dipendenti, setDipendenti] = useState("");
  const [fatturato,  setFatturato]  = useState("");
  const [aggregatoGruppo, setAggregatoGruppo] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("n_dipendenti_fte, fatturato_fascia")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      setDipendenti(data?.n_dipendenti_fte != null ? String(data.n_dipendenti_fte) : "");
      setFatturato(data?.fatturato_fascia ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, companyId]);

  async function handleConferma() {
    if (!dipendenti || !fatturato) { setError("Compila entrambi i valori."); return; }
    setError("");
    setSaving(true);
    const { error: updErr } = await supabase
      .from("companies")
      .update({ n_dipendenti_fte: parseFloat(dipendenti), fatturato_fascia: fatturato })
      .eq("id", companyId);
    if (updErr) { setError("Errore salvataggio: " + updErr.message); setSaving(false); return; }
    onClose();
    onConfermato(aggregatoGruppo);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full flex flex-col"
        style={{ backgroundColor: T.ink2, border: `1px solid ${T.line}`, borderRadius: "12px", maxWidth: "440px" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>
            Conferma dati organico
          </p>
          <button onClick={onClose} className="transition-opacity hover:opacity-80" style={{ color: T.slate400 }}>✕</button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-xs leading-relaxed" style={{ color: T.boneDim }}>
            Questi dati determinano la soglia di soggettività NIS2 — confermali o aggiornali prima di procedere.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <RefreshCw size={15} className="animate-spin" style={{ color: T.slate400 }} />
              <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>Caricamento…</span>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold" style={{ color: T.slate400 }}>Dipendenti (FTE) *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={dipendenti}
                  onChange={(e) => setDipendenti(e.target.value)}
                  placeholder="Es. 18.5"
                  className="rounded-lg px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}`, colorScheme: "dark" }}
                />
                <p className="text-xs leading-relaxed" style={{ color: T.slate400, opacity: 0.75 }}>
                  Contare solo i dipendenti FTE (Full-Time Equivalent) — il part-time conta in proporzione alle ore lavorate rispetto al tempo pieno. Non includere i liberi professionisti che fatturano a parcella.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold" style={{ color: T.slate400 }}>Fascia fatturato *</label>
                <select
                  value={fatturato}
                  onChange={(e) => setFatturato(e.target.value)}
                  className="rounded-lg px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}`, colorScheme: "dark" }}
                >
                  <option value="">Seleziona…</option>
                  {FASCIA_FATTURATO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {hasGruppo && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aggregatoGruppo}
                    onChange={(e) => setAggregatoGruppo(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-xs leading-relaxed" style={{ color: T.boneDim }}>
                    I dati dimensionali inseriti sono aggregati a livello di gruppo (Racc. 2003/361/CE).
                  </span>
                </label>
              )}

              {error && <p className="text-xs font-bold" style={{ color: T.red }}>{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ color: T.slate400, border: `1px solid ${T.line}` }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleConferma}
                  disabled={saving || !dipendenti || !fatturato}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
                >
                  {saving ? "Salvataggio…" : "Conferma e avvia →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
