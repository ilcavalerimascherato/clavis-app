"use client";

/**
 * CLAVIS — EmailBuilderModal
 * Aggrega tutti i flag aperti per fornitore e costruisce email pronte.
 * Una email per fornitore, con tutte le richieste consolidate.
 * Bottoni: Apri in Mail (mailto) + Copia testo.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildEmailsPerFornitore,
  type EntityData,
  type CompanyData,
  type FornitoreConFlag,
} from "@/lib/documentTemplates";

// ─── DESIGN TOKENS
const T = {
  navy:      "#0A0E1A",
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

interface FlagAperto {
  flag_key: string;
}

interface EmailBuilderModalProps {
  flagsAperti: FlagAperto[];
  entityId: string;
  entity: EntityData;
  company: CompanyData;
  onClose: () => void;
}

// ─── COMPONENTE PRINCIPALE

export function EmailBuilderModal({
  flagsAperti,
  entityId,
  entity,
  company,
  onClose,
}: EmailBuilderModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [fornitori, setFornitori] = useState<FornitoreConFlag[]>([]);
  const [selectedFornitore, setSelectedFornitore] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── CARICA FORNITORI + CATEGORIE
  const loadFornitori = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Recupera company_id da entity
      const { data: entityRow } = await supabase
        .from("entities")
        .select("company_id")
        .eq("id", entityId)
        .single();

      const cid = entityRow?.company_id;
      if (!cid) { setError("Società non trovata."); setLoading(false); return; }

      const { data, error: dbErr } = await supabase.rpc("fn_suppliers_with_categories", {
        p_company_id: cid,
      });

      if (dbErr) {
        // Fallback: query manuale se RPC non esiste ancora
        const { data: srData } = await supabase
          .from("supplier_registry")
          .select("id, ragione_sociale, email_fornitore, referente_fornitore, dpa_firmato")
          .eq("company_id", cid);

        const { data: sData } = await supabase
          .from("suppliers")
          .select("fornitore_id, categoria")
          .in("fornitore_id", (srData ?? []).map((r: any) => r.id));

        const fornitoriFull = (srData ?? []).map((r: any) => ({
          ...r,
          categorie: (sData ?? [])
            .filter((s: any) => s.fornitore_id === r.id)
            .map((s: any) => s.categoria)
            .filter(Boolean),
        }));

        const result = buildEmailsPerFornitore(flagsAperti, fornitoriFull, entity, company);
        setFornitori(result);
        if (result.length > 0) setSelectedFornitore(result[0].id);
        return;
      }

      const result = buildEmailsPerFornitore(flagsAperti, data ?? [], entity, company);
      setFornitori(result);
      if (result.length > 0) setSelectedFornitore(result[0].id);
    } catch (e) {
      setError("Errore nel caricamento dei fornitori.");
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, flagsAperti, entity, company]);

  useEffect(() => { loadFornitori(); }, [loadFornitori]);

  // ─── FORNITORE SELEZIONATO
  const fornitoreAttivo = fornitori.find(f => f.id === selectedFornitore) ?? null;

  // ─── EMAIL AGGREGATA per fornitore selezionato
  // Se ha più flag → un'unica email consolidata con tutti gli argomenti
  const emailConsolidata = useMemo(() => {
    if (!fornitoreAttivo) return null;
    const flags = fornitoreAttivo.flagsAperti;
    if (flags.length === 0) return null;

    if (flags.length === 1) return flags[0];

    // Aggrega: oggetto multi-tema, corpo concatenato con separatori
    const oggetto = `Richiesta documentazione compliance normativa — ${company.name} / ${fornitoreAttivo.ragione_sociale}`;

    const intestazione = flags[0].corpo.split("\n")[0]; // "Gentile Referente,"
    const firma = `\n\nCordiali saluti,\n______________________________\n${company.name}\n${entity.entity_name} (${entity.entity_type}, ${entity.region})`;

    const corpoMid = flags.map((f, idx) => {
      // Estrae il corpo senza intestazione e senza firma
      const lines = f.corpo.split("\n");
      const withoutGreeting = lines.slice(1).join("\n").trim();
      const withoutFirma = withoutGreeting.replace(/\n\nCordiali saluti[\s\S]*$/, "").trim();
      return `─── ${idx + 1}. ${f.oggetto.split("—")[0].trim()} ───\n\n${withoutFirma}`;
    }).join("\n\n");

    const corpo = `${intestazione}\n\nCi rivolgiamo a Voi in relazione a più obblighi normativi che richiedono documentazione da parte dei nostri fornitori. Vi trasmettiamo le richieste in forma consolidata per facilitare il vostro riscontro.\n\n${corpoMid}${firma}`;

    return { flagKey: "consolidated", oggetto, corpo };
  }, [fornitoreAttivo, company, entity]);

  // ─── COPIA TESTO
  async function handleCopy(testo: string, id: string) {
    await navigator.clipboard.writeText(testo);
    setCopiedFlag(id);
    setTimeout(() => setCopiedFlag(null), 2000);
  }

  // ─── MAILTO
  function handleMailto(email: string | null, oggetto: string, corpo: string) {
    if (!email) return;
    const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;
    window.open(url, "_blank");
  }

  // ─── RENDER

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col w-full mx-4"
        style={{
          backgroundColor: "var(--ink2, #0F1424)",
          border: "1px solid rgba(238,241,248,.16)",
          borderRadius: "6px",
          maxWidth: "780px",
          maxHeight: "88vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>
              Email ai Fornitori
            </p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>
              (Supplier Compliance Emails) — richieste aggregate per fornitore
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-lg transition-opacity hover:opacity-60"
            style={{ color: T.slate400 }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-sm font-mono" style={{ color: T.slate400 }}>Caricamento fornitori...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 flex items-center justify-center py-16 px-6 text-center">
            <p className="text-sm" style={{ color: T.critical }}>{error}</p>
          </div>
        )}

        {!loading && !error && fornitori.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
            <span className="text-3xl">📭</span>
            <p className="text-sm font-semibold" style={{ color: T.slate800 }}>
              Nessun fornitore da contattare
            </p>
            <p className="text-xs leading-relaxed max-w-xs" style={{ color: T.slate400 }}>
              Per i flag aperti non sono stati trovati fornitori pertinenti nel Registro.
              Completa prima il censimento fornitori.
            </p>
          </div>
        )}

        {!loading && !error && fornitori.length > 0 && (
          <div className="flex flex-1 overflow-hidden">

            {/* Sidebar fornitori */}
            <div
              className="flex-shrink-0 border-r overflow-y-auto"
              style={{ width: "220px", borderColor: T.slate200 }}
            >
              <div
                className="px-3 py-2 border-b"
                style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}
              >
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: T.slate400, fontSize: "12px" }}>
                  {fornitori.length} Fornitor{fornitori.length === 1 ? "e" : "i"}
                </p>
              </div>
              {fornitori.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFornitore(f.id)}
                  className="w-full text-left px-3 py-3 border-b transition-colors"
                  style={{
                    borderColor: T.slate200,
                    backgroundColor: selectedFornitore === f.id ? T.highBg : "transparent",
                    borderLeft: selectedFornitore === f.id ? `3px solid ${T.high}` : "3px solid transparent",
                  }}
                >
                  <p className="text-xs font-semibold truncate" style={{ color: T.slate800 }}>
                    {f.ragione_sociale}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "rgba(94,134,245,.15)",
                        color: T.high,
                        fontSize: "12px",
                      }}
                    >
                      {f.flagsAperti.length} richiesta{f.flagsAperti.length !== 1 ? "e" : ""}
                    </span>
                    {!f.email_fornitore && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "12px" }}
                      >
                        no email
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Pannello email */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {fornitoreAttivo && emailConsolidata && (
                <>
                  {/* Sub-header fornitore */}
                  <div
                    className="px-5 py-3 border-b flex items-center justify-between gap-4 flex-shrink-0"
                    style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: T.slate800 }}>
                        {fornitoreAttivo.ragione_sociale}
                      </p>
                      {fornitoreAttivo.email_fornitore ? (
                        <p className="text-xs font-mono" style={{ color: T.slate400 }}>
                          {fornitoreAttivo.email_fornitore}
                        </p>
                      ) : (
                        <p className="text-xs" style={{ color: T.critical }}>
                          ⚠ Email non presente in anagrafica — aggiungerla in Registro Fornitori
                        </p>
                      )}
                    </div>
                    {/* Badges richieste */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                      {fornitoreAttivo.flagsAperti.map(f => (
                        <span
                          key={f.flagKey}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "rgba(94,134,245,.12)",
                            color: T.high,
                            border: "1px solid rgba(94,134,245,.25)",
                            fontSize: "12px",
                          }}
                        >
                          {f.oggetto.split("—")[0].trim().replace("Richiesta ", "").slice(0, 20)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Corpo email */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {/* Campo oggetto */}
                    <div>
                      <p className="text-xs uppercase tracking-widest font-bold mb-1.5"
                        style={{ color: T.slate600, fontSize: "12px" }}>
                        Oggetto
                      </p>
                      <div
                        className="px-3 py-2 text-sm font-semibold"
                        style={{
                          backgroundColor: "rgba(238,241,248,.04)",
                          border: "1px solid rgba(238,241,248,.12)",
                          borderRadius: "4px",
                          color: T.slate800,
                        }}
                      >
                        {emailConsolidata.oggetto}
                      </div>
                    </div>

                    {/* Campo corpo */}
                    <div>
                      <p className="text-xs uppercase tracking-widest font-bold mb-1.5"
                        style={{ color: T.slate600, fontSize: "12px" }}>
                        Testo
                      </p>
                      <div
                        className="px-3 py-3 text-xs leading-relaxed whitespace-pre-wrap"
                        style={{
                          backgroundColor: "rgba(238,241,248,.04)",
                          border: "1px solid rgba(238,241,248,.12)",
                          borderRadius: "4px",
                          color: T.slate600,
                          fontFamily: "monospace",
                          fontSize: "13px",
                          minHeight: "200px",
                        }}
                      >
                        {emailConsolidata.corpo}
                      </div>
                    </div>

                    {/* Nota richieste aggregate */}
                    {fornitoreAttivo.flagsAperti.length > 1 && (
                      <div
                        className="px-3 py-2 text-xs"
                        style={{
                          backgroundColor: T.highBg,
                          border: "1px solid rgba(94,134,245,.2)",
                          borderRadius: "4px",
                          color: "#7BA7D4",
                        }}
                      >
                        ℹ {fornitoreAttivo.flagsAperti.length} richieste consolidate in un'unica email professionale.
                      </div>
                    )}
                  </div>

                  {/* Footer azioni */}
                  <div
                    className="flex items-center justify-between gap-3 px-5 py-4 border-t flex-shrink-0"
                    style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}
                  >
                    <button
                      onClick={onClose}
                      className="text-xs px-4 py-2 font-semibold transition-opacity hover:opacity-70"
                      style={{
                        border: "1px solid rgba(238,241,248,.16)",
                        color: T.slate600,
                        borderRadius: "4px",
                      }}
                    >
                      Chiudi
                    </button>

                    <div className="flex items-center gap-2">
                      {/* Copia testo */}
                      <button
                        onClick={() => handleCopy(
                          `OGGETTO: ${emailConsolidata.oggetto}\n\n${emailConsolidata.corpo}`,
                          fornitoreAttivo.id,
                        )}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors"
                        style={{
                          border: "1px solid rgba(238,241,248,.25)",
                          color: copiedFlag === fornitoreAttivo.id ? T.low : T.slate600,
                          borderColor: copiedFlag === fornitoreAttivo.id ? "rgba(62,207,142,.4)" : "rgba(238,241,248,.25)",
                          borderRadius: "4px",
                        }}
                      >
                        {copiedFlag === fornitoreAttivo.id ? "✓ Copiato" : "Copia testo"}
                      </button>

                      {/* Apri in Mail */}
                      <button
                        onClick={() => handleMailto(
                          fornitoreAttivo.email_fornitore,
                          emailConsolidata.oggetto,
                          emailConsolidata.corpo,
                        )}
                        disabled={!fornitoreAttivo.email_fornitore}
                        className="px-5 py-2 text-xs font-bold uppercase tracking-widest transition-opacity"
                        style={{
                          backgroundColor: fornitoreAttivo.email_fornitore
                            ? "var(--shield, #3A6DF0)"
                            : "rgba(238,241,248,.08)",
                          color: fornitoreAttivo.email_fornitore
                            ? "var(--bone, #EEF1F8)"
                            : T.slate400,
                          borderRadius: "4px",
                          opacity: fornitoreAttivo.email_fornitore ? 1 : 0.5,
                          cursor: fornitoreAttivo.email_fornitore ? "pointer" : "not-allowed",
                        }}
                      >
                        Apri in Mail ↗
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
