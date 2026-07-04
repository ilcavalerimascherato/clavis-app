"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";

// ─── TIPI
// Campi marcati "NEW" non hanno ancora una colonna DB dedicata: vengono
// tenuti solo in stato locale (persi al reload) finché non arriva la
// migrazione SQL. Vedi TODO nei rispettivi handler di salvataggio.

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
  legale_esterno: string | null;   // NEW — non persistito
  firmatario_dpa: string | null;   // NEW — non persistito
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
  referente_breach: string | null;
  email_referente_breach: string | null;
  tel_referente_breach: string | null;
  direttore_sanitario: string | null;         // NEW — non persistito
  responsabile_formazione: string | null;     // NEW — non persistito
  rto: string | null;                          // NEW — non persistito
  rpo: string | null;                          // NEW — non persistito
  backup_frequenza: string | null;             // NEW — non persistito
  backup_tipo: string | null;                  // NEW — non persistito
  backup_ubicazione: string | null;            // NEW — non persistito
  backup_fornitore: string | null;             // NEW — non persistito
  registro_cartaceo_ubicazione: string | null; // NEW — non persistito
  ultima_stampa_terapie_ubicazione: string | null; // NEW — non persistito
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

function NewFieldBadge() {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded uppercase tracking-wide font-bold"
      style={{ backgroundColor: T.amberBg, color: T.amber }}
    >
      Dati non ancora salvati
    </span>
  );
}

