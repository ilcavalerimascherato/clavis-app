"use client";

/**
 * CLAVIS — GenerateDocModal
 * Genera documenti PDF (non editabili) e DOCX (editabili) da template fissi.
 * PDF: @react-pdf/renderer
 * DOCX: libreria docx (da installare: npm install docx)
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Document, Page, Text, View, StyleSheet, pdf, Font,
} from "@react-pdf/renderer";
import {
  buildDocument,
  FLAG_OUTPUT_TYPE,
  isValidationError,
  type DocumentOutput,
  type DocumentValidationError,
  type EntityData,
  type CompanyData,
} from "@/lib/documentTemplates";
import { createClient } from "@/lib/supabase/client";

// ─── DESIGN TOKENS (coerenti con dashboard)
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
};

// ─── STILI PDF (react-pdf)
const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    backgroundColor: "#FFFFFF",
    color: "#1A1A2E",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1A3A6B",
    paddingBottom: 12,
    marginBottom: 20,
  },
  logoArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  clavisLabel: {
    fontSize: 8,
    color: "#6B7FA3",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dateLabel: {
    fontSize: 8,
    color: "#6B7FA3",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#0A1628",
    marginBottom: 4,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 9,
    color: "#4A6FA5",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  normaTag: {
    fontSize: 7.5,
    color: "#6B7FA3",
    marginTop: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1A3A6B",
    backgroundColor: "#F0F4FF",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#3A6DF0",
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.55,
    color: "#2A2A3E",
    marginBottom: 4,
  },
  listItem: {
    fontSize: 9.5,
    lineHeight: 1.55,
    color: "#2A2A3E",
    marginBottom: 3,
    paddingLeft: 12,
  },
  listBullet: {
    fontSize: 9.5,
    color: "#3A6DF0",
    marginRight: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    borderTopWidth: 0.5,
    borderTopColor: "#C8D0E4",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#8A95B4",
  },
  disclaimer: {
    fontSize: 7,
    color: "#9AA3BD",
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E4F0",
    lineHeight: 1.4,
    fontStyle: "italic",
  },
  pageNumber: {
    fontSize: 7,
    color: "#8A95B4",
    textAlign: "right",
  },
});

// ─── COMPONENTE PDF
function ClavisPdfDocument({ doc }: { doc: DocumentOutput }) {
  return (
    <Document
      title={doc.title}
      author="CLAVIS — Governance Normativa"
      subject={doc.metadata.norma}
      creator="CLAVIS"
      producer="CLAVIS"
    >
      <Page size="A4" style={pdfStyles.page}>

        {/* Header */}
        <View style={pdfStyles.header}>
          <View style={pdfStyles.logoArea}>
            <Text style={pdfStyles.clavisLabel}>CLAVIS — Governance Normativa</Text>
            <Text style={pdfStyles.dateLabel}>{doc.metadata.dataGenerazione}</Text>
          </View>
          <Text style={pdfStyles.title}>{doc.title}</Text>
          <Text style={pdfStyles.subtitle}>{doc.subtitle}</Text>
          <Text style={pdfStyles.normaTag}>{doc.metadata.articoli}</Text>
        </View>

        {/* Sezioni */}
        {doc.sections.map((section, idx) => (
          <View key={idx} style={pdfStyles.section}>
            <Text style={pdfStyles.sectionHeading}>{section.heading}</Text>
            {section.isList && section.items ? (
              section.items.map((item, i) => (
                <View key={i} style={pdfStyles.listRow}>
                  <Text style={pdfStyles.listBullet}>•</Text>
                  <Text style={pdfStyles.listItem}>{item}</Text>
                </View>
              ))
            ) : (
              <Text style={pdfStyles.paragraph}>{section.content}</Text>
            )}
          </View>
        ))}

        {/* Disclaimer */}
        <Text style={pdfStyles.disclaimer}>{doc.metadata.disclaimerLegale}</Text>

        {/* Footer */}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>{doc.footer}</Text>
          <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}

