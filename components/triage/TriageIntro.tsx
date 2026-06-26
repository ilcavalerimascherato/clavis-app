"use client";

import React, { useEffect, useRef, useState } from "react";

// ─── SEZIONI RADAR
const SECTIONS = [
  { id: "S1", label: "Supply Chain",  framework: "NIS2",       risk: 72 },
  { id: "S2", label: "AI Act",        framework: "AI Act",     risk: 45 },
  { id: "S3", label: "Shadow IT",     framework: "D.Lgs.231",  risk: 88 },
  { id: "S4", label: "Incidenti",     framework: "NIS2",       risk: 61 },
  { id: "S5", label: "Governance",    framework: "D.Lgs.231",  risk: 33 },
  { id: "S6", label: "Compliance",    framework: "DM 77",      risk: 55 },
];

const NORME = [
  { label: "NIS2",         ref: "D.Lgs. 138/2024" },
  { label: "AI Act",       ref: "UE 2024/1689"    },
  { label: "GDPR",         ref: "UE 2016/679"     },
  { label: "D.Lgs. 231",  ref: "L. 132/2025"     },
  { label: "MDR",          ref: "UE 2017/745"     },
  { label: "DM 77",        ref: "DM 77/2022"      },
];

// ─── RADAR SVG animato
function AnimatedRadar() {
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      setPhase(((ts - startRef.current) / 8000) * Math.PI * 2);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const cx = 180, cy = 180, r = 130, n = 6;

  function pt(i: number, val: number, extra = 0) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rv = ((val / 100) * r) + extra;
    return { x: cx + rv * Math.cos(a), y: cy + rv * Math.sin(a) };
  }

  // Valori animati con oscillazione lenta
  const animatedRisks = SECTIONS.map((s, i) => {
    const osc = Math.sin(phase + i * 1.1) * 8;
    return Math.min(100, Math.max(10, s.risk + osc));
  });

  const poly = animatedRisks.map((v, i) => {
    const p = pt(i, v);
    return `${p.x},${p.y}`;
  }).join(" ");

  // Linea radar rotante
  const radarX = cx + (r + 20) * Math.cos(phase - Math.PI / 2);
  const radarY = cy + (r + 20) * Math.sin(phase - Math.PI / 2);

  function getRiskColor(risk: number) {
    if (risk >= 70) return "#E8634A";
    if (risk >= 45) return "#D9B25A";
    return "#3ECF8E";
  }

  return (
    <svg viewBox="0 0 360 360" className="w-full h-full" style={{ filter: "drop-shadow(0 0 32px rgba(37,99,235,0.15))" }}>
      {/* Sfondo cerchi griglia */}
      {[25, 50, 75, 100].map(l => (
        <polygon key={l}
          points={Array.from({ length: n }, (_, i) => {
            const p = pt(i, l);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="rgba(238,241,248,0.06)"
          strokeWidth={l === 100 ? "1.5" : "0.8"}
        />
      ))}

      {/* Assi */}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 100);
        return (
          <line key={i}
            x1={cx} y1={cy} x2={p.x} y2={p.y}
            stroke="rgba(238,241,248,0.08)" strokeWidth="1"
          />
        );
      })}

      {/* Sweep radar — linea rotante */}
      <defs>
        <radialGradient id="radarSweep" cx="0%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </radialGradient>
      </defs>
      <line
        x1={cx} y1={cy} x2={radarX} y2={radarY}
        stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.6"
      />
      {/* Arco sweep */}
      <path
        d={`M ${cx} ${cy} L ${cx + (r + 20) * Math.cos(phase - Math.PI / 2 - 0.8)} ${cy + (r + 20) * Math.sin(phase - Math.PI / 2 - 0.8)} A ${r + 20} ${r + 20} 0 0 1 ${radarX} ${radarY} Z`}
        fill="url(#radarSweep)"
        opacity="0.3"
      />

      {/* Area rischio */}
      <polygon
        points={poly}
        fill="rgba(37,99,235,0.08)"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={{ transition: "points 0.1s ease" }}
      />

      {/* Punti sezione */}
      {animatedRisks.map((v, i) => {
        const p = pt(i, v);
        const color = getRiskColor(v);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5" fill={color} opacity="0.9" />
            <circle cx={p.x} cy={p.y} r="9" fill={color} opacity="0.15" />
          </g>
        );
      })}

      {/* Label sezioni */}
      {SECTIONS.map((s, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const d = r + 28;
        const x = cx + d * Math.cos(a);
        const y = cy + d * Math.sin(a);
        const dx = Math.cos(a);
        return (
          <text key={i} x={x} y={y}
            textAnchor={dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle"}
            fontSize="10"
            fontFamily="DM Sans, system-ui"
            fontWeight="600"
            fill="rgba(200,194,180,0.7)"
            dominantBaseline="middle"
          >
            {s.label}
          </text>
        );
      })}

      {/* Centro */}
      <circle cx={cx} cy={cy} r="4" fill="#2563eb" opacity="0.8" />
      <circle cx={cx} cy={cy} r="8" fill="#2563eb" opacity="0.15" />
    </svg>
  );
}