function EditInput({ label, value, onChange, type = "text", placeholder, isNew }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; isNew?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-semibold" style={{ color: T.slate600 }}>{label}</label>
        {isNew && <NewFieldBadge />}
      </div>
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

function EditSelect({ label, value, onChange, options, isNew }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; isNew?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-semibold" style={{ color: T.slate600 }}>{label}</label>
        {isNew && <NewFieldBadge />}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-base outline-none rounded"
        style={{ backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark", border: `1px solid ${T.slate200}`, color: value ? T.slate800 : T.slate400 }}
      >
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
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

function SectionCard({ icon, title, subtitle, justSaved, children }: {
  icon: string; title: string; subtitle: string; justSaved: boolean; children: React.ReactNode;
}) {
  return (
    <div className="border rounded-md flex flex-col" style={{ backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200 }}>
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
    <SectionCard icon="🏢" title="Società" subtitle="Legal Entity" justSaved={justSaved}>
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
          <EditInput label="Legale Esterno" value={cv(draft.legale_esterno)} onChange={s("legale_esterno")} placeholder="Nome Cognome o Studio Legale" isNew />
          <EditInput label="Firmatario DPA" value={cv(draft.firmatario_dpa)} onChange={s("firmatario_dpa")} placeholder="Nome Cognome" isNew />
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
    <SectionCard icon="🏥" title="Struttura" subtitle="Facility" justSaved={justSaved}>
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
          <ReadField label="Direttore Sanitario" value={entity.direttore_sanitario} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Referente Data Breach" value={entity.referente_breach} />
            <ReadField label="Email Ref. Breach" value={entity.email_referente_breach} />
            <ReadField label="Telefono Ref. Breach" value={entity.tel_referente_breach} />
          </div>
          <ReadField label="Responsabile Formazione" value={entity.responsabile_formazione} />
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Responsabile IT" value={entity.responsabile_it} />
            <ReadField label="Email Responsabile IT" value={entity.email_responsabile_it} />
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
          <EditInput label="Direttore Sanitario" value={cv(draft.direttore_sanitario)} onChange={s("direttore_sanitario")} placeholder="Nome Cognome" isNew />
          <SubLabel>Referente Data Breach — Art. 33 GDPR</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome" value={cv(draft.referente_breach)} onChange={s("referente_breach")} placeholder="Nome Cognome" />
            <EditInput label="Email" type="email" value={cv(draft.email_referente_breach)} onChange={s("email_referente_breach")} placeholder="breach@struttura.it" />
            <EditInput label="Telefono" value={cv(draft.tel_referente_breach)} onChange={s("tel_referente_breach")} placeholder="+39 ..." />
          </div>
          <EditInput label="Responsabile Formazione" value={cv(draft.responsabile_formazione)} onChange={s("responsabile_formazione")} placeholder="Nome Cognome" isNew />
          <SubLabel>Responsabile IT</SubLabel>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Nome" value={cv(draft.responsabile_it)} onChange={s("responsabile_it")} placeholder="Nome Cognome o Società" />
            <EditInput label="Email" type="email" value={cv(draft.email_responsabile_it)} onChange={s("email_responsabile_it")} placeholder="it@struttura.it" />
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
// SEZIONE 3 — CONFIGURAZIONE IT (tutti campi nuovi, non persistiti)
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
    <SectionCard icon="💾" title="Configurazione IT" subtitle="Disaster Recovery & Backup — dati non ancora salvati su DB" justSaved={justSaved}>
      {!editing ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="RTO (Recovery Time Objective)" value={entity.rto} />
            <ReadField label="RPO (Recovery Point Objective)" value={entity.rpo} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Frequenza Backup" value={entity.backup_frequenza} />
            <ReadField label="Tipo Backup" value={entity.backup_tipo} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Ubicazione Backup" value={entity.backup_ubicazione} />
            <ReadField label="Fornitore Backup" value={entity.backup_fornitore} />
          </div>
          <ReadField label="Ubicazione Registro Cartaceo Emergenza" value={entity.registro_cartaceo_ubicazione} />
          <ReadField label="Ubicazione Ultima Stampa Terapie" value={entity.ultima_stampa_terapie_ubicazione} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <EditSelect label="RTO (Recovery Time Objective)" value={cv(draft.rto)} onChange={s("rto")} options={RTO_RPO_OPTIONS} isNew />
            <EditSelect label="RPO (Recovery Point Objective)" value={cv(draft.rpo)} onChange={s("rpo")} options={RTO_RPO_OPTIONS} isNew />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditSelect label="Frequenza Backup" value={cv(draft.backup_frequenza)} onChange={s("backup_frequenza")} options={BACKUP_FREQ_OPTIONS} isNew />
            <EditSelect label="Tipo Backup" value={cv(draft.backup_tipo)} onChange={s("backup_tipo")} options={BACKUP_TIPO_OPTIONS} isNew />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <EditInput label="Ubicazione Backup" value={cv(draft.backup_ubicazione)} onChange={s("backup_ubicazione")} placeholder="Es. Cloud esterno, NAS locale..." isNew />
            <EditInput label="Fornitore Backup" value={cv(draft.backup_fornitore)} onChange={s("backup_fornitore")} placeholder="Nome fornitore" isNew />
          </div>
          <EditInput label="Ubicazione Registro Cartaceo Emergenza" value={cv(draft.registro_cartaceo_ubicazione)} onChange={s("registro_cartaceo_ubicazione")} placeholder="Es. Armadio ufficio direzione" isNew />
          <EditInput label="Ubicazione Ultima Stampa Terapie" value={cv(draft.ultima_stampa_terapie_ubicazione)} onChange={s("ultima_stampa_terapie_ubicazione")} placeholder="Es. Faldone reparto A" isNew />
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
      const entitySelect = "id,company_id,name,entity_type,region,address,total_beds,n_ospiti,responsabile_it,email_responsabile_it,referente_breach,email_referente_breach,tel_referente_breach";
      const entityQuery = storedEntityId
        ? supabase.from("entities").select(entitySelect).eq("id", storedEntityId).single()
        : supabase.from("entities").select(entitySelect).eq("created_by", user.id).limit(1).single();

      const { data: entityRow } = await entityQuery;
      if (!entityRow) { router.push("/onboarding"); return; }

      setEntityFullData({
        ...(entityRow as unknown as Omit<EntityData,
          "direttore_sanitario" | "responsabile_formazione" | "rto" | "rpo" |
          "backup_frequenza" | "backup_tipo" | "backup_ubicazione" | "backup_fornitore" |
          "registro_cartaceo_ubicazione" | "ultima_stampa_terapie_ubicazione">),
        // NEW — nessuna colonna DB ancora: sempre null al caricamento
        direttore_sanitario: null,
        responsabile_formazione: null,
        rto: null,
        rpo: null,
        backup_frequenza: null,
        backup_tipo: null,
        backup_ubicazione: null,
        backup_fornitore: null,
        registro_cartaceo_ubicazione: null,
        ultima_stampa_terapie_ubicazione: null,
      });

      const { data: compRow } = await supabase
        .from("companies")
        .select("id,name,vat_number,codice_fiscale,legal_address,pec,legale_rappresentante,nome_dpo,email_dpo,dpo_telefono,dpo_qualifica")
        .eq("id", (entityRow as { company_id: string }).company_id)
        .single();

      if (compRow) {
        setCompanyFullData({
          ...(compRow as unknown as Omit<CompanyData, "legale_esterno" | "firmatario_dpa">),
          // NEW — nessuna colonna DB ancora: sempre null al caricamento
          legale_esterno: null,
          firmatario_dpa: null,
        });
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
      // TODO(migrazione companies): aggiungere colonne `legale_esterno` e
      // `firmatario_dpa` (ex referente_fornitore, rinominato per il contesto
      // societario) e includerle qui una volta create.
    }).eq("id", patch.id);
    setCompanyFullData(patch); // mantiene i campi non persistiti in sessione
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
      referente_breach: patch.referente_breach,
      email_referente_breach: patch.email_referente_breach,
      tel_referente_breach: patch.tel_referente_breach,
      // TODO(migrazione entities): aggiungere colonne `direttore_sanitario`
      // e `responsabile_formazione` e includerle qui una volta create.
    }).eq("id", patch.id);
    setEntityFullData(prev => prev ? { ...prev, ...patch } : patch);
  }

  // ─── SAVE SEZIONE 3 — CONFIGURAZIONE IT (nessuna colonna esiste ancora)
  async function saveConfigIt(patch: EntityData) {
    // TODO(migrazione entities): nessuna delle colonne di questa sezione
    // (rto, rpo, backup_frequenza, backup_tipo, backup_ubicazione,
    // backup_fornitore, registro_cartaceo_ubicazione,
    // ultima_stampa_terapie_ubicazione) esiste ancora su `entities`.
    // Quando le migrazioni saranno pronte, sostituire il no-op sotto con:
    // await supabase.from("entities").update({
    //   rto: patch.rto, rpo: patch.rpo,
    //   backup_frequenza: patch.backup_frequenza, backup_tipo: patch.backup_tipo,
    //   backup_ubicazione: patch.backup_ubicazione, backup_fornitore: patch.backup_fornitore,
    //   registro_cartaceo_ubicazione: patch.registro_cartaceo_ubicazione,
    //   ultima_stampa_terapie_ubicazione: patch.ultima_stampa_terapie_ubicazione,
    // }).eq("id", patch.id);
    setEntityFullData(prev => prev ? { ...prev, ...patch } : patch);
  }

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

          <div className="px-4 py-3 border rounded" style={{
            borderColor: "rgba(94,134,245,.2)", backgroundColor: "rgba(94,134,245,.06)",
          }}>
            <p className="text-sm leading-relaxed" style={{ color: "#7BA7D4" }}>
              ℹ I campi con badge <span style={{ color: T.amber }}>"Dati non ancora salvati"</span> non hanno
              ancora una colonna dedicata su database: restano visibili solo per questa sessione finché
              non verrà eseguita la migrazione SQL corrispondente.
            </p>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