// ─── GENERAZIONE DOCX (dinamica — richiede docx npm)
async function generateDocx(doc: DocumentOutput): Promise<Blob> {
  // Import dinamico per non bloccare il bundle se docx non è installato
  const {
    Document: DocxDocument,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    Packer,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  // Titolo
  children.push(
    new Paragraph({
      text: "CLAVIS — Governance Normativa",
      heading: HeadingLevel.HEADING_3,
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      text: doc.title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: doc.subtitle, color: "4A6FA5", size: 20 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: doc.metadata.articoli, color: "6B7FA3", size: 18 })],
    }),
    new Paragraph({ text: "" }),
  );

  // Sezioni
  for (const section of doc.sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_2,
        border: { left: { style: BorderStyle.THICK, size: 12, color: "3A6DF0" } },
      }),
    );

    if (section.isList && section.items) {
      for (const item of section.items) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `• ${item}` })],
            indent: { left: 360 },
          }),
        );
      }
    } else {
      // Split per newline per preservare la formattazione
      const lines = section.content.split("\n");
      for (const line of lines) {
        children.push(new Paragraph({ text: line }));
      }
    }
    children.push(new Paragraph({ text: "" }));
  }

  // Disclaimer
  children.push(
    new Paragraph({
      children: [new TextRun({ text: doc.metadata.disclaimerLegale, color: "9AA3BD", size: 16, italics: true })],
    }),
  );

  const docxDoc = new DocxDocument({
    sections: [{
      properties: {},
      children,
    }],
    creator: "CLAVIS",
    title: doc.title,
    subject: doc.metadata.norma,
    description: doc.metadata.disclaimerLegale,
  });

  return await Packer.toBlob(docxDoc);
}

// ─── CAMPI NOMINATIVI

type FormField = "legale_rappresentante" | "nome_dpo" | "email_dpo" | "dpo_qualifica" | "dpo_telefono" | "responsabile_it";

const FIELD_LABELS: Record<FormField, string> = {
  legale_rappresentante: "Legale Rappresentante",
  nome_dpo:              "Nome DPO",
  email_dpo:             "Email DPO",
  dpo_qualifica:         "Qualifica DPO",
  dpo_telefono:          "Telefono DPO",
  responsabile_it:       "Responsabile IT",
};

/** Campi richiesti per ogni documento (solo quelli che appaiono nel template) */
const FLAG_REQUIRED_FIELDS: Partial<Record<string, FormField[]>> = {
  Flag_GDPR_DPO:        ["nome_dpo", "email_dpo", "dpo_qualifica", "dpo_telefono", "legale_rappresentante"],
  Flag_NIS2_IRP:        ["legale_rappresentante", "responsabile_it", "nome_dpo"],
  Flag_GDPR_Breach:     ["nome_dpo", "email_dpo"],
  Flag_NIS2_CdA:        ["legale_rappresentante"],
  Flag_NIS2_BCP:        ["responsabile_it"],
  Flag_D231_Formazione: ["legale_rappresentante"],
};

// ─── PROPS

interface GenerateDocModalProps {
  flagKey: string;
  modalKey?: string;   // step.modal_key — usato per buildDocument(); se assente si usa flagKey
  entity: EntityData;
  company: CompanyData;
  entityId?: string;
  onClose: () => void;
}

// ─── COMPONENTE PRINCIPALE

