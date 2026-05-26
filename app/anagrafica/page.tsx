"use client";

/**
 * CLAVIS — /anagrafica
 * Tre card affiancate: Società / Struttura / Referenti
 * Ogni card apre un modal dedicato per la modifica.
 * Stessa struttura layout della dashboard.
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
  slate300:  "rgba(238,241,248,.25)",
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

interface CompanyData {
  id: string;
  name: string;
  vat_number: string | null;
  legal_address: string | null;
  codice_fiscale: string | null;
  pec: string | null;
  legale_rappresentante: string | null;
  fatturato_fascia: string | null;
  n_dipendenti_fascia: string | null;
  modello_231: string | null;
  storico_violazioni: boolean;
  storico_violazioni_note: string | null;
}

interface EntityData {
  id: string;
  name: string;
  entity_type: string | null;
  region: string | null;
  total_beds: number | null;
  address: string | null;
  n_dipendenti: string | null;
  convenzione_ssn: boolean;
  tipo_convenzione: string | null;
  gestione_it: string | null;
  nome_dpo: string | null;
  email_dpo: string | null;
  dpo_qualifica: string | null;
  dpo_telefono: string | null;
  responsabile_it: string | null;
  email_responsabile_it: string | null;
  ai_officer: string | null;
  email_ai_officer: string | null;
}

// ─── HELPERS UI

const cv = (v: string | null | undefined) => v ?? "";

function Field({ label, value, missing }: { label: string; value: string | null | undefined; missing?: boolean }) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "9px" }}>{label}</span>
      {empty ? (
        <span className="text-xs font-mono italic" style={{ color: missing ? T.critical : T.slate400, fontSize: "11px" }}>
          {missing ? "⚠ mancante" : "—"}
        </span>
      ) : (
        <span className="text-xs font-semibold truncate" style={{ color: T.slate800, fontSize: "12px" }}>{value}</span>
      )}
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
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "9px" }}>MANCANTE</span>
        )}
        {!empty && <span style={{ color: T.low, fontSize: "10px" }}>✓</span>}
      </div>
      {sublabel && <p className="text-xs" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>}
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
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "9px" }}>MANCANTE</span>
        )}
        {!empty && <span style={{ color: T.low, fontSize: "10px" }}>✓</span>}
      </div>
      {sublabel && <p className="text-xs" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>}
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
        {sublabel && <p className="text-xs mt-0.5" style={{ color: T.slate400, fontSize: "10px" }}>{sublabel}</p>}
      </div>
      <button onClick={() => onChange(!value)} style={{ width: "40px", height: "22px", borderRadius: "11px", backgroundColor: value ? T.low : T.slate200, position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: "3px", left: value ? "20px" : "3px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

// ─── SEPARATORE SEZIONE MODAL
function ModalSection({ label }: { label: string }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-2">
      <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
      <span className="text-xs font-mono uppercase tracking-widest px-2" style={{ color: T.bronze, fontSize: "9px" }}>{label}</span>
      <div className="h-px flex-1" style={{ backgroundColor: T.slate200 }} />
    </div>
  );
}

// ─── MODAL BASE
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
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>{title}</p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-lg transition-opacity hover:opacity-60" style={{ color: T.slate400 }}>✕</button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-4">{children}</div>
        </div>
        {/* Footer */}
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
              borderRadius: "4px", border: saved ? `1px solid rgba(62,207,142,.4)` : "none",
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

  // Modal states
  const [modalOpen, setModalOpen] = useState<"societa" | "struttura" | "referenti" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state — cloni editabili
  const [editCompany, setEditCompany] = useState<CompanyData | null>(null);
  const [editEntity, setEditEntity] = useState<EntityData | null>(null);

  // ─── LOAD
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("*").eq("id", storedEntityId).single()
        : supabase.from("entities").select("*").eq("created_by", user.id).limit(1).single();
      const { data: entityData } = await entityQuery;
      if (!entityData) { router.push("/onboarding"); return; }

      setEntity(entityData as EntityData);

      const { data: compData } = await supabase
        .from("companies").select("*").eq("id", entityData.company_id).single();
      if (compData) setCompany(compData as CompanyData);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── OPEN MODAL
  function openModal(type: "societa" | "struttura" | "referenti") {
    setEditCompany(company ? { ...company } : null);
    setEditEntity(entity ? { ...entity } : null);
    setSaved(false);
    setModalOpen(type);
  }

  // ─── SAVE
  async function handleSave() {
    if (!editCompany || !editEntity) return;
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        supabase.from("companies").update({
          name: editCompany.name,
          vat_number: editCompany.vat_number,
          legal_address: editCompany.legal_address,
          codice_fiscale: editCompany.codice_fiscale,
          pec: editCompany.pec,
          legale_rappresentante: editCompany.legale_rappresentante,
          fatturato_fascia: editCompany.fatturato_fascia,
          n_dipendenti_fascia: editCompany.n_dipendenti_fascia,
          modello_231: editCompany.modello_231,
          storico_violazioni: editCompany.storico_violazioni,
          storico_violazioni_note: editCompany.storico_violazioni_note,
        }).eq("id", editCompany.id),
        supabase.from("entities").update({
          name: editEntity.name,
          entity_type: editEntity.entity_type,
          region: editEntity.region,
          total_beds: editEntity.total_beds,
          address: editEntity.address,
          n_dipendenti: editEntity.n_dipendenti,
          convenzione_ssn: editEntity.convenzione_ssn,
          tipo_convenzione: editEntity.tipo_convenzione,
          gestione_it: editEntity.gestione_it,
          nome_dpo: editEntity.nome_dpo,
          email_dpo: editEntity.email_dpo,
          dpo_qualifica: editEntity.dpo_qualifica,
          dpo_telefono: editEntity.dpo_telefono,
          responsabile_it: editEntity.responsabile_it,
          email_responsabile_it: editEntity.email_responsabile_it,
          ai_officer: editEntity.ai_officer,
          email_ai_officer: editEntity.email_ai_officer,
        }).eq("id", editEntity.id),
      ]);
      // Aggiorna stato locale
      setCompany({ ...editCompany });
      setEntity({ ...editEntity });
      setSaved(true);
      setTimeout(() => { setSaved(false); setModalOpen(null); }, 1500);
    } finally {
      setSaving(false);
    }
  }

  const sc = (field: keyof CompanyData) => (v: string | boolean) =>
    setEditCompany(prev => prev ? { ...prev, [field]: v || null } : prev);
  const se = (field: keyof EntityData) => (v: string | boolean | number | null) =>
    setEditEntity(prev => prev ? { ...prev, [field]: v } : prev);

  // ─── COMPLETENESS BADGE
  function badge(filled: number, total: number) {
    const pct = Math.round((filled / total) * 100);
    const color = pct === 100 ? T.low : pct >= 60 ? T.bronze : T.critical;
    return { pct, color };
  }

  const societaBadge = badge([
    company?.name, company?.vat_number, company?.legal_address,
    company?.legale_rappresentante, company?.pec,
  ].filter(Boolean).length, 5);

  const strutturaBadge = badge([
    entity?.name, entity?.entity_type, entity?.region, entity?.total_beds,
  ].filter(Boolean).length, 4);

  const referentiBadge = badge([
    entity?.nome_dpo, entity?.email_dpo, entity?.dpo_qualifica,
    entity?.responsabile_it,
  ].filter(Boolean).length, 4);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  // ─── SIDEBAR ITEMS (replica dashboard)
  const navItems = [
    { icon: "◈", label: "Panoramica", route: "/dashboard" },
    { icon: "⬡", label: "Remediation", route: "/remediation" },
    { icon: "◷", label: "Scadenze", route: "/scadenze" },
    { icon: "⬒", label: "Struttura", route: "/struttura" },
    { icon: "⬡", label: "Fornitori", route: "/fornitori" },
    { icon: "🏢", label: "Anagrafica", route: "/anagrafica", active: true },
  ];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--ink, #0A0E1A)" }}>

      {/* ── SIDEBAR */}
      <aside className="flex-shrink-0 flex flex-col border-r"
        style={{ width: "200px", borderColor: T.slate200, backgroundColor: "var(--ink2, #0F1424)" }}>
        {/* Logo */}
        <div className="px-5 py-4 border-b" style={{ borderColor: T.slate200 }}>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: T.slate800 }}>CLAVIS</p>
          <p className="text-xs" style={{ color: T.slate400, fontSize: "9px" }}>Governance Normativa</p>
        </div>
        {/* Nav */}
        <nav className="flex-1 py-3">
          {navItems.map(item => (
            <button key={item.route} onClick={() => router.push(item.route)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                backgroundColor: item.active ? T.highBg : "transparent",
                borderLeft: item.active ? `2px solid ${T.high}` : "2px solid transparent",
                color: item.active ? T.slate800 : T.slate400,
              }}>
              <span style={{ fontSize: "14px" }}>{item.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>
        {/* Entity selector */}
        <div className="px-3 py-3 border-t" style={{ borderColor: T.slate200 }}>
          <EntitySelector />
        </div>
      </aside>

      {/* ── MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex-shrink-0 border-b flex items-center justify-between px-6 py-3"
          style={{ borderColor: T.slate200, backgroundColor: "var(--ink2, #0F1424)", height: "52px" }}>
          <div>
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Anagrafica</span>
            <span className="text-xs ml-2" style={{ color: T.slate400 }}>(Company Profile)</span>
          </div>
          <p className="text-xs" style={{ color: T.slate400 }}>
            I dati qui sono usati automaticamente per generare i documenti CLAVIS
          </p>
        </header>

        {/* Contenuto */}
        <div className="flex-1 overflow-y-auto px-6 py-6">

          {/* 3 CARD AFFIANCATE */}
          <div className="grid grid-cols-3 gap-4">

            {/* ── CARD SOCIETÀ */}
            <div className="flex flex-col border" style={{
              backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200,
              borderRadius: "6px", borderTopWidth: "3px", borderTopColor: societaBadge.color,
            }}>
              {/* Card header */}
              <div className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Società</p>
                    <p className="text-xs" style={{ color: T.slate400, fontSize: "9px" }}>Legal Entity</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: societaBadge.color, fontSize: "10px" }}>
                  {societaBadge.pct}%
                </span>
              </div>
              {/* Dati */}
              <div className="flex-1 px-4 py-4 space-y-3">
                <Field label="Ragione Sociale" value={company?.name} missing />
                <Field label="P.IVA" value={company?.vat_number} missing />
                <Field label="Sede Legale" value={company?.legal_address} />
                <Field label="Legale Rappresentante" value={company?.legale_rappresentante} missing />
                <Field label="PEC" value={company?.pec} />
                <Field label="Modello 231" value={company?.modello_231} />
              </div>
              {/* Bottone */}
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("societa")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: `1px solid rgba(94,134,245,.3)` }}>
                  Modifica dati →
                </button>
              </div>
            </div>

            {/* ── CARD STRUTTURA */}
            <div className="flex flex-col border" style={{
              backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200,
              borderRadius: "6px", borderTopWidth: "3px", borderTopColor: strutturaBadge.color,
            }}>
              <div className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏥</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Struttura</p>
                    <p className="text-xs" style={{ color: T.slate400, fontSize: "9px" }}>Facility</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: strutturaBadge.color, fontSize: "10px" }}>
                  {strutturaBadge.pct}%
                </span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                <Field label="Nome Struttura" value={entity?.name} missing />
                <Field label="Tipologia" value={entity?.entity_type} missing />
                <Field label="Regione" value={entity?.region} missing />
                <Field label="Posti letto" value={entity?.total_beds?.toString()} missing />
                <Field label="Indirizzo" value={entity?.address} />
                <Field label="Convenzione SSN" value={entity?.convenzione_ssn ? `Sì — ${entity.tipo_convenzione ?? ""}` : "No"} />
                <Field label="Gestione IT" value={entity?.gestione_it} />
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("struttura")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: `1px solid rgba(94,134,245,.3)` }}>
                  Modifica dati →
                </button>
              </div>
            </div>

            {/* ── CARD REFERENTI */}
            <div className="flex flex-col border" style={{
              backgroundColor: "var(--ink2, #0F1424)", borderColor: T.slate200,
              borderRadius: "6px", borderTopWidth: "3px", borderTopColor: referentiBadge.color,
            }}>
              <div className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👤</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Referenti</p>
                    <p className="text-xs" style={{ color: T.slate400, fontSize: "9px" }}>Key Contacts</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold" style={{ color: referentiBadge.color, fontSize: "10px" }}>
                  {referentiBadge.pct}%
                </span>
              </div>
              <div className="flex-1 px-4 py-4 space-y-3">
                {/* DPO */}
                <div className="pb-2 border-b" style={{ borderColor: T.slate200 }}>
                  <p className="text-xs font-mono uppercase mb-2" style={{ color: T.bronze, fontSize: "9px" }}>DPO</p>
                  <div className="space-y-2">
                    <Field label="Nome" value={entity?.nome_dpo} missing />
                    <Field label="Email" value={entity?.email_dpo} missing />
                    <Field label="Qualifica" value={entity?.dpo_qualifica} missing />
                    <Field label="Telefono" value={entity?.dpo_telefono} />
                  </div>
                </div>
                {/* Responsabile IT */}
                <div className="pb-2 border-b" style={{ borderColor: T.slate200 }}>
                  <p className="text-xs font-mono uppercase mb-2" style={{ color: T.bronze, fontSize: "9px" }}>Resp. IT</p>
                  <div className="space-y-2">
                    <Field label="Nome" value={entity?.responsabile_it} />
                    <Field label="Email" value={entity?.email_responsabile_it} />
                  </div>
                </div>
                {/* AI Officer */}
                <div>
                  <p className="text-xs font-mono uppercase mb-2" style={{ color: T.bronze, fontSize: "9px" }}>AI Officer</p>
                  <div className="space-y-2">
                    <Field label="Nome" value={entity?.ai_officer} />
                    <Field label="Email" value={entity?.email_ai_officer} />
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t" style={{ borderColor: T.slate200 }}>
                <button onClick={() => openModal("referenti")}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.highBg, color: T.high, borderRadius: "4px", border: `1px solid rgba(94,134,245,.3)` }}>
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
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MODAL SOCIETÀ
      ══════════════════════════════════════════ */}
      {modalOpen === "societa" && editCompany && (
        <EditModal title="Società" subtitle="Legal Entity — dati societari"
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
            <ModalInput label="Sede Legale" required value={cv(editCompany.legal_address)}
              onChange={v => sc("legal_address")(v)} placeholder="Via, Città, CAP" />
          </div>
          <ModalInput label="Legale Rappresentante" required value={cv(editCompany.legale_rappresentante)}
            onChange={v => sc("legale_rappresentante")(v)} placeholder="Nome Cognome"
            sublabel="Firma i documenti societari" />
          <ModalInput label="PEC" type="email" value={cv(editCompany.pec)}
            onChange={v => sc("pec")(v)} placeholder="pec@società.it" />

          <ModalSection label="Profilo rischio" />

          <ModalSelect label="Fatturato annuo" value={cv(editCompany.fatturato_fascia)}
            onChange={v => sc("fatturato_fascia")(v)}
            options={["Sotto 2M", "2M_5M", "5M_20M", "20M_50M", "Oltre 50M"]}
            sublabel="Incide sul calcolo sanzioni" />
          <ModalSelect label="Dipendenti totali società" value={cv(editCompany.n_dipendenti_fascia)}
            onChange={v => sc("n_dipendenti_fascia")(v)}
            options={["Meno di 20", "20_49", "50_249", "250 o più"]}
            sublabel="Soglia 50 = soggetto NIS2" />
          <div className="col-span-2">
            <ModalSelect label="Modello 231" value={cv(editCompany.modello_231)}
              onChange={v => sc("modello_231")(v)}
              options={["Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)", "In corso di adozione", "No"]}
              sublabel="Responsabilità amministrativa dell'ente — D.Lgs. 231/2001" />
          </div>
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
        </EditModal>
      )}

      {/* ══════════════════════════════════════════
          MODAL STRUTTURA
      ══════════════════════════════════════════ */}
      {modalOpen === "struttura" && editEntity && (
        <EditModal title="Struttura Sanitaria" subtitle="Facility — dati operativi"
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
          <ModalSelect label="Dipendenti in questa struttura" value={cv(editEntity.n_dipendenti)}
            onChange={v => se("n_dipendenti")(v)}
            options={["Meno di 20","20–49","50–249","250 o più"]}
            sublabel="Riferito solo a questa sede" />
          <div className="col-span-2">
            <ModalInput label="Indirizzo struttura" value={cv(editEntity.address)}
              onChange={v => se("address")(v)} placeholder="Via, Città, CAP" />
          </div>
          <div className="col-span-2">
            <ModalSelect label="Gestione IT" value={cv(editEntity.gestione_it)}
              onChange={v => se("gestione_it")(v)}
              options={["Completamente interna","Completamente esternalizzata","Mista (interna + fornitori)","Non strutturata / non so"]}
              sublabel="Determina perimetro NIS2 supply chain" />
          </div>
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

      {/* ══════════════════════════════════════════
          MODAL REFERENTI
      ══════════════════════════════════════════ */}
      {modalOpen === "referenti" && editEntity && (
        <EditModal title="Referenti e Responsabili" subtitle="Key Contacts — usati nei documenti generati"
          onClose={() => setModalOpen(null)} onSave={handleSave} saving={saving} saved={saved}>

          <ModalSection label="DPO — Responsabile Protezione Dati" />
          <ModalInput label="Nome DPO" required value={cv(editEntity.nome_dpo)}
            onChange={v => se("nome_dpo")(v)} placeholder="Nome Cognome"
            sublabel="Obbligatorio — Art. 37 GDPR" />
          <ModalInput label="Email DPO" required type="email" value={cv(editEntity.email_dpo)}
            onChange={v => se("email_dpo")(v)} placeholder="dpo@struttura.it" />
          <ModalSelect label="Qualifica DPO" required value={cv(editEntity.dpo_qualifica)}
            onChange={v => se("dpo_qualifica")(v)}
            options={["Dipendente interno","Consulente esterno","Società esterna"]}
            sublabel="Incide sulle clausole contrattuali" />
          <ModalInput label="Telefono DPO" value={cv(editEntity.dpo_telefono)}
            onChange={v => se("dpo_telefono")(v)} placeholder="+39 ..." />

          <ModalSection label="Responsabile IT / Sicurezza" />
          <ModalInput label="Nome Responsabile IT" value={cv(editEntity.responsabile_it)}
            onChange={v => se("responsabile_it")(v)} placeholder="Nome Cognome o Società"
            sublabel="Usato in BCP, IRP e policy tecniche" />
          <ModalInput label="Email Responsabile IT" type="email" value={cv(editEntity.email_responsabile_it)}
            onChange={v => se("email_responsabile_it")(v)} placeholder="it@struttura.it" />

          <ModalSection label="AI Officer — Art. 26 AI Act" />
          <ModalInput label="Nome AI Officer" value={cv(editEntity.ai_officer)}
            onChange={v => se("ai_officer")(v)} placeholder="Nome Cognome"
            sublabel="Responsabile sistemi AI ad alto rischio — best practice" />
          <ModalInput label="Email AI Officer" type="email" value={cv(editEntity.email_ai_officer)}
            onChange={v => se("email_ai_officer")(v)} placeholder="ai@struttura.it" />
        </EditModal>
      )}
    </div>
  );
}
