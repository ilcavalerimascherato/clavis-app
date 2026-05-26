"use client";

import { BgLayout, ClavisTitle } from "./shared";
import { UDO_OPTIONS } from "./constants";
import type { Profilo } from "./types";

interface TriageProfiloProps {
  profilo: Profilo;
  setProfilo: React.Dispatch<React.SetStateAction<Profilo>>;
  onBack: () => void;
  onNext: () => void;
}

const SELECT_CLASS =
  "w-full bg-zinc-950 border border-zinc-800 px-4 py-3 text-white focus:border-zinc-500 outline-none text-base appearance-none";

const FIELDS: Array<{ key: keyof Profilo; label: string; options: string[] }> = [
  { key: "tipo_struttura", label: "Tipologia struttura *", options: UDO_OPTIONS },
  { key: "n_ospiti",       label: "Numero ospiti/pazienti in carico *", options: ["Meno di 30", "30–80", "81–150", "Oltre 150"] },
  { key: "n_dipendenti",   label: "Numero dipendenti (incl. part-time) *", options: ["Meno di 20", "20–49", "50–249", "250 o più"] },
  { key: "regione",        label: "Regione *", options: ["Lombardia", "Veneto", "Lazio", "Piemonte", "Emilia-Romagna", "Toscana", "Campania", "Sicilia", "Liguria", "Altre"] },
  { key: "gestione_it",    label: "Gestione infrastruttura IT *", options: ["Completamente interna", "Completamente esternalizzata", "Mista (interna + fornitori)", "Non strutturata / non so"] },
  { key: "modello_231",    label: "Modello Organizzativo 231 *", options: ["Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)", "In corso di adozione", "No"] },
];

export default function TriageProfilo({ profilo, setProfilo, onBack, onNext }: TriageProfiloProps) {
  const profiloComplete =
    profilo.tipo_struttura && profilo.n_ospiti &&
    profilo.n_dipendenti && profilo.regione &&
    profilo.gestione_it && profilo.modello_231;

  return (
    <BgLayout centered>
      <div className="max-w-2xl w-full mx-auto space-y-8">
        <ClavisTitle it="Profilo della Struttura" en="Facility Profile" size="lg" />
        <p className="text-base text-zinc-500">
          Le risposte calibrano i pesi normativi del triage — strutture diverse hanno esposizioni diverse.
        </p>

        <div className="space-y-4">
          {FIELDS.map(({ key, label, options }) => (
            <div key={key}>
              <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">{label}</label>
              <select
                value={profilo[key]}
                onChange={e => setProfilo(p => ({ ...p, [key]: e.target.value }))}
                className={SELECT_CLASS}
              >
                <option value="">— Seleziona —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>

        {profilo.tipo_struttura === "REMS — Residenza Esecuzione Misure di Sicurezza" && (
          <div className="border border-red-900 bg-red-950/20 p-4 text-base text-red-400">
            ⚠ Le REMS hanno normativa ibrida penale-sanitaria. Il triage fornisce un quadro orientativo — si raccomanda consulenza legale specializzata per l&apos;analisi completa.
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors"
          >
            ← Indietro
          </button>
          <button
            disabled={!profiloComplete}
            onClick={onNext}
            className="flex-grow border py-3 font-bold tracking-widest uppercase text-sm transition-colors disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed border-white hover:bg-white hover:text-black"
          >
            Inizia Triage →
          </button>
        </div>
      </div>
    </BgLayout>
  );
}
