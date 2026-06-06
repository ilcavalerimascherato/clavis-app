"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";

// ─── TIPI

interface CompanyData {
  id: string;
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
  nome_dpo: string | null;
  email_dpo: string | null;
  dpo_qualifica: string | null;
  dpo_telefono: string | null;
  dpo_pec: string | null;
  responsabile_it: string | null;
  email_responsabile_it: string | null;
  resp_it_condiviso: boolean;
}

interface EntityData {
  id: string;
  company_id: string;
  name: string;
  entity_type: string | null;
  region: string | null;
  total_beds: number | null;
  address: string | null;
  n_dipendenti: string | null;
  n_ospiti: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  accreditation_code: string | null;
  website_url: string | null;
  convenzione_ssn: boolean;
  tipo_convenzione: string | null;
  gestione_it: string | null;
  modello_231: string | null;
  nome_dpo: string | null;
  email_dpo: string | null;
  dpo_qualifica: string | null;
  dpo_telefono: string | null;
  responsabile_it: string | null;
  email_responsabile_it: string | null;
  ai_officer: string | null;
  email_ai_officer: string | null;
  referente_breach: string | null;
  email_referente_breach: string | null;
  tel_referente_breach: string | null;
}

type ModalType = "societa_statica" | "governance" | "struttura_statica" | "referenti";

// ─── HELPERS UI

const cv = (v: string | null | undefined) => v ?? "";

function Field({ label, value, missing }: { label: string; value: string | null | undefined; missing?: boolean }) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>{label}</span>
      {empty ? (
        <span className="text-xs font-mono italic" style={{ color: missing ? T.critical : T.slate400, fontSize: "13px" }}>
          {missing ? "⚠ mancante" : "—"}
        </span>
      ) : (
        <span className="text-xs font-semibold truncate" style={{ color: T.slate800, fontSize: "12px" }}>{value}</span>
      )}
    </div>
  );
}

function SubSection({ label }: { label: string }) {
  return (
    <div className="pt-1 pb-0.5 border-b" style={{ borderColor: T.slate200 }}>
      <p className="text-xs font-mono uppercase" style={{ color: T.bronze, fontSize: "11px" }}>{label}</p>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 px-3 py-3 rounded" style={{
      backgroundColor: "rgba(94,134,245,.07)", border: "1px solid rgba(94,134,245,.2)",
    }}>
      {children}
    </div>
  );
}

