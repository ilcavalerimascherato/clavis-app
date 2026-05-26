"use client";

import { BgLayout, ClavisTitle } from "./shared";
import type { Anagrafica, Band } from "./types";

interface TriageAnagraficaProps {
  anagrafica: Anagrafica;
  setAnagrafica: React.Dispatch<React.SetStateAction<Anagrafica>>;
  totalScore: number;
  totalBand: Band;
  consentReport: boolean;
  setConsentReport: React.Dispatch<React.SetStateAction<boolean>>;
  consentNewsletter: boolean;
  setConsentNewsletter: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

const INPUT_CLASS =
  "w-full bg-zinc-950 border border-zinc-800 px-4 py-3 text-white placeholder-zinc-700 focus:border-zinc-500 outline-none";

function Checkmark() {
  return (
    <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function TriageAnagrafica({
  anagrafica,
  setAnagrafica,
  totalScore,
  totalBand,
  consentReport,
  setConsentReport,
  consentNewsletter,
  setConsentNewsletter,
  saving,
  error,
  onBack,
  onSubmit,
}: TriageAnagraficaProps) {
  const canProceed =
    anagrafica.nome_struttura.trim().length > 2 &&
    anagrafica.nome_referente.trim().length > 1 &&
    anagrafica.email.trim().includes("@") &&
    consentReport;

  return (
    <BgLayout centered>
      <div className="max-w-2xl w-full mx-auto space-y-8">

        {/* Score preview */}
        <div
          className="border-2 p-6 text-center"
          style={{ borderColor: totalBand.border, backgroundColor: totalBand.bg }}
        >
          <p className="text-sm text-zinc-500 uppercase tracking-widest mb-1">Il tuo score preliminare</p>
          <p className="text-6xl font-mono font-black" style={{ color: totalBand.color }}>{totalScore}</p>
          <p className="text-sm font-bold tracking-widest uppercase mt-1" style={{ color: totalBand.color }}>
            {totalBand.label}
          </p>
        </div>

        <div className="space-y-1">
          <ClavisTitle it="Genera il tuo Report" en="Generate Your Report" size="lg" />
          <p className="text-base text-zinc-500 mt-2">
            Compila i campi e accetta il consenso per ricevere il report nominativo completo.
          </p>
        </div>

        {/* Campi form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">Nome struttura *</label>
            <input
              type="text"
              value={anagrafica.nome_struttura}
              onChange={e => setAnagrafica(a => ({ ...a, nome_struttura: e.target.value }))}
              placeholder="es. RSA Villa Serena"
              className={`${INPUT_CLASS} text-lg`}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">Nome e cognome referente *</label>
            <input
              type="text"
              value={anagrafica.nome_referente}
              onChange={e => setAnagrafica(a => ({ ...a, nome_referente: e.target.value }))}
              placeholder="es. Mario Rossi"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">Email *</label>
            <input
              type="email"
              value={anagrafica.email}
              onChange={e => setAnagrafica(a => ({ ...a, email: e.target.value }))}
              placeholder="es. qualita@struttura.it"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Consensi */}
        <div className="border border-zinc-700 p-5 space-y-5">
          <p className="text-sm text-zinc-500 uppercase tracking-widest">Consenso al trattamento dei dati</p>

          {/* Obbligatorio */}
          <div className="space-y-3">
            <div className="flex items-start gap-4">
              <button
                onClick={() => setConsentReport(v => !v)}
                className={`mt-0.5 w-5 h-5 flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  consentReport
                    ? "border-white bg-white"
                    : "border-zinc-500 bg-transparent hover:border-zinc-300"
                }`}
                aria-label="Accetta consenso report"
              >
                {consentReport && <Checkmark />}
              </button>
              <div className="space-y-1">
                <p className="text-sm text-zinc-500 uppercase tracking-widest font-semibold">Obbligatorio</p>
                <p className="text-base text-zinc-200 leading-relaxed">
                  Ho letto l&apos;informativa privacy e acconsento al trattamento dei dati personali
                  per la generazione e l&apos;invio del report tecnico.
                </p>
              </div>
            </div>
            {!consentReport && (
              <div className="ml-9 border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <p className="text-base text-zinc-500 leading-relaxed">
                  <span className="text-zinc-300 font-semibold">Consenso richiesto.</span>{" "}
                  Non è possibile generare il report senza autorizzare il trattamento dei dati.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800" />

          {/* Facoltativo */}
          <div className="flex items-start gap-4">
            <button
              onClick={() => setConsentNewsletter(v => !v)}
              className={`mt-0.5 w-5 h-5 flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                consentNewsletter
                  ? "border-white bg-white"
                  : "border-zinc-700 bg-transparent hover:border-zinc-500"
              }`}
              aria-label="Iscriviti alla newsletter"
            >
              {consentNewsletter && <Checkmark />}
            </button>
            <div className="space-y-1">
              <p className="text-sm text-zinc-600 uppercase tracking-widest">Facoltativo</p>
              <p className="text-base text-zinc-400 leading-relaxed">
                Iscrivimi alla newsletter per ricevere aggiornamenti normativi e offerte CLAVIS.
                Posso disiscrivermi in qualsiasi momento tramite il link in calce alle email.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors"
          >
            ← Indietro
          </button>
          <button
            disabled={!canProceed || saving}
            onClick={onSubmit}
            className="flex-grow border py-3 font-bold tracking-widest uppercase text-sm transition-colors disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed border-white hover:bg-white hover:text-black"
          >
            {saving ? "Elaborazione..." : "Genera Report →"}
          </button>
        </div>

        {error && <p className="text-red-500 text-base text-center">{error}</p>}
      </div>
    </BgLayout>
  );
}
