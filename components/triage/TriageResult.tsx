"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BgLayout, ClavisTitle } from "./shared";
import { getBand, getSectionRisk, calcSectionScore, getSectionAnswers } from "./utils";
import type { Anagrafica, Band, Profilo, Section } from "./types";

// ─── RadarChart

const RADAR_LABELS = [
  ["Catena di", "Fornitura Digitale"],
  ["Sistemi AI e", "Dispositivi Medici"],
  ["Shadow IT e", "Governo Dati"],
  ["Gestione", "Incidenti"],
  ["Formazione e", "Governance"],
  ["Compliance", "Regionale"],
];

function RadarChart({ scores }: { scores: number[] }) {
  const cx = 240, cy = 240, r = 130;
  const n = scores.length;

  function point(i: number, val: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  }

  function labelPos(i: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = r + 36;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  }

  const riskScores = scores.map(s => getSectionRisk(s));
  const polyPoints = riskScores.map((v, i) => {
    const p = point(i, v);
    return `${p.x},${p.y}`;
  }).join(" ");

  const gridLevels = [25, 50, 75, 100];

  return (
    <svg viewBox="0 0 480 480" className="w-full max-w-lg mx-auto">
      {gridLevels.map(level => (
        <g key={level}>
          <polygon
            points={Array.from({ length: n }, (_, i) => {
              const p = point(i, level);
              return `${p.x},${p.y}`;
            }).join(" ")}
            fill="none" stroke="#27272a" strokeWidth="1"
          />
          <text x={cx + 4} y={cy - (level / 100) * r - 3} fontSize="8" fill="#3f3f46" fontFamily="monospace">
            {level}%
          </text>
        </g>
      ))}

      {Array.from({ length: n }, (_, i) => {
        const end = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#3f3f46" strokeWidth="1" />;
      })}

      <polygon points={polyPoints} fill="#DC262618" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />

      {riskScores.map((v, i) => {
        const p = point(i, v);
        const band = getBand(v);
        return <circle key={i} cx={p.x} cy={p.y} r="5" fill={band.color} stroke="#080c14" strokeWidth="1.5" />;
      })}

      {riskScores.map((v, i) => {
        const p = point(i, v);
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const ox = Math.cos(angle) * 14;
        const oy = Math.sin(angle) * 14;
        const band = getBand(v);
        return (
          <text key={`pct-${i}`} x={p.x + ox} y={p.y + oy + 3}
            textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill={band.color}>
            {v}%
          </text>
        );
      })}

      {RADAR_LABELS.map((lines, i) => {
        const pos = labelPos(i);
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const dx = Math.cos(angle);
        const anchor = dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
        return (
          <text key={i} x={pos.x} y={pos.y - 6} textAnchor={anchor} fontFamily="monospace" fill="#a1a1aa">
            {lines.map((line, li) => (
              <tspan key={li} x={pos.x} dy={li === 0 ? 0 : 12} fontSize="9">{line}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

// ─── AnimatedAmount

function AnimatedAmount({ maxNum, label }: { maxNum: number; label: string }) {
  const [displayed, setDisplayed] = React.useState(0);
  const [started, setStarted] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  React.useEffect(() => {
    if (!started || maxNum === 0) return;
    const duration = 1800;
    const steps = 60;
    const increment = maxNum / steps;
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + increment, maxNum);
      setDisplayed(Math.round(current));
      if (current >= maxNum) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [started, maxNum]);

  const pct = maxNum > 0 ? displayed / maxNum : 0;
  const color =
    pct < 0.15 ? "#16A34A" : pct < 0.4 ? "#CA8A04" : pct < 0.75 ? "#EA580C" : "#DC2626";
  const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  if (maxNum === 0) {
    return (
      <div ref={ref}>
        <p className="font-mono font-bold text-base text-zinc-300 leading-snug">{label}</p>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <p className="font-mono text-sm text-zinc-500 mb-0.5">fino a</p>
      <p className="font-mono font-black text-2xl leading-none transition-colors duration-100" style={{ color }}>
        {started ? fmt.format(displayed) : "0 €"}
        <span className="text-base font-bold ml-1">€</span>
      </p>
      <p className="text-sm text-zinc-500 mt-1 leading-snug">
        {label.split(" o ")[1] ?? label.split("+")[1] ?? ""}
      </p>
    </div>
  );
}

// ─── TriageResult

interface TriageResultProps {
  anagrafica: Anagrafica;
  profilo: Profilo;
  sections: Section[];
  answers: Record<string, number[]>;
  totalScore: number;
  totalBand: Band;
  sessionId: string | null;
  isDesktop: boolean;
  onReset: () => void;
}

export default function TriageResult({
  anagrafica,
  profilo,
  sections,
  answers,
  totalScore,
  totalBand,
  sessionId,
  isDesktop,
  onReset,
}: TriageResultProps) {
  const router = useRouter();

  const sectionRisks = sections.map(s => {
    const ans = getSectionAnswers(answers, s.id, s.questions.length);
    const meanScore = calcSectionScore(ans, s.questions);
    return { ...s, riskScore: getSectionRisk(meanScore), meanScore };
  });

  const criticalSections = sectionRisks.filter(s => s.riskScore >= 75);
  const highSections = sectionRisks.filter(s => s.riskScore >= 50 && s.riskScore < 75);

  const SANZIONI = [
    {
      id: "nis2", label: "NIS2", sub: "D.Lgs. 138/2024",
      triggered:
        sectionRisks.find(s => s.id === "S1")!.riskScore >= 50 ||
        sectionRisks.find(s => s.id === "S4")!.riskScore >= 50,
      maxNum: 10000000,
      massimo: "fino a 10.000.000 € o 2% del fatturato globale",
      base: "Art. 32 D.Lgs. 138/2024",
      urgenza: sectionRisks.find(s => s.id === "S4")!.riskScore >= 75 ? "CRITICA" : "Ott. 2026",
    },
    {
      id: "aiact", label: "AI Act", sub: "Reg. UE 2024/1689",
      triggered: sectionRisks.find(s => s.id === "S2")!.riskScore >= 25,
      maxNum: 35000000,
      massimo: "fino a 35.000.000 € o 7% del fatturato globale",
      base: "Art. 99 AI Act",
      urgenza: "Ago. 2026 ⚠",
    },
    {
      id: "gdpr", label: "GDPR", sub: "Reg. UE 2016/679",
      triggered:
        sectionRisks.find(s => s.id === "S3")!.riskScore >= 50 ||
        sectionRisks.find(s => s.id === "S2")!.riskScore >= 50,
      maxNum: 20000000,
      massimo: "fino a 20.000.000 € o 4% del fatturato globale",
      base: "Art. 83 GDPR",
      urgenza: "Immediata",
    },
    {
      id: "d231", label: "D.Lgs. 231", sub: "L. 132/2025",
      triggered:
        sectionRisks.find(s => s.id === "S3")!.riskScore >= 50 ||
        sectionRisks.find(s => s.id === "S5")!.riskScore >= 50,
      maxNum: 1549370,
      massimo: "fino a 1.549.370 € (ente) + responsabilità penale individuale",
      base: "Art. 24-bis D.Lgs. 231/2001",
      urgenza: "Immediata",
    },
    {
      id: "mdr", label: "MDR", sub: "Reg. UE 2017/745",
      triggered: sectionRisks.find(s => s.id === "S2")!.riskScore >= 75,
      maxNum: 0,
      massimo: "Sanzioni penali D.Lgs. 46/1997 + responsabilità civile illimitata",
      base: "Art. 83 MDR 2017/745",
      urgenza: "90 giorni",
    },
  ].filter(s => s.triggered);

  return (
    <BgLayout centered={false}>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 14mm; }
          body { background: white !important; color: black !important; font-size: 9.5pt !important; }
          button, .print-hide { display: none !important; }
          [style*="background"], [class*="bg-"] { background: white !important; background-image: none !important; }
          [class*="border"] { border-color: #d4d4d4 !important; }
          [class*="text-zinc"] { color: #222 !important; }
          [class*="text-white"] { color: #000 !important; }
          .print-score { font-size: 40pt !important; }
          [class*="space-y-10"] > * + * { margin-top: 10px !important; }
          [class*="space-y-8"] > * + *  { margin-top: 8px !important; }
          [class*="space-y-4"] > * + *  { margin-top: 5px !important; }
          [class*="p-8"] { padding: 8px !important; }
          [class*="p-7"] { padding: 7px !important; }
          [class*="p-6"] { padding: 6px !important; }
          [class*="p-5"] { padding: 5px !important; }
          [class*="p-4"] { padding: 4px !important; }
          svg { max-width: 260px !important; display: block; margin: 0 auto !important; }
          .page-break-before { page-break-before: always; }
          .page-break-avoid  { page-break-inside: avoid; }
        }
      `}</style>

      <div className={isDesktop ? "max-w-5xl mx-auto space-y-6 px-2" : "max-w-2xl mx-auto space-y-6"}>

        {/* HEADER */}
        <div className="space-y-1">
          <p className="text-sm text-zinc-500 tracking-[0.25em] uppercase">
            CLAVIS — Governance Normativa Sociosanitaria
          </p>
          <p className="text-sm text-zinc-600 tracking-[0.2em] uppercase">
            {anagrafica.nome_struttura} — {profilo.tipo_struttura.split("—")[0].trim()} — {profilo.regione} — {new Date().toLocaleDateString("it-IT")}
          </p>
          <ClavisTitle it="Profilo di Rischio Composito" en="Composite Risk Profile" size="xl" />
        </div>

        {/* 1. CONTESTO VALUTAZIONE */}
        <div className="border border-zinc-700 p-5 page-break-avoid">
          <ClavisTitle it="Contesto della Valutazione" en="Assessment Context" size="sm" />
          <div className="grid grid-cols-4 gap-3 text-base mt-3">
            {[
              ["Struttura",   anagrafica.nome_struttura],
              ["Tipologia",   profilo.tipo_struttura.split("—")[0].trim()],
              ["Ospiti",      profilo.n_ospiti],
              ["Dipendenti",  profilo.n_dipendenti],
              ["Regione",     profilo.regione],
              ["Referente",   anagrafica.nome_referente],
              ["Gestione IT", profilo.gestione_it.split(" ")[0]],
              ["MOG 231",     profilo.modello_231.split(",")[0]],
            ].map(([k, v]) => (
              <div key={k} className="border border-zinc-800 p-2">
                <p className="text-zinc-600 text-xs uppercase tracking-wider">{k}</p>
                <p className="text-zinc-200 font-medium mt-0.5 truncate" title={v}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 2+3. SCORE + RADAR */}
        <div className={`grid gap-4 mt-6 page-break-avoid ${isDesktop ? "grid-cols-2" : "grid-cols-1"}`}>
          <div
            className="border-2 p-6 text-center flex flex-col justify-center"
            style={{ borderColor: totalBand.border, backgroundColor: totalBand.bg }}
          >
            <p className="text-sm text-zinc-500 font-mono uppercase tracking-widest mb-2">Score di Rischio Composito</p>
            <p className="print-score text-9xl font-mono font-black leading-none" style={{ color: totalBand.color }}>
              {totalScore}
            </p>
            <p className="text-base text-zinc-500 font-mono mt-2">/100 PUNTI DI RISCHIO</p>
            <p className="text-2xl font-bold tracking-widest uppercase mt-3" style={{ color: totalBand.color }}>
              {totalBand.label}
            </p>
            <p className="text-base text-zinc-400 mt-3 leading-relaxed">
              {totalScore >= 75
                ? "Esposizione a sanzioni multiple attive. Avviare piano di remediation immediato."
                : totalScore >= 50
                  ? "Piano d'azione strutturato entro 30 giorni. Prioritizzare le aree critiche."
                  : totalScore >= 25
                    ? "Programmare remediation entro Q3 2026. Monitorare le scadenze normative."
                    : "Presidio adeguato. Mantenere aggiornamento normativo annuale."}
            </p>
          </div>

          <div className="border border-zinc-800 p-4 flex flex-col">
            <ClavisTitle it="Mappa del Rischio per Area" en="Risk Map by Area" size="sm" />
            <div className="flex-1 flex items-center">
              <RadarChart scores={sectionRisks.map(s => s.meanScore)} />
            </div>
            <p className="text-center text-base text-zinc-600 mt-1">
              L&apos;area colorata rappresenta l&apos;esposizione al rischio — più grande = più rischio
            </p>
          </div>
        </div>

        {/* 4. ANALISI PER SEZIONE */}
        <div className="page-break-avoid">
          <ClavisTitle it="Analisi per Sezione" en="Section Analysis" size="sm" />
          <div className={`grid gap-2 mt-3 ${isDesktop ? "grid-cols-3" : "grid-cols-2"}`}>
            {sectionRisks.map(s => {
              const band = getBand(s.riskScore);
              return (
                <div key={s.id} className="border border-zinc-800 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-base truncate">{s.label_it}</p>
                      <p className="text-xs text-zinc-600">peso {s.weight_pct}%</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-mono font-black" style={{ color: band.color }}>{s.riskScore}%</p>
                      <p className="text-xs font-bold uppercase" style={{ color: band.color }}>
                        {band.label.replace("RISCHIO ", "")}
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.riskScore}%`, backgroundColor: band.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. ESPOSIZIONE SANZIONATORIA */}
        <div className="page-break-avoid space-y-3">
          <ClavisTitle it="Esposizione Sanzionatoria Stimata" en="Estimated Regulatory Exposure" size="sm" />
          {SANZIONI.length === 0 ? (
            <div className="border border-green-900 bg-green-950/10 p-4">
              <p className="text-green-400 font-semibold text-base">
                Nessuna esposizione sanzionatoria significativa rilevata.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-base text-zinc-600">
                Sanzioni massime edittali applicabili sulla base delle risposte fornite. L&apos;esposizione effettiva è determinata dall&apos;autorità competente.
              </p>
              <div className="border border-zinc-700 overflow-hidden">
                <div className="grid grid-cols-12 bg-zinc-900 border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
                  <div className="col-span-3 px-3 py-2">Norma</div>
                  <div className="col-span-4 px-3 py-2">Sanzione massima</div>
                  <div className="col-span-3 px-3 py-2">Base giuridica</div>
                  <div className="col-span-2 px-3 py-2 text-right">Scadenza</div>
                </div>
                {SANZIONI.map((s, i) => (
                  <div
                    key={s.id}
                    className={`grid grid-cols-12 border-b border-zinc-800 items-center ${i % 2 === 0 ? "" : "bg-zinc-950/40"}`}
                  >
                    <div
                      className="col-span-3 px-3 py-3 border-r border-zinc-800"
                      style={{ borderLeftColor: "#DC2626", borderLeftWidth: "3px" }}
                    >
                      <p className="font-bold text-white text-base">{s.label}</p>
                      <p className="text-xs text-zinc-600">{s.sub}</p>
                    </div>
                    <div className="col-span-4 px-3 py-3 border-r border-zinc-800">
                      <AnimatedAmount maxNum={s.maxNum} label={s.massimo} />
                    </div>
                    <div className="col-span-3 px-3 py-3 border-r border-zinc-800">
                      <p className="text-xs text-zinc-500 font-mono">{s.base}</p>
                    </div>
                    <div className="col-span-2 px-3 py-3 text-right">
                      <p className={`text-xs font-bold ${s.urgenza.includes("Imm") || s.urgenza.includes("CRIT") ? "text-red-400" : "text-orange-400"}`}>
                        {s.urgenza}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {SANZIONI.length > 1 && (
                <div className="border border-red-900 bg-red-950/10 px-4 py-3 flex items-start gap-3">
                  <span className="text-red-400 font-bold text-base flex-shrink-0">⚠</span>
                  <p className="text-base text-zinc-400">
                    <span className="text-red-400 font-bold">{SANZIONI.length} regimi sanzionatori attivi in modo cumulativo.</span>{" "}
                    Una stessa condotta può essere sanzionata contemporaneamente da più autorità (Garante, ACN, Tribunale).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. NOTA METODOLOGICA */}
        <div className="border border-zinc-800 px-5 py-4 text-base text-zinc-500 leading-relaxed space-y-2 page-break-avoid">
          <p className="font-mono text-zinc-400 font-semibold text-xs uppercase tracking-widest">
            Nota Metodologica e Valore Documentale
          </p>
          <p>
            Questa analisi applica i criteri normativi vigenti al 16/05/2026 alle informazioni fornite dalla struttura.
            Il report costituisce documentazione formale della proattività dell&apos;ente ai sensi dell&apos;
            <span className="text-zinc-300">art. 5 par. 2 GDPR</span> (accountability) e dell&apos;
            <span className="text-zinc-300">art. 6 D.Lgs. 231/2001</span> (Modello Organizzativo).
            La proattività documentata è fattore mitigante riconosciuto dalle autorità di vigilanza.
            Le sanzioni indicate sono i massimi edittali — l&apos;entità effettiva è determinata dall&apos;autorità competente.
          </p>
          <p className="text-zinc-700 font-mono text-xs">RISERVATO — USO INTERNO — NON DISTRIBUIRE</p>
        </div>

        {/* 7. PRIORITÀ DI INTERVENTO */}
        {(criticalSections.length > 0 || highSections.length > 0) && (
          <div className="space-y-2 page-break-avoid">
            <ClavisTitle it="Priorità di Intervento" en="Action Priorities" size="sm" />
            <div className={`grid gap-2 ${isDesktop ? "grid-cols-3" : "grid-cols-2"}`}>
              {criticalSections.map(s => {
                const band = getBand(s.riskScore);
                return (
                  <div key={s.id} className="border border-red-900 bg-red-950/10 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-red-400 font-bold uppercase tracking-widest">Azione Immediata</p>
                      <p className="text-base text-white font-semibold">{s.label_it}</p>
                    </div>
                    <p className="text-xl font-mono font-black flex-shrink-0" style={{ color: band.color }}>{s.riskScore}%</p>
                  </div>
                );
              })}
              {highSections.map(s => {
                const band = getBand(s.riskScore);
                return (
                  <div key={s.id} className="border border-orange-900 bg-orange-950/10 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-orange-400 font-bold uppercase tracking-widest">Piano 30 giorni</p>
                      <p className="text-base text-white font-semibold">{s.label_it}</p>
                    </div>
                    <p className="text-xl font-mono font-black flex-shrink-0" style={{ color: band.color }}>{s.riskScore}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 8. CTA */}
        <div
          className="border-2 border-zinc-600 p-6 space-y-4 print-hide"
          style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.05) 0%, rgba(99,102,241,0.05) 100%)" }}
        >
          <ClavisTitle it="Trasforma il Rischio in Controllo" en="Turn Risk Into Compliance" size="lg" />
          <p className="text-zinc-200 text-base leading-relaxed">
            Questo report è il punto di partenza. Con <span className="text-white font-semibold">CLAVIS</span> hai
            uno strumento permanente di governance normativa: il piano di remediation si costruisce,
            si aggiorna e si monitora direttamente in piattaforma — con scadenze, responsabili assegnati,
            evidenze documentali e aggiornamento automatico al mutare della normativa.
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {[
              "✓  Piano di remediation strutturato per ogni area di rischio",
              "✓  Monitoraggio scadenze normative con alert automatici",
              "✓  Documentazione accountability sempre pronta per audit e ispezioni",
              "✓  Aggiornamento normativo continuo — NIS2, AI Act, GDPR, D.Lgs. 231",
              "✓  Multi-struttura: gestisci tutto il portafoglio da un'unica dashboard",
            ].map((item, i) => (
              <p key={i} className="text-base text-zinc-300">{item}</p>
            ))}
          </div>
          <div className="border-t border-zinc-700 pt-4 flex gap-3">
            <button
              onClick={() =>
                router.push(
                  `/register?session=${sessionId ?? ""}&from=triage&email=${encodeURIComponent(anagrafica.email)}`,
                )
              }
              className="flex-1 border border-white py-4 font-black tracking-widest uppercase text-sm hover:bg-white hover:text-black transition-colors duration-200"
            >
              Accedi a CLAVIS →
            </button>
            <button
              onClick={() => window.print()}
              className="border border-zinc-700 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors"
            >
              Stampa
            </button>
          </div>
        </div>

        <button
          onClick={onReset}
          className="print-hide w-full text-zinc-700 text-base py-2 hover:text-zinc-500 transition-colors"
        >
          ← Nuovo Triage
        </button>

      </div>
    </BgLayout>
  );
}