export function GenerateDocModal({ flagKey, modalKey, entity, company, entityId, onClose }: GenerateDocModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [gateBlocked, setGateBlocked] = useState(false);

  // DEBUG TEMPORANEO — traccia stack elementi sotto ogni click
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      console.log(
        "[CLICK TRACE] elementi sotto il cursore:",
        els.map(el => `${el.tagName}${el.id ? "#" + el.id : ""}.${String(el.className).slice(0, 40)}`),
      );
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // flagKey → lookup FLAG_REQUIRED_FIELDS (campi nominativi richiesti)
  // docKey  → lookup buildDocument() e FLAG_OUTPUT_TYPE (template specifico dello step)
  const docKey = modalKey ?? flagKey;

  const requiredFields = FLAG_REQUIRED_FIELDS[flagKey] ?? [];

  // Stato form: pre-popolato dai valori già presenti in entity
  const [formFields, setFormFields] = useState<Record<FormField, string>>(() => ({
    legale_rappresentante: entity.legale_rappresentante ?? "",
    nome_dpo:              entity.nome_dpo              ?? "",
    email_dpo:             entity.email_dpo             ?? "",
    dpo_qualifica:         entity.dpo_qualifica         ?? "",
    dpo_telefono:          entity.dpo_telefono          ?? "",
    responsabile_it:       entity.responsabile_it       ?? "",
  }));

  // Campi richiesti da questo documento che non sono ancora valorizzati
  const missingFields = useMemo(
    () => requiredFields.filter(f => !formFields[f]?.trim()),
    [requiredFields, formFields],
  );

  // Debug: logga ogni volta che cambia lo stato dei campi mancanti
  React.useEffect(() => {
    console.log("[GenerateDocModal] flagKey:", flagKey, "| docKey:", docKey);
    console.log("[GenerateDocModal] requiredFields:", requiredFields);
    console.log("[GenerateDocModal] missingFields:", missingFields);
    console.log("[GenerateDocModal] formFields:", formFields);
    console.log("[GenerateDocModal] entity:", entity);
    console.log("[GenerateDocModal] company:", company);
    if (missingFields.length > 0) {
      console.warn("[GenerateDocModal] ⚠ Bottone DISABILITATO — campi mancanti:", missingFields);
    } else {
      console.log("[GenerateDocModal] ✓ canGenerate = true");
    }
  }, [flagKey, docKey, missingFields, formFields, entity, company, requiredFields]);

  const canGenerate = missingFields.length === 0;

  const [validationError, setValidationError] = useState<DocumentValidationError | null>(null);

  // Merge: entity originale + valori inseriti nel form
  const mergedEntity = useMemo<EntityData>(() => ({
    ...entity,
    legale_rappresentante: formFields.legale_rappresentante.trim() || entity.legale_rappresentante,
    nome_dpo:              formFields.nome_dpo.trim()              || entity.nome_dpo,
    email_dpo:             formFields.email_dpo.trim()             || entity.email_dpo,
    dpo_qualifica:         formFields.dpo_qualifica.trim()         || entity.dpo_qualifica,
    dpo_telefono:          formFields.dpo_telefono.trim()          || entity.dpo_telefono,
    responsabile_it:       formFields.responsabile_it.trim()       || entity.responsabile_it,
  }), [entity, formFields]);

  // Merge: company + eventuale LR inserito nel form
  const mergedCompany = useMemo<CompanyData>(() => ({
    ...company,
    legale_rappresentante: formFields.legale_rappresentante.trim() || company.legale_rappresentante,
  }), [company, formFields]);

  const result = useMemo(
    () => buildDocument(docKey, mergedEntity, mergedCompany),
    [docKey, mergedEntity, mergedCompany],
  );

  // doc è DocumentOutput solo quando il template non ha errori di validazione
  const doc = useMemo<DocumentOutput | null>(() => {
    if (!result || isValidationError(result)) return null;
    return result;
  }, [result]);

  // Sincronizza validationError con il risultato del template
  React.useEffect(() => {
    setValidationError(result && isValidationError(result) ? result : null);
  }, [result]);

  const outputType = FLAG_OUTPUT_TYPE[docKey] ?? "pdf";

  // Logica di generazione effettiva — separata per poter essere chiamata con doc forzato
  const doGenerate = useCallback(async (docToGenerate: DocumentOutput) => {
    setGenerating(true);
    setError(null);
    try {
      console.log("[doGenerate] inizio generazione", outputType);
      if (outputType === "pdf") {
        const blob = await pdf(<ClavisPdfDocument doc={docToGenerate} />).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CLAVIS_${docKey}_${docToGenerate.metadata.dataGenerazione}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = await generateDocx(docToGenerate);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CLAVIS_${docKey}_${docToGenerate.metadata.dataGenerazione}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setDone(true);
      console.log("[doGenerate] ✓ completato con successo");
      if (entityId) {
        try {
          await supabase.from("compliance_events").insert({
            entity_id: entityId,
            tipo: "generato",
            documento_key: flagKey ?? docKey,
            documento_titolo: docToGenerate.title,
            note: `Generato via CLAVIS — ${new Date().toISOString()}`,
          });
        } catch (evtErr) {
          console.error("[compliance_events] insert generato:", evtErr);
        }
      }
    } catch (e) {
      console.error("[doGenerate] ERRORE:", e);
      setError("Errore: " + String(e));
    } finally {
      setGenerating(false);
    }
  }, [outputType, flagKey, docKey, entityId, supabase]);

  const handleGenerate = useCallback(async () => {
    console.log("[handleGenerate] chiamato", { doc, outputType, flagKey, docKey, canGenerate });

    if (!doc) {
      console.error("[handleGenerate] doc è null per docKey:", docKey);
      return;
    }
    if (!canGenerate) {
      console.warn("[handleGenerate] canGenerate=false, missingFields bloccano la generazione");
      return;
    }

    // Check verde gate per utenti FREE
    const gateRes = await fetch("/api/verde-gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id }),
    });
    await gateRes.json();
    // TEMPORANEAMENTE DISABILITATO — beta
    // if (!gate.allowed) { setGateBlocked(true); return; }

    await doGenerate(doc);
  }, [doc, outputType, flagKey, docKey, canGenerate, company, doGenerate]);

  // Genera con segnaposti per i campi mancanti — richiede conferma esplicita
  const handleForceGenerate = useCallback(async () => {
    if (!window.confirm(
      "Vuoi procedere con campi vuoti? Il documento conterrà segnaposti (______) da compilare manualmente prima dell'uso ufficiale.",
    )) return;

    const BLANK = "______________________________";
    const filledEntity: EntityData = {
      ...mergedEntity,
      nome_dpo:              mergedEntity.nome_dpo      || BLANK,
      email_dpo:             mergedEntity.email_dpo     || BLANK,
      dpo_qualifica:         mergedEntity.dpo_qualifica || BLANK,
      dpo_telefono:          mergedEntity.dpo_telefono  || BLANK,
      legale_rappresentante: mergedEntity.legale_rappresentante || BLANK,
    };
    const filledCompany: CompanyData = {
      ...mergedCompany,
      name:                 mergedCompany.name              || BLANK,
      vat_number:           mergedCompany.vat_number        || BLANK,
      legal_address:        mergedCompany.legal_address     || BLANK,
      legale_rappresentante:mergedCompany.legale_rappresentante || BLANK,
    };
    const forcedResult = buildDocument(docKey, filledEntity, filledCompany);
    if (!forcedResult || isValidationError(forcedResult)) return;
    await doGenerate(forcedResult);
  }, [mergedEntity, mergedCompany, docKey, doGenerate]);

  // Template sconosciuto (distinto da errore di validazione)
  if (!result) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}>
      <div style={{ backgroundColor: "#0F1424", border: "1px solid rgba(238,241,248,.16)",
                    borderRadius: "6px", padding: "24px", maxWidth: "400px" }}>
        <p style={{ color: "#E8634A" }}>
          Template non trovato per: {docKey}
        </p>
        <button onClick={onClose} style={{ color: "#9AA3BD", marginTop: "12px" }}>
          Chiudi
        </button>
      </div>
    </div>
  );

  const isPdf = outputType === "pdf";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col max-w-lg w-full mx-4"
        style={{
          backgroundColor: "var(--ink2, #0F1424)",
          border: "1px solid rgba(238,241,248,.16)",
          borderRadius: "6px",
          maxHeight: "85vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: "rgba(238,241,248,.16)", backgroundColor: "#141B30" }}
        >
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
                style={{
                  backgroundColor: isPdf ? "rgba(94,134,245,.15)" : "rgba(62,207,142,.12)",
                  color: isPdf ? "#5E86F5" : "#3ECF8E",
                  border: `1px solid ${isPdf ? "rgba(94,134,245,.3)" : "rgba(62,207,142,.3)"}`,
                }}
              >
                {isPdf ? "PDF" : "DOCX"}
              </span>
              <span className="text-xs uppercase tracking-widest" style={{ color: T.slate400 }}>
                {isPdf ? "Non editabile" : "Editabile"}
              </span>
            </div>
            <p className="text-sm font-bold leading-snug" style={{ color: T.slate800 }}>
              {doc.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>
              {doc.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-lg flex-shrink-0 transition-opacity hover:opacity-60"
            style={{ color: T.slate400 }}
          >
            ✕
          </button>
        </div>

        {/* Anteprima struttura documento */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── Errore di validazione (campi obbligatori mancanti nel template) */}
          {validationError && (
            <div
              role="alert"
              className="px-4 py-3 rounded space-y-3"
              style={{
                backgroundColor: "rgba(232,99,74,.1)",
                border: "1px solid rgba(232,99,74,.4)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: T.critical }}>
                Campi obbligatori mancanti
              </p>
              <ul className="space-y-1">
                {validationError.missingFields.map(f => (
                  <li key={f.field} className="flex items-center gap-2 text-xs" style={{ color: T.slate800 }}>
                    <span style={{ color: T.critical }}>•</span>
                    <span className="font-semibold">{f.label}</span>
                    <span style={{ color: T.slate400 }}>
                      — {f.source === "company" ? "Anagrafica società" : "Anagrafica struttura"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                I campi "Anagrafica società" vanno completati nella sezione anagrafica. I campi "Anagrafica struttura" possono essere inseriti nel form sottostante.
              </p>
              <div className="flex gap-2 flex-wrap">
                <a
                  href="/anagrafica"
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded"
                  style={{
                    backgroundColor: "rgba(94,134,245,.15)",
                    color: T.high,
                    border: "1px solid rgba(94,134,245,.4)",
                  }}
                >
                  Completa anagrafica →
                </a>
                <button
                  onClick={handleForceGenerate}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded"
                  style={{
                    backgroundColor: "rgba(232,99,74,.08)",
                    color: T.critical,
                    border: "1px solid rgba(232,99,74,.3)",
                  }}
                >
                  Produci con campi vuoti
                </button>
              </div>
            </div>
          )}

          {/* ── Norma (solo se il documento è disponibile) */}
          {doc && (
            <div
              className="px-3 py-2 text-xs font-mono"
              style={{
                backgroundColor: "rgba(94,134,245,.08)",
                border: "1px solid rgba(94,134,245,.2)",
                borderRadius: "4px",
                color: "#7BA7D4",
              }}
            >
              {doc.metadata.norma} — {doc.metadata.articoli}
            </div>
          )}

          {/* ── Sezioni in anteprima compatta */}
          {doc && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-widest font-bold" style={{ color: T.slate600, fontSize: "12px" }}>
                Struttura documento
              </p>
              {doc.sections.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    backgroundColor: "rgba(238,241,248,.04)",
                    borderLeft: "2px solid rgba(94,134,245,.4)",
                    borderRadius: "2px",
                  }}
                >
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: T.slate400, fontSize: "12px" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs truncate" style={{ color: T.slate600 }}>
                    {s.heading}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Campi nominativi richiesti (sempre visibili per consentire la compilazione) */}
          {requiredFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest font-bold" style={{ color: T.slate600, fontSize: "12px" }}>
                Dati nominativi
              </p>
              {requiredFields.map(field => {
                const fieldId = `gdm-field-${field}`;
                const val = formFields[field];
                const fromEntity = !!(entity[field as keyof EntityData] as string | null | undefined)?.trim();
                return (
                  <div key={field} className="space-y-0.5">
                    <label
                      htmlFor={fieldId}
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: T.slate400, fontSize: "12px" }}
                    >
                      {FIELD_LABELS[field]}
                      {fromEntity && (
                        <span
                          className="px-1.5 py-0 rounded text-xs"
                          style={{ backgroundColor: "rgba(62,207,142,.1)", color: "#3ECF8E", border: "1px solid rgba(62,207,142,.25)", fontSize: "12px" }}
                        >
                          da database
                        </span>
                      )}
                      {!fromEntity && !val.trim() && (
                        <span
                          className="px-1.5 py-0 rounded text-xs"
                          style={{ backgroundColor: "rgba(232,99,74,.1)", color: T.critical, border: "1px solid rgba(232,99,74,.25)", fontSize: "12px" }}
                        >
                          richiesto
                        </span>
                      )}
                    </label>
                    <input
                      id={fieldId}
                      type={field === "email_dpo" ? "email" : "text"}
                      value={val}
                      onChange={e => setFormFields(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={fromEntity ? (entity[field as keyof EntityData] as string) : `Inserisci ${FIELD_LABELS[field].toLowerCase()}…`}
                      className="w-full px-3 py-1.5 text-xs outline-none"
                      style={{
                        backgroundColor: "rgba(238,241,248,.06)",
                        border: `1px solid ${!val.trim() && !fromEntity ? "rgba(232,99,74,.4)" : "rgba(238,241,248,.16)"}`,
                        borderRadius: "4px",
                        color: T.slate800,
                        colorScheme: "dark",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Variabili struttura usate */}
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest font-bold" style={{ color: T.slate600, fontSize: "12px" }}>
              Dati inseriti automaticamente
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { k: "Struttura", v: entity.entity_name },
                { k: "Tipo", v: entity.entity_type },
                { k: "Regione", v: entity.region },
                { k: "Società", v: company.name },
                { k: "P.IVA", v: company.vat_number ?? "—" },
                ...(doc ? [{ k: "Data", v: doc.metadata.dataGenerazione }] : []),
                ...(formFields.legale_rappresentante.trim() ? [{ k: "Legale Rappr.", v: formFields.legale_rappresentante.trim() }] : []),
                ...(formFields.nome_dpo.trim()              ? [{ k: "DPO",           v: formFields.nome_dpo.trim() }]              : []),
                ...(formFields.email_dpo.trim()             ? [{ k: "Email DPO",     v: formFields.email_dpo.trim() }]             : []),
                ...(formFields.responsabile_it.trim()       ? [{ k: "Resp. IT",      v: formFields.responsabile_it.trim() }]       : []),
              ].map(({ k, v }) => (
                <div
                  key={k}
                  className="px-2 py-1 flex items-center justify-between gap-1"
                  style={{ backgroundColor: "rgba(238,241,248,.04)", borderRadius: "3px" }}
                >
                  <span className="text-xs" style={{ color: T.slate400, fontSize: "12px" }}>{k}</span>
                  <span className="text-xs font-mono truncate max-w-[120px]" style={{ color: T.slate600, fontSize: "12px" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Disclaimer */}
          {doc && (
            <div
              className="px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: "rgba(217,178,90,.06)",
                border: "1px solid rgba(217,178,90,.2)",
                borderRadius: "4px",
                color: "#9A8A6A",
              }}
            >
              ⚠ {doc.metadata.disclaimerLegale}
            </div>
          )}
        </div>

        {/* Footer azioni */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-t flex-shrink-0"
          style={{ borderColor: "rgba(238,241,248,.16)", backgroundColor: "#141B30" }}
        >
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 font-semibold transition-opacity hover:opacity-70"
            style={{ border: "1px solid rgba(238,241,248,.16)", color: T.slate600, borderRadius: "4px" }}
          >
            Annulla
          </button>

          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs" style={{ color: T.critical }}>{error}</span>
            )}
            {done && !generating && (
              <span className="text-xs font-semibold" style={{ color: T.low }}>
                ✓ Download avviato
              </span>
            )}
            {!canGenerate && !validationError && (
              <span className="text-xs" style={{ color: T.critical }}>
                Compila i campi richiesti
              </span>
            )}
            {canGenerate && validationError && (
              <span className="text-xs" style={{ color: T.critical }}>
                Campi obbligatori mancanti (vedi sopra)
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log("[GENERA] click — canGenerate:", canGenerate, "validationError:", !!validationError, "generating:", generating);
                handleGenerate();
              }}
              disabled={generating || !canGenerate || !!validationError}
              className="px-5 py-2 text-xs font-bold uppercase tracking-widest transition-opacity"
              style={{
                backgroundColor: done ? "rgba(62,207,142,.15)" : "var(--shield, #3A6DF0)",
                color: done ? T.low : "var(--bone, #EEF1F8)",
                borderRadius: "4px",
                opacity: generating || !canGenerate || !!validationError ? 0.45 : 1,
                border: done ? `1px solid rgba(62,207,142,.4)` : "none",
                cursor: (!canGenerate || !!validationError) ? "not-allowed" : "pointer",
                pointerEvents: "auto",
                position: "relative",
                zIndex: 9999,
              }}
            >
              {generating
                ? "Generazione..."
                : done
                ? `✓ Scarica di nuovo`
                : `Genera ${outputType.toUpperCase()} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
