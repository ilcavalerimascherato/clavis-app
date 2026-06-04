"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";

type Categoria    = "SOFTWARE_GESTIONALE" | "INFRASTRUTTURA_IT" | "DISPOSITIVI_CONNESSI" | "SERVIZI_ESTERNI";
type DataResidency = "EU" | "EXTRA_EU" | "NON_NOTO";
type RiskBand     = "CRITICO" | "ALTO" | "MEDIO" | "BASSO";
type Stato        = "ATTIVO" | "IN_VERIFICA" | "A_RISCHIO" | "SOSPESO";

interface SupplierRegistry {
  id: string;
  company_id: string;
  created_by: string;
  ragione_sociale: string;
  piva: string | null;
  email_fornitore: string | null;
  referente_fornitore: string | null;
  dpa_firmato: boolean;
  dpa_scadenza: string | null;
  certificazioni: string[];
  stato_relazione: Stato;
  note: string | null;
  data_ultimo_contatto: string | null;
  created_at: string;
}

interface Supplier {
  id: string;
  entity_id: string;
  company_id: string;
  fornitore_id: string;
  categoria: Categoria;
  sottocategoria: string;
  servizio_descritto: string | null;
  dati_trattati: string[];
  data_residency: DataResidency;
  scc_presente: boolean;
  referente_interno: string | null;
  rischio_lordo: string;
  rischio_netto: string;
  created_at: string;
}

interface Profile { id: string; full_name: string; email: string; tier: string; }
interface Company { id: string; name: string; vat_number: string | null; legal_address: string | null; region: string | null; }

const SUBCATEGORIES: Record<Categoria, string[]> = {
  SOFTWARE_GESTIONALE:  ["GESTIONALE_RSA","CARTELLA_CLINICA","SOFTWARE_PRESENZE","SOFTWARE_CONTABILITA","SOFTWARE_FARMACI","PORTALE_FAMIGLIE","SOFTWARE_PASTI","VPN"],
  INFRASTRUTTURA_IT:    ["CONNETTIVITA","HOSTING_CLOUD","BACKUP","EMAIL_AZIENDALE","FIREWALL_ANTIVIRUS","CENTRALINO"],
  DISPOSITIVI_CONNESSI: ["PC_TABLET","VIDEOSORVEGLIANZA","CONTROLLO_ACCESSI","DISPOSITIVI_MEDICI"],
  SERVIZI_ESTERNI:      ["STUDIO_PAGHE","MEDICO_COMPETENTE","SERVIZIO_MENSA","SERVIZIO_LAVANDERIA","ALTRO"],
};

const SUBCAT_LABELS: Record<string, string> = {
  GESTIONALE_RSA:"Gestionale RSA", CARTELLA_CLINICA:"Cartella Clinica Elettronica",
  SOFTWARE_PRESENZE:"Software Presenze", SOFTWARE_CONTABILITA:"Software Contabilità",
  SOFTWARE_FARMACI:"Gestione Farmaci", PORTALE_FAMIGLIE:"Portale Famiglie",
  SOFTWARE_PASTI:"Prenotazione Pasti", VPN:"VPN Aziendale",
  CONNETTIVITA:"Connettività Internet", HOSTING_CLOUD:"Hosting / Cloud",
  BACKUP:"Backup & DR", EMAIL_AZIENDALE:"Email Aziendale",
  FIREWALL_ANTIVIRUS:"Firewall / Antivirus", CENTRALINO:"Centralino",
  PC_TABLET:"PC / Tablet", VIDEOSORVEGLIANZA:"Videosorveglianza",
  CONTROLLO_ACCESSI:"Controllo Accessi", DISPOSITIVI_MEDICI:"Dispositivi Medici",
  STUDIO_PAGHE:"Studio Paghe", MEDICO_COMPETENTE:"Medico Competente",
  SERVIZIO_MENSA:"Servizio Mensa", SERVIZIO_LAVANDERIA:"Lavanderia", ALTRO:"Altro",
};

const CAT_LABELS: Record<Categoria, string> = {
  SOFTWARE_GESTIONALE:"Software Gestionale", INFRASTRUTTURA_IT:"Infrastruttura IT",
  DISPOSITIVI_CONNESSI:"Dispositivi Connessi", SERVIZI_ESTERNI:"Servizi Esterni",
};

// ─── SUGGERIMENTI PER CATEGORIA
interface ServiceSuggestion {
  id: string;
  label: string;
  categoria: Categoria;
  sottocategoria: string;
  dati_trattati: string[];
  data_residency: DataResidency;
  descrizione: string;
}

const SERVICE_SUGGESTIONS: Record<Categoria, ServiceSuggestion[]> = {
  SOFTWARE_GESTIONALE: [
    { id:"gest_rsa",    label:"Gestionale RSA",             categoria:"SOFTWARE_GESTIONALE", sottocategoria:"GESTIONALE_RSA",       dati_trattati:["SANITARI","PERSONALI","AMMINISTRATIVI"], data_residency:"EU", descrizione:"Gestione ospiti, cartelle, presenze e amministrazione RSA" },
    { id:"cart_clin",   label:"Cartella Clinica Elettronica",categoria:"SOFTWARE_GESTIONALE", sottocategoria:"CARTELLA_CLINICA",     dati_trattati:["SANITARI","PERSONALI"],                  data_residency:"EU", descrizione:"Documentazione clinica digitale degli ospiti" },
    { id:"sw_presenze", label:"Software Presenze",          categoria:"SOFTWARE_GESTIONALE", sottocategoria:"SOFTWARE_PRESENZE",    dati_trattati:["PERSONALI","AMMINISTRATIVI"],            data_residency:"EU", descrizione:"Rilevazione presenze e turni del personale" },
    { id:"sw_farmaci",  label:"Gestione Farmaci",           categoria:"SOFTWARE_GESTIONALE", sottocategoria:"SOFTWARE_FARMACI",     dati_trattati:["SANITARI","PERSONALI"],                  data_residency:"EU", descrizione:"Gestione terapie e somministrazioni farmacologiche" },
    { id:"portale_fam", label:"Portale Famiglie",           categoria:"SOFTWARE_GESTIONALE", sottocategoria:"PORTALE_FAMIGLIE",     dati_trattati:["PERSONALI"],                            data_residency:"EU", descrizione:"Accesso famiglie a informazioni e comunicazioni" },
    { id:"sw_contab",   label:"Software Contabilità",       categoria:"SOFTWARE_GESTIONALE", sottocategoria:"SOFTWARE_CONTABILITA", dati_trattati:["AMMINISTRATIVI"],                       data_residency:"EU", descrizione:"Gestione contabile e fatturazione" },
  ],
  INFRASTRUTTURA_IT: [
    { id:"hosting",    label:"Hosting / Cloud",      categoria:"INFRASTRUTTURA_IT", sottocategoria:"HOSTING_CLOUD",     dati_trattati:["SANITARI","PERSONALI","AMMINISTRATIVI"], data_residency:"EU",     descrizione:"Hosting server e servizi cloud aziendali" },
    { id:"backup",     label:"Backup & DR",          categoria:"INFRASTRUTTURA_IT", sottocategoria:"BACKUP",            dati_trattati:["SANITARI","PERSONALI","AMMINISTRATIVI"], data_residency:"EU",     descrizione:"Backup automatico e disaster recovery" },
    { id:"email",      label:"Email Aziendale",      categoria:"INFRASTRUTTURA_IT", sottocategoria:"EMAIL_AZIENDALE",   dati_trattati:["PERSONALI","AMMINISTRATIVI"],            data_residency:"EU",     descrizione:"Servizio email e comunicazioni aziendali" },
    { id:"firewall",   label:"Firewall / Antivirus", categoria:"INFRASTRUTTURA_IT", sottocategoria:"FIREWALL_ANTIVIRUS",dati_trattati:["AMMINISTRATIVI"],                       data_residency:"EU",     descrizione:"Protezione perimetrale e antivirus endpoint" },
    { id:"connettiv",  label:"Connettività Internet",categoria:"INFRASTRUTTURA_IT", sottocategoria:"CONNETTIVITA",      dati_trattati:["AMMINISTRATIVI"],                       data_residency:"EU",     descrizione:"Fornitura rete internet e LAN" },
    { id:"centralino", label:"Centralino",           categoria:"INFRASTRUTTURA_IT", sottocategoria:"CENTRALINO",        dati_trattati:["PERSONALI"],                            data_residency:"EU",     descrizione:"Gestione telefonia e centralino VoIP" },
  ],
  DISPOSITIVI_CONNESSI: [
    { id:"pc_tablet",   label:"PC / Tablet",         categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"PC_TABLET",          dati_trattati:["PERSONALI","AMMINISTRATIVI"], data_residency:"EU", descrizione:"Fornitura e manutenzione dispositivi informatici" },
    { id:"videosrv",    label:"Videosorveglianza",   categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"VIDEOSORVEGLIANZA",  dati_trattati:["PERSONALI"],                 data_residency:"EU", descrizione:"Impianto TVCC e videosorveglianza struttura" },
    { id:"ctrl_acc",    label:"Controllo Accessi",   categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"CONTROLLO_ACCESSI",  dati_trattati:["PERSONALI","AMMINISTRATIVI"],data_residency:"EU", descrizione:"Gestione badge e accessi controllati" },
    { id:"disp_med",    label:"Dispositivi Medici",  categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"DISPOSITIVI_MEDICI", dati_trattati:["SANITARI","PERSONALI"],      data_residency:"EU", descrizione:"Dispositivi medici connessi alla rete" },
  ],
  SERVIZI_ESTERNI: [
    { id:"studio_paghe",label:"Studio Paghe",        categoria:"SERVIZI_ESTERNI", sottocategoria:"STUDIO_PAGHE",       dati_trattati:["PERSONALI","AMMINISTRATIVI"], data_residency:"EU", descrizione:"Elaborazione buste paga e adempimenti contributivi" },
    { id:"med_comp",    label:"Medico Competente",   categoria:"SERVIZI_ESTERNI", sottocategoria:"MEDICO_COMPETENTE",  dati_trattati:["SANITARI","PERSONALI"],      data_residency:"EU", descrizione:"Sorveglianza sanitaria e medicina del lavoro" },
    { id:"mensa",       label:"Servizio Mensa",      categoria:"SERVIZI_ESTERNI", sottocategoria:"SERVIZIO_MENSA",     dati_trattati:["PERSONALI","SANITARI"],      data_residency:"EU", descrizione:"Fornitura pasti e gestione mensa" },
    { id:"lavanderia",  label:"Lavanderia",          categoria:"SERVIZI_ESTERNI", sottocategoria:"SERVIZIO_LAVANDERIA",dati_trattati:["PERSONALI"],                 data_residency:"EU", descrizione:"Ritiro, lavaggio e riconsegna biancheria" },
  ],
};

const RESIDENCY_LABELS: Record<DataResidency, string> = {
  EU:"UE", EXTRA_EU:"Extra-UE", NON_NOTO:"Non noto",
};

const STATO_MAP: Record<Stato, { label: string; color: string; bg: string }> = {
  ATTIVO:      { label:"ATTIVO",      color:"#3ECF8E", bg:"rgba(62,207,142,.10)"  },
  IN_VERIFICA: { label:"IN VERIFICA", color:"#5E86F5", bg:"rgba(94,134,245,.12)"  },
  A_RISCHIO:   { label:"A RISCHIO",   color:"#E8634A", bg:"rgba(232,99,74,.12)"   },
  SOSPESO:     { label:"SOSPESO",     color:"#9AA3BD", bg:"rgba(238,241,248,.08)" },
};

const RISK_ORDER = ["BASSO", "MEDIO", "ALTO", "CRITICO"];

function calcRischioLordo(categoria: Categoria, datiTrattati: string[], certificazioni: string[]): number {
  const catBase: Record<Categoria, number> = {
    DISPOSITIVI_CONNESSI:55, SOFTWARE_GESTIONALE:50, INFRASTRUTTURA_IT:40, SERVIZI_ESTERNI:25,
  };
  let score = catBase[categoria] ?? 30;
  if (datiTrattati.includes("SANITARI"))       score += 30;
  if (datiTrattati.includes("PERSONALI"))      score += 15;
  if (datiTrattati.includes("AMMINISTRATIVI")) score += 5;
  if (certificazioni.includes("ISO 27001"))    score -= 12;
  if (certificazioni.includes("SOC2"))         score -= 10;
  if (certificazioni.includes("Nessuna"))      score += 8;
  return Math.min(100, Math.max(0, score));
}

function calcRischioNetto(lordo: number, dataResidency: DataResidency, sccPresente: boolean, dpaFirmato: boolean, certificazioni: string[]): number {
  let score = lordo;
  if (dataResidency === "EXTRA_EU")      score += sccPresente ? 5 : 18;
  else if (dataResidency === "NON_NOTO") score += 10;
  if (!dpaFirmato) score += 12;
  else             score -= 8;
  if (certificazioni.includes("ISO 27001")) score -= 5;
  if (certificazioni.includes("SOC2"))      score -= 5;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function getRiskTokens(score: number): { band: RiskBand; color: string; bg: string } {
  if (score >= 75) return { band:"CRITICO", color:T.critical, bg:T.critBg };
  if (score >= 50) return { band:"ALTO",    color:T.high,     bg:T.highBg };
  if (score >= 25) return { band:"MEDIO",   color:T.medium,   bg:T.medBg  };
  return              { band:"BASSO",   color:T.low,      bg:T.lowBg  };
}

function getRiskBadgeFromEnum(value: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    BASSO:   { label:"BASSO",   color:T.low,      bg:T.lowBg  },
    MEDIO:   { label:"MEDIO",   color:T.medium,   bg:T.medBg  },
    ALTO:    { label:"ALTO",    color:T.high,     bg:T.highBg },
    CRITICO: { label:"CRITICO", color:T.critical, bg:T.critBg },
  };
  return map[value] ?? map["MEDIO"];
}

function RiskBadge({ score }: { score: number }) {
  const { band, color, bg } = getRiskTokens(score);
  return <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:bg, color, fontSize:"13px" }}>{band}</span>;
}

function StatoBadge({ stato }: { stato: string }) {
  const t = STATO_MAP[stato as Stato] ?? STATO_MAP.ATTIVO;
  return <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:t.bg, color:t.color, fontSize:"13px" }}>{t.label}</span>;
}

interface RegistryFormData {
  ragione_sociale: string; piva: string; email: string; referente: string;
  dpa_firmato: boolean; dpa_scadenza: string; certificazioni: string[];
  stato: Stato | ""; note: string;
}
const REGISTRY_FORM_INIT: RegistryFormData = {
  ragione_sociale:"", piva:"", email:"", referente:"",
  dpa_firmato:false, dpa_scadenza:"", certificazioni:[], stato:"", note:"",
};

interface ServiceFormData {
  categoria: Categoria | ""; sottocategoria: string; servizio_descritto: string;
  dati_trattati: string[]; data_residency: DataResidency | "";
  scc_presente: boolean; referente_interno: string;
}
const SERVICE_FORM_INIT: ServiceFormData = {
  categoria:"", sottocategoria:"", servizio_descritto:"",
  dati_trattati:[], data_residency:"", scc_presente:false, referente_interno:"",
};

const inputStyle: React.CSSProperties = {
  background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)",
  borderRadius:"4px", color:"#F1F5F9", colorScheme:"dark",
};
const labelStyle: React.CSSProperties = {
  color:"#94A3B8", fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.08em",
};

// ─── WIZARD CENSIMENTO ────────────────────────────────────────────────────────

interface WizardService {
  key: string; label: string; categoria: Categoria;
  sottocategoria: string; icon: string; desc: string;
}

const WIZARD_SERVICES: WizardService[] = [
  { key:"GESTIONALE_RSA",     label:"Gestionale RSA",                 categoria:"SOFTWARE_GESTIONALE",  sottocategoria:"GESTIONALE_RSA",     icon:"🏥", desc:"Software di gestione operativa RSA/struttura" },
  { key:"CARTELLA_CLINICA",   label:"Cartella Clinica Elettronica",   categoria:"SOFTWARE_GESTIONALE",  sottocategoria:"CARTELLA_CLINICA",   icon:"📋", desc:"Gestione digitale della documentazione sanitaria" },
  { key:"SOFTWARE_PRESENZE",  label:"Software Presenze",              categoria:"SOFTWARE_GESTIONALE",  sottocategoria:"SOFTWARE_PRESENZE",  icon:"🕐", desc:"Rilevazione presenze e gestione turni" },
  { key:"EMAIL_AZIENDALE",    label:"Email Aziendale",                categoria:"INFRASTRUTTURA_IT",    sottocategoria:"EMAIL_AZIENDALE",    icon:"✉️", desc:"Provider di posta elettronica aziendale" },
  { key:"BACKUP",             label:"Backup & Disaster Recovery",     categoria:"INFRASTRUTTURA_IT",    sottocategoria:"BACKUP",             icon:"💾", desc:"Soluzioni di backup e ripristino dati" },
  { key:"HOSTING_CLOUD",      label:"Hosting / Cloud",                categoria:"INFRASTRUTTURA_IT",    sottocategoria:"HOSTING_CLOUD",      icon:"☁️", desc:"Infrastruttura cloud o hosting dei sistemi" },
  { key:"VIDEOSORVEGLIANZA",  label:"Videosorveglianza",              categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"VIDEOSORVEGLIANZA",  icon:"📹", desc:"Sistema di videosorveglianza IP o cloud" },
  { key:"CONTROLLO_ACCESSI",  label:"Controllo Accessi",              categoria:"DISPOSITIVI_CONNESSI", sottocategoria:"CONTROLLO_ACCESSI",  icon:"🔐", desc:"Sistemi di controllo accessi fisici" },
  { key:"STUDIO_PAGHE",       label:"Studio Paghe",                   categoria:"SERVIZI_ESTERNI",      sottocategoria:"STUDIO_PAGHE",       icon:"💼", desc:"Elaborazione cedolini e consulenza HR/payroll" },
  { key:"MEDICO_COMPETENTE",  label:"Medico Competente",              categoria:"SERVIZI_ESTERNI",      sottocategoria:"MEDICO_COMPETENTE",  icon:"🩺", desc:"Servizio di sorveglianza sanitaria lavoratori" },
  { key:"SERVIZIO_MENSA",     label:"Servizio Mensa",                 categoria:"SERVIZI_ESTERNI",      sottocategoria:"SERVIZIO_MENSA",     icon:"🍽️", desc:"Fornitura pasti e catering per ospiti/dipendenti" },
  { key:"SERVIZIO_LAVANDERIA",label:"Lavanderia",                     categoria:"SERVIZI_ESTERNI",      sottocategoria:"SERVIZIO_LAVANDERIA",icon:"🧺", desc:"Servizio di lavanderia e noleggio biancheria" },
];

