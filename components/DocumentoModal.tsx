"use client";

/**
 * CLAVIS — DocumentoModal (componente condiviso)
 * Modal adempimento documentale — tre strade:
 *  BLU   → Carica documento → AI verifica → entity/company_compliance_items stato=VERIFICATO
 *  AMBRA → Autocertifica → stato=DICHIARATO
 *  VERDE → Genera documento con GenerateDocModal
 *
 * Usato da: /documenti (ex /struttura)
 */

import React, { useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";
import type { ComplianceLivello, ComplianceStato } from "@/lib/types";
import { useFeatureGate } from "@/lib/tier";
import type { UserTier } from "@/lib/tier";

// ─── DESIGN TOKENS
const T = {
  ink2:     "#0F1424",
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.16)",
  slate400: "#9AA3BD",
  slate800: "#EEF1F8",
  bronze:   "#D9B25A",
  high:     "#5E86F5",
  highBg:   "rgba(94,134,245,.12)",
  low:      "#3ECF8E",
  lowBg:    "rgba(62,207,142,.10)",
  warn:     "#F59E0B",
  warnBg:   "rgba(245,158,11,.12)",
  critical: "#E8634A",
  critBg:   "rgba(232,99,74,.12)",
  blue:     "#3A6DF0",
  blueBg:   "rgba(58,109,240,.12)",
};

// ─── TIPI
export type { ComplianceLivello, ComplianceStato } from "@/lib/types";

export interface AdempimentoDef {
  tipo: string;
  label: string;
  norma: string;
  descrizione: string;
  producibile: boolean;
  obbligatorio: boolean;
  icon?: string;
  peso?: number;
  maxPagine?: number;
  cosaCaricare?: string;
  modalKey?: string;       // per GenerateDocModal — se assente si usa tipo
  flagKey?: string;        // flag_key reale (Flag_GDPR_DPO) per FLAG_REQUIRED_FIELDS
  linkEsterno?: string;
  linkLabel?: string;
  linkInterno?: string;
  automatico?: boolean;
  condizionale?: boolean;
  condizioneLabel?: string;
}

export interface DocumentoModalProps {
  def: AdempimentoDef;
  livello: ComplianceLivello;
  entityId: string;
  companyId: string | null;
  userId: string;
  entityFullData: EntityData | null;
  companyData: CompanyData | null;
  currentStato: ComplianceStato;
  currentDocNome?: string | null;
  onClose: () => void;
  onUpdate: () => void;
  userTier?: UserTier;
}

// ─── MODAL KEY MAP (tipo → modal_key per GenerateDocModal)
const TIPO_TO_MODAL_KEY: Record<string, string> = {
  NOMINA_DPO:                  "nomina_dpo",
  DELIBERA_CDA:                "pacchetto_cda",
  NOMINA_AI_OFFICER:           "nomina_ai_officer",
  MODELLO_231:                 "modello_231",
  CODICE_ETICO_231:            "circolare_shadow_ai",
  DPIA:                        "dpia_guidata",
  FRIA:                        "fria",
  IRP_INCIDENT_RESPONSE:       "irp",
  BCP_BUSINESS_CONTINUITY:     "bcp",
  PIANO_FORMATIVO:             "piano_formativo_231",
  INFORMATIVA_PRIVACY_PAZIENTI:"informativa_privacy",
  RICHIESTA_DOSSIER_TECNICO_AI:"richiesta_dossier_tecnico_ai",
  ALLEGATO_CLAUSOLA_AIACT:     "allegato_clausola_aiact",
  NOMINA_AI_SUPERVISOR:        "nomina_ai_supervisor",
  PROTOCOLLO_SUPERVISIONE_AI:  "protocollo_supervisione_ai",
  PROCEDURA_INCIDENTI_AI:      "procedura_incidenti_ai",
  INFORMATIVA_TRASPARENZA_AI:  "informativa_trasparenza_ai",
  AUTOCERT_NO_AI_HIGHRISKS:    "autocert_no_ai_highrisks",
  AUTOCERT_NO_MDR:             "autocert_no_mdr",
  EMAIL_REGIONE_FSE:           "email_regione_fse",
  PIANIFICA_TEST_BCP:          "pianifica_test_bcp",
};

