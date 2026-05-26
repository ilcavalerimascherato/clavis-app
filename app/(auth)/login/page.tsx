"use client";

// app/auth/login/page.tsx
// Split-screen: sinistra = landing CLAVIS, destra = form login/recovery

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "forgot" | "reset";

// [cx, cy, r, pulse_class (1|2|3)]
const STARS: Array<[number, number, number, 1 | 2 | 3]> = [
  [42,  28,  1.2, 1], [123, 52,  0.9, 2], [198, 22,  1.5, 1],
  [287, 78,  1.0, 3], [352, 38,  1.8, 2], [418, 64,  0.8, 1],
  [488, 29,  1.3, 3], [558, 88,  1.0, 2], [631, 43,  1.6, 1],
  [702, 19,  0.9, 3], [762, 69,  1.2, 2], [78,  118, 1.0, 3],
  [153, 138, 1.4, 1], [242, 108, 0.8, 2], [312, 158, 1.2, 3],
  [383, 128, 1.5, 1], [453, 143, 0.9, 2], [522, 113, 1.3, 3],
  [593, 163, 1.0, 1], [663, 133, 1.6, 2], [732, 148, 0.8, 3],
  [782, 118, 1.2, 1], [33,  218, 1.5, 2], [112, 198, 0.9, 3],
  [178, 238, 1.3, 1], [258, 208, 1.0, 2], [333, 253, 1.4, 3],
  [402, 223, 0.8, 1], [468, 243, 1.6, 2], [543, 203, 1.2, 3],
  [613, 268, 0.9, 1], [683, 233, 1.5, 2], [743, 258, 1.0, 3],
  [88,  318, 1.3, 1], [163, 358, 0.8, 2], [278, 338, 1.4, 3],
  [398, 378, 1.1, 1], [518, 348, 1.6, 2], [638, 398, 0.9, 3],
  [753, 328, 1.2, 1],
];

