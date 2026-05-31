"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import { EmailBuilderModal } from "./EmailBuilderModal";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";

// ─── DESIGN TOKENS
const T = {
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.16)",
  slate400: "#9AA3BD",
  slate600: "#9AA3BD",
  slate800: "#EEF1F8",
  high:     "#5E86F5",
  highBg:   "rgba(94,134,245,.12)",
  low:      "#3ECF8E",
  lowBg:    "rgba(62,207,142,.10)",
  gold:     "#D9B25A",
  critical: "#E8634A",
};

// ─── TYPES
interface SubAction {
  type: string;
  label: string;
  modal_key?: string;
  url?: string;
  ai_check?: string;
  ai_extract?: boolean;
  description?: string;
}

interface ActionStep {
  step: number;
  type: string;
  color?: string;
  label: string;
  description?: string;
  modal_key?: string;
  url?: string;
  output?: string;
  ai_check?: string;
  option_yes?: SubAction;
  option_no?: SubAction;
  option_internal?: SubAction;
  option_external?: SubAction;
  outcome_none?: { type: string; label: string; modal_key?: string; output?: string };
  outcome_some?: { next_step?: number };
  outcome_not_applicable?: string;
}

export interface StepFlowModalProps {
  flagKey: string;
  entityId: string;
  entity: EntityData;
  company: CompanyData;
  onClose: () => void;
  onGenerate?: (modalKey: string, flagKey: string) => void;
}

// ─── SMALL ATOMS
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded text-sm leading-relaxed"
      style={{ background: "rgba(94,134,245,0.07)", border: "1px solid rgba(94,134,245,0.2)", color: T.slate400 }}>
      {children}
    </div>
  );
}

function DoneBox({ label }: { label?: string }) {
  return (
    <div className="p-3 rounded flex items-center gap-2"
      style={{ background: T.lowBg, border: "1px solid rgba(62,207,142,0.35)" }}>
      <span style={{ color: T.low }}>✓</span>
      <span className="text-sm font-semibold" style={{ color: T.low }}>{label ?? "Completato"}</span>
    </div>
  );
}

function GreenBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="px-5 py-2.5 text-sm font-bold uppercase tracking-widest"
      style={{ background: "rgba(62,207,142,.12)", border: "1px solid rgba(62,207,142,.4)", color: T.low, borderRadius: "4px" }}>
      {children}
    </button>
  );
}

function BlueBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-5 py-2.5 text-sm font-bold uppercase tracking-widest"
      style={{ background: "var(--shield, #3A6DF0)", color: "var(--bone)", borderRadius: "4px", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

// ─── UPLOAD ZONE (shared sub-component)
function UploadZone({
  uploadFile, uploadDone, uploadDragging, uploadError, uploadLoading,
  onFile, onDragOver, onDragLeave, onDrop, onUpload, inputId,
}: {
  uploadFile: File | null; uploadDone: boolean; uploadDragging: boolean;
  uploadError: string | null; uploadLoading: boolean;
  onFile: (f: File) => void; onDragOver: () => void; onDragLeave: () => void;
  onDrop: (f: File) => void; onUpload: () => void; inputId: string;
}) {
  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); onDragOver(); }}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }}
        onClick={() => !uploadDone && document.getElementById(inputId)?.click()}
        className="rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
        style={{
          minHeight: "110px",
          border: `2px dashed ${uploadDragging ? T.high : uploadDone ? "rgba(62,207,142,0.5)" : "rgba(94,134,245,0.3)"}`,
          background: uploadDragging ? T.highBg : uploadDone ? T.lowBg : "rgba(94,134,245,0.04)",
        }}>
        <input id={inputId} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); } }} />
        {uploadDone
          ? <span className="text-sm font-semibold" style={{ color: T.low }}>✓ Documento caricato</span>
          : uploadFile
          ? <><span className="text-sm" style={{ color: T.slate800 }}>{uploadFile.name}</span>
              <span className="text-xs" style={{ color: T.slate400 }}>Clicca per cambiare</span></>
          : <><span className="text-2xl">📄</span>
              <span className="text-sm" style={{ color: T.slate400 }}>Trascina il file qui o clicca</span>
              <span className="text-xs" style={{ color: T.slate600 }}>PDF, Word, immagine</span></>
        }
      </div>
      {uploadError && <p className="text-xs" style={{ color: T.critical }}>{uploadError}</p>}
      {uploadFile && !uploadDone && (
        <BlueBtn onClick={onUpload} disabled={uploadLoading}>
          {uploadLoading ? "Caricamento..." : "Carica documento →"}
        </BlueBtn>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT
export function StepFlowModal({ flagKey, entityId, entity, company, onClose, onGenerate }: StepFlowModalProps) {
  const router  = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flag      = (LEGAL_DICT as any).flags?.[flagKey];
  const steps     = (flag?.action_steps ?? []) as ActionStep[];
  const flagTitle = (flag?.title_director ?? flag?.label ?? flagKey) as string;

  // ─── CORE STATE
  const [currentStep,    setCurrentStep]    = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepDone,       setStepDone]       = useState(false);
  const [allDone,        setAllDone]        = useState(false);
  const [saving,         setSaving]         = useState(false);

  // ─── SUB-MODAL STATE
  const [showEmail, setShowEmail] = useState(false);

  // ─── UPLOAD STATE
  const [uploadFile,     setUploadFile]     = useState<File | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadLoading,  setUploadLoading]  = useState(false);
  const [uploadDone,     setUploadDone]     = useState(false);
  const [uploadError,    setUploadError]    = useState<string | null>(null);

  // ─── ACQUIRE_OR_GENERATE STATE
  const [acquireChoice,  setAcquireChoice]  = useState<"yes" | "no" | null>(null);
  const [acquireSubDone, setAcquireSubDone] = useState(false);

  // ─── CHECKLIST STATE
  const [checklistOutcome, setChecklistOutcome] = useState<"none" | "some" | null>(null);

  // ─── CHOICE (internal/external) STATE
  const [choiceSelection, setChoiceSelection] = useState<"internal" | "external" | null>(null);
  const [choiceSubDone,   setChoiceSubDone]   = useState(false);

  // ─── DATE INPUT STATE
  const [dateValue, setDateValue] = useState("");

  // ─── AUTO STATE
  const [autoCheckDone, setAutoCheckDone] = useState(false);

  const step       = steps[currentStep] ?? null;
  const totalSteps = steps.length;

  // Reset per-step transient state on navigation
  useEffect(() => {
    setStepDone(false);
    setUploadFile(null); setUploadDone(false); setUploadError(null); setUploadLoading(false); setUploadDragging(false);
    setAcquireChoice(null); setAcquireSubDone(false);
    setChecklistOutcome(null);
    setChoiceSelection(null); setChoiceSubDone(false);
    setDateValue("");
    setAutoCheckDone(false);
    setShowEmail(false);

    if (step?.type === "info") setStepDone(true);
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-execute auto_check / auto_from_registry
  useEffect(() => {
    if (step?.type !== "auto_check" && step?.type !== "auto_from_registry") return;
    const t = setTimeout(() => { setAutoCheckDone(true); setStepDone(true); }, 900);
    return () => clearTimeout(t);
  }, [currentStep, step?.type]);

  // ─── HELPERS
  const logStep = useCallback(async (actionType: string, actionNote: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("compliance_activity_log").insert({
      entity_id:   entityId,
      flag_key:    flagKey,
      action_type: actionType,
      action_note: actionNote,
      performed_by: user.id,
    });
  }, [supabase, entityId, flagKey]);

  const markStepDone = useCallback(() => {
    setStepDone(true);
    setCompletedSteps(prev => { const n = new Set(prev); n.add(currentStep); return n; });
    if (step) logStep(step.type, step.label);
  }, [currentStep, step, logStep]);

  const handleUpload = useCallback(async (): Promise<boolean> => {
    if (!uploadFile) return false;
    setUploadLoading(true);
    setUploadError(null);
    try {
      const path = `documents/${entityId}/${flagKey}/step${currentStep}_${Date.now()}_${uploadFile.name}`;
      const { error } = await supabase.storage
        .from("compliance-docs")
        .upload(path, uploadFile, { upsert: true });
      if (error) throw error;
      setUploadDone(true);
      return true;
    } catch {
      setUploadError("Errore durante il caricamento. Controlla la connessione e riprova.");
      return false;
    } finally {
      setUploadLoading(false);
    }
  }, [uploadFile, entityId, flagKey, currentStep, supabase]);

  const handleNext = useCallback(async () => {
    if (!stepDone || saving) return;
    if (currentStep >= totalSteps - 1) {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("remediation_plans")
        .update({ status: "completato", completed_at: new Date().toISOString(), completed_by: user?.id })
        .eq("entity_id", entityId).eq("flag_key", flagKey);
      await logStep("completed_flow", `Flusso completato — ${totalSteps} step`);
      setSaving(false);
      setAllDone(true);
      setTimeout(() => onClose(), 2200);
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [stepDone, saving, currentStep, totalSteps, supabase, entityId, flagKey, logStep, onClose]);

  // ─── ALL DONE SCREEN
  if (allDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
        <div className="flex flex-col items-center gap-5 p-10 max-w-xs w-full text-center"
          style={{ background: "var(--ink2)", border: "1px solid rgba(62,207,142,0.45)", borderRadius: "10px" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(62,207,142,0.12)", border: "2px solid rgba(62,207,142,0.4)" }}>
            <span className="text-3xl" style={{ color: T.low }}>✓</span>
          </div>
          <p className="text-xl font-bold" style={{ color: T.low }}>Adempimento completato</p>
          <p className="text-sm" style={{ color: T.slate400 }}>Il piano è stato aggiornato automaticamente.</p>
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.72)" }}>
        <div className="p-8 max-w-sm w-full text-center" style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "8px" }}>
          <p className="text-sm" style={{ color: T.slate400 }}>Nessuno step definito per questo flag.</p>
          <button onClick={onClose} className="mt-4 text-xs px-4 py-2" style={{ border: "1px solid var(--line2)", color: T.slate600, borderRadius: "4px" }}>Chiudi</button>
        </div>
      </div>
    );
  }

  const progressPct = totalSteps > 0 ? Math.round((completedSteps.size / totalSteps) * 100) : 0;

  // ─── STEP BODY RENDERER
  function renderBody() {
    switch (step!.type) {

      // ── INFO: testo statico, "Avanti" subito abilitato
      case "info":
        return step!.description ? <InfoBox>{step!.description}</InfoBox> : null;

      // ── AUTO CHECK / AUTO FROM REGISTRY
      case "auto_check":
      case "auto_from_registry":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            <div className="p-3 rounded flex items-center gap-2 transition-all"
              style={{ background: autoCheckDone ? T.lowBg : "rgba(94,134,245,.07)", border: `1px solid ${autoCheckDone ? "rgba(62,207,142,0.35)" : "rgba(94,134,245,.2)"}` }}>
              {autoCheckDone
                ? <><span style={{ color: T.low }}>✓</span><span className="text-sm font-semibold" style={{ color: T.low }}>Verifica completata</span></>
                : <><span className="text-xs animate-pulse" style={{ color: T.high }}>⟳</span><span className="text-xs" style={{ color: T.high }}>Analisi in corso...</span></>
              }
            </div>
          </div>
        );

      // ── UPLOAD: drag & drop + Supabase storage
      case "upload":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            <UploadZone
              uploadFile={uploadFile} uploadDone={uploadDone} uploadDragging={uploadDragging}
              uploadError={uploadError} uploadLoading={uploadLoading}
              inputId="sfm-upload-main"
              onFile={f => { setUploadFile(f); setUploadDone(false); }}
              onDragOver={() => setUploadDragging(true)}
              onDragLeave={() => setUploadDragging(false)}
              onDrop={f => { setUploadFile(f); setUploadDone(false); }}
              onUpload={async () => { const ok = await handleUpload(); if (ok) markStepDone(); }}
            />
          </div>
        );

      // ── GENERATE: delega sempre al parent via onGenerate
      case "generate":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {stepDone
              ? <DoneBox label="Documento generato" />
              : <GreenBtn onClick={() => onGenerate?.(step!.modal_key ?? flagKey, flagKey)}>
                  → Genera documento
                </GreenBtn>
            }
          </div>
        );

      // ── EMAIL: apre EmailBuilderModal
      case "email":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {stepDone
              ? <DoneBox label="Email preparata" />
              : <GreenBtn onClick={() => setShowEmail(true)}>→ Apri builder email</GreenBtn>
            }
          </div>
        );

      // ── FORNITORI: router.push
      case "fornitori":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {stepDone
              ? <DoneBox label="Apertura avviata" />
              : <button
                  onClick={() => { router.push(step!.url ?? "/fornitori"); markStepDone(); }}
                  className="px-5 py-2.5 text-sm font-bold uppercase tracking-widest"
                  style={{ border: "1px solid var(--shield)", color: "var(--shield-soft)", borderRadius: "4px" }}>
                  → Vai al Registro Fornitori
                </button>
            }
          </div>
        );

      // ── EXTERNAL: window.open
      case "external":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {stepDone
              ? <DoneBox label="Aperto in nuova scheda" />
              : <button
                  onClick={() => { window.open(step!.url, "_blank", "noopener,noreferrer"); markStepDone(); }}
                  className="px-5 py-2.5 text-sm font-bold uppercase tracking-widest"
                  style={{ border: "1px solid var(--warn)", color: "var(--warn)", borderRadius: "4px" }}>
                  → Apri sito esterno ↗
                </button>
            }
          </div>
        );

      // ── DATE INPUT
      case "date_input":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Data</label>
              <input type="date" value={dateValue}
                onChange={e => {
                  setDateValue(e.target.value);
                  if (e.target.value && !stepDone) markStepDone();
                }}
                className="px-3 py-2 text-sm outline-none"
                style={{ background: "rgba(238,241,248,.06)", border: "1px solid rgba(238,241,248,.16)", borderRadius: "4px", color: T.slate800 }} />
            </div>
          </div>
        );

      // ── CHECKLIST: domanda + radio sì/no con rami outcome
      case "checklist":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            <div className="space-y-2">
              {(["some", "none"] as const).map((outcome, i) => {
                const label = outcome === "some" ? "Sì — applicabile" : "No — non applicabile";
                return (
                  <label key={outcome}
                    className="flex items-center gap-3 cursor-pointer p-3 rounded transition-colors"
                    style={{
                      background: checklistOutcome === outcome ? "rgba(94,134,245,.08)" : "rgba(238,241,248,.04)",
                      border: `1px solid ${checklistOutcome === outcome ? "rgba(94,134,245,.3)" : "rgba(238,241,248,.1)"}`,
                    }}>
                    <input type="radio" name="sfm_checklist" value={outcome}
                      checked={checklistOutcome === outcome}
                      onChange={() => {
                        setChecklistOutcome(outcome);
                        if (!stepDone) markStepDone();
                      }} />
                    <span className="text-sm" style={{ color: T.slate800 }}>{label}</span>
                  </label>
                );
              })}
            </div>
            {checklistOutcome === "none" && step!.outcome_none && (
              <div className="p-3 rounded space-y-2"
                style={{ background: "rgba(62,207,142,.06)", border: "1px solid rgba(62,207,142,.25)" }}>
                <p className="text-xs font-semibold" style={{ color: T.low }}>→ {step!.outcome_none.label}</p>
                <GreenBtn onClick={() => onGenerate?.(step!.outcome_none!.modal_key ?? flagKey, flagKey)}>
                  → Genera autocertificazione
                </GreenBtn>
              </div>
            )}
          </div>
        );

      // ── ACQUIRE OR GENERATE: sì/no con sub-azioni
      case "acquire_or_generate":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}

            {!acquireChoice && (
              <div className="flex gap-3">
                <button onClick={() => setAcquireChoice("yes")}
                  className="flex-1 py-3 text-sm font-bold uppercase tracking-widest"
                  style={{ border: "1px solid var(--shield)", color: "var(--shield-soft)", borderRadius: "4px" }}>
                  ✓ Sì, ce l'ho
                </button>
                <button onClick={() => setAcquireChoice("no")}
                  className="flex-1 py-3 text-sm font-bold uppercase tracking-widest"
                  style={{ background: "rgba(62,207,142,.10)", border: "1px solid rgba(62,207,142,.4)", color: T.low, borderRadius: "4px" }}>
                  ✗ No, non ce l'ho
                </button>
              </div>
            )}

            {/* SUB-AZIONE SÌ */}
            {acquireChoice === "yes" && step!.option_yes && (
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: T.slate400 }}>
                  → {step!.option_yes.label}
                </p>
                {acquireSubDone
                  ? <DoneBox />
                  : step!.option_yes.type === "upload"
                  ? <UploadZone
                      uploadFile={uploadFile} uploadDone={uploadDone} uploadDragging={uploadDragging}
                      uploadError={uploadError} uploadLoading={uploadLoading}
                      inputId="sfm-upload-acq-yes"
                      onFile={f => { setUploadFile(f); setUploadDone(false); }}
                      onDragOver={() => setUploadDragging(true)}
                      onDragLeave={() => setUploadDragging(false)}
                      onDrop={f => { setUploadFile(f); setUploadDone(false); }}
                      onUpload={async () => { const ok = await handleUpload(); if (ok) { setAcquireSubDone(true); markStepDone(); } }}
                    />
                  : null
                }
              </div>
            )}

            {/* SUB-AZIONE NO */}
            {acquireChoice === "no" && step!.option_no && (
              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: T.slate400 }}>
                  → {step!.option_no.label}
                </p>
                {acquireSubDone
                  ? <DoneBox />
                  : step!.option_no.type === "email"
                  ? <GreenBtn onClick={() => setShowEmail(true)}>→ Apri builder email</GreenBtn>
                  : step!.option_no.type === "generate"
                  ? <GreenBtn onClick={() => onGenerate?.(step!.option_no!.modal_key ?? flagKey, flagKey)}>→ Genera documento</GreenBtn>
                  : step!.option_no.type === "fornitori"
                  ? <button onClick={() => { router.push(step!.option_no!.url ?? "/fornitori"); setAcquireSubDone(true); markStepDone(); }}
                      className="px-5 py-2.5 text-sm font-bold uppercase tracking-widest"
                      style={{ border: "1px solid var(--shield)", color: "var(--shield-soft)", borderRadius: "4px" }}>
                      → Vai ai Fornitori
                    </button>
                  : null
                }
              </div>
            )}
          </div>
        );

      // ── CHOICE: formazione interna vs esterna
      case "choice":
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {!choiceSelection && (
              <div className="flex gap-3">
                {step!.option_internal && (
                  <button onClick={() => setChoiceSelection("internal")}
                    className="flex-1 py-3 text-sm font-bold uppercase tracking-widest"
                    style={{ border: "1px solid var(--shield)", color: "var(--shield-soft)", borderRadius: "4px" }}>
                    Formazione interna
                  </button>
                )}
                {step!.option_external && (
                  <button onClick={() => setChoiceSelection("external")}
                    className="flex-1 py-3 text-sm font-bold uppercase tracking-widest"
                    style={{ background: "rgba(62,207,142,.10)", border: "1px solid rgba(62,207,142,.4)", color: T.low, borderRadius: "4px" }}>
                    Formatore esterno
                  </button>
                )}
              </div>
            )}
            {choiceSelection && !choiceSubDone && (
              <div className="space-y-2">
                {(() => {
                  const opt = choiceSelection === "internal" ? step!.option_internal : step!.option_external;
                  if (!opt) return null;
                  return (
                    <>
                      <p className="text-xs font-semibold" style={{ color: T.slate400 }}>→ {opt.label}</p>
                      <GreenBtn onClick={() => onGenerate?.(opt.modal_key ?? flagKey, flagKey)}>→ Genera documento</GreenBtn>
                    </>
                  );
                })()}
              </div>
            )}
            {choiceSubDone && <DoneBox />}
          </div>
        );

      // ── FALLBACK: conferma manuale
      default:
        return (
          <div className="space-y-3">
            {step!.description && <InfoBox>{step!.description}</InfoBox>}
            {stepDone
              ? <DoneBox />
              : <button onClick={markStepDone}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest"
                  style={{ border: "1px solid rgba(238,241,248,.2)", color: T.slate600, borderRadius: "4px" }}>
                  Conferma completamento →
                </button>
            }
          </div>
        );
    }
  }

  // ─── CALLBACKS SUB-MODAL CLOSE
  function onEmailClose() {
    setShowEmail(false);
    if (step?.type === "email") {
      markStepDone();
    } else if (step?.type === "acquire_or_generate" && acquireChoice === "no") {
      setAcquireSubDone(true);
      markStepDone();
    }
  }

  // ─── RENDER
  return (
    <>
      {/* ── MAIN MODAL */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={e => {
          if (showEmail) return; // non chiudere se EmailBuilderModal è aperto
          if (e.target === e.currentTarget) onClose();
        }}>
        <div
          className="flex flex-col max-w-xl w-full mx-4"
          style={{
            background: "var(--ink2, #0F1424)",
            border: "1px solid rgba(238,241,248,.16)",
            borderRadius: "8px",
            maxHeight: "90vh",
            overflow: "hidden",
          }}>

          {/* HEADER */}
          <div className="px-5 py-4 border-b flex items-start justify-between gap-4 flex-shrink-0"
            style={{ borderColor: "rgba(238,241,248,.12)", background: T.slate100 }}>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest mb-0.5 truncate" style={{ color: T.slate400 }}>
                {flagTitle}
              </p>
              <p className="text-sm font-bold leading-snug" style={{ color: T.slate800 }}>
                Passo {currentStep + 1} di {totalSteps} — {step.label}
              </p>
            </div>
            <button onClick={onClose} className="text-lg flex-shrink-0 transition-opacity hover:opacity-60"
              style={{ color: T.slate400 }}>✕</button>
          </div>

          {/* PROGRESS BAR */}
          <div className="px-5 py-2.5 border-b flex items-center gap-3 flex-shrink-0"
            style={{ borderColor: "rgba(238,241,248,.08)", background: "var(--ink)" }}>
            <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(238,241,248,.08)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: "var(--shield, #3A6DF0)" }} />
            </div>
            <span className="text-xs font-mono flex-shrink-0" style={{ color: T.slate400 }}>
              {completedSteps.size}/{totalSteps}
            </span>
          </div>

          {/* BODY */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {renderBody()}
          </div>

          {/* FOOTER */}
          <div className="px-5 py-4 border-t flex items-center justify-between gap-4 flex-shrink-0"
            style={{ borderColor: "rgba(238,241,248,.12)", background: T.slate100 }}>

            {/* Indietro */}
            <button
              onClick={() => { if (currentStep > 0) setCurrentStep(s => s - 1); }}
              disabled={currentStep === 0}
              className="text-xs px-4 py-2 font-semibold uppercase tracking-wider"
              style={{
                border: "1px solid rgba(238,241,248,.12)",
                color: currentStep === 0 ? "rgba(154,163,189,.3)" : T.slate600,
                borderRadius: "4px",
                cursor: currentStep === 0 ? "not-allowed" : "pointer",
              }}>
              ← Indietro
            </button>

            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <div key={i} className="rounded-full transition-all duration-300"
                  style={{
                    width:  i === currentStep ? "18px" : "7px",
                    height: "7px",
                    background: i === currentStep
                      ? "var(--shield, #3A6DF0)"
                      : completedSteps.has(i)
                      ? T.low
                      : "rgba(238,241,248,.15)",
                  }} />
              ))}
            </div>

            {/* Avanti */}
            <button
              onClick={handleNext}
              disabled={!stepDone || saving}
              className="text-xs px-5 py-2 font-bold uppercase tracking-widest transition-all"
              style={{
                background: stepDone && !saving ? "var(--shield, #3A6DF0)" : "rgba(238,241,248,.06)",
                color: stepDone && !saving ? "var(--bone)" : "rgba(154,163,189,.4)",
                borderRadius: "4px",
                cursor: !stepDone || saving ? "not-allowed" : "pointer",
              }}>
              {saving ? "Salvataggio..." : currentStep >= totalSteps - 1 ? "Completa ✓" : "Avanti →"}
            </button>
          </div>
        </div>
      </div>

      {/* ── SUB-MODAL: EmailBuilderModal — portal su document.body */}
      {showEmail && createPortal(
        <EmailBuilderModal
          flagsAperti={[{ flag_key: flagKey }]}
          entityId={entityId}
          entity={entity}
          company={company}
          onClose={onEmailClose}
        />,
        document.body,
      )}
    </>
  );
}
