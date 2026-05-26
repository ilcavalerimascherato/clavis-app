"use client";

/**
 * CLAVIS — /societa
 * Anagrafica completa società + struttura.
 * Fonte dati per generazione documenti — compilare una volta, usato ovunque.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EntitySelector } from "@/components/EntitySelector";
import { useActiveEntity } from "@/contexts/EntityContext";

// ─── DESIGN TOKENS
const T = {
  navy:      "#0A0E1A",
  navyLight: "#0F1424",
  slate100:  "#141B30",
  slate200:  "rgba(238,241,248,.16)",
  slate400:  "#9AA3BD",
  slate600:  "#9AA3BD",
  slate800:  "#EEF1F8",
  bronze:    "#D9B25A",
  bronzeBg:  "rgba(217,178,90,.12)",
  high:      "#5E86F5",
  highBg:    "rgba(94,134,245,.12)",
  low:       "#3ECF8E",
  lowBg:     "rgba(62,207,142,.10)",
  critical:  "#E8634A",
  critBg:    "rgba(232,99,74,.12)",
};

// ─── TIPI

interface CompanyFields {
  name: string;
  vat_number: string | null;
  legal_address: string | null;
  region: string | null;
  country: string | null;
  codice_fiscale: string | null;
  pec: string | null;
  legale_rappresentante: string | null;
  fatturato_fascia: string | null;
  n_dipendenti_fascia: string | null;
  modello_231: string | null;
  storico_violazioni: boolean;
  storico_violazioni_note: string | null;
}

interface EntityFields {
  name: string;
  entity_type: string | null;
  region: string | null;
  total_beds: number | null;
  address: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  n_ospiti: string | null;
  n_dipendenti: string | null;
  convenzione_ssn: boolean;
  tipo_convenzione: string | null;
  gestione_it: string | null;
  responsabile_it: string | null;
  email_responsabile_it: string | null;
  nome_dpo: string | null;
  email_dpo: string | null;
  dpo_qualifica: string | null;
  dpo_telefono: string | null;
}

// ─── FIELD ROW
function FieldRow({
  label, sublabel, value, onChange, type = "text", required = false, placeholder,
}: {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const isEmpty = !value || value.trim() === "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>
          {label}
        </label>
        {required && isEmpty && (
          <span className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "9px" }}>
            MANCANTE
          </span>
        )}
        {!isEmpty && (
          <span className="text-xs" style={{ color: T.low, fontSize: "10px" }}>✓</span>
        )}
      </div>
      {sublabel && (
        <p className="text-xs leading-snug" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}...`}
        className="w-full px-3 py-2 text-sm outline-none transition-all"
        style={{
          backgroundColor: isEmpty ? "rgba(232,99,74,.05)" : "rgba(238,241,248,.06)",
          border: `1px solid ${isEmpty && required ? "rgba(232,99,74,.3)" : T.slate200}`,
          borderRadius: "4px",
          color: T.slate800,
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ─── SELECT ROW
function SelectRow({
  label, sublabel, value, onChange, options, required = false,
}: {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  const isEmpty = !value || value.trim() === "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>
          {label}
        </label>
        {required && isEmpty && (
          <span className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "9px" }}>
            MANCANTE
          </span>
        )}
        {!isEmpty && (
          <span className="text-xs" style={{ color: T.low, fontSize: "10px" }}>✓</span>
        )}
      </div>
      {sublabel && (
        <p className="text-xs leading-snug" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm outline-none transition-all"
        style={{
          backgroundColor: "rgba(238,241,248,.06)",
          border: `1px solid ${T.slate200}`,
          borderRadius: "4px",
          color: value ? T.slate800 : T.slate400,
          colorScheme: "dark",
          fontFamily: "inherit",
        }}
      >
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── SEZIONE CARD
function SectionCard({
  title, subtitle, icon, children, completeness,
}: {
  title: string;
  subtitle: string;
  icon: string;
  children: React.ReactNode;
  completeness: number; // 0-100
}) {
  const color = completeness === 100 ? T.low : completeness >= 60 ? T.bronze : T.critical;
  return (
    <div className="border flex flex-col"
      style={{
        backgroundColor: "var(--ink2, #0F1424)",
        borderColor: T.slate200,
        borderRadius: "6px",
        borderLeftWidth: "3px",
        borderLeftColor: color,
        borderLeftStyle: "solid",
      }}>
      {/* Header sezione */}
      <div className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>{title}</p>
            <p className="text-xs" style={{ color: T.slate400 }}>{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-20 h-1.5 rounded-full" style={{ backgroundColor: T.slate200 }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${completeness}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs font-mono" style={{ color, fontSize: "10px" }}>
            {completeness}%
          </span>
        </div>
      </div>
      {/* Contenuto */}
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

// ─── TOGGLE
function Toggle({ label, sublabel, value, onChange }: {
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 col-span-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>{label}</p>
        {sublabel && <p className="text-xs mt-0.5" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="flex-shrink-0 transition-all"
        style={{
          width: "40px", height: "22px", borderRadius: "11px",
          backgroundColor: value ? T.low : T.slate200,
          position: "relative",
        }}>
        <div style={{
          position: "absolute", top: "3px",
          left: value ? "20px" : "3px",
          width: "16px", height: "16px", borderRadius: "50%",
          backgroundColor: "white",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

// ─── MAIN

export default function SocietaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { entityVersion } = useActiveEntity();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; email: string; tier: string } | null>(null);

  const [company, setCompany] = useState<CompanyFields>({
    name: "", vat_number: null, legal_address: null, region: null, country: "IT",
    codice_fiscale: null, pec: null, legale_rappresentante: null,
    fatturato_fascia: null, n_dipendenti_fascia: null, modello_231: null,
    storico_violazioni: false, storico_violazioni_note: null,
  });

  const [entity, setEntity] = useState<EntityFields>({
    name: "", entity_type: null, region: null, total_beds: null, address: null,
    vat_number: null, fiscal_code: null, n_ospiti: null, n_dipendenti: null,
    convenzione_ssn: false, tipo_convenzione: null, gestione_it: null,
    responsabile_it: null, email_responsabile_it: null,
    nome_dpo: null, email_dpo: null, dpo_qualifica: null, dpo_telefono: null,
  });

  // ─── LOAD
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profData } = await supabase
        .from("profiles").select("full_name, email, tier").eq("id", user.id).single();
      if (profData) setProfile(profData as any);

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("*").eq("id", storedEntityId).single()
        : supabase.from("entities").select("*").eq("created_by", user.id).limit(1).single();
      const { data: entityData } = await entityQuery;
      if (!entityData) { router.push("/onboarding"); return; }

      setEntityId(entityData.id);
      setEntity({
        name: entityData.name ?? "",
        entity_type: entityData.entity_type ?? null,
        region: entityData.region ?? null,
        total_beds: entityData.total_beds ?? null,
        address: entityData.address ?? null,
        vat_number: entityData.vat_number ?? null,
        fiscal_code: entityData.fiscal_code ?? null,
        n_ospiti: entityData.n_ospiti ?? null,
        n_dipendenti: entityData.n_dipendenti ?? null,
        convenzione_ssn: entityData.convenzione_ssn ?? false,
        tipo_convenzione: entityData.tipo_convenzione ?? null,
        gestione_it: entityData.gestione_it ?? null,
        responsabile_it: entityData.responsabile_it ?? null,
        email_responsabile_it: entityData.email_responsabile_it ?? null,
        nome_dpo: entityData.nome_dpo ?? null,
        email_dpo: entityData.email_dpo ?? null,
        dpo_qualifica: entityData.dpo_qualifica ?? null,
        dpo_telefono: entityData.dpo_telefono ?? null,
      });

      const { data: compData } = await supabase
        .from("companies").select("*").eq("id", entityData.company_id).single();
      if (compData) {
        setCompanyId(compData.id);
        setCompany({
          name: compData.name ?? "",
          vat_number: compData.vat_number ?? null,
          legal_address: compData.legal_address ?? null,
          region: compData.region ?? null,
          country: compData.country ?? "IT",
          codice_fiscale: compData.codice_fiscale ?? null,
          pec: compData.pec ?? null,
          legale_rappresentante: compData.legale_rappresentante ?? null,
          fatturato_fascia: compData.fatturato_fascia ?? null,
          n_dipendenti_fascia: compData.n_dipendenti_fascia ?? null,
          modello_231: compData.modello_231 ?? null,
          storico_violazioni: compData.storico_violazioni ?? false,
          storico_violazioni_note: compData.storico_violazioni_note ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── SAVE
  async function handleSave() {
    if (!entityId || !companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        supabase.from("companies").update({
          name: company.name,
          vat_number: company.vat_number,
          legal_address: company.legal_address,
          region: company.region,
          codice_fiscale: company.codice_fiscale,
          pec: company.pec,
          legale_rappresentante: company.legale_rappresentante,
          fatturato_fascia: company.fatturato_fascia,
          n_dipendenti_fascia: company.n_dipendenti_fascia,
          modello_231: company.modello_231,
          storico_violazioni: company.storico_violazioni,
          storico_violazioni_note: company.storico_violazioni_note,
        }).eq("id", companyId),
        supabase.from("entities").update({
          name: entity.name,
          entity_type: entity.entity_type,
          region: entity.region,
          total_beds: entity.total_beds,
          address: entity.address,
          n_ospiti: entity.n_ospiti,
          n_dipendenti: entity.n_dipendenti,
          convenzione_ssn: entity.convenzione_ssn,
          tipo_convenzione: entity.tipo_convenzione,
          gestione_it: entity.gestione_it,
          responsabile_it: entity.responsabile_it,
          email_responsabile_it: entity.email_responsabile_it,
          nome_dpo: entity.nome_dpo,
          email_dpo: entity.email_dpo,
          dpo_qualifica: entity.dpo_qualifica,
          dpo_telefono: entity.dpo_telefono,
        }).eq("id", entityId),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  // ─── COMPLETENESS
  function calcCompleteness(fields: (string | null | boolean | number | undefined)[], required: number): number {
    const filled = fields.filter(f => f !== null && f !== undefined && f !== "" && f !== 0).length;
    return Math.round((filled / required) * 100);
  }

  const companyCompleteness = calcCompleteness([
    company.name, company.vat_number, company.legal_address,
    company.codice_fiscale, company.pec, company.legale_rappresentante,
    company.fatturato_fascia, company.n_dipendenti_fascia,
  ], 8);

  const entityCompleteness = calcCompleteness([
    entity.name, entity.entity_type, entity.region, entity.total_beds,
    entity.n_ospiti, entity.n_dipendenti, entity.gestione_it,
  ], 7);

  const referentiCompleteness = calcCompleteness([
    entity.nome_dpo, entity.email_dpo, entity.dpo_qualifica,
    entity.responsabile_it, entity.email_responsabile_it,
  ], 5);

  const totalCompleteness = Math.round((companyCompleteness + entityCompleteness + referentiCompleteness) / 3);

  // ─── HELPERS
  const cv = (v: string | null | undefined) => v ?? "";
  const sc = (field: keyof CompanyFields) => (v: string) =>
    setCompany(prev => ({ ...prev, [field]: v || null }));
  const se = (field: keyof EntityFields) => (v: string) =>
    setEntity(prev => ({ ...prev, [field]: v || null }));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--ink, #0A0E1A)" }}>

      {/* TOPBAR */}
      <header className="flex-shrink-0 border-b flex items-center justify-between px-6 py-3"
        style={{ borderColor: T.slate200, backgroundColor: "var(--ink2, #0F1424)", height: "52px" }}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")}
            className="text-xs font-mono uppercase tracking-widest transition-opacity hover:opacity-60"
            style={{ color: T.slate400 }}>
            ← Dashboard
          </button>
          <span style={{ color: T.slate200 }}>|</span>
          <div>
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>
              Anagrafica
            </span>
            <span className="text-xs ml-1" style={{ color: T.slate400 }}>(Company Profile)</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EntitySelector />
          {/* Completeness globale */}
          <div className="flex items-center gap-2 px-3 py-1.5 border"
            style={{
              borderColor: totalCompleteness === 100 ? "rgba(62,207,142,.3)" : T.slate200,
              borderRadius: "4px",
              backgroundColor: totalCompleteness === 100 ? T.lowBg : "transparent",
            }}>
            <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: T.slate200 }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${totalCompleteness}%`,
                  backgroundColor: totalCompleteness === 100 ? T.low : totalCompleteness >= 60 ? T.bronze : T.critical,
                }} />
            </div>
            <span className="text-xs font-mono"
              style={{
                color: totalCompleteness === 100 ? T.low : totalCompleteness >= 60 ? T.bronze : T.critical,
                fontSize: "10px",
              }}>
              {totalCompleteness}% completo
            </span>
          </div>
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all"
            style={{
              backgroundColor: saved ? T.lowBg : "var(--shield, #3A6DF0)",
              color: saved ? T.low : "var(--bone, #EEF1F8)",
              borderRadius: "4px",
              border: saved ? `1px solid rgba(62,207,142,.4)` : "none",
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? "Salvataggio..." : saved ? "✓ Salvato" : "Salva →"}
          </button>
        </div>
      </header>

      {/* NOTA CONTESTUALE */}
      <div className="flex-shrink-0 px-6 py-3 border-b"
        style={{ borderColor: T.slate200, backgroundColor: "rgba(94,134,245,.06)" }}>
        <p className="text-xs" style={{ color: "#7BA7D4" }}>
          ℹ I dati inseriti qui vengono usati automaticamente per la generazione dei documenti (Nomina DPO, BCP, delibere CdA, policy).
          Compilali una volta sola — non verranno più richiesti nel modal di generazione.
        </p>
      </div>

      {/* CONTENUTO */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-4xl w-full mx-auto">

        {/* ── 1. SOCIETÀ */}
        <SectionCard
          title="Società" subtitle="(Legal Entity)" icon="🏢"
          completeness={companyCompleteness}>

          <FieldRow label="Ragione Sociale" required value={cv(company.name)}
            onChange={sc("name")} placeholder="Es. Test Gold Srl" />

          <FieldRow label="P.IVA" required value={cv(company.vat_number)}
            onChange={sc("vat_number")} placeholder="Es. 12345678901" />

          <FieldRow label="Codice Fiscale" value={cv(company.codice_fiscale)}
            onChange={sc("codice_fiscale")} placeholder="Se diverso da P.IVA" />

          <FieldRow label="PEC" type="email" value={cv(company.pec)}
            onChange={sc("pec")} placeholder="pec@società.it"
            sublabel="Usata per comunicazioni ufficiali con Garante e ACN" />

          <div className="col-span-2">
            <FieldRow label="Sede Legale" required value={cv(company.legal_address)}
              onChange={sc("legal_address")} placeholder="Via, Città, CAP" />
          </div>

          <FieldRow label="Legale Rappresentante" required value={cv(company.legale_rappresentante)}
            onChange={sc("legale_rappresentante")} placeholder="Nome Cognome"
            sublabel="Firma i documenti societari (Nomina DPO, delibere CdA)" />

          <SelectRow label="Fatturato Annuo" value={cv(company.fatturato_fascia)}
            onChange={sc("fatturato_fascia")}
            options={["Sotto 2M", "2M_5M", "5M_20M", "20M_50M", "Oltre 50M"]}
            sublabel="Incide sul calcolo sanzioni NIS2/GDPR" />

          <SelectRow label="Dipendenti totali società (fascia)" value={cv(company.n_dipendenti_fascia)}
            onChange={sc("n_dipendenti_fascia")}
            options={["Meno di 20", "20_49", "50_249", "250 o più"]}
            sublabel="Dato societario complessivo — soglia 50 = soggetto NIS2" />

          <div className="col-span-2">
            <SelectRow label="Modello 231" value={cv(company.modello_231)}
              onChange={sc("modello_231")}
              options={[
                "Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)",
                "In corso di adozione", "No",
              ]}
              sublabel="Responsabilità amministrativa dell'ente — D.Lgs. 231/2001" />
          </div>

          <div className="col-span-2">
            <Toggle
              label="Storico violazioni normative"
              sublabel="La struttura ha ricevuto sanzioni o contestazioni da Garante/ACN negli ultimi 3 anni"
              value={company.storico_violazioni}
              onChange={v => setCompany(prev => ({ ...prev, storico_violazioni: v }))} />
          </div>

          {company.storico_violazioni && (
            <div className="col-span-2">
              <FieldRow label="Note violazioni" value={cv(company.storico_violazioni_note)}
                onChange={sc("storico_violazioni_note")}
                placeholder="Breve descrizione — incide sul calcolo del rischio" />
            </div>
          )}
        </SectionCard>

        {/* ── 2. STRUTTURA */}
        <SectionCard
          title="Struttura Sanitaria" subtitle="(Facility)" icon="🏥"
          completeness={entityCompleteness}>

          <FieldRow label="Nome Struttura" required value={cv(entity.name)}
            onChange={se("name")} placeholder="Es. RSA Test Gold" />

          <SelectRow label="Tipologia" required value={cv(entity.entity_type)}
            onChange={se("entity_type")}
            options={[
              "RSA", "RSSA", "CDI", "Hospice", "OdC", "RSD", "CSS", "CDD", "CSE",
              "Comunità Alloggio Disabili", "CRA", "CRM", "SRP", "CPS", "SPDC",
              "REMS", "SerD", "CT", "Comunità Educativa Minori", "Casa Famiglia",
              "ADI", "Poliambulatorio / ex art.26", "Altro",
            ]} />

          <SelectRow label="Regione" required value={cv(entity.region)}
            onChange={se("region")}
            options={[
              "Lombardia", "Veneto", "Lazio", "Piemonte", "Emilia-Romagna",
              "Toscana", "Campania", "Sicilia", "Liguria", "Marche", "Abruzzo",
              "Puglia", "Calabria", "Sardegna", "Friuli-Venezia Giulia",
              "Trentino-Alto Adige", "Umbria", "Basilicata", "Molise", "Valle d'Aosta",
            ]} />

          <FieldRow label="Posti letto / Ospiti max" required value={entity.total_beds?.toString() ?? ""}
            onChange={v => setEntity(prev => ({ ...prev, total_beds: v ? parseInt(v) : null }))}
            type="number" placeholder="Es. 60" />

          <div className="col-span-2">
            <FieldRow label="Indirizzo struttura" value={cv(entity.address)}
              onChange={se("address")} placeholder="Via, Città, CAP" />
          </div>

          <SelectRow label="Dipendenti in questa struttura (fascia)" value={cv(entity.n_dipendenti)}
            onChange={se("n_dipendenti")}
            options={["Meno di 20", "20–49", "50–249", "250 o più"]}
            sublabel="Riferito solo a questa sede" />

          <SelectRow label="Gestione IT" value={cv(entity.gestione_it)}
            onChange={se("gestione_it")}
            options={[
              "Completamente interna", "Completamente esternalizzata",
              "Mista (interna + fornitori)", "Non strutturata / non so",
            ]}
            sublabel="Determina perimetro NIS2 supply chain" />

          <div className="col-span-2">
            <Toggle
              label="Convenzione SSN/SSR"
              sublabel="La struttura opera in convenzione con il Servizio Sanitario Nazionale o Regionale"
              value={entity.convenzione_ssn}
              onChange={v => setEntity(prev => ({ ...prev, convenzione_ssn: v }))} />
          </div>

          {entity.convenzione_ssn && (
            <SelectRow label="Tipo convenzione" value={cv(entity.tipo_convenzione)}
              onChange={se("tipo_convenzione")}
              options={["SSN", "SSR", "Entrambi"]} />
          )}
        </SectionCard>

        {/* ── 3. REFERENTI — dati usati nei documenti */}
        <SectionCard
          title="Referenti e Responsabili" subtitle="(Key Contacts)" icon="👤"
          completeness={referentiCompleteness}>

          {/* DPO */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
              <span className="text-xs font-mono uppercase tracking-widest px-2"
                style={{ color: T.bronze, fontSize: "10px" }}>
                DPO — Responsabile Protezione Dati
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
            </div>
          </div>

          <FieldRow label="Nome DPO" required value={cv(entity.nome_dpo)}
            onChange={se("nome_dpo")} placeholder="Nome Cognome"
            sublabel="Obbligatorio per strutture sanitarie (Art. 37 GDPR)" />

          <FieldRow label="Email DPO" required type="email" value={cv(entity.email_dpo)}
            onChange={se("email_dpo")} placeholder="dpo@struttura.it"
            sublabel="Da pubblicare sul sito e comunicare al Garante" />

          <SelectRow label="Qualifica DPO" required value={cv(entity.dpo_qualifica)}
            onChange={se("dpo_qualifica")}
            options={["Dipendente interno", "Consulente esterno", "Società esterna"]}
            sublabel="Il GDPR distingue DPO interno da esterno — incide sulle clausole contrattuali" />

          <FieldRow label="Telefono DPO" value={cv(entity.dpo_telefono)}
            onChange={se("dpo_telefono")} placeholder="+39 ..." />

          {/* Responsabile IT */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3 mt-2">
              <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
              <span className="text-xs font-mono uppercase tracking-widest px-2"
                style={{ color: T.bronze, fontSize: "10px" }}>
                Responsabile IT / Sicurezza
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
            </div>
          </div>

          <FieldRow label="Nome Responsabile IT" value={cv(entity.responsabile_it)}
            onChange={se("responsabile_it")} placeholder="Nome Cognome o Società"
            sublabel="Usato in BCP, IRP e policy tecniche" />

          <FieldRow label="Email Responsabile IT" type="email" value={cv(entity.email_responsabile_it)}
            onChange={se("email_responsabile_it")} placeholder="it@struttura.it" />

        </SectionCard>

        {/* Spazio finale */}
        <div className="h-8" />
      </div>

      {/* SAVE BOTTOM — per schermi piccoli */}
      <div className="flex-shrink-0 border-t px-6 py-3 flex items-center justify-between"
        style={{ borderColor: T.slate200, backgroundColor: "var(--ink2, #0F1424)" }}>
        <p className="text-xs" style={{ color: T.slate400 }}>
          {totalCompleteness < 100
            ? `${8 - Math.round(8 * totalCompleteness / 100)} campi obbligatori mancanti — i documenti generati avranno spazi vuoti`
            : "✓ Anagrafica completa — tutti i documenti verranno generati con i dati reali"}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-xs font-bold uppercase tracking-widest transition-all"
          style={{
            backgroundColor: saved ? T.lowBg : "var(--shield, #3A6DF0)",
            color: saved ? T.low : "var(--bone, #EEF1F8)",
            borderRadius: "4px",
            border: saved ? `1px solid rgba(62,207,142,.4)` : "none",
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? "Salvataggio..." : saved ? "✓ Salvato" : "Salva →"}
        </button>
      </div>
    </div>
  );
}