// ─── STELLE STATICHE
function Stars() {
  const stars = [
    { cx: 15, cy: 18, r: 1.2, o: 0.30 }, { cx: 85, cy: 8, r: 0.8, o: 0.20 },
    { cx: 140, cy: 25, r: 1.5, o: 0.35 }, { cx: 58, cy: 42, r: 1.0, o: 0.25 },
    { cx: 172, cy: 12, r: 0.9, o: 0.15 }, { cx: 28, cy: 68, r: 1.8, o: 0.40 },
    { cx: 118, cy: 55, r: 1.2, o: 0.20 }, { cx: 75, cy: 80, r: 0.8, o: 0.30 },
    { cx: 155, cy: 72, r: 1.4, o: 0.25 }, { cx: 200, cy: 30, r: 1.1, o: 0.20 },
    { cx: 240, cy: 15, r: 0.9, o: 0.30 }, { cx: 300, cy: 45, r: 1.3, o: 0.25 },
    { cx: 350, cy: 20, r: 1.0, o: 0.20 }, { cx: 420, cy: 60, r: 1.6, o: 0.35 },
    { cx: 480, cy: 10, r: 0.8, o: 0.15 }, { cx: 550, cy: 40, r: 1.2, o: 0.30 },
    { cx: 620, cy: 25, r: 0.9, o: 0.20 }, { cx: 700, cy: 55, r: 1.4, o: 0.25 },
    { cx: 750, cy: 15, r: 1.0, o: 0.30 }, { cx: 820, cy: 35, r: 0.8, o: 0.20 },
  ];

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      {stars.map((s, i) => (
        <circle key={i} cx={`${(s.cx / 900) * 100}%`} cy={`${s.cy}px`} r={s.r} fill="white" opacity={s.o} />
      ))}
    </svg>
  );
}

// ─── PROPS
interface TriageIntroProps {
  onStart: () => void;
  beforeButton?: React.ReactNode;
}