const HERO_PILLS = [
  {
    label: "Triage normativo automatico",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.25" />
        <path d="M3.5 7l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Supply chain compliance",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5.5 8.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M8.5 5.5 9 5a2 2 0 012.83 2.83l-2 2A2 2 0 017 7.17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M5.5 8.5 5 9a2 2 0 01-2.83-2.83l2-2A2 2 0 017 6.83" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Incident response 24h/72h",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M7 4.5V7l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hash = window.location.hash;
    if (hash.includes("type=recovery") && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            setMode("reset");
            window.history.replaceState(null, "", window.location.pathname);
          });
      }
    }
  }, [supabase]);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ text: error.message.includes("Invalid") ? "Email o password non corretti." : error.message, type: "error" });
    } else { router.push("/dashboard"); }
    setLoading(false);
  }

  async function handleForgot() {
    if (!email) { setMessage({ text: "Inserisci la tua email.", type: "error" }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    });
    if (error) { setMessage({ text: error.message, type: "error" }); }
    else { setMessage({ text: "Link inviato. Controlla email e cartella spam.", type: "success" }); }
    setLoading(false);
  }

  async function handleReset() {
    if (!newPassword || newPassword !== confirmPassword) return;
    if (newPassword.length < 8) { setMessage({ text: "Minimo 8 caratteri.", type: "error" }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setMessage({ text: error.message, type: "error" }); }
    else { setMessage({ text: "Password aggiornata. Accesso in corso...", type: "success" }); setTimeout(() => router.push("/dashboard"), 1500); }
    setLoading(false);
  }

  const inputClass = "w-full bg-zinc-950 border border-zinc-800 px-4 py-3.5 text-white placeholder-zinc-700 focus:border-zinc-500 outline-none text-base transition-colors";
  const labelClass = "block text-xs text-zinc-500 uppercase tracking-[0.15em] mb-2 font-medium";
  const btnClass = "w-full border py-4 font-black tracking-widest uppercase text-base transition-all disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed border-white hover:bg-white hover:text-black";
  const msgClass = (t: string) => `px-4 py-3 text-sm border leading-relaxed ${t === "error" ? "border-red-900 bg-red-950/20 text-red-400" : "border-green-900 bg-green-950/10 text-green-400"}`;

  function renderForm() {
    if (mode === "reset") return (
      <div className="space-y-6">
        <div>
          <p className="text-2xl font-bold text-white uppercase tracking-tight">Nuova Password</p>
          <p className="text-xs text-zinc-600 tracking-widest mt-1">(Reset Password)</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nuova Password *</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimo 8 caratteri" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Conferma Password *</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Ripeti" onKeyDown={e => e.key === "Enter" && handleReset()}
              className={`${inputClass} ${confirmPassword && newPassword !== confirmPassword ? "border-red-900" : ""}`} />
            {confirmPassword && newPassword !== confirmPassword && <p className="text-sm text-red-400 mt-1.5">Le password non coincidono.</p>}
            {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 && <p className="text-sm text-green-400 mt-1.5">✓ Corrispondono.</p>}
          </div>
        </div>
        {message && <div className={msgClass(message.type)}>{message.text}</div>}
        <button disabled={loading || !newPassword || newPassword !== confirmPassword} onClick={handleReset} className={btnClass}>
          {loading ? "Aggiornamento..." : "Imposta Password →"}
        </button>
      </div>
    );

    if (mode === "forgot") return (
      <div className="space-y-6">
        <div>
          <button onClick={() => { setMode("login"); setMessage(null); }} className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors mb-4 flex items-center gap-1.5">
            ← Torna al login
          </button>
          <p className="text-2xl font-bold text-white uppercase tracking-tight">Recupero Password</p>
          <p className="text-xs text-zinc-600 tracking-widest mt-1">(Password Recovery)</p>
          <p className="text-sm text-zinc-400 mt-4 leading-relaxed">Inserisci la tua email per ricevere il link di reimpostazione.</p>
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@struttura.it" onKeyDown={e => e.key === "Enter" && handleForgot()} className={inputClass} autoComplete="email" />
        </div>
        {message && <div className={msgClass(message.type)}>{message.text}</div>}
        <button disabled={loading || !email} onClick={handleForgot} className={btnClass}>
          {loading ? "Invio..." : "Invia Link →"}
        </button>
      </div>
    );

    return (
      <div className="space-y-6">
        <div>
          <p className="text-2xl font-bold text-white uppercase tracking-tight">Accesso alla Piattaforma</p>
          <p className="text-xs text-zinc-600 tracking-widest mt-1">(Platform Login)</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@struttura.it" onKeyDown={e => e.key === "Enter" && handleLogin()} className={inputClass} autoComplete="email" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-500 uppercase tracking-[0.15em] font-medium">Password</label>
              <button onClick={() => { setMode("forgot"); setMessage(null); }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors tracking-wide">
                Password dimenticata?
              </button>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} className={inputClass} autoComplete="current-password" />
          </div>
        </div>
        {message && <div className={msgClass(message.type)}>{message.text}</div>}
        <button disabled={loading || !email || !password} onClick={handleLogin} className={btnClass}>
          {loading ? "Accesso in corso..." : "Accedi →"}
        </button>
        <div className="space-y-3 pt-4 border-t border-zinc-900">
          <p className="text-sm text-zinc-600 text-center">
            Non hai un account?{" "}
            <button onClick={() => router.push("/register")} className="text-zinc-300 hover:text-white transition-colors underline">
              Registrati
            </button>
          </p>
          <p className="text-center">
            <a href="/triage/pubblico" className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors">
              Prova il Triage senza registrazione →
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#080c14" }}>

      {/* ── SINISTRA — Hero */}
      <div className="hidden lg:flex flex-col w-[56%] relative overflow-hidden clavis-bg border-r border-slate-800 px-16 py-14">

        {/* ── LAYER 0: Glow orbs */}
        <div
          className="absolute top-0 left-0 w-96 h-96 rounded-full pointer-events-none z-0 animate-pulse blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(0,210,180,0.12) 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 right-0 w-80 h-80 rounded-full pointer-events-none z-0 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-20 left-1/3 w-64 h-64 rounded-full pointer-events-none z-0 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)" }}
        />

        {/* ── LAYER 0: City silhouette */}
        <svg
          className="absolute bottom-0 left-0 right-0 h-48 w-full pointer-events-none z-0"
          viewBox="0 0 1440 200"
          preserveAspectRatio="xMidYMax meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="cityG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F2040" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="fadeG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="60%" stopColor="#0F172A" stopOpacity="0" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Edifici */}
          <rect x="0"    y="60" width="40" height="140" fill="url(#cityG)" />
          <rect x="50"   y="40" width="30" height="160" fill="url(#cityG)" />
          <rect x="100"  y="50" width="60" height="150" fill="url(#cityG)" />
          <rect x="170"  y="20" width="35" height="180" fill="url(#cityG)" />
          <rect x="220"  y="45" width="50" height="155" fill="url(#cityG)" />
          <rect x="330"  y="10" width="30" height="190" fill="url(#cityG)" />
          <rect x="370"  y="35" width="70" height="165" fill="url(#cityG)" />
          <rect x="510"  y="20" width="40" height="180" fill="url(#cityG)" />
          <rect x="630"  y="30" width="35" height="170" fill="url(#cityG)" />
          <rect x="740"  y="10" width="40" height="190" fill="url(#cityG)" />
          <rect x="900"  y="25" width="35" height="175" fill="url(#cityG)" />
          <rect x="1060" y="15" width="40" height="185" fill="url(#cityG)" />
          <rect x="1180" y="5"  width="45" height="195" fill="url(#cityG)" />
          <rect x="1300" y="30" width="40" height="170" fill="url(#cityG)" />

          {/* Luci finestre — cyan / violet / blue */}
          <rect x="54"   y="50" width="6" height="4" rx="1" fill="rgba(0,210,180,0.65)" />
          <rect x="64"   y="50" width="6" height="4" rx="1" fill="rgba(0,210,180,0.40)" />
          <rect x="54"   y="62" width="6" height="4" rx="1" fill="rgba(0,210,180,0.75)" />
          <rect x="174"  y="28" width="6" height="4" rx="1" fill="rgba(139,92,246,0.70)" />
          <rect x="184"  y="28" width="6" height="4" rx="1" fill="rgba(139,92,246,0.50)" />
          <rect x="174"  y="40" width="6" height="4" rx="1" fill="rgba(59,130,246,0.60)" />
          <rect x="334"  y="18" width="6" height="4" rx="1" fill="rgba(0,210,180,0.80)" />
          <rect x="344"  y="18" width="6" height="4" rx="1" fill="rgba(0,210,180,0.50)" />
          <rect x="334"  y="30" width="6" height="4" rx="1" fill="rgba(139,92,246,0.60)" />
          <rect x="514"  y="28" width="6" height="4" rx="1" fill="rgba(59,130,246,0.70)" />
          <rect x="524"  y="28" width="6" height="4" rx="1" fill="rgba(59,130,246,0.50)" />
          <rect x="534"  y="40" width="6" height="4" rx="1" fill="rgba(0,210,180,0.60)" />
          <rect x="744"  y="18" width="6" height="4" rx="1" fill="rgba(139,92,246,0.80)" />
          <rect x="754"  y="18" width="6" height="4" rx="1" fill="rgba(139,92,246,0.50)" />
          <rect x="744"  y="30" width="6" height="4" rx="1" fill="rgba(0,210,180,0.60)" />
          <rect x="1184" y="12" width="6" height="4" rx="1" fill="rgba(59,130,246,0.70)" />
          <rect x="1194" y="12" width="6" height="4" rx="1" fill="rgba(0,210,180,0.55)" />
          <rect x="1204" y="24" width="6" height="4" rx="1" fill="rgba(139,92,246,0.65)" />

          {/* Fade bottom */}
          <rect x="0" y="0" width="1440" height="200" fill="url(#fadeG)" />
        </svg>

        {/* ── LAYER 1: Scanline overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.04) 4px)",
          }}
        />

        {/* ── LAYER 2: Stelle fisse */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-[2]"
          viewBox="0 0 800 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {STARS.map(([cx, cy, r, anim], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="white" className={`star-pulse-${anim}`} />
          ))}
        </svg>

        {/* ── LAYER 2: Stelle cadenti */}
        <div
          className="shooting-star pointer-events-none z-[2]"
          style={{ top: "15%", left: "10%", animationDuration: "7s",  animationDelay: "0s" }}
        />
        <div
          className="shooting-star pointer-events-none z-[2]"
          style={{ top: "8%",  left: "40%", animationDuration: "9s",  animationDelay: "3s" }}
        />
        <div
          className="shooting-star pointer-events-none z-[2]"
          style={{ top: "25%", left: "5%",  animationDuration: "11s", animationDelay: "6s" }}
        />

        {/* ── LAYER 10: Contenuto testuale */}
        <div className="relative z-10 flex flex-col justify-between h-full">

          {/* TOP — badge + hero copy + feature pills */}
          <div className="space-y-8">

            {/* Badge pill */}
            <div className="flex items-center gap-2.5 w-fit px-4 py-2 border border-slate-700 rounded-full bg-slate-800/40">
              <span className="clavis-pulse-cyan" />
              <span className="text-xs font-mono text-slate-400 tracking-widest uppercase">
                Governance Normativa · RSA · D.Lgs. 138/2024
              </span>
            </div>

            {/* Hero text */}
            <div className="space-y-4 max-w-lg">
              <h1 className="clavis-hero-title">CLAVIS</h1>
              <p className="clavis-hero-subtitle text-slate-300">
                La chiave della conformità normativa per le strutture LTC
              </p>
              <p className="text-slate-400 text-base leading-relaxed">
                Piattaforma autonoma di governance normativa per RSA.
                Monitora NIS2, AI Act e GDPR in tempo reale.
              </p>
            </div>

            {/* Feature pills */}
            <div className="flex flex-col gap-3">
              {HERO_PILLS.map(pill => (
                <div
                  key={pill.label}
                  className="flex items-center gap-2.5 w-fit px-4 py-2.5 border border-slate-700 rounded-full bg-slate-800/30 text-slate-300 text-sm"
                >
                  {pill.icon}
                  <span>{pill.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* BOTTOM — stats row */}
          <div className="border-t border-slate-800 pt-6">
            <p className="text-xs font-mono text-slate-500 tracking-[0.15em]">
              23 tipologie UDO · 3 framework normativi · Agosto 2026 deadline
            </p>
          </div>
        </div>
      </div>

      {/* ── DESTRA — Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 lg:px-14 py-12 relative">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* Logo mobile */}
        <div className="lg:hidden mb-10 text-center">
          <p className="text-3xl font-black tracking-[0.15em] text-white">CLAVIS</p>
          <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase mt-1">Governance Normativa Sociosanitaria</p>
        </div>

        {/* Divisore verticale decorativo */}
        <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-24"
          style={{ background: "linear-gradient(to bottom, transparent, #3f3f46, transparent)" }} />

        <div className="relative z-10 w-full max-w-md">
          {renderForm()}
        </div>

        <p className="lg:hidden relative z-10 mt-12 text-xs font-mono text-zinc-800 text-center">
          CLAVIS v0.2.0 — Uso riservato
        </p>
      </div>
    </div>
  );
}
