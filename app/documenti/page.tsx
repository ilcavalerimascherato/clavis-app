"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClavisTitle } from "@/components/ui/ClavisTitle";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { DocumentoModal } from "@/components/DocumentoModal";
import type { AdempimentoDef as ModalDef } from "@/components/DocumentoModal";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";
import type { ComplianceStato, ComplianceLivello } from "@/lib/types";
import { T } from "@/lib/clavis-tokens";
import { useFeatureGate } from "@/lib/tier";
import type { UserTier } from "@/lib/tier";

// ─── TIPI

interface ComplianceItem {
  id: string;
  entity_id: string;
  company_id: string | null;
  tipo: string;
  stato: ComplianceStato;
  documento_path: string | null;
  documento_nome: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  note: string | null;
  analisi_ok: boolean | null;
  analisi_note: string | null;
  dichiarato_da: string | null;
  dichiarato_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface CompanyComplianceItem {
  id: string;
  company_id: string;
  tipo: string;
  stato: ComplianceStato;
  documento_path: string | null;
  documento_nome: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  note: string | null;
  analisi_ok: boolean | null;
  analisi_note: string | null;
  dichiarato_da: string | null;
  dichiarato_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Profile { id: string; full_name: string; email: string; tier: string; }
interface Company { id: string; name: string; }

interface CatalogDoc {
  key: string;
  label: string;
  norma: string;
  descrizione: string;
  producibile: boolean;
  output_type: "pdf" | "docx" | null;
  obbligatorio: boolean;
  condizionale: boolean;
  condizione_label: string | null;
  cosa_caricare: string;
  max_pagine: number;
  livello: "company" | "entity";
  scope: string;
  flag_key: string;
  framework: string;
  revisione_mesi: number | null;
}

// ─── ADAPTER: converte CatalogDoc nel tipo atteso da DocumentoModal/GenerateDocModal
function toModalDef(doc: CatalogDoc): ModalDef {
  return {
    tipo: doc.key,
    label: doc.label,
    norma: doc.norma,
    descrizione: doc.descrizione,
    producibile: doc.producibile,
    obbligatorio: doc.obbligatorio,
    icon: "📄",
    peso: 5,
    maxPagine: doc.max_pagine,
    cosaCaricare: doc.cosa_caricare,
    modalKey: doc.key,
    flagKey: doc.flag_key,
    condizionale: doc.condizionale,
    condizioneLabel: doc.condizione_label ?? undefined,
  };
}

// ─── SSOT: helper esportabile per lettura stato da altre pagine
export async function getComplianceStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entityId: string,
  companyId: string,
  tipo: string,
): Promise<ComplianceStato | null> {

  // Calcolo automatico per REGISTRO_FORNITORI
  if (tipo === "REGISTRO_FORNITORI") {
    const { data: fornitori } = await supabase
      .from("supplier_registry")
      .select("id")
      .eq("company_id", companyId);
    const total = fornitori?.length ?? 0;
    if (total === 0) return "MANCANTE";
    const ids = fornitori!.map((f: { id: string }) => f.id);
    const { data: conServizi } = await supabase
      .from("suppliers")
      .select("fornitore_id")
      .in("fornitore_id", ids);
    const conServiziIds = new Set(conServizi?.map((s: { fornitore_id: string }) => s.fornitore_id));
    const tuttiHannoServizi = ids.every((id: string) => conServiziIds.has(id));
    return tuttiHannoServizi ? "CONFORME" : "DICHIARATO";
  }

  // Calcolo automatico per DPA_FORNITORI
  if (tipo === "DPA_FORNITORI") {
    const { data: fornitori } = await supabase
      .from("supplier_registry")
      .select("dpa_firmato")
      .eq("company_id", companyId);
    const totaleFornitori = fornitori?.length ?? 0;
    const fornitoriConDpa = fornitori?.filter((f: { dpa_firmato: boolean }) => f.dpa_firmato).length ?? 0;
    if (totaleFornitori === 0) return "MANCANTE";
    if (fornitoriConDpa === totaleFornitori) return "CONFORME";
    if (fornitoriConDpa > 0) return "DICHIARATO";
    return "MANCANTE";
  }

  const { data: entityItem } = await supabase
    .from("entity_compliance_items")
    .select("stato")
    .eq("entity_id", entityId)
    .eq("tipo", tipo)
    .single();
  if (entityItem) return entityItem.stato as ComplianceStato;

  const { data: companyItem } = await supabase
    .from("company_compliance_items")
    .select("stato")
    .eq("company_id", companyId)
    .eq("tipo", tipo)
    .single();
  return companyItem?.stato ?? null;
}

// ─── SCORE COMPLIANCE DOCUMENTALE
// Restituisce un punteggio di rischio 0-100 (0 = ottimo, 100 = critico)
export function calcScoreCompliance(
  entityItems: ComplianceItem[],
  companyItems: CompanyComplianceItem[]
): number {
  // TODO Sprint-X: leggere risk_score_weight dal dizionario
  const PESI: Record<string, number> = {
    REGISTRAZIONE_ACN:           11,
    IRP_INCIDENT_RESPONSE:        9,
    NOMINA_DPO:                   9,
    REGISTRO_TRATTAMENTI:         8,
    BCP_BUSINESS_CONTINUITY:      7,
    MODELLO_231:                  7,
    NOMINA_AI_OFFICER:            7,
    DPA_FORNITORI:                6,
    DELIBERA_CDA:                 6,
    REGISTRO_FORNITORI:           6,
    INFORMATIVA_PRIVACY_PAZIENTI: 5,
    DPIA:                         5,
    FRIA:                         6,
    PIANO_FORMATIVO:              5,
    POLIZZA_RC_DM232:             5,
    CODICE_ETICO_231:             4,
  };

  const allItems = [...entityItems, ...companyItems];
  let rischioTotale = 0;

  for (const item of allItems) {
    const peso = PESI[item.tipo] ?? 0;
    switch (item.stato) {
      case "CONFORME":     rischioTotale += 0;            break;
      case "IN_CORSO":     rischioTotale += peso * 0.3;   break;
      case "DICHIARATO":   rischioTotale += peso * 0.5;   break;
      case "MANCANTE":     rischioTotale += peso;         break;
      case "NON_CONFORME": rischioTotale += peso * 1.2;   break;
      case "SCADUTO":      rischioTotale += peso * 1.5;   break;
    }
  }

  return Math.min(100, Math.round(rischioTotale));
}

// ─── BADGE STATO
type DisplayStato = ComplianceStato | "VERIFICATO" | "GENERATO" | "CARICATO" | "AUTOCERTIFICATO";

const STATO_CONFIG: Record<DisplayStato, { label: string; color: string; bg: string }> = {
  MANCANTE:        { label: "MANCANTE",        color: T.critical,          bg: T.critBg                    },
  AUTOCERTIFICATO: { label: "AUTOCERTIFICATO", color: "#5E86F5",           bg: "rgba(94,134,245,0.12)"     },
  GENERATO:        { label: "GENERATO",         color: T.amber,             bg: T.amberBg                   },
  CONFORME:        { label: "CONFORME",         color: T.low,               bg: T.lowBg                     },
  NON_CONFORME:    { label: "NON CONFORME",     color: T.critical,          bg: T.critBg                    },
  SCADUTO:         { label: "SCADUTO",          color: "#ffffff",           bg: "#7A1F1F"                   },
  IN_CORSO:        { label: "IN SCADENZA",      color: T.orange,            bg: T.orangeBg                  },
  DICHIARATO:      { label: "AUTOCERTIFICATO",  color: "#5E86F5",           bg: "rgba(94,134,245,0.12)"     },
  VERIFICATO:      { label: "CONFORME",         color: T.low,               bg: T.lowBg                     },
  CARICATO:        { label: "CONFORME",         color: T.low,               bg: T.lowBg                     },
};

function StatoBadge({ stato }: { stato: DisplayStato }) {
  const cfg = STATO_CONFIG[stato];
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded"
      style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "13px", letterSpacing: "0.06em" }}>
      {cfg.label}
    </span>
  );
}