// ─── MAIN COMPONENT
export default function TriageIntro({ onStart, beforeButton }: TriageIntroProps) {
  return (
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{ backgroundColor: "#080c14", fontFamily: "DM Sans, system-ui" }}
    >
      {/* Stelle di sfondo */}
      <Stars />

      {/* Stelle cadenti */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="shooting-star" style={{ top: "8%",  animationDuration: "9s",  animationDelay: "1s" }} />
        <div className="shooting-star" style={{ top: "22%", animationDuration: "13s", animationDelay: "5s" }} />
        <div className="shooting-star" style={{ top: "55%", animationDuration: "10s", animationDelay: "3s" }} />
      </div>

      {/* ── COLONNA SINISTRA — Radar */}
      <div
        className="hidden lg:flex flex-col items-center justify-center flex-shrink-0 relative"
        style={{ width: "45%", zIndex: 1 }}
      >
        {/* Glow sfondo radar */}
        <div
          className="absolute"
          style={{
            width: "420px", height: "420px",
            background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Radar */}
        <div style={{ width: "380px", height: "380px", position: "relative", zIndex: 2 }}>
          <AnimatedRadar />
        </div>

        {/* Label sotto radar */}
        <div className="text-center mt-4" style={{ position: "relative", zIndex: 2 }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(37,99,235,0.8)" }}>
            Profilo di Rischio Composito
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(200,194,180,0.4)" }}>
            Analisi simulata — il tuo profilo sarà generato al termine
          </p>
        </div>

        {/* Pill norme in basso */}
        <div className="flex flex-wrap gap-2 justify-center mt-6 px-8" style={{ position: "relative", zIndex: 2 }}>
          {NORME.map(n => (
            <div
              key={n.label}
              className="px-3 py-1.5 flex flex-col items-center"
              style={{
                backgroundColor: "rgba(238,241,248,0.04)",
                border: "1px solid rgba(238,241,248,0.08)",
                borderRadius: "4px",
              }}
            >
              <span className="text-xs font-bold font-mono" style={{ color: "#f0ece0" }}>{n.label}</span>
              <span className="text-xs" style={{ color: "rgba(200,194,180,0.4)", fontSize: "10px" }}>{n.ref}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COLONNA DESTRA — Contenuto */}
      <div
        className="flex flex-col justify-center flex-1 px-8 lg:px-16 py-12"
        style={{ zIndex: 1, position: "relative" }}
      >
        {/* Brand */}
        <div className="mb-10">
          <p
            className="font-black tracking-[0.15em] text-sm uppercase mb-1"
            style={{ color: "rgba(37,99,235,0.9)" }}
          >
            CLAVIS
          </p>
          <div style={{ height: "1px", width: "40px", backgroundColor: "rgba(37,99,235,0.4)" }} />
        </div>

        {/* Titolo */}
        <div className="mb-8">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "rgba(200,194,180,0.5)" }}
          >
            Governance Normativa
          </p>
          <h1
            className="font-black leading-none mb-3"
            style={{ color: "#f0ece0", fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em" }}
          >
            ANALISI DEL RISCHIO
            <br />
            <span style={{ color: "#2563eb" }}>NORMATIVO</span>
          </h1>
          <p
            className="text-sm leading-relaxed max-w-md"
            style={{ color: "rgba(200,194,180,0.6)" }}
          >
            Sei sezioni tematiche. Quindici minuti. Un Profilo di Rischio Composito
            basato su <strong style={{ color: "#f0ece0" }}>NIS2, AI Act, GDPR</strong> e D.Lgs. 231/2001.
          </p>
        </div>

        {/* Statistiche */}
        <div className="flex gap-8 mb-10">
          {[
            { value: "22", label: "domande slider" },
            { value: "6",  label: "sezioni tematiche" },
            { value: "24", label: "tipologie struttura" },
          ].map(s => (
            <div key={s.label}>
              <p
                className="font-black font-mono"
                style={{ color: "#2563eb", fontSize: "2rem", lineHeight: 1 }}
              >
                {s.value}
              </p>
              <p
                className="text-xs mt-1 leading-relaxed"
                style={{ color: "rgba(200,194,180,0.5)" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Privacy note */}
        <div
          className="flex items-center gap-3 mb-8 px-4 py-3 max-w-sm"
          style={{
            backgroundColor: "rgba(238,241,248,0.04)",
            border: "1px solid rgba(238,241,248,0.08)",
            borderRadius: "4px",
          }}
        >
          <span style={{ color: "#2563eb", fontSize: "16px" }}>⊛</span>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(200,194,180,0.5)" }}>
            I tuoi dati non vengono condivisi con terzi.{" "}
            <strong style={{ color: "#f0ece0" }}>Il report è gratuito.</strong>
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 max-w-sm">
          {beforeButton}
          <button
            onClick={onStart}
            className="w-full py-4 font-black tracking-widest uppercase text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: "#2563eb",
              color: "white",
              borderRadius: "4px",
              letterSpacing: "0.1em",
            }}
          >
            AVVIA TRIAGE →
          </button>
        </div>
      </div>
    </div>
  );
}