interface WizardRow {
  serviceKey: string; label: string; categoria: Categoria; sottocategoria: string;
}

interface WizardServiceForm {
  ragione_sociale: string; piva: string; email: string; referente: string;
  dpa_firmato: boolean; data_residency: DataResidency | ""; dati_trattati: string[];
}

const WIZARD_FORM_INIT: WizardServiceForm = {
  ragione_sociale:"", piva:"", email:"", referente:"",
  dpa_firmato:false, data_residency:"", dati_trattati:[],
};

export default function FornitoriPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [profile,   setProfile]   = useState<Profile | null>(null);
  const [entityId,  setEntityId]  = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [registries,      setRegistries]      = useState<SupplierRegistry[]>([]);
  const [servicesMap,     setServicesMap]     = useState<Record<string, Supplier[]>>({});
  const [aggregates,      setAggregates]      = useState<Record<string, { count: number; rischioMax: string | null }>>({});
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [loadingServices, setLoadingServices] = useState<Record<string, boolean>>({});

  const [loading,          setLoading]          = useState(true);

  const [showRegistryModal, setShowRegistryModal] = useState(false);
  const [editingRegistryId, setEditingRegistryId] = useState<string | null>(null);
  const [registryForm,      setRegistryForm]      = useState<RegistryFormData>(REGISTRY_FORM_INIT);
  const [savingRegistry,    setSavingRegistry]    = useState(false);
  const [registrySaveError, setRegistrySaveError] = useState<string | null>(null);

  const [showServiceModal,   setShowServiceModal]   = useState(false);
  const [serviceFornitoreId, setServiceFornitoreId] = useState<string | null>(null);
  const [editingServiceId,   setEditingServiceId]   = useState<string | null>(null);
  const [serviceStep,        setServiceStep]        = useState<0 | 1 | 2>(1);
  const [serviceForm,        setServiceForm]        = useState<ServiceFormData>(SERVICE_FORM_INIT);
  const [savingService,      setSavingService]      = useState(false);
  const [serviceSaveError,   setServiceSaveError]   = useState<string | null>(null);
  // step 0 suggerimenti
  const [suggestCategoria,   setSuggestCategoria]   = useState<Categoria | null>(null);
  const [suggestSelected,    setSuggestSelected]    = useState<Set<string>>(new Set());
  const [savingSuggested,    setSavingSuggested]    = useState(false);

  const [mailFornitore, setMailFornitore] = useState<SupplierRegistry | null>(null);
  const [mailSubject,   setMailSubject]   = useState("");
  const [mailBody,      setMailBody]      = useState("");
  const [mailCopied,    setMailCopied]    = useState(false);

  const [company,        setCompany]        = useState<Company | null>(null);
  const [dpaFornitore,   setDpaFornitore]   = useState<SupplierRegistry | null>(null);
  const [dpaServices,    setDpaServices]    = useState<Supplier[]>([]);
  const [dpaDecorrenza,  setDpaDecorrenza]  = useState("");
  const [dpaAddress,     setDpaAddress]     = useState("");
  const [dpaPiva,        setDpaPiva]        = useState("");
  const [dpaEmail,       setDpaEmail]       = useState("");
  const [dpaCopied,      setDpaCopied]      = useState(false);

  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadingType,  setUploadingType]  = useState<"REGISTRO_FORNITORI"|"REGISTRO_TRATTAMENTI"|null>(null);
  const [docConfirmType, setDocConfirmType] = useState<"REGISTRO_FORNITORI"|"REGISTRO_TRATTAMENTI"|null>(null);
  const [docError,       setDocError]       = useState<string | null>(null);
  const [analyzingType,  setAnalyzingType]  = useState<"REGISTRO_FORNITORI"|"REGISTRO_TRATTAMENTI"|null>(null);
  const [importRows,     setImportRows]     = useState<unknown[]>([]);
  const [importSelected, setImportSelected] = useState<boolean[]>([]);
  const [importType,     setImportType]     = useState<string>("");
  const [showImportModal,setShowImportModal]= useState(false);
  const [savingImport,   setSavingImport]   = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importMeta,       setImportMeta]       = useState<Record<string,unknown> | null>(null);
  const [triageHints,      setTriageHints]      = useState<Record<string,boolean> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lastAnalysis,     setLastAnalysis]     = useState<any>(null);
  const [externalBanner,     setExternalBanner]     = useState<string | null>(null);
  const [analyzeProgress,    setAnalyzeProgress]    = useState(0);
  const [externalList,       setExternalList]       = useState<string[]>([]);
  const [externalQueue,      setExternalQueue]      = useState<string[]>([]);
  const [currentExternal,    setCurrentExternal]    = useState<string | null>(null);
  const [showExternalModal,  setShowExternalModal]  = useState(false);
  const [externalForm,       setExternalForm]       = useState({ ragione_sociale:"", piva:"", email:"", categoria:"SERVIZI_ESTERNI" as Categoria, stato_relazione:"ATTIVO" as Stato });
  const [savingExternal,     setSavingExternal]     = useState(false);
  const [externalSaveError,  setExternalSaveError]  = useState<string | null>(null);

  // Compliance SSOT — stato adempimenti collegati
  const [complianceRegFornitori,   setComplianceRegFornitori]   = useState<string | null>(null);
  const [complianceRegFornData,    setComplianceRegFornData]    = useState<string | null>(null);
  const [complianceRegTrattamenti, setComplianceRegTrattamenti] = useState<string | null>(null);
  const [complianceRegTrattData,   setComplianceRegTrattData]   = useState<string | null>(null);

  // Wizard censimento
  const [wizardOpen,     setWizardOpen]     = useState(false);
  const [wizardStep,     setWizardStep]     = useState<0 | 1 | 2 | "conclusivo">(0);
  const [wizardSelected, setWizardSelected] = useState<string[]>([]);
  const [wizardForms,    setWizardForms]    = useState<Record<string, WizardServiceForm>>({});
  const [wizardFormIdx,  setWizardFormIdx]  = useState(0);
  const [savingWizard,   setSavingWizard]   = useState(false);
  const [wizardError,    setWizardError]    = useState<string | null>(null);
  const [wizardSaved,    setWizardSaved]    = useState(0);

  const currentRegistry = registries.find(r => r.id === serviceFornitoreId);
  const previewLordo = serviceForm.categoria
    ? calcRischioLordo(serviceForm.categoria as Categoria, serviceForm.dati_trattati, currentRegistry?.certificazioni ?? [])
    : 0;
  const previewNetto = serviceForm.categoria
    ? calcRischioNetto(previewLordo, (serviceForm.data_residency || "EU") as DataResidency, serviceForm.scc_presente, currentRegistry?.dpa_firmato ?? false, currentRegistry?.certificazioni ?? [])
    : 0;

  function computeAggregates(rows: { fornitore_id: string; rischio_netto: string }[]) {
    const agg: Record<string, { count: number; rischioMax: string | null }> = {};
    rows.forEach(s => {
      if (!s.fornitore_id) return;
      if (!agg[s.fornitore_id]) agg[s.fornitore_id] = { count:0, rischioMax:null };
      agg[s.fornitore_id].count++;
      const curr = agg[s.fornitore_id].rischioMax;
      if (!curr || RISK_ORDER.indexOf(s.rischio_netto) > RISK_ORDER.indexOf(curr))
        agg[s.fornitore_id].rischioMax = s.rischio_netto;
    });
    return agg;
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("id, company_id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id, company_id").eq("created_by", user.id).limit(1);

      const [profRes, entityRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        entityQuery,
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (!entityRes.data || entityRes.data.length === 0) { router.push("/onboarding"); return; }

      const eid = entityRes.data[0].id;
      const cid = entityRes.data[0].company_id ?? null;
      setEntityId(eid);
      setCompanyId(cid);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);
      if (!cid) return;

      const [regRes, aggRes, compRes] = await Promise.all([
        supabase.from("supplier_registry").select("*").eq("company_id", cid).order("ragione_sociale"),
        supabase.from("suppliers").select("fornitore_id, rischio_netto").eq("company_id", cid),
        supabase.from("companies").select("id, name, vat_number, legal_address, region").eq("id", cid).single(),
      ]);

      if (regRes.data)  setRegistries(regRes.data as SupplierRegistry[]);
      if (aggRes.data)  setAggregates(computeAggregates(aggRes.data));
      if (compRes.data) setCompany(compRes.data as Company);

      // Leggi stato compliance adempimenti collegati (SSOT)
      const [statoForn, statoTratt] = await Promise.all([
        supabase.from("entity_compliance_items").select("stato, data_documento").eq("entity_id", eid).eq("tipo", "REGISTRO_FORNITORI").single(),
        supabase.from("entity_compliance_items").select("stato, data_documento").eq("entity_id", eid).eq("tipo", "REGISTRO_TRATTAMENTI").single(),
      ]);
      if (statoForn.data) {
        setComplianceRegFornitori(statoForn.data.stato ?? null);
        setComplianceRegFornData(statoForn.data.data_documento ?? null);
      }
      if (statoTratt.data) {
        setComplianceRegTrattamenti(statoTratt.data.stato ?? null);
        setComplianceRegTrattData(statoTratt.data.data_documento ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  const loadServices = useCallback(async (fornitoreId: string): Promise<Supplier[]> => {
    setLoadingServices(prev => ({ ...prev, [fornitoreId]:true }));
    try {
      const { data } = await supabase
        .from("suppliers").select("*").eq("fornitore_id", fornitoreId)
        .order("created_at", { ascending:false });
      const rows = (data ?? []) as Supplier[];
      setServicesMap(prev => ({ ...prev, [fornitoreId]:rows }));
      return rows;
    } finally {
      setLoadingServices(prev => ({ ...prev, [fornitoreId]:false }));
    }
  }, [supabase]);

  const reloadAggregates = useCallback(async (cid: string) => {
    const { data } = await supabase.from("suppliers").select("fornitore_id, rischio_netto").eq("company_id", cid);
    if (data) setAggregates(computeAggregates(data));
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("clavis_last_analysis");
      if (saved) setLastAnalysis(JSON.parse(saved));
    } catch {}
  }, []);

  // Apri il wizard quando URL contiene ?action=censimento
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "censimento") {
      setWizardOpen(true);
      setWizardStep(0);
      setWizardSelected([]);
      setWizardForms({});
      setWizardFormIdx(0);
      setWizardError(null);
      setWizardSaved(0);
    }
  }, []);

  // Pre-inizializza i form per i servizi selezionati
  useEffect(() => {
    if (!wizardOpen) return;
    setWizardForms(prev => {
      const next = { ...prev };
      wizardSelected.forEach(key => {
        if (!next[key]) next[key] = { ...WIZARD_FORM_INIT };
      });
      return next;
    });
  }, [wizardSelected, wizardOpen]);

  async function saveWizardFornitore() {
    if (!companyId || !entityId) return;
    setSavingWizard(true);
    setWizardError(null);
    let saved = 0;
    let fornSaved = 0;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? "";

      for (const key of wizardSelected) {
        const form = wizardForms[key];
        if (!form?.ragione_sociale.trim()) continue;
        const svc = WIZARD_SERVICES.find(s => s.key === key);
        if (!svc) continue;

        // 1. Cerca fornitore esistente o inseriscine uno nuovo
        let fornId: string | null = null;
        const existing = registries.find(
          r => r.ragione_sociale.toLowerCase().trim() === form.ragione_sociale.toLowerCase().trim()
        );
        if (existing) {
          fornId = existing.id;
        } else {
          const { data: regData, error: regErr } = await supabase
            .from("supplier_registry")
            .insert({
              company_id: companyId,
              created_by: userId,
              ragione_sociale: form.ragione_sociale.trim(),
              piva: form.piva.trim() || null,
              email_fornitore: form.email.trim() || null,
              referente_fornitore: form.referente.trim() || null,
              dpa_firmato: form.dpa_firmato,
              dpa_scadenza: null,
              certificazioni: [],
              stato_relazione: "ATTIVO",
              categoria: svc.categoria,
              note: null,
              data_ultimo_contatto: null,
            })
            .select("id")
            .single();
          if (regErr || !regData) continue;
          fornId = (regData as { id: string }).id;
          fornSaved++;
        }
        if (!fornId) continue;

        // 2. Inserisci servizio collegato
        const residency = (form.data_residency || "EU") as DataResidency;
        const lordo = calcRischioLordo(svc.categoria, form.dati_trattati, []);
        const netto  = calcRischioNetto(lordo, residency, false, form.dpa_firmato, []);

        const { error: svcErr } = await supabase
          .from("suppliers")
          .insert({
            entity_id: entityId,
            company_id: companyId,
            fornitore_id: fornId,
            categoria: svc.categoria,
            sottocategoria: svc.sottocategoria,
            servizio_descritto: null,
            dati_trattati: form.dati_trattati,
            data_residency: residency,
            scc_presente: false,
            referente_interno: form.referente.trim() || null,
            rischio_lordo: getRiskTokens(lordo).band,
            rischio_netto: getRiskTokens(netto).band,
          });
        if (!svcErr) saved++;
      }

      setWizardSaved(fornSaved);
      setWizardStep("conclusivo");
      await loadData();
    } catch {
      setWizardError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSavingWizard(false);
    }
  }

  async function toggleAccordion(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!servicesMap[id]) await loadServices(id);
  }

  function openAddRegistry() {
    setEditingRegistryId(null); setRegistryForm(REGISTRY_FORM_INIT);
    setRegistrySaveError(null); setShowRegistryModal(true);
  }
  function openEditRegistry(r: SupplierRegistry) {
    setEditingRegistryId(r.id);
    setRegistryForm({
      ragione_sociale:r.ragione_sociale, piva:r.piva??"", email:r.email_fornitore??"",
      referente:r.referente_fornitore??"", dpa_firmato:r.dpa_firmato, dpa_scadenza:r.dpa_scadenza??"",
      certificazioni:r.certificazioni??[], stato:r.stato_relazione, note:r.note??"",
    });
    setRegistrySaveError(null); setShowRegistryModal(true);
  }
  function closeRegistryModal() {
    setShowRegistryModal(false); setEditingRegistryId(null);
    setRegistryForm(REGISTRY_FORM_INIT); setRegistrySaveError(null);
  }

  async function handleRegistrySave() {
    if (!registryForm.ragione_sociale.trim()) { setRegistrySaveError("Ragione sociale obbligatoria"); return; }
    setSavingRegistry(true); setRegistrySaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        company_id:      companyId,
        created_by:      user.id,
        ragione_sociale: registryForm.ragione_sociale.trim(),
        piva:                registryForm.piva.trim() || null,
        email_fornitore:     registryForm.email.trim() || null,
        referente_fornitore: registryForm.referente.trim() || null,
        dpa_firmato:         registryForm.dpa_firmato,
        dpa_scadenza:        registryForm.dpa_firmato && registryForm.dpa_scadenza ? registryForm.dpa_scadenza : null,
        certificazioni:      registryForm.certificazioni,
        stato_relazione:     registryForm.stato || "ATTIVO",
        note:            registryForm.note.trim() || null,
      };
      let err;
      if (editingRegistryId) {
        ({ error: err } = await supabase.from("supplier_registry").update(payload).eq("id", editingRegistryId));
      } else {
        ({ error: err } = await supabase.from("supplier_registry").insert(payload));
      }
      if (err) { setRegistrySaveError(err.message); return; }
      if (companyId) {
        const { data } = await supabase.from("supplier_registry").select("*").eq("company_id", companyId).order("ragione_sociale");
        if (data) setRegistries(data as SupplierRegistry[]);
      }
      closeRegistryModal();
    } finally { setSavingRegistry(false); }
  }

  function openAddService(fornitoreId: string) {
    const reg = registries.find(r => r.id === fornitoreId);
    const cat = (reg as any)?.categoria as Categoria | null ?? null;
    setServiceFornitoreId(fornitoreId);
    setEditingServiceId(null);
    setServiceForm(SERVICE_FORM_INIT);
    setServiceStep(0);
    setSuggestCategoria(cat);
    setSuggestSelected(new Set());
    setServiceSaveError(null);
    setShowServiceModal(true);
  }
  function openEditService(s: Supplier) {
    setServiceFornitoreId(s.fornitore_id); setEditingServiceId(s.id);
    setServiceForm({
      categoria:s.categoria, sottocategoria:s.sottocategoria,
      servizio_descritto:s.servizio_descritto??"", dati_trattati:s.dati_trattati??[],
      data_residency:s.data_residency, scc_presente:s.scc_presente,
      referente_interno:s.referente_interno??"",
    });
    setServiceStep(1); setServiceSaveError(null); setShowServiceModal(true);
  }
  function closeServiceModal() {
    setShowServiceModal(false); setEditingServiceId(null);
    setServiceForm(SERVICE_FORM_INIT); setServiceStep(1);
    setServiceSaveError(null); setSuggestCategoria(null);
    setSuggestSelected(new Set());
  }

  async function saveSuggestedServices() {
    if (!serviceFornitoreId || !entityId || !companyId) return;
    setSavingSuggested(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? "";
      const cat = suggestCategoria!;
      const suggestions = SERVICE_SUGGESTIONS[cat] ?? [];
      const toSave = suggestions.filter(s => suggestSelected.has(s.id));
      console.log("suggestCategoria:", cat, "toSave:", toSave.length, "selected:", Array.from(suggestSelected));
      for (const sug of toSave) {
        const lordo = calcRischioLordo(sug.categoria, sug.dati_trattati, []);
        const netto  = calcRischioNetto(lordo, sug.data_residency, false, false, []);
        const { error: insErr } = await supabase.from("suppliers").insert({
          entity_id: entityId,
          company_id: companyId,
          ragione_sociale: currentRegistry?.ragione_sociale ?? "",
          fornitore_id: serviceFornitoreId,
          categoria: sug.categoria,
          sottocategoria: sug.sottocategoria,
          servizio_descritto: sug.descrizione,
          dati_trattati: sug.dati_trattati,
          data_residency: sug.data_residency,
          scc_presente: false,
          rischio_lordo: getRiskTokens(lordo).band,
          rischio_netto: getRiskTokens(netto).band,
          created_by: uid,
        });
        if (insErr) console.error("Insert error:", insErr);
      }
      const fornId = serviceFornitoreId;
      closeServiceModal();
      await loadData();
      if (fornId) {
        await loadServices(fornId);
        setExpandedId(fornId);
      }
    } finally {
      setSavingSuggested(false);
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm("Eliminare questo servizio?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", serviceId);
    if (!error) {
      if (expandedId) await loadServices(expandedId);
      if (companyId) await reloadAggregates(companyId);
    }
  }

  async function handleDeleteRegistry(registryId: string) {
    if (!confirm("Eliminare questo fornitore e tutti i suoi servizi?")) return;
    await supabase.from("suppliers").delete().eq("fornitore_id", registryId);
    const { error } = await supabase.from("supplier_registry").delete().eq("id", registryId);
    if (!error) {
      if (expandedId === registryId) setExpandedId(null);
      const { data } = await supabase.from("supplier_registry").select("*").eq("company_id", companyId).order("ragione_sociale");
      if (data) setRegistries(data as SupplierRegistry[]);
      if (companyId) await reloadAggregates(companyId);
    }
  }

  async function handleServiceSave() {
    if (!serviceForm.data_residency) { setServiceSaveError("Seleziona la localizzazione dei dati del fornitore"); return; }
    setSavingService(true); setServiceSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const reg   = registries.find(r => r.id === serviceFornitoreId);
      const lordo = calcRischioLordo(serviceForm.categoria as Categoria, serviceForm.dati_trattati, reg?.certificazioni??[]);
      const netto = calcRischioNetto(lordo, serviceForm.data_residency as DataResidency, serviceForm.scc_presente, reg?.dpa_firmato??false, reg?.certificazioni??[]);
      const payload = {
        entity_id:          entityId,
        company_id:         companyId,
        fornitore_id:       reg?.id ?? serviceFornitoreId,
        ragione_sociale:    reg?.ragione_sociale ?? "",
        created_by:         user.id,
        categoria:          serviceForm.categoria,
        sottocategoria:     serviceForm.sottocategoria,
        servizio_descritto: serviceForm.servizio_descritto || null,
        dati_trattati:      serviceForm.dati_trattati,
        data_residency:     serviceForm.data_residency,
        scc_presente:       serviceForm.scc_presente,
        referente_interno:  serviceForm.referente_interno || null,
        rischio_lordo:      getRiskTokens(lordo).band,
        rischio_netto:      getRiskTokens(netto).band,
      };
      let err;
      if (editingServiceId) {
        ({ error: err } = await supabase.from("suppliers").update(payload).eq("id", editingServiceId));
      } else {
        ({ error: err } = await supabase.from("suppliers").insert(payload));
      }
      if (err) { setServiceSaveError(err.message); return; }
      await loadServices(serviceFornitoreId!);
      if (companyId) await reloadAggregates(companyId);
      closeServiceModal();
    } finally { setSavingService(false); }
  }

  async function openMailModal(r: SupplierRegistry) {
    let services = servicesMap[r.id];
    if (!services) services = await loadServices(r.id);
    const criticita: string[] = [];
    if (!r.dpa_firmato) criticita.push("• DPA (Data Processing Agreement) non firmato");
    if (!(r.certificazioni??[]).includes("ISO 27001") && !(r.certificazioni??[]).includes("SOC2"))
      criticita.push("• Assenza di certificazioni di sicurezza (ISO 27001 / SOC2)");
    if (services.some(s => s.data_residency === "EXTRA_EU" && !s.scc_presente))
      criticita.push("• Trasferimento dati Extra-UE senza Standard Contractual Clauses");
    const servicesList = services.map(s =>
      `  - ${SUBCAT_LABELS[s.sottocategoria]??s.sottocategoria} (${CAT_LABELS[s.categoria]??s.categoria}) — Rischio: ${s.rischio_netto}`
    ).join("\n");
    setMailSubject(`Richiesta compliance e documentazione — ${r.ragione_sociale}`);
    setMailBody(
      `Gentile ${r.ragione_sociale},\n\nIn conformità agli obblighi previsti dall'Art. 21 della Direttiva NIS2 (UE 2022/2555) e all'Art. 28 del Regolamento GDPR (UE 2016/679), vi chiediamo di dare pronto riscontro in merito ai seguenti punti.\n\nSERVIZI OGGETTO DELLA VERIFICA:\n${servicesList||"  (nessun servizio registrato)"}\n\nPUNTI DI ATTENZIONE:\n${criticita.length?criticita.join("\n"):"  Nessuna criticità rilevata."}\n\nVi chiediamo di fornire la documentazione richiesta entro 30 giorni dal ricevimento della presente.\n\nDistinti saluti`
    );
    setMailCopied(false);
    setMailFornitore(r);
  }

  async function openDpaModal(r: SupplierRegistry) {
    let services = servicesMap[r.id];
    if (!services) services = await loadServices(r.id);
    setDpaFornitore(r);
    setDpaServices(services);
    setDpaDecorrenza(new Date().toISOString().split("T")[0]);
    setDpaAddress("");
    setDpaPiva(r.piva ?? "");
    setDpaEmail(r.email_fornitore ?? "");
    setDpaCopied(false);
  }

  async function handleMailSend() {
    if (!mailFornitore || !entityId || !companyId) return;
    await supabase.from("supplier_communications").insert({
      entity_id:entityId, company_id:companyId, fornitore_id:mailFornitore.id,
      tipo:"EMAIL", oggetto:mailSubject, corpo:mailBody, sent_at:new Date().toISOString(),
    });
    await supabase.from("supplier_registry").update({ data_ultimo_contatto:new Date().toISOString() }).eq("id", mailFornitore.id);
    setRegistries(prev => prev.map(r => r.id===mailFornitore.id ? {...r, data_ultimo_contatto:new Date().toISOString()} : r));
    window.location.href = `mailto:${mailFornitore.email_fornitore??""}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
    setMailFornitore(null);
  }

  function advanceExternalQueue(queue: string[], current: string) {
    const idx  = queue.indexOf(current);
    const next = queue[idx + 1];
    if (next) {
      setCurrentExternal(next);
      setExternalForm({ ragione_sociale:next, piva:"", email:"", categoria:"SERVIZI_ESTERNI", stato_relazione:"ATTIVO" });
      setExternalSaveError(null);
    } else {
      setShowExternalModal(false);
      setCurrentExternal(null);
      setExternalQueue([]);
      loadData();
    }
  }

  async function handleSaveExternal(queue: string[], current: string) {
    if (!companyId) return;
    setSavingExternal(true); setExternalSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("supplier_registry").insert({
        company_id:          companyId,
        created_by:          user.id,
        ragione_sociale:     externalForm.ragione_sociale.trim(),
        piva:                externalForm.piva.trim() || null,
        email_fornitore:     externalForm.email.trim() || null,
        referente_fornitore: null,
        dpa_firmato:         false,
        dpa_scadenza:        null,
        certificazioni:      [] as string[],
        stato_relazione:     externalForm.stato_relazione,
        note:                null,
      });
      if (error) { setExternalSaveError(error.message); return; }
      advanceExternalQueue(queue, current);
    } finally { setSavingExternal(false); }
  }

  const handleDocUpload = async (file: File, tipo: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAnalyzingType(tipo as any);
    setAnalyzeProgress(0);
    progressIntervalRef.current = setInterval(() => {
      setAnalyzeProgress(prev => {
        if (prev >= 90) {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          return 90;
        }
        return prev + Math.random() * 8;
      });
    }, 800);
    try {
      // 1. Upload su Storage
      const ext  = file.name.split(".").pop() ?? "bin";
      const path = `${entityId}/${tipo}_${Date.now()}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("supplier-docs")
        .upload(path, file, { upsert: true });

      if (storageErr) throw new Error("Upload fallito: " + storageErr.message);

      // 2. Chiama analisi AI
      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: path, documentType: tipo }),
      });

      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      // 3. Apri modal approvazione
      const rows = data.data.trattamenti ?? data.data.fornitori ?? [];
      setImportRows(rows);
      setImportSelected(rows.map(() => true));
      setImportType(tipo);

      // Estrai meta e triage hints (solo per trattamenti)
      let resolvedMeta: Record<string,unknown> | null = null;
      let resolvedHints: Record<string,boolean> | null = null;
      if (tipo === "REGISTRO_TRATTAMENTI") {
        if (data.data.meta) {
          resolvedMeta = data.data.meta as Record<string,unknown>;
          setImportMeta(resolvedMeta);
        }
        const agg: Record<string,boolean> = {};
        (data.data.trattamenti as Record<string,unknown>[] ?? []).forEach((r: Record<string,unknown>) => {
          const h = r.triage_hints as Record<string,boolean> | undefined;
          if (h) Object.entries(h).forEach(([k,v]) => { if (v) agg[k] = true; });
        });
        if (Object.keys(agg).length > 0) { resolvedHints = agg; setTriageHints(agg); }
      }

      // Salva ultima analisi in localStorage
      try {
        const analysisData = {
          rows, type: tipo, meta: resolvedMeta, hints: resolvedHints,
          timestamp: new Date().toISOString(), fileName: file.name,
        };
        localStorage.setItem("clavis_last_analysis", JSON.stringify(analysisData));
        setLastAnalysis(analysisData);
      } catch {}

      setShowImportModal(true);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setDocError("✗ " + msg);
      setTimeout(() => setDocError(null), 8000);
    } finally {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setAnalyzeProgress(100);
      setTimeout(() => setAnalyzeProgress(0), 500);
      setAnalyzingType(null);
    }
  };

  function updateImportRow(idx: number, field: string, value: unknown) {
    setImportRows(prev =>
      prev.map((row, i) =>
        i === idx ? { ...(row as Record<string, unknown>), [field]: value } : row
      )
    );
  }

  async function handleImportConfirm() {
    if (!companyId) return;
    setSavingImport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      type AnyRow = Record<string, unknown>;
      const selectedRows = importRows.filter((_, i) => importSelected[i]) as AnyRow[];

      if (importType === "REGISTRO_TRATTAMENTI") {
        const inserts = selectedRows.map(row => ({
          company_id:             companyId,
          trattamento:            row.trattamento as string,
          finalita:               row.finalita as string,
          base_giuridica:         (row.base_giuridica as string) || "da definire",
          categorie_dati:         (row.categorie_dati as string[]) ?? [],
          categorie_interessati:  (row.categorie_interessati as string[]) ?? [],
          misure_sicurezza:       (row.misure_sicurezza as string) || null,
          importato_da_documento: true,
          approvato_da:           user.id,
          approvato_at:           new Date().toISOString(),
          created_by:             user.id,
        }));
        console.log("Insert payload processing_registry:", inserts);
        const { error } = await supabase.from("processing_registry").upsert(inserts, {
          onConflict: "company_id,trattamento",
          ignoreDuplicates: false,
        });
        console.log("Insert error:", error);
        if (error) { setDocError(error.message); setTimeout(() => setDocError(null), 8000); return; }
        const allExternal = selectedRows
          .flatMap(row => (row.responsabili_esterni as string[]) ?? [])
          .filter(Boolean);
        const uniqueExternal = [...new Set(allExternal)];
        setShowImportModal(false);
        setImportMeta(null); setTriageHints(null);
        const n = selectedRows.length;
        setImportSuccessMsg(`${n} trattament${n===1?"o":"i"} importat${n===1?"o":"i"} con successo`);
        setTimeout(() => setImportSuccessMsg(null), 8000);
        if (uniqueExternal.length > 0) {
          const ne = uniqueExternal.length;
          setExternalList(uniqueExternal);
          setExternalBanner(`Trovati ${ne} responsabil${ne===1?"e":"i"} extern${ne===1?"o":"i"}. Vuoi crearli come fornitori?`);
        }
      } else {
        const inserts = selectedRows.map(row => ({
          company_id:          companyId,
          created_by:          user.id,
          ragione_sociale:     row.ragione_sociale as string,
          piva:                (row.piva as string) || null,
          email_fornitore:     null,
          referente_fornitore: null,
          dpa_firmato:         Boolean(row.dpa_firmato),
          dpa_scadenza:        null,
          certificazioni:      [] as string[],
          stato_relazione:     "ATTIVO" as Stato,
          note:                (row.note as string) || null,
        }));
        const { error } = await supabase.from("supplier_registry").insert(inserts);
        if (error) { setDocError(error.message); setTimeout(() => setDocError(null), 8000); return; }
        setShowImportModal(false);
        setImportMeta(null); setTriageHints(null);
        const n = selectedRows.length;
        setImportSuccessMsg(`${n} fornitor${n===1?"e":"i"} importat${n===1?"o":"i"} con successo`);
        setTimeout(() => setImportSuccessMsg(null), 8000);
        await loadData();
      }
    } finally { setSavingImport(false); }
  }

  const totalCount    = registries.length;
  const criticalCount = registries.filter(r => aggregates[r.id]?.rischioMax === "CRITICO").length;
  const dpaMissing    = registries.filter(r => !r.dpa_firmato).length;
  const today         = new Date().toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" });

  if (loading) return (
    <div className="clavis-bg min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color:"var(--bone-dim)" }}>CLAVIS</p>
        <p className="text-sm" style={{ color:"var(--bone-dim)" }}>Caricamento...</p>
      </div>
    </div>
  );

  return (
    <AppShell
      profile={profile}
      activeRoute="/fornitori"
    >
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-hidden p-4 gap-4">

          {/* CARD UPLOAD */}
          <div className="flex-shrink-0 border p-4 flex items-center justify-between gap-6 flex-wrap"
            style={{ backgroundColor:"var(--ink2)", borderColor:"var(--line2)", borderRadius:"6px" }}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded flex items-center justify-center" style={{ backgroundColor:T.bronzeBg }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.bronze} strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color:"var(--bone)" }}>Come costruire il Registro Fornitori Digitali</p>
                <div className="mt-1.5 flex flex-col gap-1">
                  <p className="text-xs" style={{ color:"var(--bone-dim)" }}>
                    <span style={{ color:T.bronze, fontWeight:700 }}>1. Aggiungi i fornitori</span>
                    {" "}— usa "+ Aggiungi Fornitore" oppure carica un registro fornitori esistente (Excel o PDF con ragione sociale e P.IVA).
                  </p>
                  <p className="text-xs" style={{ color:"var(--bone-dim)" }}>
                    <span style={{ color:T.bronze, fontWeight:700 }}>2. Aggiungi i servizi</span>
                    {" "}— per ogni fornitore clicca "+ Servizi": indica cosa fa, che dati tratta e dove li conserva.
                  </p>
                  <p className="text-xs" style={{ color:"var(--bone-dim)" }}>
                    <span style={{ color:T.bronze, fontWeight:700 }}>3. Verifica il DPA</span>
                    {" "}— ogni fornitore che tratta dati per tuo conto deve avere un DPA firmato (Art. 28 GDPR).
                  </p>
                  <p className="text-xs mt-0.5" style={{ color:"rgba(154,163,189,.5)", fontStyle:"italic" }}>
                    "Carica Registro Trattamenti Art. 30" è utile solo se hai già un registro GDPR strutturato — non per il manuale privacy generale.
                  </p>
                </div>
                {analyzingType && <p className="text-xs mt-1.5 font-semibold" style={{ color:T.bronze }}>⏳ Analisi AI in corso — attendere...</p>}
                {!analyzingType && importSuccessMsg && <p className="text-xs mt-1.5 font-semibold" style={{ color:T.low }}>✓ {importSuccessMsg}</p>}
                {docError && <p className="text-xs mt-1.5 font-semibold" style={{ color:T.critical }}>✗ {docError}</p>}
                {externalBanner && (
                  <div className="mt-2 flex items-start justify-between gap-2 px-3 py-2 rounded text-xs font-semibold"
                    style={{ backgroundColor:T.highBg, color:T.high, border:`1px solid ${T.high}40` }}>
                    <span>🔗 {externalBanner}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          const list = externalList;
                          setExternalQueue(list);
                          setCurrentExternal(list[0] ?? null);
                          setExternalForm({ ragione_sociale:list[0]??"", piva:"", email:"", categoria:"SERVIZI_ESTERNI", stato_relazione:"ATTIVO" });
                          setExternalSaveError(null);
                          setShowExternalModal(true);
                          setExternalBanner(null);
                        }}
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ backgroundColor:T.high, color:"white" }}>
                        Crea fornitori
                      </button>
                      <button
                        onClick={() => setExternalBanner(null)}
                        className="px-2 py-1 rounded text-xs font-semibold"
                        style={{ border:`1px solid ${T.high}80`, color:T.high }}>
                        Ignora
                      </button>
                      <button onClick={() => setExternalBanner(null)} style={{ color:T.high, opacity:0.6 }}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <input ref={fileRef1} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx,.csv" className="hidden"
                  onChange={e => { const f=e.target.files?.[0]; if(f) handleDocUpload(f,"REGISTRO_FORNITORI"); e.target.value=""; }} />
                <input ref={fileRef2} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx,.csv" className="hidden"
                  onChange={e => { const f=e.target.files?.[0]; if(f) handleDocUpload(f,"REGISTRO_TRATTAMENTI"); e.target.value=""; }} />
                {(["REGISTRO_FORNITORI","REGISTRO_TRATTAMENTI"] as const).map((tipo, idx) => {
                  const isConforme = tipo === "REGISTRO_FORNITORI"
                    ? complianceRegFornitori === "CONFORME"
                    : complianceRegTrattamenti === "CONFORME";
                  const conformeData = tipo === "REGISTRO_FORNITORI"
                    ? complianceRegFornData
                    : complianceRegTrattData;
                  return (
                  <div key={tipo}>
                    <button onClick={() => [fileRef1,fileRef2][idx].current?.click()} disabled={!!uploadingType || !!analyzingType}
                      className="text-xs px-3 py-2 font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
                      style={{ border: isConforme ? `1px solid ${T.low}60` : "1px solid var(--line2)", color: isConforme ? T.low : "var(--bone-dim)", borderRadius:"4px", backgroundColor:"var(--ink3)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {uploadingType===tipo ? "Caricamento..." : analyzingType===tipo ? "Analisi AI..." : tipo==="REGISTRO_FORNITORI" ? "Carica Registro Fornitori esistente" : "Carica Registro Trattamenti Art. 30"}
                      {isConforme && <span className="font-bold" style={{ color: T.low }}>✓{conformeData ? ` · ${new Date(conformeData).toLocaleDateString("it-IT")}` : ""}</span>}
                    </button>
                    {analyzingType === tipo && (
                      <div style={{marginTop:"8px"}}>
                        <div style={{display:"flex", justifyContent:"space-between", fontSize:"12px", color:"var(--bone-dim)", marginBottom:"4px"}}>
                          <span>Analisi AI in corso...</span>
                          <span>{Math.round(analyzeProgress)}%</span>
                        </div>
                        <div style={{height:"4px", background:"var(--ink3)", borderRadius:"2px", overflow:"hidden"}}>
                          <div style={{
                            height:"100%",
                            width:`${analyzeProgress}%`,
                            background:"linear-gradient(90deg, var(--shield), var(--emerald))",
                            borderRadius:"2px",
                            transition:"width 0.5s ease",
                          }}/>
                        </div>
                      </div>
                    )}
                  </div>
                ); })}
              </div>
              <p className="text-xs" style={{ color:"var(--bone-dim)", opacity:0.6 }}>
                I dati estratti verranno mostrati per approvazione riga per riga prima dell&apos;importazione.
              </p>
              {lastAnalysis && (
                <div className="flex items-center justify-between gap-3 mt-1 px-3 py-2 rounded text-xs w-full"
                  style={{ backgroundColor:T.bronzeBg, border:`1px solid ${T.bronze}30` }}>
                  <span style={{ color:T.bronze }}>
                    📋 Ultima analisi: <strong>{lastAnalysis.fileName}</strong> · {new Date(lastAnalysis.timestamp).toLocaleDateString("it-IT")}
                  </span>
                  <button
                    onClick={() => {
                      setImportRows(lastAnalysis.rows ?? []);
                      setImportSelected((lastAnalysis.rows as unknown[] ?? []).map(() => true));
                      setImportType(lastAnalysis.type ?? "");
                      if (lastAnalysis.meta)  setImportMeta(lastAnalysis.meta);
                      if (lastAnalysis.hints) setTriageHints(lastAnalysis.hints);
                      setShowImportModal(true);
                    }}
                    className="font-bold flex-shrink-0"
                    style={{ color:T.bronze }}>
                    Riapri risultati →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* HEADER */}
          <div className="flex items-start justify-between flex-shrink-0 gap-4 flex-wrap">
            <div>
              <h1 className="flex flex-col gap-0.5">
                <span style={{ fontFamily:"Syne, system-ui", fontWeight:800, fontSize:"20px", letterSpacing:"0.06em", textTransform:"uppercase", color:"var(--bone)" }}>
                  Registro Fornitori Digitali
                </span>
                <span className="font-mono text-xs" style={{ color:"var(--bone-dim)" }}>(Digital Supplier Registry)</span>
              </h1>
              <p className="text-xs mt-1" style={{ color:"var(--bone-dim)" }}>Art. 21 NIS2 · Art. 28 GDPR — aggiornato al {today}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1 rounded" style={{ backgroundColor:"var(--ink3)", color:"var(--bone-dim)" }}>
                  {totalCount} {totalCount===1?"fornitore":"fornitori"}
                </span>
                {criticalCount>0 && (
                  <span className="text-xs font-bold px-3 py-1 rounded flex items-center gap-1.5" style={{ backgroundColor:T.critBg, color:T.critical }}>
                    <span className="clavis-pulse"/>{criticalCount} {criticalCount===1?"critico":"critici"}
                  </span>
                )}
                {dpaMissing>0 && (
                  <span className="text-xs font-bold px-3 py-1 rounded flex items-center gap-1.5" style={{ backgroundColor:T.highBg, color:T.high }}>
                    <span className="clavis-pulse-amber"/>{dpaMissing} DPA mancanti
                  </span>
                )}
              </div>
              <button onClick={openAddRegistry}
                className="text-xs px-4 py-2 font-bold tracking-widest uppercase hover:opacity-80 transition-opacity"
                style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                + Aggiungi Fornitore
              </button>
            </div>
          </div>

          {/* TABELLA ANAGRAFICA */}
          <div className="flex-1 overflow-auto border"
            style={{ backgroundColor:"var(--ink2)", borderColor:"var(--line2)", borderRadius:"4px" }}>
            <table className="w-full text-sm" style={{ minWidth:"960px" }}>
              <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                <tr style={{ backgroundColor:"var(--ink3)", borderBottom:"1px solid var(--line2)" }}>
                  {["","Fornitore","P.IVA","DPA","Certificazioni","Stato","Servizi","Rischio Max","Azioni"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold"
                      style={{ color:"var(--bone-dim)", fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registries.length===0 ? (
                  <tr><td colSpan={9} className="px-4 py-14 text-center">
                    <p className="text-sm font-medium" style={{ color:"var(--bone-dim)" }}>Nessun fornitore registrato.</p>
                    <p className="text-xs mt-1.5" style={{ color:"var(--bone-dim)" }}>Aggiungi il primo fornitore per avviare la valutazione del rischio supply chain (Art. 21 NIS2).</p>
                  </td></tr>
                ) : registries.map((r, i) => {
                  const agg        = aggregates[r.id];
                  const isExpanded = expandedId===r.id;
                  const services   = servicesMap[r.id]??[];
                  const loadingSvc = loadingServices[r.id];
                  const certShow   = (r.certificazioni??[]).filter(c => c!=="Nessuna"&&c!=="Non noto");
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{
                        borderTop: isExpanded ? "2px solid var(--shield-soft)" : undefined,
                        borderBottom: isExpanded ? "none" : "1px solid var(--line)",
                        backgroundColor: i%2===0 ? "var(--ink2)" : "var(--ink3)",
                        transition: "background-color 0.15s",
                      }}>
                        <td className="px-3 py-3" style={{ width:"32px", borderLeft: isExpanded ? "2px solid var(--shield-soft)" : undefined, borderTopLeftRadius: isExpanded ? "8px" : undefined }}>
                          <button onClick={() => toggleAccordion(r.id)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                            style={{ color:"var(--bone-dim)" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                              style={{ transform:isExpanded?"rotate(90deg)":"none", transition:"transform 0.15s" }}>
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <p style={{ color:"var(--bone)", fontSize:"15px", fontWeight:"600" }}>{r.ragione_sociale}</p>
                          {r.referente_fornitore && <p className="text-xs mt-0.5" style={{ color:"var(--bone-dim)" }}>{r.referente_fornitore}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono" style={{ color:"var(--bone-dim)", fontSize:"13px" }}>{r.piva||"—"}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.dpa_firmato
                            ? <span className="font-bold text-base" style={{ color:T.low }}     title="DPA firmato">✓</span>
                            : <span className="font-bold text-base" style={{ color:T.critical }} title="DPA mancante">✗</span>}
                        </td>
                        <td className="px-4 py-3">
                          {certShow.length>0
                            ? <div className="flex flex-wrap gap-1">{certShow.map(c => (
                                <span key={c} className="text-xs px-1.5 py-0.5 rounded font-mono"
                                  style={{ backgroundColor:T.lowBg, color:T.low, fontSize:"13px" }}>{c}</span>
                              ))}</div>
                            : <span className="text-xs" style={{ color:"var(--bone-dim)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3"><StatoBadge stato={r.stato_relazione}/></td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:"var(--ink3)", color:"var(--bone-dim)" }}>
                            {agg?.count??0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {agg?.rischioMax
                            ? (() => { const t=getRiskBadgeFromEnum(agg.rischioMax!); return (
                                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:t.bg, color:t.color, fontSize:"13px" }}>{t.label}</span>
                              ); })()
                            : <span className="text-xs" style={{ color:"var(--bone-dim)" }}>—</span>}
                        </td>
                        <td className="px-4 py-3" style={{ borderRight: isExpanded ? "2px solid var(--shield-soft)" : undefined, borderTopRightRadius: isExpanded ? "8px" : undefined }}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditRegistry(r)} title="Modifica fornitore" className="hover:opacity-60 transition-opacity">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--bone-dim)" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button onClick={() => openMailModal(r)} title="Invia richiesta compliance" className="hover:opacity-60 transition-opacity">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--bone-dim)" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                              </svg>
                            </button>
                            <button onClick={() => openDpaModal(r)} title="Genera DPA" className="hover:opacity-60 transition-opacity">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--bone-dim)" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
                                <polyline points="9 9 9 9"/>
                              </svg>
                            </button>
                            {isExpanded && (
                              <button
                                onClick={() => openAddService(r.id)}
                                title="Aggiungi servizio"
                                style={{ background:"none", border:"none", color:"var(--shield-soft)", cursor:"pointer", padding:"4px 8px" }}
                              >
                                <span style={{ fontSize:"12px", fontWeight:"700", color:"var(--shield-soft)", letterSpacing:".02em" }}>+ SERVIZI</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteRegistry(r.id)}
                              title="Elimina fornitore"
                              style={{ background:"none", border:"none", color:"var(--warn)", cursor:"pointer", fontSize:"16px", padding:"4px 6px" }}
                            >✕</button>
                          </div>
                        </td>
                      </tr>

                      {/* ACCORDION */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding:0, borderLeft:"2px solid var(--shield-soft)", borderRight:"2px solid var(--shield-soft)", borderBottom:"2px solid var(--shield-soft)", borderBottomLeftRadius:"8px", borderBottomRightRadius:"8px", overflow:"hidden" }}>
                            <div style={{ backgroundColor:"var(--ink)", borderTop:"1px solid var(--line2)" }}>
                              {loadingSvc ? (
                                <div className="px-6 py-4 text-center">
                                  <p className="text-xs" style={{ color:"var(--bone-dim)" }}>Caricamento servizi...</p>
                                </div>
                              ) : services.length===0 ? (
                                <div className="px-6 py-5 text-center">
                                  <p className="text-xs" style={{ color:"var(--bone-dim)" }}>Nessun servizio registrato per questo fornitore.</p>
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm" style={{ minWidth:"700px" }}>
                                    <thead>
                                      <tr style={{ backgroundColor:"var(--ink3)" }}>
                                        {["Servizio","Categoria","Dati Trattati","Residency","Rischio Lordo","Rischio Netto","Azioni"].map(h => (
                                          <th key={h} className="px-4 py-2 text-left font-semibold"
                                            style={{ color:"var(--bone-dim)", fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.08em" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {services.map((s, si) => {
                                        const lTok = getRiskBadgeFromEnum(s.rischio_lordo);
                                        const nTok = getRiskBadgeFromEnum(s.rischio_netto);
                                        return (
                                          <tr key={s.id} style={{ borderTop:"1px solid var(--line)", backgroundColor:si%2===0?"var(--ink2)":"var(--ink3)", fontSize:"14px" }}>
                                            <td className="px-4 py-2.5">
                                              <p className="font-semibold" style={{ color:"var(--bone)", fontSize:"14px" }}>{SUBCAT_LABELS[s.sottocategoria]??s.sottocategoria}</p>
                                              {s.servizio_descritto && <p className="text-xs mt-0.5 truncate max-w-[200px]" style={{ color:"var(--bone-dim)" }}>{s.servizio_descritto}</p>}
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <span className="px-2 py-0.5 rounded" style={{ backgroundColor:"var(--ink3)", color:"var(--bone-dim)", fontSize:"13px" }}>
                                                {CAT_LABELS[s.categoria]??s.categoria}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <div className="flex flex-wrap gap-1">
                                                {(s.dati_trattati??[]).length>0
                                                  ? (s.dati_trattati).map(d => (
                                                      <span key={d} className="text-xs px-1.5 py-0.5 rounded font-mono"
                                                        style={{ backgroundColor:d==="SANITARI"?T.critBg:"var(--ink3)", color:d==="SANITARI"?T.critical:"var(--bone-dim)", fontSize:"12px" }}>{d}</span>
                                                    ))
                                                  : <span style={{ color:"var(--bone-dim)", fontSize:"13px" }}>—</span>}
                                              </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <span className="text-xs font-mono font-semibold" style={{
                                                color:s.data_residency==="EXTRA_EU"?T.high:s.data_residency==="NON_NOTO"?T.medium:T.low,
                                              }}>{RESIDENCY_LABELS[s.data_residency]??s.data_residency}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:lTok.bg, color:lTok.color, fontSize:"13px" }}>{lTok.label}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor:nTok.bg, color:nTok.color, fontSize:"13px" }}>{nTok.label}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                                                <button onClick={() => openEditService(s)} title="Modifica servizio" style={{ background:"none", border:"none", color:"var(--bone-dim)", cursor:"pointer", fontSize:"16px", padding:"4px" }}>✎</button>
                                                <button onClick={() => handleDeleteService(s.id)} title="Elimina servizio" style={{ background:"none", border:"none", color:"var(--warn)", cursor:"pointer", fontSize:"16px", padding:"4px" }}>✕</button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && (
                        <tr><td colSpan={9} style={{ padding:0, height:"8px" }}></td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

      {/* MODAL ANAGRAFICA */}
      {showRegistryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }}>
          <div className="w-full flex flex-col"
            style={{ maxWidth:"480px", background:"#1E293B", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", maxHeight:"90vh" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              <div>
                <p className="font-bold uppercase tracking-wider text-sm" style={{ color:"#F1F5F9" }}>
                  {editingRegistryId?"Modifica Fornitore":"Aggiungi Fornitore"}
                </p>
                <p className="text-xs mt-0.5" style={{ color:"#64748B" }}>Anagrafica e dati contrattuali</p>
              </div>
              <button onClick={closeRegistryModal} style={{ color:"#64748B" }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={labelStyle}>Ragione Sociale *</label>
                <input type="text" value={registryForm.ragione_sociale}
                  onChange={e => setRegistryForm(f => ({...f, ragione_sociale:e.target.value}))}
                  placeholder="Es. Acme Software S.r.l."
                  className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>P.IVA</label>
                  <input type="text" value={registryForm.piva}
                    onChange={e => setRegistryForm(f => ({...f, piva:e.target.value}))}
                    placeholder="IT12345678901"
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>Email Fornitore</label>
                  <input type="email" value={registryForm.email}
                    onChange={e => setRegistryForm(f => ({...f, email:e.target.value}))}
                    placeholder="info@fornitore.it"
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={labelStyle}>Referente Fornitore</label>
                <input type="text" value={registryForm.referente}
                  onChange={e => setRegistryForm(f => ({...f, referente:e.target.value}))}
                  placeholder="Nome e cognome"
                  className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={labelStyle}>Stato Relazione</label>
                <select value={registryForm.stato}
                  onChange={e => setRegistryForm(f => ({...f, stato:e.target.value as Stato}))}
                  className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="" disabled>Seleziona...</option>
                  <option value="ATTIVO"      style={{ background:"#1E293B" }}>Attivo</option>
                  <option value="IN_VERIFICA" style={{ background:"#1E293B" }}>In Verifica</option>
                  <option value="A_RISCHIO"   style={{ background:"#1E293B" }}>A Rischio</option>
                  <option value="SOSPESO"     style={{ background:"#1E293B" }}>Sospeso</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold" style={labelStyle}>Certificazioni</label>
                <div className="grid grid-cols-2 gap-2">
                  {["ISO 27001","SOC2","Nessuna","Non noto"].map(c => (
                    <label key={c} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={registryForm.certificazioni.includes(c)}
                        onChange={e => setRegistryForm(f => ({
                          ...f, certificazioni:e.target.checked?[...f.certificazioni,c]:f.certificazioni.filter(x=>x!==c),
                        }))} className="accent-orange-600"/>
                      <span className="text-sm" style={{ color:"#CBD5E1" }}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={registryForm.dpa_firmato}
                  onChange={e => setRegistryForm(f => ({...f, dpa_firmato:e.target.checked, dpa_scadenza:e.target.checked?f.dpa_scadenza:""}))}
                  className="accent-orange-600"/>
                <span className="text-sm" style={{ color:"#CBD5E1" }}>
                  DPA firmato <span style={{ color:"#64748B" }}>(Data Processing Agreement)</span>
                </span>
              </label>
              {registryForm.dpa_firmato && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>Scadenza DPA</label>
                  <input type="date" value={registryForm.dpa_scadenza}
                    onChange={e => setRegistryForm(f => ({...f, dpa_scadenza:e.target.value}))}
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={labelStyle}>Note</label>
                <textarea value={registryForm.note}
                  onChange={e => setRegistryForm(f => ({...f, note:e.target.value}))}
                  rows={2} placeholder="Note interne (opzionale)"
                  className="w-full px-3 py-2 text-sm resize-none outline-none" style={inputStyle}/>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              <button onClick={closeRegistryModal} className="text-sm px-4 py-2" style={{ color:"#94A3B8" }}>Annulla</button>
              <div className="flex items-center gap-3">
                {editingRegistryId && (() => {
                  const r = registries.find(x => x.id === editingRegistryId);
                  return r ? (
                    <button onClick={() => { closeRegistryModal(); openDpaModal(r); }}
                      className="text-sm px-4 py-2 font-semibold flex items-center gap-1.5"
                      style={{ border:`1px solid ${T.bronze}`, color:T.bronze, borderRadius:"4px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
                      </svg>
                      Genera DPA
                    </button>
                  ) : null;
                })()}
                <div className="flex flex-col items-end gap-1.5">
                  {registrySaveError && <p className="text-xs font-semibold" style={{ color:T.critical }}>{registrySaveError}</p>}
                  <button onClick={handleRegistrySave} disabled={savingRegistry}
                    className="text-sm px-5 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                    style={{ backgroundColor:T.navy, color:"white", borderRadius:"4px" }}>
                    {savingRegistry?"Salvataggio...":"Salva"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SERVIZIO */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }}>
          <div className="w-full flex flex-col"
            style={{ maxWidth:"520px", background:"#1E293B", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", maxHeight:"90vh" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              <div>
                <p className="font-bold uppercase tracking-wider text-sm" style={{ color:"#F1F5F9" }}>
                  {editingServiceId ? "Modifica Servizio" : serviceStep === 0 ? "Servizi suggeriti" : "Aggiungi Servizio"}
                </p>
                <p className="text-xs mt-0.5" style={{ color:"#64748B" }}>
                  {serviceStep === 0
                    ? "Seleziona i servizi che questo fornitore ti eroga"
                    : `Step ${serviceStep} di 2 — ${serviceStep===1?"Tipo servizio":"Dati e rischio"}`}
                  {currentRegistry && <span style={{ color:T.bronze }}> · {currentRegistry.ragione_sociale}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {serviceStep > 0 && [1,2].map(n => (
                  <div key={n} className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: serviceStep===n ? T.bronze : serviceStep>n ? "rgba(180,83,9,0.35)" : "rgba(255,255,255,0.05)",
                      color: serviceStep>=n ? "white" : "#475569", fontSize:"13px",
                    }}>{serviceStep>n?"✓":n}</div>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* ── STEP 0: SUGGERIMENTI */}
              {serviceStep === 0 && (
                <div className="space-y-4">
                  {/* Se categoria non nota → selezione tipo */}
                  {!suggestCategoria && (
                    <div className="space-y-3">
                      <p className="text-xs" style={{ color:"#94A3B8" }}>
                        Che tipo di fornitore è <strong style={{ color:"#F1F5F9" }}>{currentRegistry?.ragione_sociale}</strong>?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.entries(CAT_LABELS) as [Categoria, string][]).map(([k, v]) => (
                          <button key={k} onClick={() => setSuggestCategoria(k)}
                            className="px-3 py-3 rounded text-xs font-semibold text-left transition-all"
                            style={{ backgroundColor:"rgba(255,255,255,0.04)", border:`1px solid rgba(255,255,255,0.08)`, color:"#CBD5E1" }}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card suggerite */}
                  {suggestCategoria && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:T.bronze }}>
                          {CAT_LABELS[suggestCategoria]} — seleziona i servizi erogati
                        </p>
                        <button onClick={() => setSuggestCategoria(null)} className="text-xs" style={{ color:"#64748B" }}>
                          ← Cambia tipo
                        </button>
                      </div>
                      <div className="space-y-2">
                        {SERVICE_SUGGESTIONS[suggestCategoria].map(sug => {
                          const selected = suggestSelected.has(sug.id);
                          return (
                            <button key={sug.id}
                              onClick={() => setSuggestSelected(prev => {
                                const next = new Set(prev);
                                selected ? next.delete(sug.id) : next.add(sug.id);
                                return next;
                              })}
                              className="w-full px-3 py-3 rounded text-left transition-all"
                              style={{
                                backgroundColor: selected ? "rgba(217,178,90,0.08)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${selected ? "rgba(217,178,90,0.35)" : "rgba(255,255,255,0.07)"}`,
                              }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="text-xs font-semibold" style={{ color: selected ? T.bronze : "#CBD5E1" }}>
                                    {sug.label}
                                  </p>
                                  <p className="text-xs mt-0.5" style={{ color:"#64748B" }}>{sug.descrizione}</p>
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    {sug.dati_trattati.map(d => (
                                      <span key={d} className="text-xs px-1.5 py-0.5 rounded"
                                        style={{ backgroundColor:"rgba(255,255,255,0.06)", color:"#94A3B8", fontSize:"10px" }}>
                                        {d}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                                  style={{ backgroundColor: selected ? T.bronze : "rgba(255,255,255,0.06)", border: `1px solid ${selected ? T.bronze : "rgba(255,255,255,0.12)"}` }}>
                                  {selected && <span style={{ color:"white", fontSize:"11px" }}>✓</span>}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => { setServiceStep(1); setSuggestCategoria(null); }}
                        className="w-full py-2 text-xs font-semibold"
                        style={{ color:"#64748B", border:`1px dashed rgba(255,255,255,0.1)`, borderRadius:"4px" }}>
                        + Aggiungi servizio manualmente
                      </button>
                    </div>
                  )}
                </div>
              )}

              {serviceStep===1 && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>Categoria *</label>
                    <select value={serviceForm.categoria}
                      onChange={e => setServiceForm(f => ({...f, categoria:e.target.value as Categoria, sottocategoria:"", servizio_descritto:""}))}
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                      <option value="" disabled>Seleziona categoria...</option>
                      {(Object.entries(CAT_LABELS) as [Categoria,string][]).map(([k,v]) => (
                        <option key={k} value={k} style={{ background:"#1E293B" }}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {serviceForm.categoria && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold" style={labelStyle}>Sottocategoria *</label>
                      <select value={serviceForm.sottocategoria}
                        onChange={e => setServiceForm(f => ({...f, sottocategoria:e.target.value}))}
                        className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                        <option value="" disabled>Seleziona sottocategoria...</option>
                        {SUBCATEGORIES[serviceForm.categoria].map(k => (
                          <option key={k} value={k} style={{ background:"#1E293B" }}>{SUBCAT_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>Descrizione Servizio</label>
                    <textarea value={serviceForm.servizio_descritto}
                      onChange={e => setServiceForm(f => ({...f, servizio_descritto:e.target.value}))}
                      rows={3} placeholder="Descrivi il servizio fornito..."
                      className="w-full px-3 py-2 text-sm resize-none outline-none" style={inputStyle}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>Referente Interno</label>
                    <input type="text" value={serviceForm.referente_interno}
                      onChange={e => setServiceForm(f => ({...f, referente_interno:e.target.value}))}
                      placeholder="Nome e cognome"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                </>
              )}
              {serviceStep===2 && (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold" style={labelStyle}>Dati Trattati</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["SANITARI","PERSONALI","AMMINISTRATIVI","NESSUNO"].map(d => (
                        <label key={d} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={serviceForm.dati_trattati.includes(d)}
                            onChange={e => {
                              if (d==="NESSUNO") {
                                setServiceForm(f => ({...f, dati_trattati:e.target.checked?["NESSUNO"]:[]}));
                              } else {
                                setServiceForm(f => ({
                                  ...f,
                                  dati_trattati:e.target.checked
                                    ? [...f.dati_trattati.filter(x=>x!=="NESSUNO"),d]
                                    : f.dati_trattati.filter(x=>x!==d),
                                }));
                              }
                            }} className="accent-orange-600"/>
                          <span className="text-sm" style={{ color:"#CBD5E1" }}>{d}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>Data Residency *</label>
                    <select value={serviceForm.data_residency}
                      onChange={e => setServiceForm(f => ({...f, data_residency:e.target.value as DataResidency, scc_presente:false}))}
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                      <option value="" disabled>Seleziona...</option>
                      <option value="EU"       style={{ background:"#1E293B" }}>Unione Europea</option>
                      <option value="EXTRA_EU" style={{ background:"#1E293B" }}>Extra-UE</option>
                      <option value="NON_NOTO" style={{ background:"#1E293B" }}>Non noto</option>
                    </select>
                  </div>
                  {serviceForm.data_residency==="EXTRA_EU" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={serviceForm.scc_presente}
                        onChange={e => setServiceForm(f => ({...f, scc_presente:e.target.checked}))}
                        className="accent-orange-600"/>
                      <span className="text-sm" style={{ color:"#CBD5E1" }}>
                        SCC presente <span style={{ color:"#64748B" }}>(Standard Contractual Clauses)</span>
                      </span>
                    </label>
                  )}
                  {serviceForm.categoria && (
                    <div className="p-4 space-y-3"
                      style={{ border:"1px solid rgba(255,255,255,0.08)", borderRadius:"6px", background:"rgba(255,255,255,0.03)" }}>
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color:"#94A3B8" }}>
                        Anteprima Rischio (tempo reale)
                      </p>
                      <div className="flex items-center gap-6">
                        <div>
                          <p className="text-xs mb-1" style={{ color:"#64748B" }}>Rischio Lordo</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-mono font-black" style={{ color:getRiskTokens(previewLordo).color }}>{previewLordo}</span>
                            <RiskBadge score={previewLordo}/>
                          </div>
                        </div>
                        <span style={{ color:"#475569", fontSize:"20px" }}>→</span>
                        <div>
                          <p className="text-xs mb-1" style={{ color:"#64748B" }}>Rischio Netto</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-mono font-black" style={{ color:getRiskTokens(previewNetto).color }}>{previewNetto}</span>
                            <RiskBadge score={previewNetto}/>
                          </div>
                        </div>
                      </div>
                      {currentRegistry && (
                        <p className="text-xs" style={{ color:"#64748B" }}>
                          Calcolo include DPA {currentRegistry.dpa_firmato?"✓":"✗"} e
                          cert. {(currentRegistry.certificazioni??[]).join(", ")||"nessuna"} dall&apos;anagrafica.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              {serviceStep === 0 ? (
                <>
                  <button onClick={closeServiceModal} className="text-sm px-4 py-2" style={{ color:"#94A3B8" }}>Annulla</button>
                  <button
                    onClick={saveSuggestedServices}
                    disabled={savingSuggested || suggestSelected.size === 0}
                    className="text-sm px-5 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                    style={{ backgroundColor: T.bronze, color:"white", borderRadius:"4px" }}>
                    {savingSuggested ? "Salvataggio..." : `Aggiungi ${suggestSelected.size > 0 ? suggestSelected.size : ""} ${suggestSelected.size === 1 ? "servizio" : "servizi"} →`}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={serviceStep===1 ? closeServiceModal : ()=>setServiceStep(1)}
                    className="text-sm px-4 py-2" style={{ color:"#94A3B8" }}>
                    {serviceStep===1 ? "Annulla" : "← Indietro"}
                  </button>
                  {serviceStep===1 ? (
                    <button onClick={() => setServiceStep(2)}
                      disabled={!serviceForm.categoria||!serviceForm.sottocategoria}
                      className="text-sm px-5 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                      style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                      Avanti →
                    </button>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      {serviceSaveError && <p className="text-xs font-semibold" style={{ color:T.critical }}>{serviceSaveError}</p>}
                      <button onClick={handleServiceSave} disabled={savingService}
                        className="text-sm px-5 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                        style={{ backgroundColor:T.navy, color:"white", borderRadius:"4px" }}>
                        {savingService?"Salvataggio...":"Salva"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DPA MODAL */}
      {dpaFornitore && (() => {
        const r = dpaFornitore;
        const hasExtraEu = dpaServices.some(s => s.data_residency === "EXTRA_EU");
        const hasNoScc   = dpaServices.some(s => s.data_residency === "EXTRA_EU" && !s.scc_presente);
        const hasCertISO = (r.certificazioni ?? []).includes("ISO 27001");
        const titolare   = company?.name ?? "—";
        const titPiva    = company?.vat_number ?? "—";
        const titAddr    = company?.legal_address ?? "—";
        const decorrenzaFmt = dpaDecorrenza
          ? new Date(dpaDecorrenza).toLocaleDateString("it-IT", { day:"2-digit", month:"long", year:"numeric" })
          : "___________";
        const serviceLines = dpaServices.map(s =>
          `${SUBCAT_LABELS[s.sottocategoria] ?? s.sottocategoria} (${CAT_LABELS[s.categoria] ?? s.categoria})${s.data_residency === "EXTRA_EU" ? " — ⚠ Extra-UE" : ""}`
        ).join("\n");

        const docText =
`DATA PROCESSING AGREEMENT
Art. 28 GDPR · Art. 21 NIS2 · AI Act

TITOLARE: ${titolare} — P.IVA ${titPiva}
RESPONSABILE: ${r.ragione_sociale} — P.IVA ${dpaPiva || "—"}

SERVIZI OGGETTO DEL TRATTAMENTO:
${serviceLines || "Nessun servizio registrato"}

Art. 1 — OGGETTO
Il presente Accordo disciplina il trattamento dei dati personali effettuato dal Responsabile per conto del Titolare ai sensi dell'art. 28 GDPR UE 2016/679.

Art. 2 — OBBLIGHI DEL RESPONSABILE
Il Responsabile si impegna a trattare i dati solo su istruzione documentata del Titolare, garantire riservatezza, adottare misure ex art. 32 GDPR e assistere il Titolare nelle richieste degli interessati.${hasCertISO ? "\nCertificazione ISO 27001 dichiarata dal Responsabile." : ""}

Art. 3 — ISTRUZIONI DEL TITOLARE
Il Responsabile tratta i dati esclusivamente secondo le istruzioni del Titolare, anche per trasferimenti verso paesi terzi.

Art. 4 — SUB-RESPONSABILI
Il Responsabile non ricorre ad altri responsabili senza previa autorizzazione scritta del Titolare.
${hasExtraEu ? `\nArt. 5 — TRASFERIMENTO EXTRA-UE
I dati sono trattati fuori dallo SEE. Il trasferimento è subordinato alle SCC approvate ex art. 46(2)(c) GDPR.${hasNoScc ? "\n⚠ ATTENZIONE: uno o più servizi risultano privi di SCC. Il Titolare deve sanare l'irregolarità prima della firma." : ""}` : ""}

Art. 6 — SISTEMI DI INTELLIGENZA ARTIFICIALE (AI Act Reg. UE 2024/1689)
I sistemi di IA ad alto rischio (Allegato III AI Act) devono essere conformi prima della messa in servizio. Il Responsabile si impegna a fornire documentazione di conformità su richiesta.

Art. 7 — MISURE DI SICUREZZA (NIS2 Art. 21 Dir. UE 2022/2555)
Il Responsabile adotta misure di sicurezza appropriate incluse: politiche di sicurezza, gestione incidenti, continuità operativa, sicurezza della supply chain.

Art. 8 — NOTIFICA VIOLAZIONI
Il Responsabile notifica qualsiasi data breach entro 72 ore dalla scoperta ai sensi dell'art. 33 GDPR.

Art. 9 — DURATA E CANCELLAZIONE
Il presente Accordo decorre dal ${decorrenzaFmt} e rimane valido per la durata del contratto di fornitura. Al termine, il Responsabile cancella o restituisce tutti i dati.

Luogo e data: _______________
${titolare} (Titolare)          ${r.ragione_sociale} (Responsabile)
_______________________          _______________________`;

        const handlePrint = () => {
          const docContent = document.getElementById("dpa-document-content")?.innerHTML;
          if (!docContent) return;
          const win = window.open("", "_blank");
          if (!win) return;
          win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>DPA — ${r.ragione_sociale}</title>
  <style>
    body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; margin: 2cm; color: #000; }
    h1 { font-size: 14pt; text-align: center; margin-bottom: 4px; }
    h2 { font-size: 11pt; margin-top: 20px; margin-bottom: 6px; }
    p { margin: 6px 0; }
    .disclaimer { font-size: 9pt; color: #666; border-top: 1px solid #ccc; margin-top: 30px; padding-top: 10px; text-align: center; }
    .firme { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
    .firma-box { border-top: 1px solid #000; padding-top: 8px; }
    .warn-box { background: #fff3cd; border: 1px solid #ffc107; padding: 8px 12px; border-radius: 3px; }
    .cert-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 10px; border-radius: 3px; }
  </style>
</head>
<body>${docContent}</body>
</html>`);
          win.document.close();
          win.print();
        };

        const articles = [
          { n:1, title:"Oggetto e ambito del trattamento", active:true },
          { n:2, title:"Obblighi del Responsabile (art. 28 GDPR)", active:true },
          { n:3, title:"Istruzioni del Titolare", active:true },
          { n:4, title:"Sub-responsabili del trattamento", active:true },
          { n:5, title:"Trasferimento dati Extra-UE (art. 46 GDPR)", active:hasExtraEu },
          { n:6, title:"Sistemi IA — AI Act Reg. UE 2024/1689", active:true },
          { n:7, title:"Misure di sicurezza — NIS2 Art. 21", active:true },
          { n:8, title:"Notifica violazioni dati personali", active:true },
          { n:9, title:"Durata e cancellazione dei dati", active:true },
        ];

        return (
          <div className="fixed inset-0 flex items-start justify-center overflow-auto"
            style={{ zIndex:70, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(4px)", padding:"24px 16px" }}>
            <style>{`@media print { .dpa-no-print { display:none!important; } .dpa-doc { max-height:none!important; overflow:visible!important; } body > *:not(#dpa-root) { display:none; } }`}</style>
            <div id="dpa-root" className="w-full flex" style={{ maxWidth:"1120px", borderRadius:"8px", overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.6)" }}>

              {/* ── LEFT: DOCUMENT ── */}
              <div id="dpa-document-content" className="dpa-doc flex-shrink-0" style={{ width:"60%", background:"white", padding:"48px 52px", overflowY:"auto", maxHeight:"92vh", fontFamily:"Georgia, serif", color:"#111", fontSize:"13px", lineHeight:"1.7" }}>

                {/* Header */}
                <div style={{ textAlign:"center", marginBottom:"32px", borderBottom:"2px solid #0F172A", paddingBottom:"20px" }}>
                  <p style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"10px", letterSpacing:"0.15em", color:"#64748B", marginBottom:"6px" }}>
                    RISERVATEZZA · ART. 28 GDPR · ART. 21 NIS2 · AI ACT
                  </p>
                  <h1 style={{ fontFamily:"Georgia, serif", fontSize:"20px", fontWeight:"bold", letterSpacing:"0.04em", margin:"0 0 4px" }}>
                    DATA PROCESSING AGREEMENT
                  </h1>
                  <p style={{ fontSize:"11px", color:"#64748B" }}>
                    Accordo di nomina a Responsabile del Trattamento — Rev. 1.0 · {today}
                  </p>
                </div>

                {/* Parties */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"24px", marginBottom:"28px" }}>
                  <div style={{ borderLeft:"3px solid #0F172A", paddingLeft:"14px" }}>
                    <p style={{ fontFamily:"sans-serif", fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748B", marginBottom:"6px" }}>TITOLARE DEL TRATTAMENTO</p>
                    <p style={{ fontWeight:"bold", marginBottom:"2px" }}>{titolare}</p>
                    <p style={{ fontSize:"12px", color:"#475569" }}>P.IVA: {titPiva}</p>
                    {titAddr !== "—" && <p style={{ fontSize:"12px", color:"#475569" }}>{titAddr}</p>}
                    {company?.region && <p style={{ fontSize:"12px", color:"#475569" }}>{company.region}</p>}
                  </div>
                  <div style={{ borderLeft:"3px solid #3A6DF0", paddingLeft:"14px" }}>
                    <p style={{ fontFamily:"sans-serif", fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748B", marginBottom:"6px" }}>RESPONSABILE DEL TRATTAMENTO</p>
                    <p style={{ fontWeight:"bold", marginBottom:"2px" }}>{r.ragione_sociale}</p>
                    <p style={{ fontSize:"12px", color:"#475569" }}>P.IVA: {dpaPiva || "___________"}</p>
                    {dpaAddress && <p style={{ fontSize:"12px", color:"#475569" }}>{dpaAddress}</p>}
                    {dpaEmail && <p style={{ fontSize:"12px", color:"#475569" }}>{dpaEmail}</p>}
                  </div>
                </div>

                {/* Premises */}
                <div style={{ background:"#F8FAFC", border:"1px solid #E2E8F0", borderRadius:"4px", padding:"14px 18px", marginBottom:"24px" }}>
                  <p style={{ fontFamily:"sans-serif", fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748B", marginBottom:"8px" }}>PREMESSE — SERVIZI OGGETTO DEL TRATTAMENTO</p>
                  {dpaServices.length === 0
                    ? <p style={{ fontSize:"12px", color:"#94A3B8", fontStyle:"italic" }}>Nessun servizio registrato per questo fornitore.</p>
                    : dpaServices.map((s, i) => (
                        <div key={s.id} style={{ display:"flex", alignItems:"flex-start", gap:"8px", marginBottom:"4px" }}>
                          <span style={{ fontFamily:"monospace", fontSize:"11px", color:"#94A3B8", flexShrink:0 }}>{String(i+1).padStart(2,"0")}.</span>
                          <span style={{ fontSize:"12px" }}>
                            <strong>{SUBCAT_LABELS[s.sottocategoria] ?? s.sottocategoria}</strong>
                            {" — "}{CAT_LABELS[s.categoria]}
                            {s.dati_trattati?.length > 0 && <span style={{ color:"#64748B" }}>{" · "}{s.dati_trattati.join(", ")}</span>}
                            {s.data_residency === "EXTRA_EU" && <span style={{ color:"#D97706", marginLeft:"6px" }}>⚠ Extra-UE{!s.scc_presente ? " (SCC mancanti)" : ""}</span>}
                          </span>
                        </div>
                      ))
                  }
                </div>

                {/* Art. 1 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 1 — Oggetto e ambito del trattamento</p>
                  <p style={{ textAlign:"justify" }}>Il presente Accordo disciplina il trattamento dei dati personali effettuato dal Responsabile per conto del Titolare, ai sensi dell&apos;art. 28 del Regolamento UE 2016/679 (GDPR), relativamente ai servizi indicati nelle Premesse. Il trattamento è eseguito esclusivamente per le finalità indicate dal Titolare e per la durata del rapporto contrattuale.</p>
                </div>

                {/* Art. 2 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 2 — Obblighi del Responsabile del trattamento</p>
                  <p style={{ textAlign:"justify", marginBottom:"6px" }}>Il Responsabile si impegna a: (a) trattare i dati personali soltanto su istruzione documentata del Titolare; (b) garantire che le persone autorizzate al trattamento si siano impegnate alla riservatezza; (c) adottare misure tecniche e organizzative adeguate ai sensi dell&apos;art. 32 GDPR; (d) assistere il Titolare nel rispondere alle richieste degli interessati; (e) mettere a disposizione del Titolare le informazioni necessarie per dimostrare il rispetto degli obblighi.</p>
                  {hasCertISO && <p style={{ fontSize:"12px", background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:"3px", padding:"6px 10px", color:"#166534" }}>✓ Il Responsabile dichiara di essere in possesso di certificazione ISO 27001. Copia del certificato in vigore è allegata al presente Accordo.</p>}
                </div>

                {/* Art. 3 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 3 — Istruzioni del Titolare</p>
                  <p style={{ textAlign:"justify" }}>Il Responsabile tratta i dati personali soltanto secondo le istruzioni documentate del Titolare, anche in relazione al trasferimento di dati personali verso un paese terzo o un&apos;organizzazione internazionale, salvo che un obbligo di legge dell&apos;Unione o dello Stato membro cui è soggetto il Responsabile lo preveda diversamente.</p>
                </div>

                {/* Art. 4 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 4 — Sub-responsabili del trattamento</p>
                  <p style={{ textAlign:"justify" }}>Il Responsabile non ricorre ad altro responsabile del trattamento senza previa autorizzazione scritta, specifica o generale, del Titolare. In caso di autorizzazione generale, il Responsabile informa il Titolare di qualsiasi modifica prevista riguardante l&apos;aggiunta o la sostituzione di altri responsabili.</p>
                </div>

                {/* Art. 5 — Extra-EU (conditional) */}
                {hasExtraEu && (
                  <div style={{ marginBottom:"20px", background:hasNoScc?"#FEF2F2":"transparent", border:hasNoScc?"1px solid #FECACA":"none", borderRadius:"4px", padding:hasNoScc?"12px":"0" }}>
                    <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 5 — Trasferimento di dati verso paesi terzi</p>
                    <p style={{ textAlign:"justify", marginBottom:"6px" }}>I dati personali oggetto del presente Accordo sono trattati al di fuori dello Spazio Economico Europeo. Il trasferimento è subordinato all&apos;adozione delle Clausole Contrattuali Standard (SCC) approvate dalla Commissione europea ai sensi dell&apos;art. 46, par. 2, lett. c) del GDPR.</p>
                    {hasNoScc && <p style={{ fontWeight:"bold", color:"#991B1B", fontSize:"12px" }}>⚠ ATTENZIONE: Per uno o più servizi non risultano apposte le SCC. Il Titolare è tenuto a sanare tale irregolarità prima della firma del presente Accordo, pena la nullità del trasferimento ex art. 44 GDPR.</p>}
                  </div>
                )}

                {/* Art. 6 — AI Act */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 6 — Sistemi di intelligenza artificiale <span style={{ fontWeight:"normal", color:"#64748B", fontSize:"11px" }}>(AI Act Reg. UE 2024/1689)</span></p>
                  <p style={{ textAlign:"justify" }}>Qualora il Responsabile utilizzi sistemi di intelligenza artificiale nel trattamento dei dati, è tenuto a rispettare il Regolamento UE 2024/1689 (AI Act). I sistemi classificati ad alto rischio ai sensi dell&apos;Allegato III devono essere soggetti a valutazione di conformità prima della messa in servizio. Il Responsabile si impegna a fornire documentazione attestante la conformità su richiesta del Titolare.</p>
                </div>

                {/* Art. 7 — NIS2 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 7 — Misure di sicurezza <span style={{ fontWeight:"normal", color:"#64748B", fontSize:"11px" }}>(NIS2 Art. 21 Dir. UE 2022/2555)</span></p>
                  <p style={{ textAlign:"justify" }}>Il Responsabile adotta misure tecniche e organizzative appropriate ai sensi dell&apos;art. 32 GDPR e dell&apos;art. 21 della Direttiva NIS2, incluse: (a) politiche in materia di sicurezza dei sistemi informativi; (b) gestione degli incidenti; (c) continuità operativa e gestione delle crisi; (d) sicurezza della catena di approvvigionamento; (e) sicurezza nell&apos;acquisizione, sviluppo e manutenzione dei sistemi informativi.</p>
                </div>

                {/* Art. 8 */}
                <div style={{ marginBottom:"20px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 8 — Notifica delle violazioni dei dati personali</p>
                  <p style={{ textAlign:"justify" }}>Il Responsabile notifica al Titolare qualsiasi violazione dei dati personali senza ingiustificato ritardo e, ove possibile, entro 72 ore dalla scoperta, ai sensi dell&apos;art. 33 GDPR. La notifica contiene almeno le informazioni di cui all&apos;art. 33, par. 3 GDPR.</p>
                </div>

                {/* Art. 9 */}
                <div style={{ marginBottom:"32px" }}>
                  <p style={{ fontWeight:"bold", marginBottom:"6px" }}>Art. 9 — Durata, restituzione e cancellazione dei dati</p>
                  <p style={{ textAlign:"justify" }}>Il presente Accordo decorre dal <strong>{decorrenzaFmt}</strong> e rimane in vigore per la durata del contratto di fornitura. Al termine del contratto, il Responsabile, su scelta del Titolare, cancella o restituisce tutti i dati personali e cancella le copie esistenti, salvo che il diritto dell&apos;Unione o dello Stato membro preveda la conservazione dei dati.</p>
                </div>

                {/* Signatures */}
                <div style={{ borderTop:"1px solid #E2E8F0", paddingTop:"28px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"32px" }}>
                  <div>
                    <p style={{ fontFamily:"sans-serif", fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748B", marginBottom:"40px" }}>TITOLARE DEL TRATTAMENTO</p>
                    <div style={{ borderTop:"1px solid #0F172A", paddingTop:"6px" }}>
                      <p style={{ fontSize:"12px", fontWeight:"bold" }}>{titolare}</p>
                      <p style={{ fontSize:"11px", color:"#64748B" }}>Legale Rappresentante</p>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontFamily:"sans-serif", fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748B", marginBottom:"40px" }}>RESPONSABILE DEL TRATTAMENTO</p>
                    <div style={{ borderTop:"1px solid #3A6DF0", paddingTop:"6px" }}>
                      <p style={{ fontSize:"12px", fontWeight:"bold" }}>{r.ragione_sociale}</p>
                      <p style={{ fontSize:"11px", color:"#64748B" }}>Legale Rappresentante / Delegato</p>
                    </div>
                  </div>
                </div>

                <p style={{ marginTop:"28px", fontSize:"10px", color:"#94A3B8", fontFamily:"sans-serif", textAlign:"center", borderTop:"1px solid #F1F5F9", paddingTop:"12px" }}>
                  Documento generato da CLAVIS — Governance Normativa per Strutture Sociosanitarie · Non sostituisce consulenza legale professionale.
                </p>
              </div>

              {/* ── RIGHT: ACTIONS ── */}
              <div className="dpa-no-print" style={{ width:"40%", background:"var(--ink2)", padding:"32px 28px", overflowY:"auto", maxHeight:"92vh", borderLeft:"1px solid var(--line)" }}>
                <div style={{ marginBottom:"24px" }}>
                  <p style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:"10px", letterSpacing:"0.12em", color:"var(--bone-dim)", marginBottom:"4px" }}>DPA INTEGRATO</p>
                  <h2 style={{ fontFamily:"Syne, system-ui", fontWeight:800, fontSize:"16px", color:"var(--bone)", letterSpacing:"0.04em", margin:"0 0 2px" }}>
                    NIS2 + GDPR + AI Act
                  </h2>
                  <p style={{ fontSize:"11px", color:"var(--bone-dim)" }}>Rev. 1.0 · {today} · {r.ragione_sociale}</p>
                </div>

                {/* Editable fields */}
                <div style={{ marginBottom:"24px", display:"flex", flexDirection:"column", gap:"12px" }}>
                  <div>
                    <p style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"var(--bone-dim)", marginBottom:"4px", textTransform:"uppercase" }}>Data decorrenza</p>
                    <input type="date" value={dpaDecorrenza} onChange={e => setDpaDecorrenza(e.target.value)}
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                  <div>
                    <p style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"var(--bone-dim)", marginBottom:"4px", textTransform:"uppercase" }}>P.IVA Responsabile</p>
                    <input type="text" value={dpaPiva} onChange={e => setDpaPiva(e.target.value)}
                      placeholder="IT12345678901"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                  <div>
                    <p style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"var(--bone-dim)", marginBottom:"4px", textTransform:"uppercase" }}>Sede Responsabile</p>
                    <input type="text" value={dpaAddress} onChange={e => setDpaAddress(e.target.value)}
                      placeholder="Via Roma 1, 20100 Milano MI"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                  <div>
                    <p style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"var(--bone-dim)", marginBottom:"4px", textTransform:"uppercase" }}>Email Responsabile</p>
                    <input type="email" value={dpaEmail} onChange={e => setDpaEmail(e.target.value)}
                      placeholder="dpo@fornitore.it"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                </div>

                {/* Articles checklist */}
                <div style={{ marginBottom:"24px", background:"rgba(255,255,255,0.04)", border:"1px solid var(--line)", borderRadius:"4px", padding:"14px" }}>
                  <p style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"var(--bone-dim)", marginBottom:"10px", textTransform:"uppercase" }}>Articoli inclusi</p>
                  {articles.map(a => (
                    <div key={a.n} style={{ display:"flex", alignItems:"flex-start", gap:"8px", marginBottom:"6px" }}>
                      <span style={{ fontSize:"11px", color:a.active?"var(--emerald)":"var(--bone-dim)", flexShrink:0, marginTop:"1px" }}>{a.active?"✓":"○"}</span>
                      <span style={{ fontSize:"12px", color:a.active?"var(--bone)":"var(--bone-dim)", opacity:a.active?1:0.45 }}>
                        <span style={{ fontFamily:"monospace", color:"var(--bone-dim)", marginRight:"4px" }}>Art.{a.n}</span>
                        {a.title}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Warnings */}
                {hasNoScc && (
                  <div style={{ marginBottom:"16px", background:"rgba(232,99,74,.12)", border:"1px solid rgba(232,99,74,.3)", borderRadius:"4px", padding:"10px 12px" }}>
                    <p style={{ fontSize:"12px", color:"var(--warn)", fontWeight:600 }}>⚠ SCC mancanti per trasferimento Extra-UE</p>
                    <p style={{ fontSize:"11px", color:"var(--bone-dim)", marginTop:"2px" }}>Il documento segnala la criticità nell&apos;Art. 5. Integrare prima della firma.</p>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <button onClick={handlePrint}
                    className="w-full flex items-center justify-center gap-2 py-2.5 font-bold text-sm"
                    style={{ backgroundColor:"var(--shield)", color:"white", borderRadius:"4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    Scarica PDF
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(docText); setDpaCopied(true); setTimeout(() => setDpaCopied(false), 3000); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 font-semibold text-sm"
                    style={{ background:"rgba(255,255,255,0.06)", border:"1px solid var(--line2)", color:"var(--bone)", borderRadius:"4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    {dpaCopied ? "✓ Copiato" : "Copia testo"}
                  </button>
                  <button onClick={() => setDpaFornitore(null)}
                    className="w-full py-2.5 text-sm font-semibold"
                    style={{ color:"var(--bone-dim)" }}>
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MAIL MODAL */}
      {mailFornitore && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex:60, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(4px)" }}>
          <div className="w-full flex flex-col" style={{ maxWidth:"520px", maxHeight:"82vh", background:"#1E293B", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              <div>
                <p className="font-bold text-sm" style={{ color:"#F1F5F9" }}>Comunicazione formale</p>
                <p className="text-xs mt-0.5" style={{ color:"#64748B" }}>{mailFornitore.ragione_sociale}</p>
              </div>
              <button onClick={() => setMailFornitore(null)} style={{ color:"#64748B" }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:"#64748B" }}>Oggetto</p>
                <input type="text" value={mailSubject} onChange={e => setMailSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color:"#64748B" }}>Testo</p>
                <textarea value={mailBody} onChange={e => setMailBody(e.target.value)}
                  rows={14} className="w-full px-3 py-2 text-sm resize-none outline-none"
                  style={{ ...inputStyle, fontFamily:"Inter, system-ui" }}/>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center gap-3 flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => { navigator.clipboard.writeText(`Oggetto: ${mailSubject}\n\n${mailBody}`); setMailCopied(true); setTimeout(()=>setMailCopied(false),3000); }}
                className="text-xs px-4 py-2 font-semibold"
                style={{ backgroundColor:"rgba(255,255,255,0.08)", color:"#CBD5E1", borderRadius:"4px", border:"1px solid rgba(255,255,255,0.08)" }}>
                {mailCopied?"✓ Copiato":"Copia testo"}
              </button>
              <button onClick={handleMailSend}
                className="text-xs px-4 py-2 font-semibold"
                style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                Apri client mail →
              </button>
              <button onClick={() => setMailFornitore(null)}
                className="ml-auto text-xs px-3 py-2 font-semibold" style={{ color:"#64748B" }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREA FORNITORE DA RESPONSABILI ESTERNI */}
      {showExternalModal && currentExternal && (() => {
        const queueIdx = externalQueue.indexOf(currentExternal);
        const total    = externalQueue.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background:"rgba(0,0,0,0.72)", backdropFilter:"blur(4px)" }}>
            <div className="w-full flex flex-col"
              style={{ maxWidth:"440px", background:"#1E293B", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", maxHeight:"90vh" }}>

              {/* Header */}
              <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
                <div>
                  <p className="font-bold uppercase tracking-wider text-sm" style={{ color:"#F1F5F9" }}>
                    Crea fornitore — {currentExternal}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color:"#64748B" }}>
                    {queueIdx + 1} di {total} responsabili esterni
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: total }).map((_, n) => (
                    <div key={n} className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: n < queueIdx ? T.low : n === queueIdx ? T.bronze : "rgba(255,255,255,0.12)" }}/>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>Ragione Sociale *</label>
                  <input type="text" value={externalForm.ragione_sociale}
                    onChange={e => setExternalForm(f => ({...f, ragione_sociale:e.target.value}))}
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>P.IVA</label>
                    <input type="text" value={externalForm.piva}
                      onChange={e => setExternalForm(f => ({...f, piva:e.target.value}))}
                      placeholder="Opzionale"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold" style={labelStyle}>Email</label>
                    <input type="email" value={externalForm.email}
                      onChange={e => setExternalForm(f => ({...f, email:e.target.value}))}
                      placeholder="Opzionale"
                      className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}/>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>Categoria</label>
                  <select value={externalForm.categoria}
                    onChange={e => setExternalForm(f => ({...f, categoria:e.target.value as Categoria}))}
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                    {(Object.entries(CAT_LABELS) as [Categoria,string][]).map(([k,v]) => (
                      <option key={k} value={k} style={{ background:"#1E293B" }}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold" style={labelStyle}>Stato Relazione</label>
                  <select value={externalForm.stato_relazione}
                    onChange={e => setExternalForm(f => ({...f, stato_relazione:e.target.value as Stato}))}
                    className="w-full px-3 py-2 text-sm outline-none" style={inputStyle}>
                    <option value="ATTIVO"      style={{ background:"#1E293B" }}>Attivo</option>
                    <option value="IN_VERIFICA" style={{ background:"#1E293B" }}>In Verifica</option>
                    <option value="A_RISCHIO"   style={{ background:"#1E293B" }}>A Rischio</option>
                    <option value="SOSPESO"     style={{ background:"#1E293B" }}>Sospeso</option>
                  </select>
                </div>
                {externalSaveError && (
                  <p className="text-xs font-semibold" style={{ color:T.critical }}>{externalSaveError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between gap-3 flex-shrink-0" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
                <button
                  onClick={() => { setShowExternalModal(false); setCurrentExternal(null); setExternalQueue([]); }}
                  className="text-xs px-3 py-2 font-semibold"
                  style={{ color:"#64748B" }}>
                  Annulla tutto
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => advanceExternalQueue(externalQueue, currentExternal)}
                    className="text-xs px-4 py-2 font-semibold"
                    style={{ border:"1px solid var(--line2)", color:"var(--bone-dim)", borderRadius:"4px" }}>
                    Salta →
                  </button>
                  <button
                    onClick={() => handleSaveExternal(externalQueue, currentExternal)}
                    disabled={savingExternal || !externalForm.ragione_sociale.trim()}
                    className="text-xs px-4 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                    style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                    {savingExternal ? "Salvataggio..." : queueIdx + 1 < total ? "Salva e continua →" : "Salva e termina ✓"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL APPROVAZIONE IMPORT */}
      {showImportModal && (() => {
        const isTratt = importType === "REGISTRO_TRATTAMENTI";
        const rows = importRows as Record<string, unknown>[];
        const selectedCount = importSelected.filter(Boolean).length;
        const inlineInput: React.CSSProperties = {
          background:"var(--ink)", border:"1px solid var(--line2)",
          color:"var(--bone)", borderRadius:"3px",
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)", padding:"16px" }}>
            <div className="flex flex-col w-full"
              style={{ maxWidth:"1200px", height:"85vh", background:"var(--ink2)", border:"1px solid var(--line2)", borderRadius:"8px", overflow:"hidden" }}>

              {/* HEADER */}
              <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between gap-4" style={{ borderColor:"var(--line2)" }}>
                <div>
                  <p className="font-bold text-sm uppercase tracking-wider" style={{ color:"var(--bone)" }}>
                    Dati estratti — approva riga per riga
                  </p>
                  <p className="text-xs mt-0.5" style={{ color:"var(--bone-dim)" }}>
                    Verifica ogni riga prima di importarla. Puoi modificare i valori prima di salvare.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-bold px-3 py-1 rounded" style={{ backgroundColor:T.highBg, color:T.high }}>
                    {rows.length} {isTratt ? "trattamenti" : "fornitori"} trovati
                  </span>
                  <button onClick={() => { setShowImportModal(false); setImportMeta(null); setTriageHints(null); }} style={{ color:"var(--bone-dim)", fontSize:"18px" }}>✕</button>
                </div>
              </div>

              {/* BODY */}
              <div className="flex-1 overflow-auto">
                {isTratt ? (
                  <table className="w-full text-sm" style={{ minWidth:"1600px" }}>
                    <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                      <tr style={{ backgroundColor:"var(--ink3)", borderBottom:"1px solid var(--line2)" }}>
                        {["✓","Trattamento","Responsabile","Categorie Dati","Finalità","Conservazione","Responsabili Esterni","Formato","Informativa","Consenso","Misure Sicurezza"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold"
                            style={{ color:"var(--bone-dim)", fontSize:"12px", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom:"1px solid var(--line)", backgroundColor:i%2===0?"var(--ink2)":"var(--ink3)", minHeight:"60px" }}>
                          <td className="px-3 py-2.5" style={{ width:"36px", verticalAlign:"top" }}>
                            <input type="checkbox" checked={importSelected[i]??true}
                              onChange={e => setImportSelected(prev => prev.map((v,j) => j===i?e.target.checked:v))}
                              className="accent-orange-600"/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"180px", verticalAlign:"top" }}>
                            <textarea value={(row.trattamento as string)??""}
                              onChange={e => updateImportRow(i,"trattamento",e.target.value)}
                              rows={2} className="w-full outline-none"
                              style={{...inlineInput, width:"100%", fontSize:"13px", lineHeight:"1.5", padding:"6px 8px", resize:"vertical"}}/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"130px", verticalAlign:"top" }}>
                            <textarea value={(row.responsabile as string)??""}
                              onChange={e => updateImportRow(i,"responsabile",e.target.value)}
                              rows={2} className="w-full outline-none"
                              style={{...inlineInput, width:"100%", fontSize:"13px", lineHeight:"1.5", padding:"6px 8px", resize:"vertical"}}/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"160px", verticalAlign:"top" }}>
                            <div className="flex flex-wrap gap-1" style={{ whiteSpace:"pre-wrap", lineHeight:"1.5", fontSize:"13px", padding:"6px 0" }}>
                              {((row.categorie_dati as string[])??[]).map((c,ci) => (
                                <span key={ci} className="text-xs px-1.5 py-0.5 rounded font-mono"
                                  style={{ backgroundColor:c==="SANITARI"?T.critBg:c==="PERSONALI"?T.highBg:"var(--ink3)", color:c==="SANITARI"?T.critical:c==="PERSONALI"?T.high:"var(--bone-dim)", fontSize:"11px" }}>{c}</span>
                              ))}
                              {((row.categorie_dati as string[])??[]).length===0 && <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"200px", verticalAlign:"top" }}>
                            <textarea value={(row.finalita as string)??""}
                              onChange={e => updateImportRow(i,"finalita",e.target.value)}
                              rows={3} className="w-full outline-none"
                              style={{...inlineInput, width:"100%", minWidth:"140px", fontSize:"13px", lineHeight:"1.5", padding:"6px 8px", resize:"vertical"}}/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"130px", verticalAlign:"top" }}>
                            <textarea value={(row.periodo_conservazione as string)??""}
                              onChange={e => updateImportRow(i,"periodo_conservazione",e.target.value)}
                              rows={2} className="w-full outline-none"
                              style={{...inlineInput, width:"100%", fontSize:"13px", lineHeight:"1.5", padding:"6px 8px", resize:"vertical"}}/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"180px", verticalAlign:"top" }}>
                            <div className="flex flex-wrap gap-1" style={{ whiteSpace:"pre-wrap", lineHeight:"1.5", fontSize:"13px", padding:"6px 0" }}>
                              {((row.responsabili_esterni as string[])??[]).filter(Boolean).map((re,ri) => (
                                <span key={ri} className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor:T.bronzeBg, color:T.bronze, fontSize:"11px" }}>{re}</span>
                              ))}
                              {((row.responsabili_esterni as string[])??[]).filter(Boolean).length===0 && (
                                <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>
                              )}
                            </div>
                          </td>
                          {/* Formato */}
                          <td className="px-3 py-2.5" style={{ minWidth:"110px", verticalAlign:"top" }}>
                            {(() => {
                              const fmt = (row.formato as string)??"";
                              const fmtColor = fmt==="elettronico"?T.high:fmt==="cartaceo"?T.medium:fmt==="entrambi"?T.low:"var(--bone-dim)";
                              const fmtBg    = fmt==="elettronico"?T.highBg:fmt==="cartaceo"?T.medBg:fmt==="entrambi"?T.lowBg:"var(--ink3)";
                              return fmt
                                ? <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor:fmtBg, color:fmtColor, fontSize:"11px" }}>{fmt}</span>
                                : <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>;
                            })()}
                          </td>
                          {/* Informativa */}
                          <td className="px-3 py-2.5" style={{ width:"80px", textAlign:"center", verticalAlign:"top" }}>
                            {row.informativa_resa !== undefined
                              ? <span style={{ fontSize:"15px", fontWeight:"bold", color: row.informativa_resa ? T.low : T.critical }}>{row.informativa_resa ? "✓" : "✗"}</span>
                              : <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>}
                          </td>
                          {/* Consenso */}
                          <td className="px-3 py-2.5" style={{ width:"80px", textAlign:"center", verticalAlign:"top" }}>
                            {row.consenso_richiesto !== undefined
                              ? <span style={{ fontSize:"15px", fontWeight:"bold", color: row.consenso_richiesto ? T.low : T.medium }}>{row.consenso_richiesto ? "✓" : "✗"}</span>
                              : <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>}
                          </td>
                          {/* Misure Sicurezza */}
                          <td className="px-3 py-2.5" style={{ minWidth:"200px", verticalAlign:"top" }}>
                            <textarea value={(row.misure_sicurezza as string)??""}
                              onChange={e => updateImportRow(i,"misure_sicurezza",e.target.value)}
                              rows={2} className="w-full outline-none"
                              style={{...inlineInput, width:"100%", fontSize:"13px", lineHeight:"1.5", padding:"6px 8px", resize:"vertical"}}/>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-sm" style={{ minWidth:"800px" }}>
                    <thead style={{ position:"sticky", top:0, zIndex:1 }}>
                      <tr style={{ backgroundColor:"var(--ink3)", borderBottom:"1px solid var(--line2)" }}>
                        {["✓","Ragione Sociale","Categoria","Dati Trattati","DPA","Note"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold"
                            style={{ color:"var(--bone-dim)", fontSize:"12px", textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom:"1px solid var(--line)", backgroundColor:i%2===0?"var(--ink2)":"var(--ink3)" }}>
                          <td className="px-3 py-2.5" style={{ width:"36px", verticalAlign:"top" }}>
                            <input type="checkbox" checked={importSelected[i]??true}
                              onChange={e => setImportSelected(prev => prev.map((v,j) => j===i?e.target.checked:v))}
                              className="accent-orange-600"/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"180px", verticalAlign:"top" }}>
                            <input type="text" value={(row.ragione_sociale as string)??""}
                              onChange={e => updateImportRow(i,"ragione_sociale",e.target.value)}
                              className="w-full px-2 py-1 text-xs outline-none" style={inlineInput}/>
                            {Boolean(row.piva) && (
                              <span className="text-xs font-mono mt-0.5 block" style={{ color:"var(--bone-dim)" }}>{row.piva as string}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"190px", verticalAlign:"top" }}>
                            <select value={(row.categoria as string)??""}
                              onChange={e => updateImportRow(i,"categoria",e.target.value)}
                              className="w-full px-2 py-1 text-xs outline-none" style={inlineInput}>
                              <option value="" disabled>Seleziona...</option>
                              {(Object.entries(CAT_LABELS) as [Categoria,string][]).map(([k,v]) => (
                                <option key={k} value={k} style={{ background:"#1E293B" }}>{v}</option>
                              ))}
                            </select>
                            {Boolean(row.servizio) && (
                              <p className="text-xs mt-0.5 truncate" style={{ color:"var(--bone-dim)", maxWidth:"170px" }}>{row.servizio as string}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"160px", verticalAlign:"top" }}>
                            <div className="flex flex-wrap gap-1">
                              {((row.dati_trattati as string[])??[]).map((d,di) => (
                                <span key={di} className="text-xs px-1.5 py-0.5 rounded font-mono"
                                  style={{ backgroundColor:d==="SANITARI"?T.critBg:d==="PERSONALI"?T.highBg:"var(--ink3)", color:d==="SANITARI"?T.critical:d==="PERSONALI"?T.high:"var(--bone-dim)", fontSize:"11px" }}>{d}</span>
                              ))}
                              {((row.dati_trattati as string[])??[]).length===0 && <span style={{ color:"var(--bone-dim)", fontSize:"12px" }}>—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5" style={{ width:"60px", textAlign:"center", verticalAlign:"top" }}>
                            <input type="checkbox" checked={Boolean(row.dpa_firmato)}
                              onChange={e => updateImportRow(i,"dpa_firmato",e.target.checked)}
                              className="accent-orange-600"/>
                          </td>
                          <td className="px-3 py-2.5" style={{ minWidth:"160px", verticalAlign:"top" }}>
                            <input type="text" value={(row.note as string)??""}
                              onChange={e => updateImportRow(i,"note",e.target.value)}
                              className="w-full px-2 py-1 text-xs outline-none" style={inlineInput}/>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* META + TRIAGE PANEL */}
              {isTratt && (importMeta || triageHints) && (() => {
                const HINTS_MAP: Record<string,[string,string]> = {
                  ha_accesso_elettronico:   ["Ha accesso elettronico ai dati",         "Non ha accesso elettronico ai dati"],
                  ha_backup:                ["Ha sistema di backup",                   "Non ha sistema di backup"],
                  ha_credenziali_accesso:   ["Ha credenziali accesso protette",         "Credenziali accesso non gestite formalmente"],
                  ha_logging:               ["Ha logging degli accessi",               "Non ha logging degli accessi"],
                  ha_cifratura:             ["Ha cifratura dei dati",                  "Non ha cifratura dei dati"],
                  ha_formazione_personale:  ["Ha formazione del personale",            "Non ha formazione del personale documentata"],
                  ha_procedure_data_breach: ["Ha procedure data breach documentate",   "Non ha procedure data breach documentate"],
                  usa_cloud_esterno:        ["Usa servizi cloud esterni",              "Non usa servizi cloud esterni"],
                  dati_extra_ue:            ["Trasferisce dati fuori UE",              "Non trasferisce dati fuori UE"],
                };
                return (
                  <div className="flex-shrink-0 border-t px-6 py-4 space-y-4"
                    style={{ borderColor:"var(--line2)", backgroundColor:"rgba(0,0,0,0.15)" }}>

                    {/* Meta estratti */}
                    {importMeta && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:"var(--bone-dim)" }}>
                          Metadati estratti dal documento
                        </p>
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          {Boolean(importMeta.titolare_trattamento) && (
                            <span className="text-xs">
                              <span style={{ color:"var(--bone-dim)" }}>Titolare: </span>
                              <span className="font-semibold" style={{ color:"var(--bone)" }}>{importMeta.titolare_trattamento as string}</span>
                            </span>
                          )}
                          {Boolean(importMeta.dpo) && (
                            <span className="text-xs">
                              <span style={{ color:"var(--bone-dim)" }}>DPO: </span>
                              <span className="font-semibold" style={{ color:"var(--bone)" }}>{importMeta.dpo as string}</span>
                            </span>
                          )}
                          {Boolean(importMeta.data_documento) && (
                            <span className="text-xs">
                              <span style={{ color:"var(--bone-dim)" }}>Data documento: </span>
                              <span className="font-semibold" style={{ color:"var(--bone)" }}>{importMeta.data_documento as string}</span>
                            </span>
                          )}
                          {Boolean(importMeta.versione) && (
                            <span className="text-xs">
                              <span style={{ color:"var(--bone-dim)" }}>Versione: </span>
                              <span className="font-semibold" style={{ color:"var(--bone)" }}>{importMeta.versione as string}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Triage hints aggregati */}
                    {triageHints && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:"var(--bone-dim)" }}>
                          Dai documenti risulta che la struttura:
                        </p>
                        <div className="grid grid-cols-3 gap-x-6 gap-y-1 mb-3">
                          {Object.entries(HINTS_MAP).map(([key, [pos, neg]]) => {
                            const raw      = triageHints[key] ?? false;
                            const inverted = key === "dati_extra_ue";
                            const isGood   = inverted ? !raw : raw;
                            const label    = inverted
                              ? (raw ? "Trasferisce dati fuori UE" : "Nessun trasferimento dati extra-UE")
                              : (raw ? pos : neg);
                            return (
                              <div key={key} className="flex items-start gap-1.5">
                                <span style={{ color:isGood?T.low:T.critical, fontSize:"13px", fontWeight:"bold", flexShrink:0, marginTop:"1px" }}>{isGood?"✓":"✗"}</span>
                                <span className="text-xs" style={{ color:isGood?"var(--bone)":"var(--bone-dim)" }}>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => {
                            try { sessionStorage.setItem("clavis_triage_prefill", JSON.stringify(triageHints)); } catch {}
                            router.push("/triage/autenticato");
                          }}
                          className="text-xs px-4 py-2 font-bold"
                          style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                          Usa questi dati per pre-compilare il triage →
                        </button>
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* FOOTER */}
              <div className="flex-shrink-0 px-6 py-4 border-t flex items-center justify-between gap-4 flex-wrap" style={{ borderColor:"var(--line2)" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => setImportSelected(importSelected.map(() => true))}
                    className="text-xs px-3 py-1.5 font-semibold"
                    style={{ color:"var(--bone-dim)", border:"1px solid var(--line2)", borderRadius:"4px" }}>
                    Seleziona tutto
                  </button>
                  <button onClick={() => setImportSelected(importSelected.map(() => false))}
                    className="text-xs px-3 py-1.5 font-semibold"
                    style={{ color:"var(--bone-dim)", border:"1px solid var(--line2)", borderRadius:"4px" }}>
                    Deseleziona tutto
                  </button>
                  <span className="text-xs" style={{ color:"var(--bone-dim)" }}>
                    <span className="font-bold" style={{ color:"var(--bone)" }}>{selectedCount}</span> di {rows.length} selezionati
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setShowImportModal(false); setImportMeta(null); setTriageHints(null); }}
                    className="text-sm px-4 py-2 font-semibold" style={{ color:"var(--bone-dim)" }}>
                    Annulla
                  </button>
                  <button onClick={handleImportConfirm} disabled={savingImport || selectedCount===0}
                    className="text-sm px-5 py-2 font-bold uppercase tracking-widest disabled:opacity-40"
                    style={{ backgroundColor:T.bronze, color:"white", borderRadius:"4px" }}>
                    {savingImport ? "Importazione..." : `Importa ${selectedCount} selezionati`}
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ─── WIZARD CENSIMENTO ──────────────────────────────────────────────── */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background:"rgba(0,0,0,0.85)", backdropFilter:"blur(4px)" }}>
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            style={{ background:"#0A0E1A", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor:"rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                  style={{ background:"rgba(217,178,90,0.12)", color:T.bronze }}>
                  CENSIMENTO
                </span>
                <span className="text-sm font-semibold" style={{ color:"#EEF1F8" }}>
                  {wizardStep === 0 && "Wizard Censimento Fornitori"}
                  {wizardStep === 1 && "Passo 1 — Seleziona i servizi attivi"}
                  {wizardStep === 2 && (() => {
                    const svc = WIZARD_SERVICES.find(s => s.key === wizardSelected[wizardFormIdx]);
                    return `Passo 2 (${wizardFormIdx + 1}/${wizardSelected.length}) — ${svc?.label ?? ""}`;
                  })()}
                  {wizardStep === "conclusivo" && "Censimento completato"}
                </span>
              </div>
              <button onClick={() => setWizardOpen(false)}
                className="hover:opacity-60 transition-opacity"
                style={{ color:"#9AA3BD", fontSize:"20px", lineHeight:1 }}>✕</button>
            </div>

            {/* Body */}
            <div className="px-6 py-6">

              {/* ── Step 0: Welcome ─────────────────────────────── */}
              {wizardStep === 0 && (
                <div className="space-y-6">
                  <p className="text-sm" style={{ color:"#9AA3BD" }}>
                    Questo wizard ti guida nella registrazione guidata dei principali fornitori critici della struttura in pochi passi.
                  </p>
                  <div className="space-y-3">
                    {[
                      { n:"1", t:"Seleziona i servizi attivi",    d:"Indica quali servizi e categorie di fornitori sono presenti in struttura." },
                      { n:"2", t:"Inserisci i dati del fornitore", d:"Per ogni servizio, compila i dati essenziali: ragione sociale, DPA, data residency." },
                      { n:"3", t:"Salva in un colpo solo",         d:"Tutti i fornitori vengono registrati nel Registro Fornitori GDPR-ready." },
                    ].map(s => (
                      <div key={s.n} className="flex gap-4 p-4 rounded"
                        style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                        <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background:"rgba(217,178,90,0.15)", color:T.bronze }}>{s.n}</span>
                        <div>
                          <p className="text-sm font-semibold" style={{ color:"#EEF1F8" }}>{s.t}</p>
                          <p className="text-xs mt-0.5" style={{ color:"#9AA3BD" }}>{s.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setWizardOpen(false)}
                      className="text-sm px-4 py-2 font-semibold" style={{ color:"#9AA3BD" }}>
                      Annulla
                    </button>
                    <button onClick={() => setWizardStep(1)}
                      className="text-sm px-5 py-2.5 font-bold uppercase tracking-widest"
                      style={{ background:T.bronze, color:"white", borderRadius:"4px" }}>
                      Inizia il censimento →
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 1: Selezione servizi ────────────────────── */}
              {wizardStep === 1 && (
                <div className="space-y-5">
                  <p className="text-xs" style={{ color:"#9AA3BD" }}>
                    Seleziona tutti i servizi/forniture attive nella struttura. Puoi aggiungerne altri in seguito.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {WIZARD_SERVICES.map(svc => {
                      const isSel = wizardSelected.includes(svc.key);
                      return (
                        <button key={svc.key}
                          onClick={() => setWizardSelected(prev =>
                            isSel ? prev.filter(k => k !== svc.key) : [...prev, svc.key]
                          )}
                          className="flex items-start gap-3 p-3 rounded text-left transition-all"
                          style={{
                            background: isSel ? "rgba(217,178,90,0.08)" : "rgba(255,255,255,0.03)",
                            border: isSel ? "1px solid rgba(217,178,90,0.3)" : "1px solid rgba(255,255,255,0.06)",
                          }}>
                          <span className="text-xl flex-shrink-0 mt-0.5">{svc.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate"
                              style={{ color: isSel ? T.bronze : "#EEF1F8" }}>{svc.label}</p>
                            <p className="text-xs mt-0.5" style={{ color:"#9AA3BD", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{svc.desc}</p>
                          </div>
                          <span className="flex-shrink-0 w-4 h-4 rounded-sm flex items-center justify-center text-xs mt-0.5 font-bold"
                            style={{ background: isSel ? T.bronze : "rgba(255,255,255,0.08)", color:"white" }}>
                            {isSel ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs" style={{ color:"#9AA3BD" }}>
                      <span className="font-bold" style={{ color:"#EEF1F8" }}>{wizardSelected.length}</span> servizi selezionati
                    </span>
                    <div className="flex gap-3">
                      <button onClick={() => setWizardStep(0)}
                        className="text-sm px-4 py-2 font-semibold" style={{ color:"#9AA3BD" }}>
                        ← Indietro
                      </button>
                      <button
                        onClick={() => { setWizardFormIdx(0); setWizardStep(2); }}
                        disabled={wizardSelected.length === 0}
                        className="text-sm px-5 py-2.5 font-bold uppercase tracking-widest disabled:opacity-40"
                        style={{ background:T.bronze, color:"white", borderRadius:"4px" }}>
                        Avanti ({wizardSelected.length}) →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 2: Form per servizio ────────────────────── */}
              {wizardStep === 2 && (() => {
                const serviceKey = wizardSelected[wizardFormIdx];
                const svc = WIZARD_SERVICES.find(s => s.key === serviceKey);
                if (!svc || !serviceKey) return null;
                const form: WizardServiceForm = wizardForms[serviceKey] ?? WIZARD_FORM_INIT;
                const setField = <K extends keyof WizardServiceForm>(field: K, value: WizardServiceForm[K]) =>
                  setWizardForms(prev => ({ ...prev, [serviceKey]: { ...(prev[serviceKey] ?? WIZARD_FORM_INIT), [field]: value } }));
                const isLast = wizardFormIdx === wizardSelected.length - 1;

                return (
                  <div className="space-y-5">
                    {/* Header servizio + progress */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{svc.icon}</span>
                        <div>
                          <p className="text-sm font-bold" style={{ color:"#EEF1F8" }}>{svc.label}</p>
                          <p className="text-xs" style={{ color:"#9AA3BD" }}>{CAT_LABELS[svc.categoria]}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded"
                        style={{ background:"rgba(255,255,255,0.05)", color:"#9AA3BD" }}>
                        {wizardFormIdx + 1} / {wizardSelected.length}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 rounded-full" style={{ background:"rgba(255,255,255,0.06)" }}>
                      <div className="h-1 rounded-full transition-all"
                        style={{ width:`${((wizardFormIdx + 1) / wizardSelected.length) * 100}%`, background:T.bronze }} />
                    </div>

                    {/* Campi */}
                    <div className="space-y-4">
                      <div>
                        <label className="block mb-1.5" style={labelStyle}>
                          Ragione Sociale <span style={{ color:T.critical }}>*</span>
                        </label>
                        <input type="text" value={form.ragione_sociale}
                          onChange={e => setField("ragione_sociale", e.target.value)}
                          placeholder="Es. Mario Rossi S.r.l."
                          className="w-full px-3 py-2.5 text-sm outline-none"
                          style={inputStyle} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block mb-1.5" style={labelStyle}>P.IVA</label>
                          <input type="text" value={form.piva}
                            onChange={e => setField("piva", e.target.value)}
                            placeholder="IT12345678901"
                            className="w-full px-3 py-2.5 text-sm outline-none"
                            style={inputStyle} />
                        </div>
                        <div>
                          <label className="block mb-1.5" style={labelStyle}>Email fornitore</label>
                          <input type="email" value={form.email}
                            onChange={e => setField("email", e.target.value)}
                            placeholder="privacy@fornitore.it"
                            className="w-full px-3 py-2.5 text-sm outline-none"
                            style={inputStyle} />
                        </div>
                      </div>

                      <div>
                        <label className="block mb-1.5" style={labelStyle}>Referente interno</label>
                        <input type="text" value={form.referente}
                          onChange={e => setField("referente", e.target.value)}
                          placeholder="Nome e cognome del responsabile interno"
                          className="w-full px-3 py-2.5 text-sm outline-none"
                          style={inputStyle} />
                      </div>

                      <div>
                        <label className="block mb-1.5" style={labelStyle}>Data Residency</label>
                        <select value={form.data_residency}
                          onChange={e => setField("data_residency", e.target.value as DataResidency | "")}
                          className="w-full px-3 py-2.5 text-sm outline-none"
                          style={inputStyle}>
                          <option value="">— Seleziona —</option>
                          <option value="EU">UE (dati in Europa)</option>
                          <option value="EXTRA_EU">Extra-UE (dati fuori Europa)</option>
                          <option value="NON_NOTO">Non noto</option>
                        </select>
                      </div>

                      <div>
                        <label className="block mb-2" style={labelStyle}>Dati trattati</label>
                        <div className="flex flex-wrap gap-2">
                          {(["SANITARI","PERSONALI","AMMINISTRATIVI","FINANZIARI"] as const).map(d => {
                            const checked = form.dati_trattati.includes(d);
                            return (
                              <button key={d}
                                onClick={() => setField("dati_trattati", checked
                                  ? form.dati_trattati.filter(x => x !== d)
                                  : [...form.dati_trattati, d])}
                                className="text-xs px-3 py-1 rounded font-semibold transition-all"
                                style={{
                                  background: checked ? "rgba(217,178,90,0.12)" : "rgba(255,255,255,0.05)",
                                  border: checked ? "1px solid rgba(217,178,90,0.3)" : "1px solid rgba(255,255,255,0.08)",
                                  color: checked ? T.bronze : "#9AA3BD",
                                }}>
                                {d.charAt(0) + d.slice(1).toLowerCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={() => setField("dpa_firmato", !form.dpa_firmato)}
                          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: form.dpa_firmato ? T.bronze : "rgba(255,255,255,0.06)",
                            border: form.dpa_firmato ? "none" : "1px solid rgba(255,255,255,0.12)",
                          }}>
                          {form.dpa_firmato && <span className="text-white text-xs font-bold">✓</span>}
                        </button>
                        <span className="text-sm cursor-pointer" style={{ color:"#EEF1F8" }}
                          onClick={() => setField("dpa_firmato", !form.dpa_firmato)}>
                          DPA (Data Processing Agreement) già firmato
                        </span>
                      </div>
                    </div>

                    {wizardError && (
                      <p className="text-xs px-3 py-2 rounded"
                        style={{ background:T.critBg, color:T.critical }}>{wizardError}</p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => {
                          if (wizardFormIdx > 0) setWizardFormIdx(wizardFormIdx - 1);
                          else setWizardStep(1);
                        }}
                        className="text-sm px-4 py-2 font-semibold" style={{ color:"#9AA3BD" }}>
                        ← Indietro
                      </button>
                      {isLast ? (
                        <button
                          onClick={saveWizardFornitore}
                          disabled={savingWizard || !form.ragione_sociale.trim()}
                          className="text-sm px-5 py-2.5 font-bold uppercase tracking-widest disabled:opacity-40"
                          style={{ background:T.bronze, color:"white", borderRadius:"4px" }}>
                          {savingWizard ? "Salvataggio..." : "Salva tutto ✓"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setWizardFormIdx(wizardFormIdx + 1)}
                          disabled={!form.ragione_sociale.trim()}
                          className="text-sm px-5 py-2.5 font-bold uppercase tracking-widest disabled:opacity-40"
                          style={{ background:T.bronze, color:"white", borderRadius:"4px" }}>
                          Avanti →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Conclusivo ───────────────────────────────────── */}
              {wizardStep === "conclusivo" && (
                <div className="space-y-6 text-center py-4">
                  <div className="text-5xl">🎉</div>
                  <div>
                    <p className="text-lg font-bold" style={{ color:"#EEF1F8" }}>Censimento completato!</p>
                    <p className="text-sm mt-1" style={{ color:"#9AA3BD" }}>
                      Hai registrato{" "}
                      <span className="font-bold" style={{ color:T.bronze }}>{wizardSaved}</span>{" "}
                      {wizardSaved === 1 ? "fornitore" : "fornitori"} nel Registro Fornitori.
                    </p>
                  </div>
                  <div className="p-4 rounded text-left space-y-2"
                    style={{ background:"rgba(62,207,142,0.06)", border:"1px solid rgba(62,207,142,0.15)" }}>
                    <p className="text-xs font-semibold" style={{ color:T.low }}>✓ Cosa è stato fatto</p>
                    <ul className="text-xs space-y-1" style={{ color:"#9AA3BD" }}>
                      <li>• Fornitori aggiunti al Registro Fornitori</li>
                      <li>• Rischio lordo e netto calcolato automaticamente</li>
                      <li>• Servizi associati alla struttura corrente</li>
                    </ul>
                  </div>
                  <p className="text-xs" style={{ color:"#9AA3BD" }}>
                    Puoi completare i dettagli di ogni fornitore direttamente dalla lista.
                  </p>
                  <button
                    onClick={() => { setWizardOpen(false); router.replace("/fornitori"); }}
                    className="text-sm px-6 py-2.5 font-bold uppercase tracking-widest"
                    style={{ background:T.bronze, color:"white", borderRadius:"4px" }}>
                    Chiudi e vai al registro
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      </main>
    </AppShell>
  );
}