function NonNecessarioBadge() {
  return (
    <span
      title="Non richiesto dal profilo di questa struttura"
      style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
               backgroundColor: "rgba(154,163,189,.12)", color: "var(--bone-dim)" }}>
      ⚪ Non necessario
    </span>
  );
}

// ─── CARD ADEMPIMENTO
type AnyItem = ComplianceItem | CompanyComplianceItem;

interface CardProps {
  def: CatalogDoc;
  item: AnyItem | null;
  displayStato?: DisplayStato;
  isActive: boolean;
  isApplicable: boolean;
  onClick: () => void;
}

function AdempimentoCard({ def, item, displayStato: displayStatoProp, isActive, onClick }: CardProps) {
  const stato: ComplianceStato = item?.stato ?? "MANCANTE";
  const badgeStato: DisplayStato = displayStatoProp ?? stato;

  return (
    <div onClick={onClick} style={{
      background: "var(--ink2)",
      border: "0.5px solid var(--line)",
      borderRadius: "12px",
      padding: "14px",
      cursor: "pointer",
      opacity: !isActive ? 0.45 : 1,
      transition: "border-color .15s",
      display: "flex",
      flexDirection: "column",
      minHeight: "120px",
    }}>
      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--bone)",
                  lineHeight: 1.35, marginBottom: "10px" }}>
        {def.label}
      </p>
      <p style={{ fontSize: "11px", color: T.slate400, fontFamily: "monospace",
                  marginBottom: "10px" }}>
        {def.norma}
      </p>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {isActive ? <StatoBadge stato={badgeStato} /> : <NonNecessarioBadge />}
        <span style={{ fontSize: "16px", color: T.slate400, lineHeight: 1 }}>›</span>
      </div>
    </div>
  );
}

// ─── RIGA LISTA COMPATTA
interface RowProps {
  def: CatalogDoc;
  item: AnyItem | null;
  onOpenModal: () => void;
  displayStato?: DisplayStato;
  isActive: boolean;
  isApplicable: boolean;
}

function AdempimentoRow({ def, item, onOpenModal, displayStato: displayStatoProp, isActive }: RowProps) {
  const stato: ComplianceStato = item?.stato ?? "MANCANTE";
  const cfg = STATO_CONFIG[displayStatoProp ?? stato];

  return (
    <div
      onClick={onOpenModal}
      className="flex items-center cursor-pointer hover:opacity-90 transition-opacity"
      style={{ padding: "10px 14px", gap: "10px", border: "0.5px solid var(--line)",
               borderRadius: "6px", backgroundColor: "var(--ink2)", minHeight: "48px",
               opacity: !isActive ? 0.45 : 1 }}>
      <p className="flex-1 min-w-0 truncate font-medium" style={{ fontSize: "13px", color: "var(--bone)" }}>
        {def.label}
      </p>
      <p className="flex-shrink-0 truncate font-mono" style={{ fontSize: "11px", color: T.slate400, maxWidth: "80px" }}>
        {def.norma}
      </p>
      {isActive ? (
        <span className="flex-shrink-0 font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color,
          fontSize: "11px", padding: "2px 8px", borderRadius: "999px",
          letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
          {cfg.label}
        </span>
      ) : (
        <NonNecessarioBadge />
      )}
      <span style={{ flexShrink: 0, fontSize: "16px", color: T.slate400, lineHeight: 1 }}>›</span>
    </div>
  );
}

