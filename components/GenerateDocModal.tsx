"use client";

/**
 * CLAVIS — GenerateDocModal
 * Genera documenti PDF (non editabili) e DOCX (editabili) da template fissi.
 * PDF: @react-pdf/renderer
 * DOCX: libreria docx (da installare: npm install docx)
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  buildDocument,
  FLAG_OUTPUT_TYPE,
  isValidationError,
  type DocumentOutput,
  type DocumentValidationError,
  type EntityData,
  type CompanyData,
  type DpaFornitoreExtra,
} from "@/lib/documentTemplates";
import { createClient } from "@/lib/supabase/client";
import { ClavisPdfDocument } from "@/components/ClavisPdfDocument";

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

// ─── DPA FORNITORE — STAMPA VIA window.print()

interface DpaFornitoreRow {
  fornitore_id: string;
  ragione_sociale: string;
  piva: string | null;
  sede: string | null;
  dpa_firmato: boolean;
  dpa_scadenza: string | null;
  firmatario: string | null;
  certificazioni: string[];
  servizi: string[];
  dati_trattati: string[];
  data_residency: "EU" | "EXTRA_EU";
  scc_presente: boolean;
  selezionato: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Layout HTML di stampa del DPA — due colonne TITOLARE/RESPONSABILE, box servizi, articoli da result.sections, checklist a destra. */