// ─── COMPONENTE
export function DocumentoModal({
  def, livello, entityId, companyId, userId,
  entityFullData, companyData, currentStato, currentDocNome,
  onClose, onUpdate, userTier,
}: DocumentoModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const canAnalyzeAI = useFeatureGate("ai_document_analysis", userTier ?? "free");

  // Strada BLU
  type BluPhase = "idle" | "uploading" | "analyzing" | "success" | "error";
  const [showBluZone,  setShowBluZone]  = useState(false);
  const [bluPhase,     setBluPhase]     = useState<BluPhase>("idle");
  const [bluFile,      setBluFile]      = useState<File | null>(null);
  const [bluDragging,  setBluDragging]  = useState(false);
  const [bluError,     setBluError]     = useState<string | null>(null);
  const [bluResult,    setBluResult]    = useState<{ passed: boolean; note: string } | null>(null);
  const [dataDoc,      setDataDoc]      = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Strada AMBRA
  const [showAutocert,    setShowAutocert]    = useState(false);
  const [autocertDocName, setAutocertDocName] = useState(currentDocNome ?? "");
  const [autocertNote,    setAutocertNote]    = useState("");

  // Strada VERDE
  const [generateFlag, setGenerateFlag] = useState<{ flagKey: string; modalKey?: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const isBusy = bluPhase === "uploading" || bluPhase === "analyzing" || saving;
  const tabella = livello === "entity" ? "entity_compliance_items" : "company_compliance_items";
  const whereClause = livello === "entity"
    ? { entity_id: entityId, tipo: def.tipo }
    : { company_id: companyId!, tipo: def.tipo };

  function handleFileDrop(file: File) {
    setBluFile(file);
    setBluError(null);
    setBluResult(null);
    setBluPhase("idle");
  }

  async function handleBluUpload() {
    if (!bluFile) return;
    if (!canAnalyzeAI) { onClose(); window.location.href = "/upgrade"; return; }
    setSaving(true);
    setBluPhase("uploading");
    setBluError(null);
    try {
      const ext  = bluFile.name.split(".").pop();
      const scope = livello === "entity" ? entityId : (companyId ?? entityId);
      const path = `${scope}/${def.tipo}_${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("compliance-docs")
        .upload(path, bluFile, { upsert: false });
      if (upErr) throw new Error("Errore upload: " + upErr.message);

      setBluPhase("analyzing");
      try {
        await supabase.from("compliance_events").insert({
          entity_id: entityId,
          tipo: "caricato",
          documento_key: def.tipo,
          documento_titolo: def.label,
          note: bluFile.name,
        });
      } catch (evtErr) {
        console.error("[compliance_events] insert caricato:", evtErr);
      }

      let fileContent = "";
      if (bluFile.type === "text/plain") fileContent = await bluFile.text();

      const aiPrompt = `Sei un esperto di compliance normativa per strutture sociosanitarie italiane.
Verifica se il documento soddisfa il requisito: "${def.label}" (${def.norma}).
Cosa deve contenere: ${def.cosaCaricare}
${fileContent ? `\nContenuto:\n${fileContent.slice(0, 3000)}` : `\nFile: ${bluFile.name} (${bluFile.type}, ${Math.round(bluFile.size / 1024)}KB)`}
Rispondi SOLO con JSON valido senza backtick:
{"passed": true o false, "note": "spiegazione sintetica max 2 righe"}`;

      const aiRes = await fetch("/api/verify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: aiPrompt }),
      });
      if (!aiRes.ok) throw new Error("Analisi AI non disponibile");
      const aiResult: { passed: boolean; note: string } = await aiRes.json();
      console.log("aiResult:", JSON.stringify(aiResult));
      setBluResult(aiResult);

      const { error: upsertErr } = await supabase.from(tabella).update({
        stato: aiResult.passed ? "CONFORME" : "NON_CONFORME",
        documento_path: path,
        documento_nome: bluFile.name,
        analisi_ok: aiResult.passed,
        analisi_note: aiResult.note,
        data_documento: dataDoc || null,
        data_scadenza: dataScadenza || null,
        updated_at: new Date().toISOString(),
      }).match(whereClause);
      console.log("upsertErr:", JSON.stringify(upsertErr));

      if (aiResult.passed) {
        try {
          await supabase.from("compliance_events").insert({
            entity_id: entityId,
            tipo: "verificato_ai",
            documento_key: def.tipo,
            documento_titolo: def.label,
            note: aiResult.note,
          });
        } catch (evtErr) {
          console.error("[compliance_events] insert verificato_ai:", evtErr);
        }
      }
      setBluPhase(aiResult.passed ? "success" : "error");
      if (aiResult.passed) onUpdate();
    } catch (err: any) {
      setBluError(err.message ?? "Errore imprevisto");
      setBluPhase("idle");
    } finally { setSaving(false); }
  }

  async function handleAutocertifica() {
    if (!autocertDocName.trim()) return;
    setSaving(true);
    try {
      const { error: upsertErr } = await supabase.from(tabella).update({
        stato: "DICHIARATO",
        documento_nome: autocertDocName.trim(),
        note: autocertNote.trim() || null,
        dichiarato_da: userId,
        dichiarato_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).match(whereClause);
      console.log("upsertErr:", JSON.stringify(upsertErr));
      try {
        await supabase.from("compliance_events").insert({
          entity_id: entityId,
          tipo: "autocertificato",
          documento_key: def.tipo,
          documento_titolo: def.label,
          note: autocertNote.trim() || null,
        });
      } catch (evtErr) {
        console.error("[compliance_events] insert autocertificato:", evtErr);
      }
      onUpdate();
      onClose();
    } finally { setSaving(false); }
  }

  const modalKey = def.modalKey ?? TIPO_TO_MODAL_KEY[def.tipo] ?? def.tipo;
  const isClosedOk = currentStato === "CONFORME";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="flex flex-col w-full mx-4"
          style={{
            backgroundColor: T.ink2, border: `1px solid ${T.slate200}`,
            borderRadius: "6px", maxWidth: "560px", maxHeight: "88vh", overflow: "hidden",
          }}>

          {/* Header */}
          <div className="px-5 py-4 border-b flex-shrink-0"
            style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: "20px" }}>{def.icon}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: T.highBg, color: T.high, fontSize: "12px" }}>
                    {def.norma}
                  </span>
                  {!def.obbligatorio && (
                    <span className="text-xs" style={{ color: T.bronze }}>Facoltativo</span>
                  )}
                </div>
                <p className="text-sm font-bold" style={{ color: T.slate800 }}>{def.label}</p>
                <p className="text-xs mt-0.5 leading-snug" style={{ color: T.slate400 }}>{def.descrizione}</p>
              </div>
              <button onClick={onClose} style={{ color: T.slate400, fontSize: "18px", flexShrink: 0 }}>✕</button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Cosa caricare */}
            <div className="px-3 py-2 rounded text-xs leading-relaxed italic"
              style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.slate200}`, color: T.slate400 }}>
              {def.cosaCaricare}
            </div>

            {/* Stato corrente se DICHIARATO */}
            {currentStato === "DICHIARATO" && (
              <div className="px-3 py-2 rounded text-xs"
                style={{ backgroundColor: T.warnBg, border: `1px solid rgba(245,158,11,.2)`, color: T.warn }}>
                ⚠ Attualmente autocertificato{currentDocNome ? ` — "${currentDocNome}"` : ""}. Carica il documento per la verifica CLAVIS.
              </div>
            )}

            {/* CTA STRADE */}
            <div className="flex flex-col gap-2 pt-1">

              {/* BLU */}
              {bluPhase === "success" ? (
                <div className="px-4 py-5 rounded flex flex-col items-center gap-3 text-center"
                  style={{ backgroundColor: "rgba(62,207,142,.07)", border: `1px solid rgba(62,207,142,.3)` }}>
                  <span style={{ fontSize: "32px" }}>✓</span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: T.low }}>Documento acquisito e conforme</p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: T.slate400 }}>{bluResult?.note}</p>
                  </div>
                  <button onClick={onClose}
                    className="px-6 py-2 text-xs font-bold uppercase tracking-widest rounded"
                    style={{ backgroundColor: T.lowBg, color: T.low, border: `1px solid rgba(62,207,142,.35)` }}>
                    Chiudi
                  </button>
                </div>
              ) : bluPhase === "error" ? (
                <div className="px-4 py-3 rounded flex flex-col gap-2"
                  style={{ backgroundColor: T.critBg, border: `1px solid rgba(232,99,74,.3)` }}>
                  <p className="text-xs font-bold" style={{ color: T.critical }}>Documento non conforme</p>
                  <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>{bluResult?.note}</p>
                  <button onClick={() => { setBluPhase("idle"); setBluFile(null); setBluResult(null); setShowBluZone(false); }}
                    className="text-xs self-start underline" style={{ color: T.slate400 }}>
                    ← Riprova
                  </button>
                </div>
              ) : !showBluZone ? (
                <button onClick={() => setShowBluZone(true)} disabled={isBusy}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                  style={{ backgroundColor: T.blueBg, color: T.blue, borderRadius: "4px", border: `1px solid rgba(58,109,240,.4)` }}>
                  ⬆ Carica {def.label}
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: T.blue }}>⬆ Carica {def.label}</span>
                    <button onClick={() => { setShowBluZone(false); setBluFile(null); setBluError(null); }}
                      className="text-xs" style={{ color: T.slate400 }}>✕</button>
                  </div>

                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setBluDragging(true); }}
                    onDragLeave={() => setBluDragging(false)}
                    onDrop={e => { e.preventDefault(); setBluDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
                    onClick={() => !isBusy && fileInputRef.current?.click()}
                    className="w-full rounded cursor-pointer flex flex-col items-center justify-center gap-2 py-5 transition-all"
                    style={{
                      border: `2px dashed ${bluDragging ? T.blue : bluFile ? "rgba(58,109,240,.5)" : T.slate200}`,
                      backgroundColor: bluDragging ? T.blueBg : bluFile ? "rgba(58,109,240,.06)" : "rgba(238,241,248,.03)",
                    }}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }} />
                    {bluFile ? (
                      <>
                        <span style={{ fontSize: "20px" }}>📄</span>
                        <p className="text-xs font-semibold" style={{ color: T.blue }}>{bluFile.name}</p>
                        <p className="text-xs" style={{ color: T.slate400 }}>{Math.round(bluFile.size / 1024)} KB — clicca per cambiare</p>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "20px", color: T.slate400 }}>⬆</span>
                        <p className="text-xs font-semibold" style={{ color: T.slate400 }}>Trascina il documento qui</p>
                        <p className="text-xs" style={{ color: T.slate400, opacity: 0.6 }}>o clicca per selezionare · PDF, DOC, DOCX, TXT</p>
                      </>
                    )}
                  </div>

                  {/* Date */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>Data documento</label>
                      <input type="date" value={dataDoc} onChange={e => setDataDoc(e.target.value)}
                        className="px-2 py-1.5 text-xs outline-none"
                        style={{ backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark", border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800 }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>
                        Data scadenza
                        {def.tipo === "POLIZZA_RC_DM232" || def.tipo === "NOMINA_DPO" ? " *" : " (se applicabile)"}
                      </label>
                      <input type="date" value={dataScadenza} onChange={e => setDataScadenza(e.target.value)}
                        className="px-2 py-1.5 text-xs outline-none"
                        style={{ backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark", border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800 }} />
                    </div>
                  </div>

                  {bluError && <p className="text-xs px-1" style={{ color: T.critical }}>{bluError}</p>}

                  <button onClick={handleBluUpload} disabled={!bluFile || isBusy || !canAnalyzeAI}
                    className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                    style={{
                      backgroundColor: bluFile && !isBusy && canAnalyzeAI ? T.blueBg : "rgba(58,109,240,.05)",
                      color: bluFile && !isBusy && canAnalyzeAI ? T.blue : "rgba(58,109,240,.3)",
                      borderRadius: "4px",
                      border: `1px solid ${bluFile && !isBusy && canAnalyzeAI ? "rgba(58,109,240,.4)" : "transparent"}`,
                      cursor: bluFile && !isBusy && canAnalyzeAI ? "pointer" : "not-allowed",
                    }}>
                    {!canAnalyzeAI ? "🔒 Funzione Pro" : bluPhase === "uploading" ? "⬆ Caricamento..." : bluPhase === "analyzing" ? "⬡ Analisi CLAVIS..." : "⬆ Carica e verifica"}
                  </button>
                </div>
              )}

              {/* AMBRA */}
              {bluPhase !== "success" && (
                !showAutocert ? (
                  <button onClick={() => setShowAutocert(true)} disabled={isBusy}
                    className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                    style={{ backgroundColor: T.warnBg, color: T.warn, borderRadius: "4px", border: `1px solid rgba(245,158,11,.3)`, opacity: isBusy ? 0.4 : 1 }}>
                    ✎ Autocertifica
                  </button>
                ) : (
                  <div className="rounded p-3 flex flex-col gap-3"
                    style={{ backgroundColor: "rgba(245,158,11,.06)", border: `1px solid rgba(245,158,11,.25)` }}>
                    <p className="text-xs leading-relaxed" style={{ color: T.warn }}>
                      ⚠ Stai autocertificando <strong>"{def.label}"</strong> sotto la tua responsabilità.
                      CLAVIS non verificherà il documento — sei tu a dichiararne la conformità.
                    </p>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>Nome / riferimento documento *</label>
                      <input value={autocertDocName} onChange={e => setAutocertDocName(e.target.value)}
                        placeholder="Es: Nomina_DPO_firmata_2025.pdf"
                        className="w-full px-3 py-2 text-xs outline-none"
                        style={{ backgroundColor: "rgba(238,241,248,.06)", border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800, fontFamily: "inherit" }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>Note (opzionale)</label>
                      <input value={autocertNote} onChange={e => setAutocertNote(e.target.value)}
                        placeholder="Es: Firmato dal LR il 15/01/2025, archiviato in cartella condivisa"
                        className="w-full px-3 py-2 text-xs outline-none"
                        style={{ backgroundColor: "rgba(238,241,248,.06)", border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800, fontFamily: "inherit" }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowAutocert(false); setAutocertDocName(currentDocNome ?? ""); }}
                        className="flex-1 py-2 text-xs font-semibold uppercase tracking-widest rounded"
                        style={{ backgroundColor: "rgba(238,241,248,.06)", color: T.slate400, border: `1px solid ${T.slate200}` }}>
                        Annulla
                      </button>
                      <button onClick={handleAutocertifica} disabled={!autocertDocName.trim() || saving}
                        className="flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all"
                        style={{
                          backgroundColor: autocertDocName.trim() ? T.warnBg : "rgba(245,158,11,.04)",
                          color: autocertDocName.trim() ? T.warn : "rgba(245,158,11,.3)",
                          border: `1px solid ${autocertDocName.trim() ? "rgba(245,158,11,.4)" : "transparent"}`,
                          cursor: autocertDocName.trim() && !saving ? "pointer" : "not-allowed",
                        }}>
                        {saving ? "Salvataggio..." : "Confermo →"}
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* VERDE — solo se producibile */}
              {def.producibile && modalKey && bluPhase !== "success" && (
                <button
                  onClick={() => setGenerateFlag({ flagKey: def.flagKey ?? def.tipo, modalKey })}
                  disabled={isBusy}
                  className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                  style={{
                    backgroundColor: "rgba(62,207,142,.15)", color: T.low,
                    borderRadius: "4px", border: "1px solid rgba(62,207,142,.35)",
                    opacity: isBusy ? 0.4 : 1,
                  }}>
                  ⬡ Genera {def.label} con CLAVIS
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GenerateDocModal */}
      {generateFlag && entityFullData && (
        <GenerateDocModal
          flagKey={generateFlag.flagKey}
          modalKey={generateFlag.modalKey}
          entity={entityFullData}
          company={companyData ?? { name: "" }}
          entityId={entityId}
          onClose={() => { setGenerateFlag(null); onUpdate(); onClose(); }}
        />
      )}
    </>
  );
}