// ─── MAIN PAGE
export default function DocumentiPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [company,      setCompany]      = useState<Company | null>(null);
  const [entityId,     setEntityId]     = useState<string | null>(null);
  const [entityName,   setEntityName]   = useState<string>("");
  const [companyId,    setCompanyId]    = useState<string | null>(null);
  const [userId,       setUserId]       = useState<string>("");

  const [entityItems,  setEntityItems]  = useState<ComplianceItem[]>([]);
  const [companyItems, setCompanyItems] = useState<CompanyComplianceItem[]>([]);
  const [loading,      setLoading]      = useState(true);

  // EntityData e CompanyData per DocumentoModal
  const [entityFullData, setEntityFullData] = useState<EntityData | null>(null);
  const [companyFullData, setCompanyFullData] = useState<CompanyData | null>(null);

  // Catalogo documenti (SSOT dal dizionario)
  const [catalog, setCatalog] = useState<CatalogDoc[]>([]);

  // Modal documento (tre strade)
  const [documentoModal, setDocumentoModal] = useState<{
    def: ModalDef;
    livello: ComplianceLivello;
    currentStato: ComplianceStato;
    currentDocNome?: string | null;
  } | null>(null);

  // Modal upload
  const [uploadTipo,     setUploadTipo]     = useState<string | null>(null);
  const [uploadLivello,  setUploadLivello]  = useState<"company" | "entity">("entity");
  const [uploadFile,     setUploadFile]     = useState<File | null>(null);
  const [uploadDate,     setUploadDate]     = useState("");
  const [uploadScadenza, setUploadScadenza] = useState("");
  const [uploadNote,     setUploadNote]     = useState("");
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const [isDragging,     setIsDragging]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal produce
  const [produceTipo, setProduceTipo] = useState<string | null>(null);

  // Modal dichiara
  const [dichiaraTipo,    setDichiaraTipo]    = useState<string | null>(null);
  const [dichiaraLivello, setDichiaraLivello] = useState<"company" | "entity">("entity");
  const [dichiaraNote,    setDichiaraNote]    = useState("");
  const [dichiaraChecked, setDichiaraChecked] = useState(false);
  const [dichiarando,     setDichiarando]     = useState(false);
  const [rischioToast,   setRischioToast]   = useState(false);
  const [usaAI,          setUsaAI]          = useState(false);
  const [activeFlags,    setActiveFlags]    = useState<string[]>([]);
  const [triageDone,     setTriageDone]     = useState(false);
  const [activeTab,      setActiveTab]      = useState<string>('TUTTI');
  const [viewMode,       setViewMode]       = useState<'list' | 'grid'>('grid');
  const [docModalOpen,   setDocModalOpen]   = useState<CatalogDoc | null>(null);

  // ─── DATA LOADING
  const loadData = useCallback(async () => {
    setLoading(true);
    // Reset adempimenti prima di caricare nuovi dati (cambio entity)
    setEntityItems([]);
    setCompanyItems([]);
    setCompany(null);
    setEntityName("");
    setActiveFlags([]);
    setTriageDone(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("id, name, company_id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id, name, company_id").eq("created_by", user.id).limit(1);

      const [profRes, entityRes, catalogData] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        entityQuery,
        fetch("/api/documents-catalog").then(r => r.json() as Promise<CatalogDoc[]>),
      ]);
      setCatalog(catalogData);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (!entityRes.data || entityRes.data.length === 0) { router.push("/onboarding"); return; }

      const eid   = entityRes.data[0].id         as string;
      const ename = (entityRes.data[0].name       as string) ?? "";
      const cid   = entityRes.data[0].company_id  as string | null;
      setEntityId(eid);
      setEntityName(ename);
      setCompanyId(cid);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);

      // Fetch company name + dati completi per DocumentoModal
      if (cid) {
        const { data: companyData } = await supabase
          .from("companies").select("id, name, vat_number, legal_address, codice_fiscale, pec, legale_rappresentante, fatturato_fascia, n_dipendenti_fascia, modello_231, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono").eq("id", cid).single();
        if (companyData) {
          setCompany({ id: companyData.id, name: companyData.name });
          setCompanyFullData({
            name: companyData.name ?? "",
            vat_number: companyData.vat_number ?? null,
            legal_address: companyData.legal_address ?? null,
            codice_fiscale: companyData.codice_fiscale ?? null,
            pec: companyData.pec ?? null,
            legale_rappresentante: companyData.legale_rappresentante ?? null,
            fatturato_fascia: companyData.fatturato_fascia ?? null,
            n_dipendenti_fascia: companyData.n_dipendenti_fascia ?? null,
            modello_231: companyData.modello_231 ?? null,
            nome_dpo: companyData.nome_dpo ?? null,
            email_dpo: companyData.email_dpo ?? null,
            dpo_qualifica: companyData.dpo_qualifica ?? null,
            dpo_telefono: companyData.dpo_telefono ?? null,
          });
        }
      }

      // Fetch entity dati completi per DocumentoModal
      const { data: entityAnagrafica } = await supabase
        .from("entities").select("name, entity_type, region, total_beds, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, responsabile_it, email_responsabile_it, referente_breach, website_url").eq("id", eid).single();
      if (entityAnagrafica) setEntityFullData({
        entity_name: entityAnagrafica.name ?? "",
        entity_type: entityAnagrafica.entity_type ?? "",
        region: entityAnagrafica.region ?? "",
        total_beds: entityAnagrafica.total_beds ?? null,
        nome_dpo: entityAnagrafica.nome_dpo ?? null,
        email_dpo: entityAnagrafica.email_dpo ?? null,
        dpo_qualifica: entityAnagrafica.dpo_qualifica ?? null,
        dpo_telefono: entityAnagrafica.dpo_telefono ?? null,
        responsabile_it: entityAnagrafica.responsabile_it ?? null,
        email_responsabile_it: entityAnagrafica.email_responsabile_it ?? null,
        referente_breach: entityAnagrafica.referente_breach ?? null,
        website_url: entityAnagrafica.website_url ?? null,
      });

      // Fetch entity compliance
      const { data: entityData } = await supabase
        .from("entity_compliance_items").select("*").eq("entity_id", eid);

      // Fetch company compliance
      const { data: companyDbData } = cid
        ? await supabase.from("company_compliance_items").select("*").eq("company_id", cid)
        : { data: [] as CompanyComplianceItem[] };

      // Controlla se struttura usa AI (S2 Q1 > 0 nel triage più recente)
      const { data: triageSession } = await supabase
        .from("v_triage_dashboard")
        .select("answers")
        .eq("entity_id", eid)
        .eq("status", "generated")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s2Answers = (triageSession?.answers as any)?.S2 ?? [];
      const usaAIVal  = (s2Answers[0] ?? 0) > 0;
      setUsaAI(usaAIVal);

      // Fetch active flags from remediation_plans (latest triage session)
      const { data: latestSess } = await supabase
        .from("triage_sessions")
        .select("id")
        .eq("entity_id", eid)
        .eq("status", "generated")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();
      if (latestSess) {
        setTriageDone(true);
        const { data: remData } = await supabase
          .from("remediation_plans")
          .select("flag_key")
          .eq("session_id", latestSess.id);
        setActiveFlags((remData ?? []).map((r: { flag_key: string }) => r.flag_key));
      }

      let entityItemsArr  = (entityData   ?? []) as ComplianceItem[];
      let companyItemsArr = (companyDbData ?? []) as CompanyComplianceItem[];

      // ── Calcolo stati automatici da supplier_registry
      if (cid) {
        const now = new Date().toISOString();

        // REGISTRO_FORNITORI: tutti i fornitori hanno servizi → VERIFICATO, alcuni → DICHIARATO, nessuno → MANCANTE
        const { data: registroFornitori } = await supabase
          .from("supplier_registry")
          .select("id")
          .eq("company_id", cid);
        const total = registroFornitori?.length ?? 0;
        let registroFornitoriStato: ComplianceStato = "MANCANTE";
        if (total > 0) {
          const ids = registroFornitori!.map((f: { id: string }) => f.id);
          const { data: conServizi } = await supabase
            .from("suppliers")
            .select("fornitore_id")
            .in("fornitore_id", ids);
          const conServiziIds = new Set(conServizi?.map((s: { fornitore_id: string }) => s.fornitore_id));
          registroFornitoriStato = ids.every((id: string) => conServiziIds.has(id)) ? "CONFORME" : "DICHIARATO";
        }

        await supabase
          .from("entity_compliance_items")
          .update({ stato: registroFornitoriStato, updated_at: now })
          .eq("entity_id", eid)
          .eq("tipo", "REGISTRO_FORNITORI");

        entityItemsArr = entityItemsArr.map(i =>
          i.tipo === "REGISTRO_FORNITORI" ? { ...i, stato: registroFornitoriStato } : i
        );

        // DPA_FORNITORI: basato su campo dpa_firmato in supplier_registry
        const { data: fornitori } = await supabase
          .from("supplier_registry")
          .select("dpa_firmato")
          .eq("company_id", cid);

        const totaleFornitori = fornitori?.length ?? 0;
        const fornitoriConDpa = fornitori?.filter((f: { dpa_firmato: boolean }) => f.dpa_firmato).length ?? 0;
        const dpaStato: ComplianceStato =
          totaleFornitori === 0              ? "MANCANTE"  :
          fornitoriConDpa === totaleFornitori ? "CONFORME" :
          fornitoriConDpa > 0                ? "DICHIARATO" :
          "MANCANTE";

        await supabase
          .from("entity_compliance_items")
          .update({ stato: dpaStato, updated_at: now })
          .eq("entity_id", eid)
          .eq("tipo", "DPA_FORNITORI");

        entityItemsArr = entityItemsArr.map(i =>
          i.tipo === "DPA_FORNITORI" ? { ...i, stato: dpaStato } : i
        );
      }

      // ── Alert scadenza automatico: aggiorna stato SCADUTO se data_scadenza passata
      const oggi = new Date();
      const nowIso = oggi.toISOString();
      const allItemsConScadenza = [
        ...entityItemsArr.filter(i => i.data_scadenza),
        ...companyItemsArr.filter(i => i.data_scadenza),
      ];

      for (const item of allItemsConScadenza) {
        const scadenza = new Date(item.data_scadenza!);
        const giorniRimasti = Math.floor(
          (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (giorniRimasti < 0 && item.stato !== "SCADUTO") {
          const isEntityItem = "entity_id" in item;
          const tabella = isEntityItem
            ? "entity_compliance_items"
            : "company_compliance_items";
          await supabase.from(tabella)
            .update({ stato: "SCADUTO", updated_at: nowIso })
            .eq("id", item.id);

          // Aggiorna array locale silenziosamente
          if (isEntityItem) {
            entityItemsArr = entityItemsArr.map(i =>
              i.id === item.id ? { ...i, stato: "SCADUTO" } : i
            );
          } else {
            companyItemsArr = companyItemsArr.map(i =>
              i.id === item.id ? { ...i, stato: "SCADUTO" } : i
            );
          }
        }
      }

      setEntityItems(entityItemsArr);
      setCompanyItems(companyItemsArr);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── UPLOAD helpers
  function openUpload(tipo: string, livello: "company" | "entity") {
    setUploadTipo(tipo); setUploadLivello(livello);
    setUploadFile(null); setUploadDate(""); setUploadScadenza(""); setUploadNote(""); setUploadError(null);
  }
  function closeUpload() {
    setUploadTipo(null); setUploadFile(null);
    setUploadDate(""); setUploadScadenza(""); setUploadNote(""); setUploadError(null);
  }

  // ─── DICHIARA helpers
  function openDichiarato(tipo: string, livello: "company" | "entity") {
    setDichiaraTipo(tipo); setDichiaraLivello(livello);
    setDichiaraNote(""); setDichiaraChecked(false);
  }
  function closeDichiarato() {
    setDichiaraTipo(null); setDichiaraNote(""); setDichiaraChecked(false);
  }

  // ─── CONFERMA DICHIARAZIONE
  async function handleDichiaratoConfirm() {
    if (!dichiaraTipo || !dichiaraChecked) return;
    setDichiarando(true);
    try {
      const now = new Date().toISOString();

      if (dichiaraLivello === "entity") {
        const { error } = await supabase
          .from("entity_compliance_items")
          .upsert({
            entity_id: entityId,
            company_id: companyId,
            tipo: dichiaraTipo,
            stato: "DICHIARATO",
            dichiarato_da: userId,
            dichiarato_at: now,
            note: dichiaraNote,
            updated_at: now,
            created_by: userId,
          }, { onConflict: "entity_id,tipo" });
        if (error) console.error("dichiarato entity error:", error);
      } else {
        const { error } = await supabase
          .from("company_compliance_items")
          .upsert({
            company_id: companyId,
            tipo: dichiaraTipo,
            stato: "DICHIARATO",
            dichiarato_da: userId,
            dichiarato_at: now,
            note: dichiaraNote,
            updated_at: now,
            created_by: userId,
          }, { onConflict: "company_id,tipo" });
        if (error) console.error("dichiarato company error:", error);
      }

      console.log("[CAL insert] userId:", userId);
      await supabase.from("compliance_activity_log").insert({
        entity_id: entityId, company_id: companyId, user_id: userId,
        tipo_item: dichiaraTipo, livello: dichiaraLivello,
        azione: "DICHIARATO", dettaglio: { note: dichiaraNote || null },
      });

      const tipoSaved = dichiaraTipo;
      closeDichiarato();
      await loadData();
      if (tipoSaved) await aggiornaRischioCompliance(tipoSaved, "DICHIARATO");
    } finally {
      setDichiarando(false);
    }
  }

  // ─── UPLOAD SAVE
  async function handleUploadSave() {
    if (!uploadFile || !entityId || !uploadTipo) {
      setUploadError("Seleziona un file da caricare"); return;
    }

    // Verifica limite pagine
    const uploadDef = catalog.find(a => a.key === uploadTipo);
    if (uploadDef && uploadDef.max_pagine > 0) {
      const stimaPagine = uploadFile.size / 50000; // ~50KB per pagina PDF
      if (stimaPagine > uploadDef.max_pagine * 1.5) {
        setUploadError(
          `Il documento sembra troppo lungo. Carica solo le sezioni indicate (${uploadDef.cosa_caricare})`
        );
        return;
      }
    }

    setUploading(true); setUploadError(null);
    // snapshot prima di qualsiasi setState
    const tipoSnapshot = uploadTipo;
    let   finalStato: string | null = null;
    try {
      const isCompany = uploadLivello === "company";
      const table     = isCompany ? "company_compliance_items" : "entity_compliance_items";

      const ext  = uploadFile.name.split(".").pop() ?? "bin";
      const path = `${entityId}/${uploadTipo}_${Date.now()}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("compliance-docs").upload(path, uploadFile, { upsert: true });
      if (storageErr) throw new Error("Upload fallito: " + storageErr.message);

      const now = new Date().toISOString();

      const buildQ = async (updateData: Record<string, unknown>) => {
        if (isCompany) {
          const { data: upsertData, error: upsertError } = await supabase
            .from("company_compliance_items")
            .upsert(
              { company_id: companyId, tipo: uploadTipo, created_by: userId, ...updateData },
              { onConflict: "company_id,tipo" },
            );
          console.log("[UPSERT company] data:", upsertData, "error:", upsertError);
          return { data: upsertData, error: upsertError };
        }
        const { data: upsertData, error: upsertError } = await supabase
          .from("entity_compliance_items")
          .upsert(
            { entity_id: entityId, tipo: uploadTipo, company_id: companyId, ...updateData },
            { onConflict: "entity_id,tipo" },
          );
        console.log("[UPSERT] data:", upsertData, "error:", upsertError);
        return { data: upsertData, error: upsertError };
      };

      const catalogDef = catalog.find(d => d.key === uploadTipo);
      const revisioneMesi = catalogDef?.revisione_mesi ?? 12;
      const dataScadenzaAuto = revisioneMesi
        ? new Date(new Date().setMonth(new Date().getMonth() + revisioneMesi))
            .toISOString().split("T")[0]
        : null;

      await buildQ({
        stato: "DICHIARATO", documento_path: path, documento_nome: uploadFile.name,
        data_documento: uploadDate || null, data_scadenza: uploadScadenza || dataScadenzaAuto,
        note: uploadNote || null, updated_at: now,
      });

      // Analisi AI
      if (!canAnalyzeAI) { router.push("/upgrade"); return; }
      try {
        console.log("[UPLOAD] chiamata AI per:", uploadTipo);
        const res = await fetch("/api/analyze-document", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: path, documentType: uploadTipo, bucket: "compliance-docs" }),
        });
        const analysisData = await res.json();
        console.log("[UPLOAD] risposta AI:", JSON.stringify(analysisData));
        const societa: string | undefined = analysisData.societa_indicata;
        const societa_match = !societa ||
          societa.toLowerCase() === (company?.name ?? "").toLowerCase();

        if (!societa_match) {
          console.log("[UPLOAD] ramo:", "NON_CONFORME");
          await buildQ({
            stato: "NON_CONFORME", analisi_ok: false,
            analisi_note: `⚠ Documento intestato a '${societa}'. Struttura corrente: '${company?.name}'. Verificare.`,
            updated_at: new Date().toISOString(),
          });
          console.log("[CAL insert] userId:", userId);
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "NON_CONFORME",
            dettaglio: { societa_indicata: societa, company_name: company?.name },
          });
        } else if (analysisData.success) {
          console.log("[UPLOAD] ramo:", "CONFORME");
          finalStato = "CONFORME";
          await buildQ({
            stato: "CONFORME", analisi_ok: true,
            analisi_note: societa
              ? `✓ Documento verificato — ${societa} corrisponde alla struttura corrente.`
              : "✓ Documento verificato da AI.",
            updated_at: new Date().toISOString(),
          });
          console.log("[CAL insert] userId:", userId);
          console.log("[CAL insert] companyId:", companyId, "entityId:", entityId);
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "CONFORME",
            dettaglio: { documento_nome: uploadFile.name },
          });
        } else {
          console.log("[UPLOAD] ramo:", "CARICATO");
          await buildQ({ analisi_ok: false, updated_at: new Date().toISOString() });
          console.log("[CAL insert] userId:", userId);
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "CARICATO",
            action_type: "documento_caricato",
            dettaglio: { documento_nome: uploadFile.name, analisi_ok: false },
          });
        }
      } catch {
        await buildQ({ analisi_ok: false, updated_at: new Date().toISOString() });
      }

      closeUpload();
      await loadData();
      if (finalStato && tipoSnapshot) await aggiornaRischioCompliance(tipoSnapshot, finalStato);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setUploading(false);
    }
  }

  // ─── VIEW DOCUMENTO
  async function handleViewDocument(path: string) {
    const { data } = await supabase.storage.from("compliance-docs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  // ─── ANNULLA DICHIARAZIONE
  async function handleAnnullaDichiarazione(tipo: string, livello: "company" | "entity") {
    const table = livello === "company" ? "company_compliance_items" : "entity_compliance_items";
    const now   = new Date().toISOString();
    let q = supabase.from(table).update({
      stato: "MANCANTE", dichiarato_da: null, dichiarato_at: null, updated_at: now,
    });
    if (livello === "company") q = q.eq("company_id", companyId).eq("tipo", tipo);
    else                       q = q.eq("entity_id",  entityId).eq("tipo",  tipo);
    await q;

    console.log("[CAL insert] userId:", userId);
    await supabase.from("compliance_activity_log").insert({
      entity_id: entityId,
      company_id: companyId,
      user_id: userId,
      tipo_item: tipo,
      livello,
      azione: "ANNULLATO",
      action_type: "dichiarazione_annullata",
    });
    await loadData();
  }

  // ─── RICALCOLO RISCHIO COMPLIANCE
  async function aggiornaRischioCompliance(tipo: string, stato: string) {
    const COMPLIANCE_TO_TRIAGE: Record<string, { section: string; questionIndex: number; valueIfCompliant: number }> = {
      "NOMINA_DPO":             { section: "S5", questionIndex: 1, valueIfCompliant: 75 },
      "IRP_INCIDENT_RESPONSE":  { section: "S4", questionIndex: 0, valueIfCompliant: 75 },
      "BCP_BUSINESS_CONTINUITY":{ section: "S1", questionIndex: 3, valueIfCompliant: 75 },
      "PIANO_FORMATIVO":        { section: "S5", questionIndex: 0, valueIfCompliant: 75 },
      "REGISTRO_FORNITORI":     { section: "S1", questionIndex: 0, valueIfCompliant: 75 },
      "REGISTRO_TRATTAMENTI":   { section: "S3", questionIndex: 1, valueIfCompliant: 75 },
    };
    const mapping = COMPLIANCE_TO_TRIAGE[tipo];
    if (!mapping) return;

    const isCompliant = stato === "CONFORME" || stato === "DICHIARATO";
    const newValue    = isCompliant ? mapping.valueIfCompliant : 25;

    const { data: session } = await supabase
      .from("triage_sessions")
      .select("id, answers")
      .eq("entity_id", entityId)
      .eq("status", "generated")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (!session) return;

    const answers = (session.answers ?? {}) as Record<string, number[]>;
    const sectionAnswers = answers[mapping.section] ?? [];
    if (sectionAnswers.length > mapping.questionIndex) {
      sectionAnswers[mapping.questionIndex] = newValue;
      answers[mapping.section] = sectionAnswers;
      await supabase.from("triage_sessions").update({ answers }).eq("id", session.id);
    }

    setRischioToast(true);
    setTimeout(() => setRischioToast(false), 3500);
  }

  // ─── TIER GATE
  const userTier     = (profile?.tier ?? "free") as UserTier;
  const canAnalyzeAI = useFeatureGate("ai_document_analysis", userTier);

  // ─── CONTATORI SU OBBLIGATORI ATTIVI
  const allComplianceItems = useMemo(() => [...entityItems, ...companyItems], [entityItems, companyItems]);

  const docsObbligatoriAttivi = useMemo(() => {
    const result = catalog.filter(d => {
      if (!d.obbligatorio) return false;
      const active = (d.obbligatorio && d.scope === "ALL")
        ? true
        : (!triageDone || activeFlags.includes(d.flag_key));
      return active;
    });
    return result;
  }, [catalog, triageDone, activeFlags]);

  const docsConformi = useMemo(() => docsObbligatoriAttivi.filter(d => {
    const item = allComplianceItems.find(i => i.tipo === d.key);
    return item != null && (item.stato === "CONFORME" || item.stato === "DICHIARATO");
  }), [docsObbligatoriAttivi, allComplianceItems]);

  const pctConformita = docsObbligatoriAttivi.length > 0
    ? Math.round((docsConformi.length / docsObbligatoriAttivi.length) * 100)
    : 0;

  const mancanti = useMemo(() => docsObbligatoriAttivi.filter(d => {
    const item = allComplianceItems.find(i => i.tipo === d.key);
    return !item || item.stato === "MANCANTE";
  }).length, [docsObbligatoriAttivi, allComplianceItems]);

  const scaduti = useMemo(() => docsObbligatoriAttivi.filter(d => {
    const item = allComplianceItems.find(i => i.tipo === d.key);
    return item?.stato === "SCADUTO";
  }).length, [docsObbligatoriAttivi, allComplianceItems]);

  // ─── SCORE COMPLIANCE (memoizzato — ricalcola solo quando cambiano gli items)
  const score = useMemo(
    () => calcScoreCompliance(entityItems, companyItems),
    [entityItems, companyItems]
  );
  const scoreColor = score < 30 ? T.low : score <= 60 ? T.amber : T.critical;
  const scoreBg    = score < 30 ? T.lowBg : score <= 60 ? T.amberBg : T.critBg;

  const entityItemMap  = Object.fromEntries(entityItems.map(i  => [i.tipo, i]));
  const companyItemMap = Object.fromEntries(companyItems.map(i => [i.tipo, i]));

  const companyDefs = useMemo(() => catalog.filter(d => d.livello === "company"), [catalog]);

  const visibleEntityDefs = useMemo(
    () => catalog.filter(d => d.livello === "entity"),
    [catalog]
  );

  const allVisibleDefs = useMemo(
    () => [...companyDefs, ...visibleEntityDefs],
    [companyDefs, visibleEntityDefs]
  );

  const frameworks = useMemo(
    () => ["TUTTI", ...Array.from(new Set(catalog.map(d => d.framework)))],
    [catalog]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { TUTTI: allVisibleDefs.length };
    for (const fw of frameworks) {
      if (fw !== "TUTTI") counts[fw] = allVisibleDefs.filter(d => d.framework === fw).length;
    }
    return counts;
  }, [allVisibleDefs, frameworks]);

  const filteredDefs = useMemo(
    () => activeTab === "TUTTI" ? allVisibleDefs : allVisibleDefs.filter(d => d.framework === activeTab),
    [activeTab, allVisibleDefs]
  );

  const uploadDef  = uploadTipo  ? catalog.find(a => a.key === uploadTipo)  ?? null : null;

  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ─── LOADING
  if (loading) return (
    <div className="clavis-bg min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color: "var(--bone-dim)" }}>CLAVIS</p>
        <p className="text-sm" style={{ color: "var(--bone-dim)" }}>Caricamento adempimenti...</p>
      </div>
    </div>
  );

  return (
    <AppShell
      profile={profile}
      activeRoute="/documenti"
    >
      <>
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-auto p-6 gap-6">

          {/* HEADER PAGINA */}
          <div className="flex flex-col gap-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <ClavisTitle it="Documenti" en="Documents" as="h1" variant="page" />
                <p className="text-xs font-mono mt-1" style={{ color: T.slate400 }}>
                  GDPR · NIS2 · AI Act · D.Lgs. 231 — {today}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: "var(--ink3)", color: "var(--bone-dim)", border: "1px solid var(--line2)" }}>
                  {docsObbligatoriAttivi.length} obbligatori
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.lowBg, color: T.low }}>
                  {docsConformi.length} conformi
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.critBg, color: T.critical }}>
                  {mancanti} mancanti
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.boneDimBg, color: T.boneDim }}>
                  {scaduti} scaduti
                </span>
                {/* Score compliance documentale */}
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  title="Rischio documentale ponderato: 0 = ottima compliance, 100 = massimo rischio"
                  style={{ backgroundColor: scoreBg, color: scoreColor, border: `1px solid ${scoreColor}40` }}>
                  ⚡ Rischio: {score}/100
                </span>
              </div>
            </div>

            {/* Barra conformità complessiva */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs" style={{ color: T.slate400 }}>Conformità obbligatori attivi</p>
                <p className="text-xs font-bold font-mono" style={{ color: pctConformita === 100 ? T.low : T.bronze }}>
                  {docsConformi.length} conformi su {docsObbligatoriAttivi.length} obbligatori — {pctConformita}%
                </p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--ink3)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pctConformita}%`,
                    backgroundColor: pctConformita === 100 ? T.low : T.bronze,
                  }} />
              </div>
              <p style={{ fontSize: "12px", color: "var(--bone-dim)", fontStyle: "italic", marginTop: "6px" }}>
                Questa valutazione contribuisce per il 30% allo score globale di rischio della struttura.
              </p>
            </div>
          </div>

          {/* ── TAB FILTRI + TOGGLE VISTA */}
          <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
            <div className="flex items-center gap-1 flex-wrap">
              {frameworks.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="text-xs font-semibold px-3 py-1.5 rounded transition-all"
                  style={{
                    backgroundColor: activeTab === tab ? "var(--shield)" : "var(--ink3)",
                    color: activeTab === tab ? "var(--bone)" : T.slate400,
                    border: `1px solid ${activeTab === tab ? "var(--shield)" : "var(--line2)"}`,
                  }}>
                  {tab} ({tabCounts[tab] ?? 0})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5"
              style={{ backgroundColor: "var(--ink3)", borderRadius: "6px", padding: "2px", border: "1px solid var(--line2)" }}>
              <button onClick={() => setViewMode('list')} title="Vista lista"
                className="px-2.5 py-1 rounded transition-all text-base leading-none"
                style={{ backgroundColor: viewMode === 'list' ? "var(--ink)" : "transparent", color: viewMode === 'list' ? "var(--bone)" : T.slate400 }}>
                ☰
              </button>
              <button onClick={() => setViewMode('grid')} title="Vista griglia"
                className="px-2.5 py-1 rounded transition-all text-base leading-none"
                style={{ backgroundColor: viewMode === 'grid' ? "var(--ink)" : "transparent", color: viewMode === 'grid' ? "var(--bone)" : T.slate400 }}>
                ⊞
              </button>
            </div>
          </div>

          {/* ── CONTENUTO DOCUMENTI */}
          {activeTab === 'TUTTI' ? (
            <>
              {/* SEZIONE 1: ADEMPIMENTI SOCIETÀ */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--bone)" }}>
                      Adempimenti Società
                    </h2>
                    <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400 }}>
                      Validi per tutte le strutture collegate
                    </p>
                  </div>
                  {company && (
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded"
                      style={{ backgroundColor: T.highBg, color: T.high, border: `1px solid ${T.high}30` }}>
                      {company.name}
                    </span>
                  )}
                </div>
                {viewMode === 'grid' ? (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                    {companyDefs.map(def => {
                      const item = companyItemMap[def.key] ?? null;
                      const isActive = (def.obbligatorio && def.scope === "ALL")
                        ? true
                        : !triageDone || activeFlags.includes(def.flag_key);
                      const isApplicable = def.scope === "ALL" || usaAI;
                      return (
                        <AdempimentoCard key={def.key} def={def} item={item}
                          isActive={isActive} isApplicable={isApplicable}                          onClick={() => setDocModalOpen(def)} />
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "8px" }}>
                    {companyDefs.map(def => {
                      const item = companyItemMap[def.key] ?? null;
                      const isActive = (def.obbligatorio && def.scope === "ALL")
                        ? true
                        : !triageDone || activeFlags.includes(def.flag_key);
                      const isApplicable = def.scope === "ALL" || usaAI;
                      return (
                        <AdempimentoRow key={def.key} def={def} item={item}
                          isActive={isActive} isApplicable={isApplicable}                          onOpenModal={() => setDocModalOpen(def)} />
                      );
                    })}
                  </div>
                )}
              </section>

              {/* SEZIONE 2: ADEMPIMENTI STRUTTURA */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--bone)" }}>
                      Adempimenti Documenti
                    </h2>
                    <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400 }}>
                      Specifici per questa struttura
                    </p>
                  </div>
                  {entityName && (
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded"
                      style={{ backgroundColor: T.bronzeBg, color: T.bronze, border: `1px solid ${T.bronze}30` }}>
                      {entityName}
                    </span>
                  )}
                </div>
                {viewMode === 'grid' ? (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                    {visibleEntityDefs.map(def => {
                      const item = entityItemMap[def.key] ?? null;
                      const isActive = (def.obbligatorio && def.scope === "ALL")
                        ? true
                        : !triageDone || activeFlags.includes(def.flag_key);
                      const isApplicable = def.scope === "ALL" || usaAI;
                      return (
                        <AdempimentoCard key={def.key} def={def} item={item}
                          isActive={isActive} isApplicable={isApplicable}                          onClick={() => setDocModalOpen(def)} />
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "8px" }}>
                    {visibleEntityDefs.map(def => {
                      const item = entityItemMap[def.key] ?? null;
                      const isActive = (def.obbligatorio && def.scope === "ALL")
                        ? true
                        : !triageDone || activeFlags.includes(def.flag_key);
                      const isApplicable = def.scope === "ALL" || usaAI;
                      return (
                        <AdempimentoRow key={def.key} def={def} item={item}
                          isActive={isActive} isApplicable={isApplicable}                          onOpenModal={() => setDocModalOpen(def)} />
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            /* LISTA FILTRATA per framework */
            <section className="flex flex-col gap-3">
              <p className="text-xs font-mono" style={{ color: T.slate400 }}>
                {filteredDefs.length} document{filteredDefs.length === 1 ? 'o' : 'i'} — {activeTab}
              </p>
              {viewMode === 'grid' ? (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                  {filteredDefs.map(def => {
                    const livello = def.livello;
                    const item = livello === "company" ? (companyItemMap[def.key] ?? null) : (entityItemMap[def.key] ?? null);
                    const isActive = (def.obbligatorio && def.scope === "ALL")
                      ? true
                      : !triageDone || activeFlags.includes(def.flag_key);
                    const isApplicable = def.scope === "ALL" || usaAI;
                    return (
                      <AdempimentoCard key={def.key} def={def} item={item}
                        isActive={isActive} isApplicable={isApplicable}
                        onClick={() => setDocModalOpen(def)} />
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "8px" }}>
                  {filteredDefs.map(def => {
                    const livello = def.livello;
                    const item = livello === "company" ? (companyItemMap[def.key] ?? null) : (entityItemMap[def.key] ?? null);
                    const isActive = (def.obbligatorio && def.scope === "ALL")
                      ? true
                      : !triageDone || activeFlags.includes(def.flag_key);
                    const isApplicable = def.scope === "ALL" || usaAI;
                    return (
                      <AdempimentoRow key={def.key} def={def} item={item}
                        isActive={isActive} isApplicable={isApplicable}
                        onOpenModal={() => setDocModalOpen(def)} />
                    );
                  })}
                </div>
              )}
            </section>
          )}

        </main>

      {/* ── DOC MODAL — info + CTA */}
      {docModalOpen && (() => {
        const mDef = docModalOpen;
        const mItem = mDef.livello === "company"
          ? (companyItemMap[mDef.key] ?? null)
          : (entityItemMap[mDef.key] ?? null);
        const mStato: DisplayStato = mItem?.stato ?? "MANCANTE";
        const mIsActive = (mDef.obbligatorio && mDef.scope === "ALL")
          ? true
          : !triageDone || activeFlags.includes(mDef.flag_key);
        const mIsApplicable = mDef.scope === "ALL" || usaAI;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            onClick={e => { if (e.target === e.currentTarget) setDocModalOpen(null); }}>
            <div style={{ background: "var(--ink2)", border: "0.5px solid var(--line2)",
                          borderRadius: "16px", width: "480px", maxWidth: "94vw", overflow: "hidden" }}>

              {/* HEADER */}
              <div style={{ padding: "18px 20px 14px", borderBottom: "0.5px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                              gap: "8px", marginBottom: "8px" }}>
                  <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--bone)", lineHeight: 1.3 }}>
                    {mDef.label}
                  </p>
                  <button onClick={() => setDocModalOpen(null)}
                    style={{ background: "none", border: "none", color: T.slate400,
                             cursor: "pointer", fontSize: "18px", flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", color: T.slate400, fontFamily: "monospace" }}>
                    {mDef.norma}
                  </span>
                  {mIsActive ? <StatoBadge stato={mStato} /> : <NonNecessarioBadge />}
                </div>
              </div>

              {/* BODY */}
              <div style={{ padding: "18px 20px" }}>
                <p style={{ fontSize: "13px", color: "var(--bone-dim)", lineHeight: 1.6, marginBottom: "14px" }}>
                  {mDef.descrizione}
                </p>

                <div style={{ background: "var(--ink3)", borderRadius: "8px", padding: "10px 12px", marginBottom: "16px" }}>
                  <p style={{ fontSize: "11px", color: T.slate400, textTransform: "uppercase",
                              letterSpacing: ".06em", marginBottom: "4px" }}>Cosa caricare</p>
                  <p style={{ fontSize: "12px", color: "var(--bone-dim)", lineHeight: 1.5 }}>
                    {mDef.cosa_caricare}
                    {mDef.max_pagine > 0 && (
                      <span style={{ color: T.slate400 }}> — max {mDef.max_pagine} pagine.</span>
                    )}
                  </p>
                </div>

                {(mIsActive && mIsApplicable) ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {mDef.producibile && (
                      <button onClick={() => { setDocModalOpen(null); setProduceTipo(mDef.key); }}
                        style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
                                 fontWeight: 500, cursor: "pointer", border: "none",
                                 backgroundColor: "var(--shield)", color: "var(--bone)",
                                 display: "flex", alignItems: "center", gap: "8px" }}>
                        ✨ Genera documento
                      </button>
                    )}
                    <button onClick={() => { setDocModalOpen(null); openUpload(mDef.key, mDef.livello); }}
                      style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
                               fontWeight: 500, cursor: "pointer",
                               border: "0.5px solid var(--line2)",
                               background: "var(--ink3)", color: "var(--bone)",
                               display: "flex", alignItems: "center", gap: "8px" }}>
                      🛡 Carica e verifica con AI
                    </button>
                    <button onClick={() => { setDocModalOpen(null); openDichiarato(mDef.key, mDef.livello); }}
                      style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
                               fontWeight: 500, cursor: "pointer",
                               border: "0.5px solid var(--line2)",
                               background: "var(--ink3)", color: "var(--bone)",
                               display: "flex", alignItems: "center", gap: "8px" }}>
                      ✋ Autocertifico di averlo
                    </button>
                  </div>
                ) : null}
                {(mIsActive && mIsApplicable) && mStato === "DICHIARATO" && (
                  <button onClick={() => { setDocModalOpen(null); handleAnnullaDichiarazione(mDef.key, mDef.livello); }}
                    style={{ width:"100%", padding:"8px 16px", borderRadius:"8px", fontSize:"12px",
                             fontWeight:400, cursor:"pointer", border:"0.5px solid var(--border)",
                             background:"none", color:"var(--text-muted)",
                             display:"flex", alignItems:"center", gap:"8px", marginTop:"4px" }}>
                    <i className="ti ti-x" aria-hidden="true" style={{ fontSize:"14px" }} />
                    Annulla autocertificazione
                  </button>
                )}
                {!(mIsActive && mIsApplicable) && (
                  <p style={{ fontSize: "12px", color: T.slate400, textAlign: "center", padding: "8px" }}>
                    {!mIsActive
                      ? "Nessuna azione richiesta per questa struttura"
                      : "Applicabile solo se la struttura utilizza sistemi AI"}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DOCUMENTO MODAL (tre strade) */}
      {documentoModal && entityId && userId && (
        <DocumentoModal
          def={documentoModal.def}
          livello={documentoModal.livello}
          entityId={entityId}
          companyId={companyId}
          userId={userId}
          entityFullData={entityFullData}
          companyData={companyFullData}
          currentStato={documentoModal.currentStato}
          currentDocNome={documentoModal.currentDocNome}
          onClose={() => setDocumentoModal(null)}
          onUpdate={loadData}
          userTier={userTier}
        />
      )}

      {/* ── MODAL DICHIARA */}
      {dichiaraTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={e => { if (e.target === e.currentTarget) closeDichiarato(); }}>
          <div className="w-full max-w-md rounded-lg overflow-hidden"
            style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--line2)", backgroundColor: "var(--ink3)" }}>
              <p className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--bone)" }}>
                Dichiarazione — {catalog.find(a => a.key === dichiaraTipo)?.label}
              </p>
              <button onClick={closeDichiarato} className="hover:opacity-60 transition-opacity"
                style={{ color: T.slate400, fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={dichiaraChecked}
                  onChange={e => setDichiaraChecked(e.target.checked)}
                  className="mt-0.5 flex-shrink-0" />
                <span className="text-sm leading-snug" style={{ color: "var(--bone)" }}>
                  Dichiaro sotto mia responsabilità di essere in possesso di questo documento
                </span>
              </label>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>
                  Note (opzionale)
                </label>
                <textarea value={dichiaraNote} onChange={e => setDichiaraNote(e.target.value)}
                  rows={3} placeholder="Riferimenti, revisore, data prevista caricamento..."
                  className="w-full px-3 py-2 text-sm resize-none outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--line2)" }}>
              <button onClick={closeDichiarato} disabled={dichiarando}
                className="text-sm px-4 py-2 transition-opacity hover:opacity-70"
                style={{ color: T.slate400 }}>
                Annulla
              </button>
              <button onClick={handleDichiaratoConfirm} disabled={dichiarando || !dichiaraChecked}
                className="text-sm px-5 py-2 font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: T.amber, color: "#0A0E1A", borderRadius: "4px" }}>
                {dichiarando ? "Salvataggio..." : "Conferma dichiarazione"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CARICA DOCUMENTO */}
      {uploadTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={e => { if (e.target === e.currentTarget) closeUpload(); }}>
          <div className="w-full max-w-md rounded-lg overflow-hidden"
            style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--line2)", backgroundColor: "var(--ink3)" }}>
              <p className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--bone)" }}>
                Carica — {catalog.find(a => a.key === uploadTipo)?.label}
              </p>
              <button onClick={closeUpload} className="hover:opacity-60 transition-opacity"
                style={{ color: T.slate400, fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Nota su cosa caricare con limite pagine */}
              {uploadDef && (
                <div className="px-3 py-2.5 rounded"
                  style={{ backgroundColor: "rgba(94,134,245,0.08)", border: "1px solid rgba(94,134,245,0.2)" }}>
                  <p className="text-xs leading-snug" style={{ color: T.boneDim, fontStyle: "italic" }}>
                    {uploadDef.cosa_caricare}
                  </p>
                  {uploadDef.max_pagine > 0 && (
                    <p className="text-xs font-semibold mt-1" style={{ color: T.high }}>
                      Max {uploadDef.max_pagine} pagine — file più grandi verranno rifiutati
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>
                  File documento *
                </label>
                <div
                  className={`border rounded px-4 py-6 text-center cursor-pointer hover:opacity-80 transition-all${isDragging ? " border-green-400 bg-green-400/10" : ""}`}
                  style={{ borderColor: isDragging ? undefined : uploadFile ? `${T.low}60` : "var(--line2)", borderStyle: "dashed", backgroundColor: isDragging ? undefined : "var(--ink3)" }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) setUploadFile(f);
                  }}>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }} />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-semibold" style={{ color: T.low }}>✓ {uploadFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: T.slate400 }}>{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm" style={{ color: T.slate400 }}>Trascina il file qui o clicca per selezionare</p>
                      <p className="text-xs mt-1" style={{ color: T.slate600, fontSize: "13px" }}>PDF, Word (.docx)</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>Data documento</label>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>

              <div className="space-y-1.5">
                <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--bone-dim)", textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: "6px" }}>
                  Data scadenza <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(se applicabile)</span>
                </label>
                <input type="date" value={uploadScadenza} onChange={e => setUploadScadenza(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
                <p style={{ fontSize: "13px", color: "var(--bone-dim)", marginTop: "4px" }}>
                  Obbligatoria per: Polizza RC, Nomina DPO, Codice Etico
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>Note (opzionale)</label>
                <textarea value={uploadNote} onChange={e => setUploadNote(e.target.value)}
                  rows={3} placeholder="Annotazioni, riferimenti, revisore..."
                  className="w-full px-3 py-2 text-sm resize-none outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>

              {uploadError && <p className="text-xs font-semibold" style={{ color: T.critical }}>✗ {uploadError}</p>}

              {uploading && (
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: T.amber }}>⏳ Caricamento e analisi AI in corso...</p>
                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--ink3)" }}>
                    <div className="h-full rounded-full animate-pulse" style={{ width: "60%", backgroundColor: T.bronze }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--line2)" }}>
              <button onClick={closeUpload} disabled={uploading}
                className="text-sm px-4 py-2 transition-opacity hover:opacity-70"
                style={{ color: T.slate400 }}>
                Annulla
              </button>
              <button
                onClick={canAnalyzeAI ? handleUploadSave : () => router.push("/upgrade")}
                disabled={uploading || !uploadFile || !canAnalyzeAI}
                className="text-sm px-5 py-2 font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                {!canAnalyzeAI ? "🔒 Funzione Pro" : uploading ? "Analisi AI..." : "Analizza e salva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRODUCE DOCUMENTO */}
      {produceTipo && entityFullData && companyFullData && (
        <GenerateDocModal
          flagKey={produceTipo}
          entity={{ ...entityFullData, legale_rappresentante: companyFullData.legale_rappresentante ?? entityFullData.legale_rappresentante }}
          company={companyFullData}
          entityId={entityId ?? undefined}
          livello={catalog.find(d => d.key === produceTipo)?.livello}
          companyId={companyId ?? undefined}
          revisioneMesi={catalog.find(d => d.key === produceTipo)?.revisione_mesi}
          userId={userId}
          onClose={() => { setProduceTipo(null); loadData(); }}
        />
      )}

      {/* ── TOAST RISCHIO */}
      {rischioToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl"
          style={{ backgroundColor: "#0A2E1A", border: `1px solid ${T.low}60`, color: T.low, fontSize: "13px", fontWeight: 600 }}>
          <span>✓</span>
          <span>Rischio aggiornato automaticamente</span>
        </div>
      )}

      </>
    </AppShell>
  );
}