function buildDpaHtml(result: DocumentOutput, company: CompanyData, f: DpaFornitoreRow): string {
  const oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const titolare = company.name || "—";
  const titPiva = company.vat_number || "—";
  const titAddr = company.legal_address || "";

  // "Parti" è già reso dalle due colonne — il resto delle sezioni sono gli articoli
  const articoli = result.sections.filter(s => s.heading !== "Parti");

  const badgesHtml = f.dati_trattati.length > 0
    ? f.dati_trattati.map(d => `<span class="badge${d === "SANITARI" ? " badge-warn" : ""}">DATI ${escapeHtml(d)}</span>`).join("")
    : "";

  const serviziHtml = f.servizi.length > 0
    ? f.servizi.map(s => `<li style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><span>${escapeHtml(s)}</span>${badgesHtml}</li>`).join("")
    : "<li>Nessun servizio registrato</li>";

  // Se il fornitore non tratta dati extra-UE, l'Art. 5 (generato solo per i fornitori EXTRA_EU) va reso comunque come "non applicabile"
  const hasExtraEU = f.data_residency === "EXTRA_EU";
  const art5NonApplicabileHtml = `
    <h3 style="font-size:11pt; font-weight:bold; margin-top:16px; margin-bottom:4px;">
      Art. 5 — Trasferimento Dati Extra-UE
    </h3>
    <p style="font-size:10pt; color:#6B7280; font-style:italic;">
      Non applicabile. I dati personali sono trattati e conservati esclusivamente all'interno dell'Unione Europea.
    </p>
  `;

  const articoliHtml = articoli.map(s => `
    <div class="articolo">
      <p class="art-heading">${escapeHtml(s.heading)}</p>
      ${s.isList && s.items
        ? `<ul>${s.items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
        : `<p class="art-content">${escapeHtml(s.content)}</p>`}
    </div>
    ${!hasExtraEU && s.heading.startsWith("Art. 4") ? art5NonApplicabileHtml : ""}
  `).join("");

  const checklistHtml = articoli.map(s => `
    <div class="check-item"><span class="check-mark">✓</span><span>${escapeHtml(s.heading)}</span></div>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>DPA — ${escapeHtml(f.ragione_sociale)}</title>
<style>
  body { font-family: Georgia, serif; font-size: 12px; line-height: 1.6; margin: 0; color: #111; }
  #dpa-root { display: flex; }
  .dpa-doc { width: 60%; padding: 48px 52px; }
  .checklist { width: 40%; background: #F1F5F9; padding: 32px 28px; }
  .header { text-align: center; border-bottom: 2px solid #0F172A; padding-bottom: 20px; margin-bottom: 28px; }
  .kicker { font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.15em; color: #64748B; margin: 0 0 6px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #64748B; margin: 0; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .party-titolare { border-left: 3px solid #0F172A; padding-left: 14px; }
  .party-responsabile { border-left: 3px solid #3A6DF0; padding-left: 14px; }
  .party-label { font-family: sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #64748B; margin: 0 0 6px; }
  .party-name { font-weight: bold; margin: 0 0 2px; }
  .party-detail { font-size: 12px; color: #475569; margin: 0; }
  .servizi-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; padding: 14px 18px; margin-bottom: 24px; }
  .box-label { font-family: sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #64748B; margin: 0 0 8px; }
  .servizi-box ul { margin: 0 0 8px; padding-left: 18px; font-size: 12px; }
  .badges { margin-top: 4px; }
  .badge { display: inline-block; font-size: 11px; font-family: monospace; background: #FEF2F2; color: #991B1B; border-radius: 3px; padding: 2px 8px; margin-right: 6px; }
  .badge-empty { color: #94A3B8; font-size: 12px; }
  .articolo { margin-bottom: 20px; }
  .art-heading { font-weight: bold; margin: 0 0 6px; }
  .art-content { text-align: justify; white-space: pre-line; margin: 0; }
  .check-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: #64748B; margin: 0 0 14px; text-transform: uppercase; }
  .check-item { display: flex; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .check-mark { color: #166534; flex-shrink: 0; }
  @page {
    margin: 2cm;
    size: A4;
    orphans: 0;
    widows: 0;
  }
  @media print {
    * { -webkit-print-color-adjust: exact; }
    header, footer { display: none !important; }
    .checklist { display: none !important; }
    .dpa-doc { width: 100% !important; }
  }
  html, body {
    margin: 0;
    padding: 0;
  }
</style>
<style>
  @page { margin-top: 1cm; margin-bottom: 1cm; }
</style>
</head>
<body>
  <div id="dpa-root">
    <div class="dpa-doc">
      <div class="header">
        <p class="kicker">RISERVATEZZA · ART. 28 GDPR · ART. 21 NIS2 · AI ACT</p>
        <h1>DATA PROCESSING AGREEMENT</h1>
        <p class="subtitle">Accordo di nomina a Responsabile del Trattamento — Rev. 1.0 · ${oggi}</p>
      </div>
      <div class="parties">
        <div class="party-titolare">
          <p class="party-label">TITOLARE DEL TRATTAMENTO</p>
          <p class="party-name">${escapeHtml(titolare)}</p>
          <p class="party-detail">P.IVA: ${escapeHtml(titPiva)}</p>
          ${titAddr ? `<p class="party-detail">${escapeHtml(titAddr)}</p>` : ""}
        </div>
        <div class="party-responsabile">
          <p class="party-label">RESPONSABILE DEL TRATTAMENTO</p>
          <p class="party-name">${escapeHtml(f.ragione_sociale)}</p>
          <p class="party-detail">P.IVA: ${escapeHtml(f.piva || "___________")}</p>
          ${f.sede ? `<p class="party-detail">${escapeHtml(f.sede)}</p>` : ""}
        </div>
      </div>
      <div class="servizi-box">
        <p class="box-label">SERVIZI OGGETTO DEL TRATTAMENTO</p>
        <ul>${serviziHtml}</ul>
      </div>
      ${articoliHtml}
    </div>
    <div class="checklist">
      <p class="check-title">Articoli inclusi</p>
      ${checklistHtml}
    </div>
  </div>
</body>
</html>`;
}

// ─── STAMPA VIA html2pdf.js — genera un vero PDF scaricato, senza dialogo di stampa

async function downloadHtmlAsPdf(htmlContent: string, filename: string) {
  const { default: html2pdf } = await import("html2pdf.js");
  const element = document.createElement("div");
  element.innerHTML = htmlContent;

  await html2pdf()
    .set({
      margin: [20, 20, 20, 20],
      filename,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element)
    .save();
}

function printDpaFornitore(docKey: string, entity: EntityData, company: CompanyData, f: DpaFornitoreRow) {
  const result = buildDocument(docKey, entity, company, {
    ragione_sociale: f.ragione_sociale,
    piva: f.piva ?? undefined,
    sede: f.sede ?? undefined,
    email: undefined, // non in supplier_registry fetch attuale
    firmatario: f.firmatario ?? undefined,
    servizi: f.servizi,
    dati_trattati: f.dati_trattati,
    data_residency: f.data_residency,
    scc_presente: f.scc_presente,
    certificazioni: f.certificazioni,
    data_decorrenza: new Date().toISOString().split("T")[0],
  } satisfies DpaFornitoreExtra);

  if (!result || isValidationError(result)) return;

  const htmlContent = buildDpaHtml(result as DocumentOutput, company, f);
  downloadHtmlAsPdf(htmlContent, `CLAVIS_dpa_${f.ragione_sociale}_${(result as DocumentOutput).metadata.dataGenerazione}.pdf`);
}

/** Layout HTML di stampa della Nomina DPO — due colonne TITOLARE/DPO, articoli da result.sections, firme dedicate. Modellato su buildDpaHtml. */
function buildNominaDpoHtml(result: DocumentOutput, company: CompanyData, entity: EntityData): string {
  const oggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const titolare = company.name || "—";
  const titPiva = company.vat_number || "—";
  const titAddr = company.legal_address || "";
  const legRapp = company.legale_rappresentante || "—";
  const nomeDpo = entity.nome_dpo || "—";
  const dpoQualifica = entity.dpo_qualifica || "";
  const dpoEmail = entity.email_dpo || "";
  const dpoTelefono = entity.dpo_telefono || "";

  // La sezione "Firme" è resa a parte nel blocco firme dedicato — il resto sono gli articoli
  const articoli = result.sections.filter(s => s.heading !== "Firme");

  const articoliHtml = articoli.map(s => `
    <div class="articolo">
      <p class="art-heading">${escapeHtml(s.heading)}</p>
      ${s.isList && s.items
        ? `<ul>${s.items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
        : `<p class="art-content">${escapeHtml(s.content)}</p>`}
    </div>
  `).join("");

  const checklistHtml = articoli.map(s => `
    <div class="check-item"><span class="check-mark">✓</span><span>${escapeHtml(s.heading)}</span></div>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Nomina DPO — ${escapeHtml(titolare)}</title>
<style>
  body { font-family: Georgia, serif; font-size: 12px; line-height: 1.6; margin: 0; color: #111; }
  #dpa-root { display: flex; }
  .dpa-doc { width: 60%; padding: 48px 52px; }
  .checklist { width: 40%; background: #F1F5F9; padding: 32px 28px; }
  .header { text-align: center; border-bottom: 2px solid #0F172A; padding-bottom: 20px; margin-bottom: 28px; }
  .kicker { font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.15em; color: #64748B; margin: 0 0 6px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #64748B; margin: 0; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .party-titolare { border-left: 3px solid #0F172A; padding-left: 14px; }
  .party-responsabile { border-left: 3px solid #3A6DF0; padding-left: 14px; }
  .party-label { font-family: sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #64748B; margin: 0 0 6px; }
  .party-name { font-weight: bold; margin: 0 0 2px; }
  .party-detail { font-size: 12px; color: #475569; margin: 0; }
  .articolo { margin-bottom: 20px; }
  .art-heading { font-weight: bold; margin: 0 0 6px; }
  .art-content { text-align: justify; white-space: pre-line; margin: 0; }
  .firme p { margin: 0 0 6px; }
  .check-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: #64748B; margin: 0 0 14px; text-transform: uppercase; }
  .check-item { display: flex; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .check-mark { color: #166534; flex-shrink: 0; }
  @page {
    margin: 2cm;
    size: A4;
    orphans: 0;
    widows: 0;
  }
  @media print {
    * { -webkit-print-color-adjust: exact; }
    header, footer { display: none !important; }
    .checklist { display: none !important; }
    .dpa-doc { width: 100% !important; }
  }
  html, body {
    margin: 0;
    padding: 0;
  }
</style>
<style>
  @page { margin-top: 1cm; margin-bottom: 1cm; }
</style>
</head>
<body>
  <div id="dpa-root">
    <div class="dpa-doc">
      <div class="header">
        <p class="kicker">ART. 37, 38, 39 GDPR · D.LGS. 196/2003 · LINEE GUIDA WP243/2017</p>
        <h1>ATTO DI NOMINA DEL RESPONSABILE<br>DELLA PROTEZIONE DEI DATI</h1>
        <p class="subtitle">Data Protection Officer — Rev. 1.0 · ${oggi}</p>
      </div>
      <div class="parties">
        <div class="party-titolare">
          <p class="party-label">TITOLARE DEL TRATTAMENTO</p>
          <p class="party-name">${escapeHtml(titolare)}</p>
          <p class="party-detail">P.IVA: ${escapeHtml(titPiva)}</p>
          ${titAddr ? `<p class="party-detail">Sede: ${escapeHtml(titAddr)}</p>` : ""}
          <p class="party-detail">Leg. Rapp.: ${escapeHtml(legRapp)}</p>
        </div>
        <div class="party-responsabile">
          <p class="party-label">DPO DESIGNATO</p>
          <p class="party-name">${escapeHtml(nomeDpo)}</p>
          ${dpoQualifica ? `<p class="party-detail">Qualifica: ${escapeHtml(dpoQualifica)}</p>` : ""}
          ${dpoEmail ? `<p class="party-detail">Email: ${escapeHtml(dpoEmail)}</p>` : ""}
          ${dpoTelefono ? `<p class="party-detail">Tel: ${escapeHtml(dpoTelefono)}</p>` : ""}
        </div>
      </div>
      ${articoliHtml}
      <div class="articolo firme">
        <p class="art-heading">Firme</p>
        <p>Per ${escapeHtml(titolare)} — ${escapeHtml(legRapp)}:</p>
        <p>Data: ${oggi} &nbsp;&nbsp;&nbsp; Firma: ______________________________</p>
        <p style="margin-top:14px;">Il DPO designato, per accettazione:</p>
        <p>Nome: ${escapeHtml(nomeDpo)}</p>
        <p>Firma: ______________________________</p>
      </div>
    </div>
    <div class="checklist">
      <p class="check-title">Articoli inclusi</p>
      ${checklistHtml}
    </div>
  </div>
</body>
</html>`;
}

function printNominaDpoHtml(result: DocumentOutput, company: CompanyData, entity: EntityData) {
  const htmlContent = buildNominaDpoHtml(result, company, entity);
  downloadHtmlAsPdf(htmlContent, `CLAVIS_nomina_dpo_${result.metadata.dataGenerazione}.pdf`);
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
  livello?: "company" | "entity";
  companyId?: string;
  revisioneMesi?: number | null;
  userId?: string;
  onClose: () => void;
  relazionale?: boolean;
  fornitoreId?: string;
}

// ─── COMPONENTE PRINCIPALE

export function GenerateDocModal({ flagKey, modalKey, entity, company, entityId, livello, companyId, revisioneMesi, userId, onClose, relazionale, fornitoreId }: GenerateDocModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [gateBlocked, setGateBlocked] = useState(false);

  // ── Documenti relazionali (es. DPA per fornitore) ──
  const [fornitoriDpa, setFornitoriDpa] = useState<DpaFornitoreRow[]>([]);

  useEffect(() => {
    if (!relazionale || !companyId) return;

    async function fetchFornitori() {
      let query = supabase
        .from("suppliers")
        .select(`
          fornitore_id,
          servizio_descritto,
          dati_trattati,
          data_residency,
          scc_presente,
          supplier_registry!fornitore_id (
            ragione_sociale,
            piva,
            sede,
            dpa_firmato,
            dpa_scadenza,
            referente_fornitore,
            certificazioni
          )
        `)
        .eq("company_id", companyId)
        .not("dati_trattati", "is", null);

      if (fornitoreId) query = query.eq("fornitore_id", fornitoreId);

      const { data } = await query;

      if (!data) return;

      // Raggruppa per fornitore_id
      const map = new Map();
      data.forEach(s => {
        const reg = s.supplier_registry as any;
        if (!reg) return;
        if (!map.has(s.fornitore_id)) {
          map.set(s.fornitore_id, {
            fornitore_id: s.fornitore_id,
            ragione_sociale: reg.ragione_sociale,
            piva: reg.piva,
            sede: reg.sede,
            dpa_firmato: reg.dpa_firmato ?? false,
            dpa_scadenza: reg.dpa_scadenza,
            firmatario: reg.referente_fornitore ?? null,
            certificazioni: reg.certificazioni ?? [],
            servizi: [],
            dati_trattati: [],
            data_residency: "EU",
            scc_presente: true,
            selezionato: true,
          });
        }
        const f = map.get(s.fornitore_id);
        if (s.servizio_descritto) f.servizi.push(s.servizio_descritto);
        if (s.dati_trattati) f.dati_trattati.push(...s.dati_trattati);
        if (s.data_residency === "EXTRA_EU") {
          f.data_residency = "EXTRA_EU";
          if (!s.scc_presente) f.scc_presente = false;
        }
      });

      setFornitoriDpa(Array.from(map.values()));
    }

    fetchFornitori();
  }, [relazionale, companyId, fornitoreId, supabase]);


  // flagKey → lookup FLAG_REQUIRED_FIELDS (campi nominativi richiesti)
  // docKey  → lookup buildDocument() e FLAG_OUTPUT_TYPE (template specifico dello step)
  const docKey = modalKey ?? flagKey;

  const requiredFields = FLAG_REQUIRED_FIELDS[flagKey] ?? [];

  // Stato form: pre-popolato dai valori già presenti in entity
  const [formFields, setFormFields] = useState<Record<FormField, string>>(() => ({
    legale_rappresentante: entity.legale_rappresentante ?? "",
    nome_dpo:              company.nome_dpo              ?? entity.nome_dpo              ?? "",
    email_dpo:             company.email_dpo             ?? entity.email_dpo             ?? "",
    dpo_qualifica:         company.dpo_qualifica         ?? entity.dpo_qualifica         ?? "",
    dpo_telefono:          company.dpo_telefono          ?? entity.dpo_telefono          ?? "",
    responsabile_it:       entity.responsabile_it       ?? "",
  }));

  // Campi richiesti da questo documento che non sono ancora valorizzati
  const missingFields = useMemo(
    () => requiredFields.filter(f => !formFields[f]?.trim()),
    [requiredFields, formFields],
  );


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
  const doGenerate = useCallback(async (docToGenerate: DocumentOutput, entityForDoc?: EntityData, companyForDoc?: CompanyData) => {
    setGenerating(true);
    setError(null);
    try {
      if (docKey === "nomina_dpo") {
        printNominaDpoHtml(docToGenerate, companyForDoc ?? mergedCompany, entityForDoc ?? mergedEntity);
      } else if (outputType === "pdf") {
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
        try {
          const mesi = revisioneMesi ?? 12;
          const dataScadenza = mesi
            ? new Date(new Date().setMonth(new Date().getMonth() + mesi))
                .toISOString().split("T")[0]
            : null;
          if (livello === "company" && companyId) {
            await supabase.from("company_compliance_items").upsert(
              { company_id: companyId, tipo: flagKey, stato: "GENERATO", data_scadenza: dataScadenza, created_by: userId },
              { onConflict: "company_id,tipo" }
            );
          } else if (entityId) {
            await supabase.from("entity_compliance_items").upsert(
              { entity_id: entityId, company_id: companyId ?? null, tipo: flagKey, stato: "GENERATO", data_scadenza: dataScadenza, created_by: userId },
              { onConflict: "entity_id,tipo" }
            );
          }
        } catch (upsertErr) {
          console.error("[compliance_items] upsert generato:", upsertErr);
        }
        try {
          await supabase.from("compliance_activity_log").insert({
            entity_id:   entityId ?? null,
            company_id:  companyId ?? company?.id,
            user_id:     userId,
            tipo_item:   flagKey ?? docKey,
            livello:     livello ?? "entity",
            azione:      "GENERATO",
            action_type: "documento_generato",
          });
        } catch (actErr) {
          console.error("[compliance_activity_log] insert generato:", actErr);
        }
      }
    } catch (e) {
      console.error("[doGenerate] ERRORE:", e);
      setError("Errore: " + String(e));
    } finally {
      setGenerating(false);
    }
  }, [outputType, flagKey, docKey, entityId, livello, companyId, revisioneMesi, userId, supabase, mergedEntity, mergedCompany]);

  const handleGenerate = useCallback(async () => {
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
      body: JSON.stringify({ company_id: companyId ?? company.id }),
    });
    await gateRes.json();
    // TEMPORANEAMENTE DISABILITATO — beta
    // if (!gate.allowed) { setGateBlocked(true); return; }

    await doGenerate(doc, mergedEntity, mergedCompany);
  }, [doc, outputType, flagKey, docKey, canGenerate, company, doGenerate, mergedEntity, mergedCompany]);

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
    await doGenerate(forcedResult, filledEntity, filledCompany);
  }, [mergedEntity, mergedCompany, docKey, doGenerate]);

  // ── UI relazionale (es. DPA per fornitore) — sostituisce il layout standard
  if (relazionale) {
    return (
      <div className="fixed inset-0 z-50 flex items-center
        justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="flex flex-col w-full max-w-2xl
          bg-[#0f1a14] border border-green-900/40
          rounded-xl overflow-hidden max-h-[85vh]">

          {/* Header */}
          <div className="flex items-center justify-between
            p-6 border-b border-green-900/20">
            <div>
              <h2 className="text-white font-bold text-lg">
                {flagKey === "dpa_fornitore"
                  ? "Generazione DPA Fornitori"
                  : "Documento Relazionale"}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {fornitoriDpa.length === 0
                  ? "Nessun fornitore con trattamento dati mappato"
                  : `${fornitoriDpa.filter(f => f.selezionato).length} DPA da generare`
                }
              </p>
            </div>
            <button onClick={onClose}
              className="text-slate-400 hover:text-white">✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {fornitoriDpa.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm mb-4">
                  Nessun fornitore con trattamento dati mappato.
                  Vai al Registro Fornitori per completare
                  la mappatura dei responsabili del trattamento.
                </p>
                <a href="/fornitori"
                  className="text-green-400 text-sm
                    hover:text-green-300 underline">
                  Vai ai Fornitori →
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {fornitoriDpa.map(f => (
                  <div key={f.fornitore_id}
                    className={`p-4 rounded-lg border cursor-pointer
                      transition-colors
                      ${f.selezionato
                        ? "border-green-500/40 bg-green-500/5"
                        : "border-slate-700 bg-slate-900/30"}`}
                    onClick={() => setFornitoriDpa(prev =>
                      prev.map(p => p.fornitore_id === f.fornitore_id
                        ? { ...p, selezionato: !p.selezionato }
                        : p)
                    )}
                  >
                    <div className="flex items-start
                      justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <input type="checkbox"
                          checked={f.selezionato}
                          onChange={() => {}}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-white font-medium text-sm">
                            {f.ragione_sociale}
                          </p>
                          {f.piva && (
                            <p className="text-slate-400 text-xs">
                              P.IVA: {f.piva}
                            </p>
                          )}
                          {f.servizi.length > 0 && (
                            <p className="text-slate-500 text-xs mt-1">
                              {f.servizi.join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {f.dpa_firmato ? (
                          <span className="text-xs px-2 py-1
                            rounded-full bg-green-500/15
                            text-green-400 border
                            border-green-500/30">
                            DPA presente
                            {f.dpa_scadenza
                              ? ` · ${new Date(f.dpa_scadenza)
                                  .toLocaleDateString("it-IT")}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1
                            rounded-full bg-amber-500/15
                            text-amber-400 border
                            border-amber-500/30">
                            Da generare
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {fornitoriDpa.length > 0 && (
            <div className="p-6 border-t border-green-900/20
              flex justify-between items-center gap-3">
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg border
                  border-slate-700 text-slate-300 text-sm">
                Annulla
              </button>
              <button
                disabled={fornitoriDpa.filter(f => f.selezionato).length === 0}
                onClick={() => {
                  const selezionati = fornitoriDpa.filter(f => f.selezionato);

                  // Una finestra per fornitore, in sequenza (100ms) per evitare conflitti browser
                  selezionati.forEach((f, i) => {
                    setTimeout(() => printDpaFornitore(docKey, entity, company, f), i * 100);
                  });

                  onClose();
                }}
                className="px-6 py-2 rounded-lg bg-green-500
                  text-black font-bold text-sm
                  disabled:opacity-40 disabled:cursor-not-allowed
                  hover:bg-green-400 transition-colors"
              >
                Genera {fornitoriDpa.filter(f => f.selezionato).length} DPA →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
              {doc?.title ?? docKey}
            </p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>
              {doc?.subtitle ?? ""}
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
