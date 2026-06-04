"use client";

import { useState } from "react";
import { X, BookOpen, ArrowRight, Hospital, ShieldCheck } from "lucide-react";

type Profile = "direttore" | "dpo" | null;

export default function GuideModal() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(null);

  const close = () => {
    setOpen(false);
    setProfile(null);
  };

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium tracking-widest uppercase text-zinc-400 border border-zinc-700 px-5 py-2.5 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all rounded-sm mb-3"
      >
        <BookOpen size={14} />
        Guida alla compilazione
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm px-4"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-4xl overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex justify-between items-start px-5 py-4 border-b border-zinc-800">
              <div>
                <p className="text-base font-medium text-white">Guida alla compilazione</p>
                <p className="text-sm text-zinc-500 mt-0.5">Seleziona il tuo profilo per istruzioni personalizzate</p>
              </div>
              <button
                onClick={close}
                className="text-zinc-600 hover:text-white transition-colors p-1 -mr-1"
                aria-label="Chiudi"
              >
                <X size={18} />
              </button>
            </div>

            {/* Two-column body */}
            <div className="flex min-h-[380px]">

              {/* Colonna sinistra — selezione profilo */}
              <div className="w-48 flex-shrink-0 border-r border-zinc-800 p-4 space-y-2">
                <p className="text-xs tracking-widest uppercase text-zinc-600 mb-3">Chi sei?</p>
                <button
                  onClick={() => setProfile("direttore")}
                  className={`w-full text-left border rounded-sm p-3 transition-all ${
                    profile === "direttore"
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
                  }`}
                >
                  <Hospital size={16} className={`mb-1.5 ${profile === "direttore" ? "text-blue-400" : "text-zinc-500"}`} />
                  <p className={`text-sm font-medium ${profile === "direttore" ? "text-blue-300" : "text-white"}`}>Direttore / Coordinatore</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Gestisco una o più strutture RSA</p>
                </button>
                <button
                  onClick={() => setProfile("dpo")}
                  className={`w-full text-left border rounded-sm p-3 transition-all ${
                    profile === "dpo"
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
                  }`}
                >
                  <ShieldCheck size={16} className={`mb-1.5 ${profile === "dpo" ? "text-blue-400" : "text-zinc-500"}`} />
                  <p className={`text-sm font-medium ${profile === "dpo" ? "text-blue-300" : "text-white"}`}>DPO / Consulente</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Supporto strutture in ambito compliance</p>
                </button>
              </div>

              {/* Colonna destra — contenuto */}
              <div className="flex-1 flex flex-col">
                {!profile && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-zinc-600">← Seleziona il tuo profilo</p>
                  </div>
                )}

                {profile === "direttore" && (
                  <div className="flex-1 p-5 space-y-4 overflow-y-auto">
                    <GuideSection num={1} color="blue" title="Cosa ottieni">
                      Un profilo di rischio composito della tua struttura su tre normative: NIS2 (sicurezza informatica),
                      AI Act (uso di sistemi AI) e D.Lgs. 231/2001 (responsabilità organizzativa). Bastano 5 minuti.
                    </GuideSection>
                    <GuideSection num={2} color="amber" title="Come rispondere">
                      Le domande riguardano la tua situazione attuale — non quella ideale. Non esistono risposte giuste
                      o sbagliate: il triage serve a fotografare la realtà, non a valutarti.
                      <Tip>
                        Se usi software gestionale, cartella clinica elettronica o dispositivi medici connessi: rispondi
                        &ldquo;sì&rdquo; anche se non sei sicuro di come funzionino tecnicamente.
                      </Tip>
                    </GuideSection>
                    <GuideSection num={3} color="blue" title="Come usare la barra di risposta">
                      Ogni domanda ha una barra scorrevole. Spostala da sinistra (situazione assente o critica)
                      a destra (situazione completa e documentata). Inizia sempre da 0% e leggi le etichette
                      che compaiono: scegli quella che si avvicina di più alla tua realtà attuale.
                      <SliderExample />
                    </GuideSection>
                    <GuideSection num={4} color="green" title="Cosa succede dopo">
                      Ricevi uno score di rischio con le aree prioritarie e un piano di azione concreto. Puoi salvare
                      il report o condividerlo con il tuo consulente. Nessun dato viene condiviso con terzi.
                    </GuideSection>
                  </div>
                )}

                {profile === "dpo" && (
                  <div className="flex-1 p-5 space-y-4 overflow-y-auto">
                    <GuideSection num={1} color="blue" title="Architettura del triage">
                      Il triage copre tre framework normativi: NIS2 (Direttiva UE 2022/2555, recepita con D.Lgs. 138/2024),
                      AI Act (Reg. UE 2024/1689) e D.Lgs. 231/2001. Lo score composito è calcolato con peso
                      70% operativo + 30% documentale.
                    </GuideSection>
                    <GuideSection num={2} color="amber" title="Come compilarlo con il cliente">
                      Il triage è pensato per essere guidato: le domande sono binarie e orientate alla situazione di fatto.
                      Puoi compilarlo durante un primo incontro con il direttore o il responsabile IT della struttura.
                      <Tip>
                        Le risposte vengono salvate in sessione anonima. Con la registrazione puoi migrarle a un account
                        CLAVIS e gestire più strutture in portafoglio da un&apos;unica dashboard.
                      </Tip>
                    </GuideSection>
                    <GuideSection num={3} color="blue" title="Come usare la barra di risposta">
                      Ogni domanda ha una barra scorrevole. Spostala da sinistra (situazione assente o critica)
                      a destra (situazione completa e documentata). Inizia sempre da 0% e leggi le etichette
                      che compaiono: scegli quella che si avvicina di più alla tua realtà attuale.
                      <SliderExample />
                    </GuideSection>
                    <GuideSection num={4} color="green" title="Output e integrazioni">
                      Il report include score per framework, flag critici con riferimento normativo, e piano di remediation
                      con 22 azioni precompilate. Esportabile. Le strutture gestite sono associabili al tuo profilo
                      consulente nel tier Gold/Premium.
                    </GuideSection>
                  </div>
                )}

                {profile && (
                  <div className="p-4 border-t border-zinc-800">
                    <button
                      onClick={close}
                      className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-bold tracking-widest uppercase py-2.5 rounded-sm hover:bg-zinc-100 transition-colors"
                    >
                      Ho capito — avvia il triage <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Sub-components */

function GuideSection({
  num,
  color,
  title,
  children,
}: {
  num: number;
  color: "blue" | "amber" | "green";
  title: string;
  children: React.ReactNode;
}) {
  const colorMap = {
    blue: "bg-blue-500/15 text-blue-400",
    amber: "bg-amber-500/15 text-amber-400",
    green: "bg-green-500/15 text-green-400",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${colorMap[color]}`}>
          {num}
        </span>
        <p className="text-base font-medium text-white">{title}</p>
      </div>
      <div className="ml-7 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 border-l-2 border-blue-500/50 pl-3 text-zinc-500 leading-relaxed">
      <span className="block text-xs tracking-widest uppercase text-zinc-600 mb-1">Suggerimento</span>
      {children}
    </div>
  );
}

function SliderExample() {
  const [val, setVal] = useState(0);

  const labels = [
    { max: 10,  dot: "bg-red-500",    text: "Nessun censimento — i fornitori non sono mappati",         risk: "100% — Rischio critico",  riskColor: "text-red-500" },
    { max: 60,  dot: "bg-orange-400", text: "Elenco esistente ma non aggiornato o incompleto",           risk: "50% — Rischio alto",      riskColor: "text-orange-400" },
    { max: 101, dot: "bg-green-500",  text: "Registro completo, aggiornato e con valutazione sicurezza", risk: "0% — Rischio contenuto",  riskColor: "text-green-400" },
  ];

  const current = labels.find((l) => val < l.max)!;

  return (
    <div className="mt-3 bg-zinc-800/60 border border-zinc-700 rounded-sm p-3 space-y-2">
      <p className="text-xs tracking-widest uppercase text-zinc-600 mb-2">Esempio interattivo</p>
      <input
        type="range" min={0} max={100} value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-zinc-600">
        <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
      </div>
      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-sm px-3 py-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${current.dot}`} />
        <span className="text-sm text-zinc-300">{current.text}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-zinc-600">Rischio su questo punto</span>
        <span className={`text-xs font-mono font-bold ${current.riskColor}`}>{current.risk}</span>
      </div>
    </div>
  );
}
