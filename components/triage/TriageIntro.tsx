"use client";

import { BgLayout, ClavisTitle } from "./shared";

interface TriageIntroProps {
  onStart: () => void;
}

export default function TriageIntro({ onStart }: TriageIntroProps) {
  return (
    <BgLayout centered>
      <div className="max-w-2xl w-full mx-auto space-y-10 text-center">
        <div className="space-y-2">
          <p className="text-sm text-zinc-500 tracking-[0.3em] uppercase">CLAVIS — Governance Normativa</p>
          <ClavisTitle it="Analisi del Rischio Normativo" en="Regulatory Risk Assessment" size="xl" center />
        </div>

        <div className="border border-zinc-800 p-8 space-y-4">
          <p className="text-zinc-200 leading-relaxed text-lg">
            Sei sessioni tematiche. Quindici minuti. Un Profilo di Rischio Composito basato su{" "}
            <span className="text-white font-semibold">NIS2, AI Act, GDPR e D.Lgs. 231/2001</span>.
          </p>
          <p className="text-zinc-500 text-base">I tuoi dati non vengono condivisi con terzi.</p>
          <p className="text-white text-base font-semibold">Il report è gratuito.</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-base">
          {[
            { code: "NIS2",      desc: "D.Lgs. 138/2024" },
            { code: "AI Act",    desc: "UE 2024/1689" },
            { code: "GDPR",      desc: "UE 2016/679" },
            { code: "D.Lgs. 231", desc: "L. 132/2025" },
            { code: "MDR",       desc: "UE 2017/745" },
            { code: "DM 77",     desc: "DM 77/2022" },
          ].map(n => (
            <div key={n.code} className="border border-zinc-800 p-3">
              <p className="text-white font-mono font-bold text-base">{n.code}</p>
              <p className="text-zinc-600 mt-1">{n.desc}</p>
            </div>
          ))}
        </div>

        <div className="border border-zinc-800 p-4 grid grid-cols-3 gap-4 text-center text-base text-zinc-500">
          <div><p className="text-white text-2xl font-mono font-bold">22</p><p className="mt-1">domande slider</p></div>
          <div><p className="text-white text-2xl font-mono font-bold">6</p><p className="mt-1">sezioni tematiche</p></div>
          <div><p className="text-white text-2xl font-mono font-bold">23</p><p className="mt-1">tipologie struttura</p></div>
        </div>

        <button
          onClick={onStart}
          className="w-full border border-white py-4 text-lg font-bold tracking-widest uppercase hover:bg-white hover:text-black transition-colors duration-200"
        >
          Avvia Triage →
        </button>
      </div>
    </BgLayout>
  );
}
