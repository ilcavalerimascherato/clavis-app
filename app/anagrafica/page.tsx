"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";

// ─── TIPI

interface Profile {
  id: string;
  full_name: string;
  email: string;
  tier: string;
}

interface CompanyData {
  id: string;
  name: string;
  vat_number: string | null;
  codice_fiscale: string | null;
  legal_address: string | null;
  pec: string | null;
  legale_rappresentante: string | null;
  nome_dpo: string | null;
  email_dpo: string | null;
  dpo_telefono: string | null;
  dpo_qualifica: string | null;
  legale_esterno: string | null;
  firmatario_dpa: string | null;
}

interface EntityData {
  id: string;
  company_id: string;
  name: string;
  entity_type: string | null;
  region: string | null;
  address: string | null;
  total_beds: number | null;
  n_ospiti: string | null;
  responsabile_it: string | null;
  email_responsabile_it: string | null;
  telefono_responsabile_it: string | null;
  referente_nis2_nome: string | null;
  referente_nis2_cognome: string | null;
  referente_nis2_email: string | null;
  referente_nis2_telefono: string | null;
  referente_breach: string | null;
  email_referente_breach: string | null;
  tel_referente_breach: string | null;
  direttore_sanitario: string | null;
  telefono_direttore_sanitario: string | null;
  direttore_struttura: string | null;
  telefono_direttore_struttura: string | null;
  responsabile_formazione: string | null;
  indirizzo: string | null;
  rto: string | null;
  rpo: string | null;
  frequenza_backup: string | null;
  tipo_backup: string | null;
  ubicazione_backup: string | null;
  fornitore_backup: string | null;
  ubicazione_registro_cartaceo: string | null;
  ubicazione_stampa_terapie: string | null;
  responsabile_ripristino: string | null;
  canale_segnalazione_incidenti: string | null;
}

const UDO_OPTIONS = [
  "RSA", "RSSA", "CDI", "Hospice", "OdC", "RSD", "CSS", "CDD", "CSE", "CRA",
  "CRM", "SRP", "CPS", "SPDC", "REMS", "SerD", "CT", "ADI",
  "Poliambulatorio / ex art.26", "Altro",
];

const REGION_OPTIONS = [
  "Lombardia", "Veneto", "Lazio", "Piemonte", "Emilia-Romagna", "Toscana",
  "Campania", "Sicilia", "Liguria", "Marche", "Abruzzo", "Puglia", "Calabria",
  "Sardegna", "Friuli-Venezia Giulia", "Trentino-Alto Adige", "Umbria",
  "Basilicata", "Molise", "Valle d'Aosta",
];

const DPO_QUALIFICA_OPTIONS = ["Dipendente interno", "Consulente esterno", "Società esterna"];

const N_OSPITI_OPTIONS = ["Meno di 20", "20–49", "50–99", "100–200", "Oltre 200"];

const RTO_RPO_OPTIONS = ["< 1 ora", "1-4 ore", "4-24 ore", "24-72 ore", "> 72 ore", "Non definito"];

const BACKUP_FREQ_OPTIONS = ["Giornaliera", "Settimanale", "Mensile", "Continua (real-time)", "Non definita"];

const BACKUP_TIPO_OPTIONS = ["Full", "Incrementale", "Differenziale", "Misto", "Non definito"];

// ─── HELPERS UI condivisi

const cv = (v: string | null | undefined) => v ?? "";

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>{label}</span>
      <span className="text-sm" style={{ color: empty ? T.slate400 : T.slate800 }}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function EditInput({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold" style={{ color: T.slate600 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full px-3 py-2 text-base outline-none rounded"
        style={{ backgroundColor: "rgba(238,241,248,.06)", border: `1px solid ${T.slate200}`, color: T.slate800 }}
      />
    </div>
  );
}

function EditSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold" style={{ color: T.slate600 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-base outline-none rounded"
        style={{ backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark", border: `1px solid ${T.slate200}`, color: value ? T.slate800 : T.slate400 }}
      >
        <option value="" style={{ backgroundColor: T.slate50, color: T.slate400 }}>— seleziona —</option>
        {options.map(o => <option key={o} value={o} style={{ backgroundColor: T.slate50, color: T.slate800 }}>{o}</option>)}
      </select>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 pb-0.5 border-b col-span-2" style={{ borderColor: T.slate200 }}>
      <p className="text-xs font-mono uppercase" style={{ color: T.bronze }}>{children}</p>
    </div>
  );
}

// ─── CARD generica (header + body inline, no modal)

function SectionCard({ icon, title, subtitle, justSaved, children, id }: {
  icon: string; title: string; subtitle: string; justSaved: boolean; children: React.ReactNode; id?: string;
}) {
  return (
    <div id={id} className="border rounded-md flex flex-col" style={{ backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200 }}>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-base font-bold" style={{ color: T.slate800 }}>{title}</p>
            <p className="text-sm italic" style={{ color: T.slate400 }}>{subtitle}</p>
          </div>
        </div>
        {justSaved && (
          <span className="text-sm font-bold" style={{ color: T.low }}>✓ Salvato</span>
        )}
      </div>
      <div className="px-5 py-5 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function CardActions({ editing, saving, onEdit, onCancel, onSave }: {
  editing: boolean; saving: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void;
}) {
  if (!editing) {
    return (
      <button
        onClick={onEdit}
        className="w-full py-2 text-base font-bold transition-opacity hover:opacity-80 rounded"
        style={{ backgroundColor: T.highBg, color: T.high, border: "1px solid rgba(94,134,245,.3)" }}
      >
        Modifica →
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        onClick={onCancel}
        disabled={saving}
        className="flex-1 py-2 text-base font-semibold transition-opacity hover:opacity-70 rounded"
        style={{ border: `1px solid ${T.slate200}`, color: T.slate600 }}
      >
        Annulla
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 py-2 text-base font-bold transition-opacity hover:opacity-80 rounded"
        style={{ backgroundColor: "var(--shield, #3A6DF0)", color: "var(--bone, #EEF1F8)", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Salvataggio..." : "Salva →"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 1 — SOCIETÀ
// ═══════════════════════════════════════════════════════════════

function SocietaSection({ company, onSave }: {
  company: CompanyData;
  onSave: (patch: CompanyData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyData>(company);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { if (!editing) setDraft(company); }, [company, editing]);

  const s = (field: keyof CompanyData) => (v: string) =>
    setDraft(prev => ({ ...prev, [field]: v || null }));

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <SectionCard id="anagrafica-societa" icon="🏢" title="Società" subtitle="Legal Entity" justSaved={justSaved}>
      {!editing ? (
        <>
          <ReadField label="Nome Società" value={company.name} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="P.IVA" value={company.vat_number} />
            <ReadField label="Codice Fiscale" value={company.codice_fiscale} />
          </div>
          <ReadField label="Sede Legale" value={company.legal_address} />
          <ReadField label="PEC" value={company.pec} />
          <ReadField label="Legale Rappresentante" value={company.legale_rappresentante} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Nome DPO" value={company.nome_dpo} />
            <ReadField label="Email DPO" value={company.email_dpo} />
            <ReadField label="Telefono DPO" value={company.dpo_telefono} />
            <ReadField label="Qualifica DPO" value={company.dpo_qualifica} />
          </div>
          <ReadField label="Legale Esterno" value={company.legale_esterno} />
          <ReadField label="Firmatario DPA" value={company.firmatario_dpa} />
        </>
      ) : (
        <>
          <EditInput label="Nome Società" value={cv(draft.name)} onChange={s("name")} placeholder="Es. Test Gold Srl" />
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="P.IVA" value={cv(draft.vat_number)} onChange={s("vat_number")} placeholder="12345678901" />
            <EditInput label="Codice Fiscale" value={cv(draft.codice_fiscale)} onChange={s("codice_fiscale")} placeholder="Se diverso da P.IVA" />
          </div>
          <EditInput label="Sede Legale" value={cv(draft.legal_address)} onChange={s("legal_address")} placeholder="Via, Città, CAP" />
          <EditInput label="PEC" type="email" value={cv(draft.pec)} onChange={s("pec")} placeholder="pec@società.it" />
          <EditInput label="Legale Rappresentante" value={cv(draft.legale_rappresentante)} onChange={s("legale_rappresentante")} placeholder="Nome Cognome" />
          <SubLabel>DPO — Responsabile Protezione Dati</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome DPO" value={cv(draft.nome_dpo)} onChange={s("nome_dpo")} placeholder="Nome Cognome" />
            <EditInput label="Email DPO" type="email" value={cv(draft.email_dpo)} onChange={s("email_dpo")} placeholder="dpo@struttura.it" />
            <EditInput label="Telefono DPO" value={cv(draft.dpo_telefono)} onChange={s("dpo_telefono")} placeholder="+39 ..." />
            <EditSelect label="Qualifica DPO" value={cv(draft.dpo_qualifica)} onChange={s("dpo_qualifica")} options={DPO_QUALIFICA_OPTIONS} />
          </div>
          <SubLabel>Altri referenti</SubLabel>
          <EditInput label="Legale Esterno" value={cv(draft.legale_esterno)} onChange={s("legale_esterno")} placeholder="Nome Cognome o Studio Legale" />
          <EditInput label="Firmatario DPA" value={cv(draft.firmatario_dpa)} onChange={s("firmatario_dpa")} placeholder="Nome Cognome" />
        </>
      )}
      <CardActions
        editing={editing} saving={saving}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={handleSave}
      />
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 2 — STRUTTURA
// ═══════════════════════════════════════════════════════════════

function StrutturaSection({ entity, onSave }: {
  entity: EntityData;
  onSave: (patch: EntityData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntityData>(entity);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { if (!editing) setDraft(entity); }, [entity, editing]);

  const s = (field: keyof EntityData) => (v: string) =>
    setDraft(prev => ({ ...prev, [field]: v || null } as EntityData));

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <SectionCard id="anagrafica-struttura" icon="🏥" title="Struttura" subtitle="Facility" justSaved={justSaved}>
      {!editing ? (
        <>
          <ReadField label="Nome Struttura" value={entity.name} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Tipo UDO" value={entity.entity_type} />
            <ReadField label="Regione" value={entity.region} />
          </div>
          <ReadField label="Indirizzo" value={entity.address} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Posti Letto" value={entity.total_beds?.toString()} />
            <ReadField label="Ospiti (fascia)" value={entity.n_ospiti} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Direttore Struttura" value={entity.direttore_struttura} />
            <ReadField label="Telefono Dir. Struttura" value={entity.telefono_direttore_struttura} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Direttore Sanitario" value={entity.direttore_sanitario} />
            <ReadField label="Telefono Dir. Sanitario" value={entity.telefono_direttore_sanitario} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Referente Data Breach" value={entity.referente_breach} />
            <ReadField label="Email Ref. Breach" value={entity.email_referente_breach} />
            <ReadField label="Telefono Ref. Breach" value={entity.tel_referente_breach} />
          </div>
          <ReadField label="Responsabile Formazione" value={entity.responsabile_formazione} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Responsabile IT" value={entity.responsabile_it} />
            <ReadField label="Email Responsabile IT" value={entity.email_responsabile_it} />
            <ReadField label="Telefono Resp. IT" value={entity.telefono_responsabile_it} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Referente NIS2 — Nome" value={entity.referente_nis2_nome} />
            <ReadField label="Referente NIS2 — Cognome" value={entity.referente_nis2_cognome} />
            <ReadField label="Email Referente NIS2" value={entity.referente_nis2_email} />
            <ReadField label="Telefono Referente NIS2" value={entity.referente_nis2_telefono} />
          </div>
        </>
      ) : (
        <>
          <EditInput label="Nome Struttura" value={cv(draft.name)} onChange={s("name")} placeholder="Es. RSA Test Gold" />
          <div className="grid grid-cols-2 gap-4">
            <EditSelect label="Tipo UDO" value={cv(draft.entity_type)} onChange={s("entity_type")} options={UDO_OPTIONS} />
            <EditSelect label="Regione" value={cv(draft.region)} onChange={s("region")} options={REGION_OPTIONS} />
          </div>
          <EditInput label="Indirizzo" value={cv(draft.address)} onChange={s("address")} placeholder="Via, Città, CAP" />
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Posti Letto" type="number" value={draft.total_beds?.toString() ?? ""}
              onChange={v => setDraft(prev => ({ ...prev, total_beds: v ? parseInt(v) : null }))} placeholder="Es. 60" />
            <EditSelect label="Ospiti (fascia)" value={cv(draft.n_ospiti)} onChange={s("n_ospiti")} options={N_OSPITI_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Direttore Struttura" value={cv(draft.direttore_struttura)} onChange={s("direttore_struttura")} placeholder="Nome Cognome" />
            <EditInput label="Telefono Dir. Struttura" value={cv(draft.telefono_direttore_struttura)} onChange={s("telefono_direttore_struttura")} placeholder="+39 ..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Direttore Sanitario" value={cv(draft.direttore_sanitario)} onChange={s("direttore_sanitario")} placeholder="Nome Cognome" />
            <EditInput label="Telefono Dir. Sanitario" value={cv(draft.telefono_direttore_sanitario)} onChange={s("telefono_direttore_sanitario")} placeholder="+39 ..." />
          </div>
          <SubLabel>Referente Data Breach — Art. 33 GDPR</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome" value={cv(draft.referente_breach)} onChange={s("referente_breach")} placeholder="Nome Cognome" />
            <EditInput label="Email" type="email" value={cv(draft.email_referente_breach)} onChange={s("email_referente_breach")} placeholder="breach@struttura.it" />
            <EditInput label="Telefono" value={cv(draft.tel_referente_breach)} onChange={s("tel_referente_breach")} placeholder="+39 ..." />
          </div>
          <EditInput label="Responsabile Formazione" value={cv(draft.responsabile_formazione)} onChange={s("responsabile_formazione")} placeholder="Nome Cognome" />
          <SubLabel>Responsabile IT</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome" value={cv(draft.responsabile_it)} onChange={s("responsabile_it")} placeholder="Nome Cognome o Società" />
            <EditInput label="Email" type="email" value={cv(draft.email_responsabile_it)} onChange={s("email_responsabile_it")} placeholder="it@struttura.it" />
            <EditInput label="Telefono" value={cv(draft.telefono_responsabile_it)} onChange={s("telefono_responsabile_it")} placeholder="+39 ..." />
          </div>
          <SubLabel>Referente NIS2 (facoltativo — se vuoto, la Scheda Registrazione ACN usa il Responsabile IT)</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome" value={cv(draft.referente_nis2_nome)} onChange={s("referente_nis2_nome")} placeholder="Nome" />
            <EditInput label="Cognome" value={cv(draft.referente_nis2_cognome)} onChange={s("referente_nis2_cognome")} placeholder="Cognome" />
            <EditInput label="Email" type="email" value={cv(draft.referente_nis2_email)} onChange={s("referente_nis2_email")} placeholder="nis2@struttura.it" />
            <EditInput label="Telefono" value={cv(draft.referente_nis2_telefono)} onChange={s("referente_nis2_telefono")} placeholder="+39 ..." />
          </div>
        </>
      )}
      <CardActions
        editing={editing} saving={saving}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={handleSave}
      />
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 3 — CONFIGURAZIONE IT
// ═══════════════════════════════════════════════════════════════

function ConfigItSection({ entity, onSave }: {
  entity: EntityData;
  onSave: (patch: EntityData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EntityData>(entity);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { if (!editing) setDraft(entity); }, [entity, editing]);

  const s = (field: keyof EntityData) => (v: string) =>
    setDraft(prev => ({ ...prev, [field]: v || null } as EntityData));

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <SectionCard id="anagrafica-config-it" icon="💾" title="Configurazione IT" subtitle="Disaster Recovery & Backup" justSaved={justSaved}>
      {!editing ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="RTO (Recovery Time Objective)" value={entity.rto} />
            <ReadField label="RPO (Recovery Point Objective)" value={entity.rpo} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Frequenza Backup" value={entity.frequenza_backup} />
            <ReadField label="Tipo Backup" value={entity.tipo_backup} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Ubicazione Backup" value={entity.ubicazione_backup} />
            <ReadField label="Fornitore Backup" value={entity.fornitore_backup} />
          </div>
          <ReadField label="Ubicazione Registro Cartaceo Emergenza" value={entity.ubicazione_registro_cartaceo} />
          <ReadField label="Ubicazione Ultima Stampa Terapie" value={entity.ubicazione_stampa_terapie} />
          <ReadField label="Responsabile Ripristino" value={entity.responsabile_ripristino} />
          <ReadField label="Canale Segnalazione Incidenti" value={entity.canale_segnalazione_incidenti} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <EditSelect label="RTO (Recovery Time Objective)" value={cv(draft.rto)} onChange={s("rto")} options={RTO_RPO_OPTIONS} />
            <EditSelect label="RPO (Recovery Point Objective)" value={cv(draft.rpo)} onChange={s("rpo")} options={RTO_RPO_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditSelect label="Frequenza Backup" value={cv(draft.frequenza_backup)} onChange={s("frequenza_backup")} options={BACKUP_FREQ_OPTIONS} />
            <EditSelect label="Tipo Backup" value={cv(draft.tipo_backup)} onChange={s("tipo_backup")} options={BACKUP_TIPO_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Ubicazione Backup" value={cv(draft.ubicazione_backup)} onChange={s("ubicazione_backup")} placeholder="Es. Cloud esterno, NAS locale..." />
            <EditInput label="Fornitore Backup" value={cv(draft.fornitore_backup)} onChange={s("fornitore_backup")} placeholder="Nome fornitore" />
          </div>
          <EditInput label="Ubicazione Registro Cartaceo Emergenza" value={cv(draft.ubicazione_registro_cartaceo)} onChange={s("ubicazione_registro_cartaceo")} placeholder="Es. Armadio ufficio direzione" />
          <EditInput label="Ubicazione Ultima Stampa Terapie" value={cv(draft.ubicazione_stampa_terapie)} onChange={s("ubicazione_stampa_terapie")} placeholder="Es. Faldone reparto A" />
          <EditInput label="Responsabile Ripristino" value={cv(draft.responsabile_ripristino)} onChange={s("responsabile_ripristino")} placeholder="Nome Cognome o Società" />
          <EditInput label="Canale Segnalazione Incidenti" value={cv(draft.canale_segnalazione_incidenti)} onChange={s("canale_segnalazione_incidenti")} placeholder="Es. email, telefono interno, ticketing..." />
        </>
      )}
      <CardActions
        editing={editing} saving={saving}
        onEdit={() => setEditing(true)}
        onCancel={() => setEditing(false)}
        onSave={handleSave}
      />
    </SectionCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export default function AnagraficaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { entityVersion } = useActiveEntity();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companyFullData, setCompanyFullData] = useState<CompanyData | null>(null);
  const [entityFullData, setEntityFullData] = useState<EntityData | null>(null);

  // ─── LOAD
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: prof } = await supabase
        .from("profiles").select("id,full_name,email,tier").eq("id", user.id).single();
      if (!prof) { router.push("/login"); return; }
      setProfile(prof as Profile);

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entitySelect = "id,company_id,name,entity_type,region,address,total_beds,n_ospiti,responsabile_it,email_responsabile_it,telefono_responsabile_it,referente_nis2_nome,referente_nis2_cognome,referente_nis2_email,referente_nis2_telefono,referente_breach,email_referente_breach,tel_referente_breach,direttore_sanitario,telefono_direttore_sanitario,direttore_struttura,telefono_direttore_struttura,responsabile_formazione,indirizzo,rto,rpo,frequenza_backup,tipo_backup,ubicazione_backup,fornitore_backup,ubicazione_registro_cartaceo,ubicazione_stampa_terapie,responsabile_ripristino,canale_segnalazione_incidenti";
      const entityQuery = storedEntityId
        ? supabase.from("entities").select(entitySelect).eq("id", storedEntityId).single()
        : supabase.from("entities").select(entitySelect).eq("created_by", user.id).limit(1).single();

      const { data: entityRow } = await entityQuery;
      if (!entityRow) { router.push("/onboarding"); return; }

      setEntityFullData(entityRow as unknown as EntityData);

      const { data: compRow } = await supabase
        .from("companies")
        .select("id,name,vat_number,codice_fiscale,legal_address,pec,legale_rappresentante,nome_dpo,email_dpo,dpo_telefono,dpo_qualifica,legale_esterno,firmatario_dpa")
        .eq("id", (entityRow as { company_id: string }).company_id)
        .single();

      if (compRow) {
        setCompanyFullData(compRow as unknown as CompanyData);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── SAVE SEZIONE 1 — SOCIETÀ
  async function saveSocieta(patch: CompanyData) {
    await supabase.from("companies").update({
      name: patch.name,
      vat_number: patch.vat_number,
      codice_fiscale: patch.codice_fiscale,
      legal_address: patch.legal_address,
      pec: patch.pec,
      legale_rappresentante: patch.legale_rappresentante,
      nome_dpo: patch.nome_dpo,
      email_dpo: patch.email_dpo,
      dpo_telefono: patch.dpo_telefono,
      dpo_qualifica: patch.dpo_qualifica,
      legale_esterno: patch.legale_esterno,
      firmatario_dpa: patch.firmatario_dpa,
    }).eq("id", patch.id);
    setCompanyFullData(patch);
  }

  // ─── SAVE SEZIONE 2 — STRUTTURA
  async function saveStruttura(patch: EntityData) {
    await supabase.from("entities").update({
      name: patch.name,
      entity_type: patch.entity_type,
      region: patch.region,
      address: patch.address,
      total_beds: patch.total_beds,
      n_ospiti: patch.n_ospiti,
      responsabile_it: patch.responsabile_it,
      email_responsabile_it: patch.email_responsabile_it,
      telefono_responsabile_it: patch.telefono_responsabile_it,
      referente_nis2_nome: patch.referente_nis2_nome,
      referente_nis2_cognome: patch.referente_nis2_cognome,
      referente_nis2_email: patch.referente_nis2_email,
      referente_nis2_telefono: patch.referente_nis2_telefono,
      referente_breach: patch.referente_breach,
      email_referente_breach: patch.email_referente_breach,
      tel_referente_breach: patch.tel_referente_breach,
      direttore_sanitario: patch.direttore_sanitario,
      telefono_direttore_sanitario: patch.telefono_direttore_sanitario,
      direttore_struttura: patch.direttore_struttura,
      telefono_direttore_struttura: patch.telefono_direttore_struttura,
      responsabile_formazione: patch.responsabile_formazione,
    }).eq("id", patch.id);
    setEntityFullData(prev => prev ? { ...prev, ...patch } : patch);
  }

  // ─── SAVE SEZIONE 3 — CONFIGURAZIONE IT
  async function saveConfigIt(patch: EntityData) {
    await supabase.from("entities").update({
      rto: patch.rto,
      rpo: patch.rpo,
      frequenza_backup: patch.frequenza_backup,
      tipo_backup: patch.tipo_backup,
      ubicazione_backup: patch.ubicazione_backup,
      fornitore_backup: patch.fornitore_backup,
      ubicazione_registro_cartaceo: patch.ubicazione_registro_cartaceo,
      ubicazione_stampa_terapie: patch.ubicazione_stampa_terapie,
      responsabile_ripristino: patch.responsabile_ripristino,
      canale_segnalazione_incidenti: patch.canale_segnalazione_incidenti,
    }).eq("id", patch.id);
    setEntityFullData(prev => prev ? { ...prev, ...patch } : patch);
  }

  // ─── COMPLETEZZA ANAGRAFICA — campi chiave per la governance normativa
  const campiImportanti = useMemo(() => [
    { label: "DPO", value: companyFullData?.nome_dpo, target: "anagrafica-societa" },
    { label: "Legale Rappresentante", value: companyFullData?.legale_rappresentante, target: "anagrafica-societa" },
    { label: "Responsabile IT", value: entityFullData?.responsabile_it, target: "anagrafica-struttura" },
    { label: "Direttore Struttura", value: entityFullData?.direttore_struttura, target: "anagrafica-struttura" },
    { label: "Direttore Sanitario", value: entityFullData?.direttore_sanitario, target: "anagrafica-struttura" },
    { label: "Referente Data Breach", value: entityFullData?.referente_breach, target: "anagrafica-struttura" },
    { label: "RTO", value: entityFullData?.rto, target: "anagrafica-config-it" },
    { label: "RPO", value: entityFullData?.rpo, target: "anagrafica-config-it" },
  ], [companyFullData, entityFullData]);

  const campiValorizzati = campiImportanti.filter(c => !!c.value?.trim()).length;
  const percentualeCompletezza = Math.round((campiValorizzati / campiImportanti.length) * 100);
  const campiMancanti = campiImportanti.filter(c => !c.value?.trim());
  const coloreBarraCompletezza = percentualeCompletezza > 80 ? T.low : percentualeCompletezza >= 50 ? T.orange : T.critical;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <AppShell profile={profile} activeRoute="/anagrafica">
      <main id="main-content" className="clavis-workspace flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">

          <h1 className="text-xl font-black mb-6" style={{ color: T.slate800 }}>
            Anagrafica
            <span className="block text-sm font-normal mt-0.5" style={{ color: T.slate400 }}>
              (Company & Facility Registry)
            </span>
          </h1>

          <div className="mb-6 px-5 py-4 border rounded-md" style={{ backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200 }}>
            <div className="flex items-center justify-between gap-4 mb-2">
              <p className="text-sm font-bold" style={{ color: T.slate800 }}>
                Anagrafica {percentualeCompletezza}% completa
              </p>
              <span className="text-xs font-mono" style={{ color: T.slate400 }}>
                {campiValorizzati}/{campiImportanti.length} campi chiave
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(238,241,248,.08)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${percentualeCompletezza}%`, backgroundColor: coloreBarraCompletezza }}
              />
            </div>
            {campiMancanti.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {campiMancanti.map(c => (
                  <a
                    key={c.label}
                    href={`#${c.target}`}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{ backgroundColor: T.critBg, color: T.critical, border: "1px solid rgba(232,99,74,.25)" }}
                  >
                    {c.label} →
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {companyFullData && (
              <SocietaSection company={companyFullData} onSave={saveSocieta} />
            )}

            {entityFullData && (
              <StrutturaSection entity={entityFullData} onSave={saveStruttura} />
            )}
          </div>

          <div className="w-full mb-6">
            {entityFullData && (
              <ConfigItSection entity={entityFullData} onSave={saveConfigIt} />
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