function ModalInput({ label, value, onChange, type = "text", placeholder, sublabel, required }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; sublabel?: string; required?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>{label}</label>
        {required && empty && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "12px" }}>MANCANTE</span>
        )}
        {!empty && <span style={{ color: T.low, fontSize: "12px" }}>✓</span>}
      </div>
      {sublabel && <p className="text-xs" style={{ color: T.slate400, fontSize: "12px" }}>{sublabel}</p>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: empty && required ? "rgba(232,99,74,.05)" : "rgba(238,241,248,.06)",
          border: `1px solid ${empty && required ? "rgba(232,99,74,.3)" : T.slate200}`,
          borderRadius: "4px", color: T.slate800, fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function ModalSelect({ label, value, onChange, options, sublabel, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; sublabel?: string; required?: boolean;
}) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>{label}</label>
        {required && empty && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "12px" }}>MANCANTE</span>
        )}
        {!empty && <span style={{ color: T.low, fontSize: "12px" }}>✓</span>}
      </div>
      {sublabel && <p className="text-xs" style={{ color: T.slate400, fontSize: "12px" }}>{sublabel}</p>}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark",
          border: `1px solid ${T.slate200}`, borderRadius: "4px",
          color: value ? T.slate800 : T.slate400, fontFamily: "inherit",
        }}
      >
        <option value="">— seleziona —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ModalToggle({ label, sublabel, value, onChange }: {
  label: string; sublabel?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 col-span-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate600 }}>{label}</p>
        {sublabel && <p className="text-xs mt-0.5" style={{ color: T.slate400, fontSize: "12px" }}>{sublabel}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{ width: "40px", height: "22px", borderRadius: "11px", backgroundColor: value ? T.low : T.slate200, position: "relative", flexShrink: 0 }}
      >
        <div style={{ position: "absolute", top: "3px", left: value ? "20px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

function ModalSection({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-2">
      <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
      <span className="text-xs font-mono uppercase tracking-widest px-2" style={{ color: T.bronze, fontSize: "12px" }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
    </div>
  );
}

function EditModal({ title, subtitle, onClose, onSave, saving, saved, children }: {
  title: string; subtitle: string; onClose: () => void; onSave: () => void;
  saving: boolean; saved: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col w-full mx-4" style={{
        backgroundColor: "var(--ink2, #0F1424)", border: `1px solid ${T.slate200}`,
        borderRadius: "6px", maxWidth: "600px", maxHeight: "88vh", overflow: "hidden",
      }}>
        <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>{title}</p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-lg transition-opacity hover:opacity-60" style={{ color: T.slate400 }}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-4">{children}</div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t flex-shrink-0"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <button onClick={onClose} className="text-xs px-4 py-2 font-semibold transition-opacity hover:opacity-70"
            style={{ border: `1px solid ${T.slate200}`, color: T.slate600, borderRadius: "4px" }}>
            Annulla
          </button>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2 text-xs font-bold uppercase tracking-widest transition-all"
            style={{
              backgroundColor: saved ? T.lowBg : "var(--shield, #3A6DF0)",
              color: saved ? T.low : "var(--bone, #EEF1F8)",
              borderRadius: "4px", border: saved ? "1px solid rgba(62,207,142,.4)" : "none",
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? "Salvataggio..." : saved ? "✓ Salvato" : "Salva →"}
          </button>
        </div>
      </div>
    </div>
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
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [entity, setEntity] = useState<EntityData | null>(null);

  const [modalOpen, setModalOpen] = useState<ModalType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editCompany, setEditCompany] = useState<CompanyData | null>(null);
  const [editEntity, setEditEntity] = useState<EntityData | null>(null);

  // ─── LOAD
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entitySelect = "id,company_id,name,entity_type,region,total_beds,address,n_dipendenti,n_ospiti,vat_number,fiscal_code,accreditation_code,website_url,convenzione_ssn,tipo_convenzione,gestione_it,modello_231,nome_dpo,email_dpo,dpo_qualifica,dpo_telefono,responsabile_it,email_responsabile_it,ai_officer,email_ai_officer,referente_breach,email_referente_breach,tel_referente_breach";
      const entityQuery = storedEntityId
        ? supabase.from("entities").select(entitySelect).eq("id", storedEntityId).single()
        : supabase.from("entities").select(entitySelect).eq("created_by", user.id).limit(1).single();

      const { data: entityData } = await entityQuery;
      if (!entityData) { router.push("/onboarding"); return; }
      setEntity(entityData as EntityData);

      const { data: compData } = await supabase
        .from("companies")
        .select("id,name,vat_number,legal_address,region,country,codice_fiscale,pec,legale_rappresentante,fatturato_fascia,n_dipendenti_fascia,modello_231,storico_violazioni,storico_violazioni_note,nome_dpo,email_dpo,dpo_qualifica,dpo_telefono,dpo_pec,responsabile_it,email_responsabile_it,resp_it_condiviso")
        .eq("id", entityData.company_id)
        .single();
      if (compData) setCompany(compData as CompanyData);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── OPEN MODAL
  function openModal(type: ModalType) {
    setEditCompany(company ? { ...company } : null);
    setEditEntity(entity ? { ...entity } : null);
    setSaved(false);
    setModalOpen(type);
  }

  // ─── HELPERS SETTER
  const sc = (field: keyof CompanyData) => (v: string) =>
    setEditCompany(prev => prev ? { ...prev, [field]: v || null } : prev);
  const se = (field: keyof EntityData) => (v: string | boolean | number | null) =>
    setEditEntity(prev => prev ? { ...prev, [field]: v } : prev);

  // ─── SAVE
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      if (modalOpen === "societa_statica" && editCompany) {
        await supabase.from("companies").update({
          name: editCompany.name,
          vat_number: editCompany.vat_number,
          legal_address: editCompany.legal_address,
          region: editCompany.region,
          codice_fiscale: editCompany.codice_fiscale,
          pec: editCompany.pec,
        }).eq("id", editCompany.id);
        setCompany(prev => prev ? { ...prev, ...editCompany } : prev);
      }

      if (modalOpen === "governance" && editCompany) {
        await supabase.from("companies").update({
          legale_rappresentante: editCompany.legale_rappresentante,
          modello_231: editCompany.modello_231,
          storico_violazioni: editCompany.storico_violazioni,
          storico_violazioni_note: editCompany.storico_violazioni_note,
          fatturato_fascia: editCompany.fatturato_fascia,
          n_dipendenti_fascia: editCompany.n_dipendenti_fascia,
          nome_dpo: editCompany.nome_dpo,
          email_dpo: editCompany.email_dpo,
          dpo_qualifica: editCompany.dpo_qualifica,
          dpo_telefono: editCompany.dpo_telefono,
          dpo_pec: editCompany.dpo_pec,
          responsabile_it: editCompany.responsabile_it,
          email_responsabile_it: editCompany.email_responsabile_it,
        }).eq("id", editCompany.id);
        setCompany(prev => prev ? { ...prev, ...editCompany } : prev);
      }

      if (modalOpen === "struttura_statica" && editEntity) {
        await supabase.from("entities").update({
          name: editEntity.name,
          entity_type: editEntity.entity_type,
          region: editEntity.region,
          address: editEntity.address,
          total_beds: editEntity.total_beds,
          vat_number: editEntity.vat_number,
          fiscal_code: editEntity.fiscal_code,
          accreditation_code: editEntity.accreditation_code,
          website_url: editEntity.website_url,
          convenzione_ssn: editEntity.convenzione_ssn,
          tipo_convenzione: editEntity.tipo_convenzione,
        }).eq("id", editEntity.id);
        setEntity(prev => prev ? { ...prev, ...editEntity } : prev);
      }

      if (modalOpen === "referenti" && editEntity && editCompany) {
        const entityPatch: Record<string, unknown> = {
          ai_officer: editEntity.ai_officer,
          email_ai_officer: editEntity.email_ai_officer,
          referente_breach: editEntity.referente_breach,
          email_referente_breach: editEntity.email_referente_breach,
          tel_referente_breach: editEntity.tel_referente_breach,
          gestione_it: editEntity.gestione_it,
          modello_231: editEntity.modello_231,
          n_ospiti: editEntity.n_ospiti,
          n_dipendenti: editEntity.n_dipendenti,
        };

        if (!editCompany.resp_it_condiviso) {
          entityPatch.responsabile_it = editEntity.responsabile_it;
          entityPatch.email_responsabile_it = editEntity.email_responsabile_it;
        }

        await supabase.from("entities").update(entityPatch).eq("id", editEntity.id);
        await supabase.from("companies").update({
          resp_it_condiviso: editCompany.resp_it_condiviso,
        }).eq("id", editCompany.id);

        if (editCompany.resp_it_condiviso) {
          await supabase.from("companies").update({
            responsabile_it: editCompany.responsabile_it,
            email_responsabile_it: editCompany.email_responsabile_it,
          }).eq("id", editCompany.id);
          // Propaga a tutte le strutture della company
          await supabase.from("entities").update({
            responsabile_it: editCompany.responsabile_it,
            email_responsabile_it: editCompany.email_responsabile_it,
          }).eq("company_id", editCompany.id);
        }

        setCompany(prev => prev ? { ...prev, ...editCompany } : prev);
        setEntity(prev => prev ? {
          ...prev,
          ...editEntity,
          ...(editCompany.resp_it_condiviso ? {
            responsabile_it: editCompany.responsabile_it,
            email_responsabile_it: editCompany.email_responsabile_it,
          } : {}),
        } : prev);
      }

      setSaved(true);
      setTimeout(() => { setSaved(false); setModalOpen(null); }, 1500);
    } finally {
      setSaving(false);
    }
  }

  // ─── BADGE
  function badge(filled: number, total: number) {
    const pct = Math.round((filled / total) * 100);
    const color = pct === 100 ? T.low : pct >= 60 ? T.bronze : T.critical;
    return { pct, color };
  }

  const b1 = badge([
    company?.name,
    company?.vat_number,
    company?.codice_fiscale,
    company?.legal_address,
    company?.pec,
    company?.region,
  ].filter(Boolean).length, 6);

  const b2 = badge([
    company?.legale_rappresentante,
    company?.fatturato_fascia,
    company?.n_dipendenti_fascia,
    company?.modello_231,
    company?.storico_violazioni != null ? "ok" : null,
    company?.nome_dpo,
    company?.email_dpo,
    company?.dpo_qualifica,
  ].filter(Boolean).length, 8);

  const b3 = badge([
    entity?.name,
    entity?.entity_type,
    entity?.region,
    entity?.address,
    entity?.total_beds != null ? "ok" : null,
    entity?.convenzione_ssn != null ? "ok" : null,
    entity?.fiscal_code,
  ].filter(Boolean).length, 7);

  const respIt = company?.resp_it_condiviso
    ? company?.responsabile_it
    : entity?.responsabile_it;
  const emailRespIt = company?.resp_it_condiviso
    ? company?.email_responsabile_it
    : entity?.email_responsabile_it;

  const b4 = badge([
    respIt,
    emailRespIt,
    entity?.ai_officer,
    entity?.email_ai_officer,
    entity?.referente_breach,
    entity?.email_referente_breach,
    entity?.tel_referente_breach,
    entity?.gestione_it,
  ].filter(Boolean).length, 8);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  // ─── CARD shared style
  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--ink2, #0F1424)",
    borderColor: T.slate200,
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
  };
  const cardHeaderStyle: React.CSSProperties = {
    borderColor: T.slate200,
    backgroundColor: T.slate100,
  };

  return (
    <AppShell profile={null} activeRoute="/anagrafica">
      <>
        <main id="main-content" className="clavis-workspace flex-1 overflow-y-auto px-6 py-6">

          {/* GRIGLIA 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "stretch" }}>

            {/* ── BOX 1 — SOCIETÀ / Legal Entity */}
            <div className="border" style={{ ...cardStyle, borderTopWidth: "3px", borderTopColor: b1.color }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={cardHeaderStyle}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Società</p>
                    <p className="text-xs italic" style={{ color: T.slate400, fontSize: "12px" }}>Legal Entity</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: b1.color, fontSize: "12px" }}>{b1.pct}%</span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                <Field label="Ragione Sociale" value={company?.name} missing />
                <Field label="P.IVA" value={company?.vat_number} missing />
                <Field label="Codice Fiscale" value={company?.codice_fiscale} />
                <Field label="Sede Legale" value={company?.legal_address} />
                <Field label="PEC" value={company?.pec} />
                <Field label="Regione / Paese" value={[company?.region, company?.country].filter(Boolean).join(" — ") || null} />
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("societa_statica")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: "1px solid rgba(94,134,245,.3)" }}>
                  Modifica dati →
                </button>
              </div>
            </div>

            {/* ── BOX 2 — GOVERNANCE SOCIETARIA */}
            <div className="border" style={{ ...cardStyle, borderTopWidth: "3px", borderTopColor: b2.color }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={cardHeaderStyle}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚖️</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Governance Societaria</p>
                    <p className="text-xs italic" style={{ color: T.slate400, fontSize: "12px" }}>Corporate Governance</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: b2.color, fontSize: "12px" }}>{b2.pct}%</span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                <Field label="Legale Rappresentante" value={company?.legale_rappresentante} missing />
                <Field label="Modello 231" value={company?.modello_231} />
                <Field label="Storico Violazioni" value={company?.storico_violazioni ? "Sì" : "No"} />
                <Field label="Fatturato Fascia" value={company?.fatturato_fascia} />
                <Field label="Dipendenti Fascia" value={company?.n_dipendenti_fascia} />
                <SubSection label="DPO" />
                <Field label="Nome DPO" value={company?.nome_dpo} missing />
                <Field label="Email DPO" value={company?.email_dpo} missing />
                <Field label="Qualifica DPO" value={company?.dpo_qualifica} missing />
                <Field label="PEC DPO" value={company?.dpo_pec} />
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("governance")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: "1px solid rgba(94,134,245,.3)" }}>
                  Modifica dati →
                </button>
              </div>
            </div>

            {/* ── BOX 3 — STRUTTURA / Facility */}
            <div className="border" style={{ ...cardStyle, borderTopWidth: "3px", borderTopColor: b3.color }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={cardHeaderStyle}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏥</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Struttura</p>
                    <p className="text-xs italic" style={{ color: T.slate400, fontSize: "12px" }}>Facility</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: b3.color, fontSize: "12px" }}>{b3.pct}%</span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                <Field label="Nome Struttura" value={entity?.name} missing />
                <Field label="Tipologia" value={entity?.entity_type} missing />
                <Field label="Regione" value={entity?.region} missing />
                <Field label="Indirizzo" value={entity?.address} />
                <Field label="Posti Letto" value={entity?.total_beds?.toString()} missing />
                <Field label="P.IVA Struttura" value={entity?.vat_number} />
                <Field label="CF Struttura" value={entity?.fiscal_code} />
                <Field label="Cod. Accreditamento" value={entity?.accreditation_code} />
                <Field label="Website" value={entity?.website_url} />
                <Field label="Convenzione SSN" value={entity?.convenzione_ssn ? `Sì — ${entity.tipo_convenzione ?? ""}` : "No"} />
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("struttura_statica")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: "1px solid rgba(94,134,245,.3)" }}>
                  Modifica dati →
                </button>
              </div>
            </div>

            {/* ── BOX 4 — REFERENTI OPERATIVI / Key Contacts */}
            <div className="border" style={{ ...cardStyle, borderTopWidth: "3px", borderTopColor: b4.color }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={cardHeaderStyle}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👤</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Referenti Operativi</p>
                    <p className="text-xs italic" style={{ color: T.slate400, fontSize: "12px" }}>Key Contacts</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: b4.color, fontSize: "12px" }}>{b4.pct}%</span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                <SubSection label="Resp. IT" />
                {company?.resp_it_condiviso ? (
                  <>
                    <Field label="Nome (livello società)" value={company?.responsabile_it} />
                    <Field label="Email (livello società)" value={company?.email_responsabile_it} />
                  </>
                ) : (
                  <>
                    <Field label="Nome" value={entity?.responsabile_it} />
                    <Field label="Email" value={entity?.email_responsabile_it} />
                  </>
                )}
                <SubSection label="AI Officer" />
                <Field label="Nome" value={entity?.ai_officer} />
                <Field label="Email" value={entity?.email_ai_officer} />
                <SubSection label="Ref. Breach" />
                <Field label="Nome" value={entity?.referente_breach} />
                <Field label="Email" value={entity?.email_referente_breach} />
                <Field label="Telefono" value={entity?.tel_referente_breach} />
                <SubSection label="Dati Operativi" />
                <Field label="Gestione IT" value={entity?.gestione_it} />
                <Field label="MOG 231 struttura" value={entity?.modello_231} />
                <Field label="N. Ospiti" value={entity?.n_ospiti} />
                <Field label="N. Dipendenti" value={entity?.n_dipendenti} />
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("referenti")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: "1px solid rgba(94,134,245,.3)" }}>
                  Modifica dati →
                </button>
              </div>
            </div>
          </div>

          {/* NOTA */}
          <div className="mt-4 px-4 py-3 border" style={{
            borderColor: "rgba(94,134,245,.2)", backgroundColor: "rgba(94,134,245,.06)", borderRadius: "4px",
          }}>
            <p className="text-xs" style={{ color: "#7BA7D4" }}>
              ℹ I campi contrassegnati con <span style={{ color: T.critical }}>⚠ mancante</span> sono necessari per la generazione automatica dei documenti (Nomina DPO, BCP, delibere CdA).
              Completali per sbloccare la generazione senza campi vuoti.
            </p>
          </div>
        </main>

        {/* ═══════════════════════════════════════════
            MODAL 1 — SOCIETÀ / Legal Entity
        ═══════════════════════════════════════════ */}
        {modalOpen === "societa_statica" && editCompany && (
          <EditModal title="Società" subtitle="Legal Entity — dati societari statici"
            onClose={() => setModalOpen(null)} onSave={handleSave} saving={saving} saved={saved}>
            <div className="col-span-2">
              <ModalInput label="Ragione Sociale" required value={cv(editCompany.name)}
                onChange={v => sc("name")(v)} placeholder="Es. Test Gold Srl" />
            </div>
            <ModalInput label="P.IVA" required value={cv(editCompany.vat_number)}
              onChange={v => sc("vat_number")(v)} placeholder="12345678901" />
            <ModalInput label="Codice Fiscale" value={cv(editCompany.codice_fiscale)}
              onChange={v => sc("codice_fiscale")(v)} placeholder="Se diverso da P.IVA" />
            <div className="col-span-2">
              <ModalInput label="Sede Legale" value={cv(editCompany.legal_address)}
                onChange={v => sc("legal_address")(v)} placeholder="Via, Città, CAP" />
            </div>
            <ModalInput label="PEC" type="email" value={cv(editCompany.pec)}
              onChange={v => sc("pec")(v)} placeholder="pec@società.it" />
            <ModalInput label="Regione / Area geografica" value={cv(editCompany.region)}
              onChange={v => sc("region")(v)} placeholder="Es. Lombardia" />
          </EditModal>
        )}

        {/* ═══════════════════════════════════════════
            MODAL 2 — GOVERNANCE SOCIETARIA
        ═══════════════════════════════════════════ */}
        {modalOpen === "governance" && editCompany && (
          <EditModal title="Governance Societaria" subtitle="Corporate Governance — dati operativi e DPO"
            onClose={() => setModalOpen(null)} onSave={handleSave} saving={saving} saved={saved}>

            <ModalInput label="Legale Rappresentante" required value={cv(editCompany.legale_rappresentante)}
              onChange={v => sc("legale_rappresentante")(v)} placeholder="Nome Cognome"
              sublabel="Firma i documenti societari" />
            <div />
            <div className="col-span-2">
              <ModalSelect label="Modello 231" value={cv(editCompany.modello_231)}
                onChange={v => sc("modello_231")(v)}
                options={["Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)", "In corso di adozione", "No"]}
                sublabel="D.Lgs. 231/2001 — responsabilità amministrativa dell'ente" />
            </div>
            <ModalSelect label="Fatturato annuo" value={cv(editCompany.fatturato_fascia)}
              onChange={v => sc("fatturato_fascia")(v)}
              options={["Sotto 2M", "2M_5M", "5M_20M", "20M_50M", "Oltre 50M"]}
              sublabel="Incide sul calcolo sanzioni" />
            <ModalSelect label="Dipendenti totali società" value={cv(editCompany.n_dipendenti_fascia)}
              onChange={v => sc("n_dipendenti_fascia")(v)}
              options={["Meno di 20", "20_49", "50_249", "250 o più"]}
              sublabel="Soglia 50 = soggetto NIS2" />
            <ModalToggle label="Storico violazioni normative"
              sublabel="Sanzioni o contestazioni da Garante/ACN negli ultimi 3 anni"
              value={editCompany.storico_violazioni}
              onChange={v => setEditCompany(prev => prev ? { ...prev, storico_violazioni: v } : prev)} />
            {editCompany.storico_violazioni && (
              <div className="col-span-2">
                <ModalInput label="Note violazioni" value={cv(editCompany.storico_violazioni_note)}
                  onChange={v => sc("storico_violazioni_note")(v)} placeholder="Breve descrizione" />
              </div>
            )}

            <ModalSection label="DPO — Responsabile Protezione Dati" />
            <ModalInput label="Nome DPO" required value={cv(editCompany.nome_dpo)}
              onChange={v => sc("nome_dpo")(v)} placeholder="Nome Cognome"
              sublabel="Obbligatorio — Art. 37 GDPR" />
            <ModalInput label="Email DPO" required type="email" value={cv(editCompany.email_dpo)}
              onChange={v => sc("email_dpo")(v)} placeholder="dpo@struttura.it" />
            <ModalSelect label="Qualifica DPO" required value={cv(editCompany.dpo_qualifica)}
              onChange={v => sc("dpo_qualifica")(v)}
              options={["Dipendente interno", "Consulente esterno", "Società esterna"]}
              sublabel="Incide sulle clausole contrattuali" />
            <ModalInput label="Telefono DPO" value={cv(editCompany.dpo_telefono)}
              onChange={v => sc("dpo_telefono")(v)} placeholder="+39 ..." />
            <ModalInput label="PEC DPO" type="email" value={cv(editCompany.dpo_pec)}
              onChange={v => sc("dpo_pec")(v)} placeholder="pec-dpo@struttura.it" />
            <div />

            <ModalSection label="Responsabile IT Societario" />
            <ModalInput label="Nome Responsabile IT" value={cv(editCompany.responsabile_it)}
              onChange={v => sc("responsabile_it")(v)} placeholder="Nome Cognome o Società"
              sublabel="Può essere condiviso tra tutte le strutture del gruppo" />
            <ModalInput label="Email Responsabile IT" type="email" value={cv(editCompany.email_responsabile_it)}
              onChange={v => sc("email_responsabile_it")(v)} placeholder="it@società.it" />
          </EditModal>
        )}

        {/* ═══════════════════════════════════════════
            MODAL 3 — STRUTTURA / Facility
        ═══════════════════════════════════════════ */}
        {modalOpen === "struttura_statica" && editEntity && (
          <EditModal title="Struttura Sanitaria" subtitle="Facility — dati statici struttura"
            onClose={() => setModalOpen(null)} onSave={handleSave} saving={saving} saved={saved}>

            <div className="col-span-2">
              <ModalInput label="Nome Struttura" required value={cv(editEntity.name)}
                onChange={v => se("name")(v)} placeholder="Es. RSA Test Gold" />
            </div>
            <ModalSelect label="Tipologia" required value={cv(editEntity.entity_type)}
              onChange={v => se("entity_type")(v)}
              options={["RSA","RSSA","CDI","Hospice","OdC","RSD","CSS","CDD","CSE","CRA","CRM","SRP","CPS","SPDC","REMS","SerD","CT","ADI","Poliambulatorio / ex art.26","Altro"]} />
            <ModalSelect label="Regione" required value={cv(editEntity.region)}
              onChange={v => se("region")(v)}
              options={["Lombardia","Veneto","Lazio","Piemonte","Emilia-Romagna","Toscana","Campania","Sicilia","Liguria","Marche","Abruzzo","Puglia","Calabria","Sardegna","Friuli-Venezia Giulia","Trentino-Alto Adige","Umbria","Basilicata","Molise","Valle d'Aosta"]} />
            <ModalInput label="Posti letto / Ospiti max" required type="number"
              value={editEntity.total_beds?.toString() ?? ""}
              onChange={v => se("total_beds")(v ? parseInt(v) : null)}
              placeholder="Es. 60" />
            <div className="col-span-2">
              <ModalInput label="Indirizzo struttura" value={cv(editEntity.address)}
                onChange={v => se("address")(v)} placeholder="Via, Città, CAP" />
            </div>
            <ModalInput label="P.IVA struttura" value={cv(editEntity.vat_number)}
              onChange={v => se("vat_number")(v)} placeholder="Se diversa dalla società" />
            <ModalInput label="CF struttura" value={cv(editEntity.fiscal_code)}
              onChange={v => se("fiscal_code")(v)} placeholder="Codice fiscale struttura" />
            <ModalInput label="Codice accreditamento" value={cv(editEntity.accreditation_code)}
              onChange={v => se("accreditation_code")(v)} placeholder="Codice regionale" />
            <ModalInput label="Website" value={cv(editEntity.website_url)}
              onChange={v => se("website_url")(v)} placeholder="https://..." />
            <ModalToggle label="Convenzione SSN/SSR"
              sublabel="Opera in convenzione con il Servizio Sanitario"
              value={editEntity.convenzione_ssn}
              onChange={v => setEditEntity(prev => prev ? { ...prev, convenzione_ssn: v } : prev)} />
            {editEntity.convenzione_ssn && (
              <ModalSelect label="Tipo convenzione" value={cv(editEntity.tipo_convenzione)}
                onChange={v => se("tipo_convenzione")(v)} options={["SSN","SSR","Entrambi"]} />
            )}
          </EditModal>
        )}

        {/* ═══════════════════════════════════════════
            MODAL 4 — REFERENTI OPERATIVI / Key Contacts
        ═══════════════════════════════════════════ */}
        {modalOpen === "referenti" && editEntity && editCompany && (
          <EditModal title="Referenti Operativi" subtitle="Key Contacts — usati nei documenti generati"
            onClose={() => setModalOpen(null)} onSave={handleSave} saving={saving} saved={saved}>

            <ModalSection label="Responsabile IT / Sicurezza" />
            <ModalToggle
              label="Uguale per tutte le strutture del gruppo"
              sublabel="Propaga responsabile_it e email da companies a tutte le entities della company"
              value={editCompany.resp_it_condiviso}
              onChange={v => setEditCompany(prev => prev ? { ...prev, resp_it_condiviso: v } : prev)}
            />
            {editCompany.resp_it_condiviso ? (
              <InfoBox>
                <p className="text-xs font-mono uppercase mb-2" style={{ color: T.bronze, fontSize: "11px" }}>Definito a livello società</p>
                <p className="text-sm font-semibold" style={{ color: T.slate800 }}>{editCompany.responsabile_it || "—"}</p>
                <p className="text-xs" style={{ color: T.slate400 }}>{editCompany.email_responsabile_it || "—"}</p>
                <button
                  onClick={() => { setModalOpen(null); setTimeout(() => openModal("governance"), 50); }}
                  className="mt-2 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: "1px solid rgba(94,134,245,.3)" }}>
                  Modifica dato societario →
                </button>
              </InfoBox>
            ) : (
              <>
                <ModalInput label="Nome Responsabile IT" value={cv(editEntity.responsabile_it)}
                  onChange={v => se("responsabile_it")(v)} placeholder="Nome Cognome o Società"
                  sublabel="Specifico per questa struttura" />
                <ModalInput label="Email Responsabile IT" type="email" value={cv(editEntity.email_responsabile_it)}
                  onChange={v => se("email_responsabile_it")(v)} placeholder="it@struttura.it" />
              </>
            )}

            <ModalSection label="AI Officer — Art. 26 AI Act" />
            <ModalInput label="Nome AI Officer" value={cv(editEntity.ai_officer)}
              onChange={v => se("ai_officer")(v)} placeholder="Nome Cognome"
              sublabel="Responsabile sistemi AI ad alto rischio" />
            <ModalInput label="Email AI Officer" type="email" value={cv(editEntity.email_ai_officer)}
              onChange={v => se("email_ai_officer")(v)} placeholder="ai@struttura.it" />

            <ModalSection label="Referente Data Breach — Art. 33 GDPR" />
            <ModalInput label="Nome Referente Breach" value={cv(editEntity.referente_breach)}
              onChange={v => se("referente_breach")(v)} placeholder="Nome Cognome"
              sublabel="Notifica al Garante entro 72h" />
            <ModalInput label="Email Referente Breach" type="email" value={cv(editEntity.email_referente_breach)}
              onChange={v => se("email_referente_breach")(v)} placeholder="breach@struttura.it" />
            <ModalInput label="Telefono Referente Breach" value={cv(editEntity.tel_referente_breach)}
              onChange={v => se("tel_referente_breach")(v)} placeholder="+39 ..."
              sublabel="Reperibilità H24 per gestione incidenti" />

            <ModalSection label="Dati Operativi Struttura" />
            <div className="col-span-2">
              <ModalSelect label="Gestione IT" value={cv(editEntity.gestione_it)}
                onChange={v => se("gestione_it")(v)}
                options={["Completamente interna","Completamente esternalizzata","Mista (interna + fornitori)","Non strutturata / non so"]}
                sublabel="Determina perimetro NIS2 supply chain" />
            </div>
            <div className="col-span-2">
              <ModalSelect label="Modello 231 struttura" value={cv(editEntity.modello_231)}
                onChange={v => se("modello_231")(v)}
                options={["Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)", "In corso di adozione", "No"]} />
            </div>
            <ModalSelect label="N. Ospiti (fascia)" value={cv(editEntity.n_ospiti)}
              onChange={v => se("n_ospiti")(v)}
              options={["Meno di 20", "20–49", "50–99", "100–200", "Oltre 200"]} />
            <ModalSelect label="N. Dipendenti (fascia)" value={cv(editEntity.n_dipendenti)}
              onChange={v => se("n_dipendenti")(v)}
              options={["Meno di 20","20–49","50–249","250 o più"]}
              sublabel="Riferito solo a questa sede" />
          </EditModal>
        )}
      </>
    </AppShell>
  );
}
