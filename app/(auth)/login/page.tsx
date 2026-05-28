"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "forgot" | "reset";

// ─── Daily message logic ────────────────────────────────────────────────────
const DAILY_MSGS = [
  "Nessuna scadenza critica da ieri.",
  "Nessun alert normativo nelle ultime 24h.",
  "Aggiornamento NIS2 acquisito.",
  "Registro trattamenti verificato.",
  "Nessuna ispezione in agenda oggi.",
  "Piano di rientro: progressi registrati.",
  "Conformità monitorata. Tutto sotto controllo.",
];

function getDailyMessage(): string {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return DAILY_MSGS[seed % DAILY_MSGS.length];
}

// ─── Radar blips ────────────────────────────────────────────────────────────
const BLIPS = [
  { top: "31%", left: "64%", color: "#3ecf8e", delay: "0s"   },
  { top: "25%", left: "41%", color: "#3ecf8e", delay: "1s"   },
  { top: "62%", left: "70%", color: "#5e86f5", delay: "0.5s" },
  { top: "72%", left: "35%", color: "#d9b25a", delay: "1.5s" },
] as const;

// ─── Shield logo ────────────────────────────────────────────────────────────
const ShieldMark = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={Math.round(size * 1.21)} viewBox="0 0 24 29" fill="none" aria-hidden="true">
    <path
      d="M12 1L1 6.5V14c0 8.5 5.5 14.5 11 13.5C17.5 26.5 23 20.5 23 14V6.5L12 1Z"
      fill="rgba(58,109,240,0.18)"
      stroke="#5e86f5"
      strokeWidth="0.75"
      strokeOpacity="0.55"
    />
    <path
      d="M8 14.5l3 3 5.5-5.5"
      stroke="#5e86f5"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity="0.88"
    />
  </svg>
);

// ─── Style constants ─────────────────────────────────────────────────────────
const LABEL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(154,163,189,.45)",
  display: "block",
  marginBottom: 6,
};

const INST_NOTE: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  color: "rgba(154,163,189,.25)",
  textAlign: "center",
};

const DIVIDER: React.CSSProperties = {
  borderTop: "1px solid rgba(238,241,248,.06)",
  paddingTop: 14,
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router  = useRouter();
  const supabase = createClient();

  const [mode,            setMode]            = useState<Mode>("login");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading,         setLoading]         = useState(false);
  const [message,         setMessage]         = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [mounted,         setMounted]         = useState(false);
  const [currentDate,     setCurrentDate]     = useState("—");
  const [dailyMsg,        setDailyMsg]        = useState<string>(getDailyMessage());

  useEffect(() => {
    setMounted(true);
    setCurrentDate(
      new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    );

    // TODO: replace with fetch('/api/clavis/daily-status') when Edge Function is ready
    async function fetchDailyStatus() {
      try {
        const res = await fetch("/api/clavis/daily-status");
        if (res.ok) {
          const data = await res.json() as { message?: string };
          if (data.message) setDailyMsg(data.message);
        }
      } catch {
        // static fallback remains
      }
    }
    fetchDailyStatus();

    const hash = window.location.hash;
    if (hash.includes("type=recovery") && hash.includes("access_token=")) {
      const params       = new URLSearchParams(hash.replace("#", ""));
      const accessToken  = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
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
      setMessage({
        text: error.message.includes("Invalid") ? "Email o password non corretti." : error.message,
        type: "error",
      });
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  }

  async function handleForgot() {
    if (!email) { setMessage({ text: "Inserisci la tua email.", type: "error" }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    });
    if (error) { setMessage({ text: error.message, type: "error" }); }
    else       { setMessage({ text: "Link inviato. Controlla la tua email.", type: "success" }); }
    setLoading(false);
  }

  async function handleReset() {
    if (!newPassword || newPassword !== confirmPassword) return;
    if (newPassword.length < 8) { setMessage({ text: "Minimo 8 caratteri.", type: "error" }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setMessage({ text: error.message, type: "error" }); }
    else {
      setMessage({ text: "Password aggiornata. Accesso in corso...", type: "success" });
      setTimeout(() => router.push("/dashboard"), 1500);
    }
    setLoading(false);
  }

  function renderForm() {
    const MSG = message
      ? <div className={message.type === "error" ? "login-msg-error" : "login-msg-success"}>{message.text}</div>
      : null;

    if (mode === "reset") return (
      <div className="flex flex-col" style={{ gap: 20 }}>
        <p>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#5e86f5" }}>
            NUOVA PASSWORD
          </span>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 9, fontStyle: "italic", color: "rgba(154,163,189,.35)", marginLeft: 6 }}>
            / (Reset password)
          </span>
        </p>
        <div>
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: "#eef1f8", lineHeight: 1.1, marginBottom: 6 }}>
            Scegli la tua chiave.
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(154,163,189,.6)" }}>
            Almeno 8 caratteri.
          </p>
        </div>
        <div className="flex flex-col" style={{ gap: 14 }}>
          <div>
            <label style={LABEL}>Nuova Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimo 8 caratteri"
                className="login-input login-input-pw"
                style={{ paddingRight: 46 }}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(v => !v)}
                tabIndex={-1}
                aria-label={showNewPassword ? "Nascondi password" : "Mostra password"}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em",
                  color: "rgba(154,163,189,.4)", background: "none", border: "none", cursor: "pointer",
                  padding: 0, transition: "color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#5e86f5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(154,163,189,.4)"; }}
              >
                {showNewPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>
          <div>
            <label style={LABEL}>Conferma Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Ripeti" onKeyDown={e => e.key === "Enter" && handleReset()}
              className="login-input"
              style={confirmPassword && newPassword !== confirmPassword ? { borderColor: "rgba(232,99,74,.5)" } : undefined}
            />
            {confirmPassword && newPassword !== confirmPassword &&
              <p style={{ fontSize: 11, color: "#e8634a", marginTop: 4 }}>Le password non coincidono.</p>}
            {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 &&
              <p style={{ fontSize: 11, color: "#3ecf8e", marginTop: 4 }}>✓ Corrispondono.</p>}
          </div>
        </div>
        {MSG}
        <button disabled={loading || !newPassword || newPassword !== confirmPassword}
          onClick={handleReset} className="login-btn-primary">
          {loading ? "Aggiornamento..." : "Aggiorna password →"}
        </button>
        <div style={{ textAlign: "center" }}>
          <button onClick={() => { setMode("login"); setMessage(null); }} className="login-link" style={{ fontSize: 11 }}>
            ← Torna al login
          </button>
        </div>
        <div style={DIVIDER}><p style={INST_NOTE}>Accesso riservato agli utenti autorizzati di Gruppo Over.</p></div>
      </div>
    );

    if (mode === "forgot") return (
      <div className="flex flex-col" style={{ gap: 20 }}>
        <p>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#5e86f5" }}>
            RECUPERO ACCESSO
          </span>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 9, fontStyle: "italic", color: "rgba(154,163,189,.35)", marginLeft: 6 }}>
            / (Password recovery)
          </span>
        </p>
        <div>
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: "#eef1f8", lineHeight: 1.1, marginBottom: 6 }}>
            Hai dimenticato?
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(154,163,189,.6)" }}>
            Inserisci la tua email. Ti mandiamo il link.
          </p>
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@struttura.it" onKeyDown={e => e.key === "Enter" && handleForgot()}
            className="login-input" autoComplete="email" />
        </div>
        {MSG}
        <button disabled={loading || !email} onClick={handleForgot} className="login-btn-primary">
          {loading ? "Invio in corso..." : "Invia il link →"}
        </button>
        <div style={{ textAlign: "center" }}>
          <button onClick={() => { setMode("login"); setMessage(null); }} className="login-link" style={{ fontSize: 11 }}>
            ← Torna al login
          </button>
        </div>
        <div style={DIVIDER}>
          <p style={INST_NOTE}>Controlla anche la cartella spam.</p>
        </div>
      </div>
    );

    return (
      <div className="flex flex-col" style={{ gap: 20 }}>
        {/* Tag */}
        <p>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#5e86f5" }}>
            ACCESSO RISERVATO
          </span>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 9, fontStyle: "italic", color: "rgba(154,163,189,.35)", marginLeft: 6 }}>
            / (Secure access)
          </span>
        </p>

        {/* Heading */}
        <div>
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: "#eef1f8", lineHeight: 1.1, marginBottom: 6 }}>
            Bentornato.
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(154,163,189,.6)" }}>
            La tua plancia ti aspetta.
          </p>
        </div>

        {/* Inputs */}
        <div className="flex flex-col" style={{ gap: 14 }}>
          <div>
            <label style={LABEL}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nome@struttura.it" onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="login-input" autoComplete="email" />
          </div>
          <div>
            <label style={LABEL}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="login-input login-input-pw"
                style={{ paddingRight: 46 }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: "rgba(154,163,189,.4)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#5e86f5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(154,163,189,.4)"; }}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>
        </div>

        {MSG}

        <button disabled={loading || !email || !password} onClick={handleLogin} className="login-btn-primary">
          {loading ? "Accesso in corso..." : "Entra in CLAVIS →"}
        </button>

        <div style={{ textAlign: "center" }}>
          <button onClick={() => { setMode("forgot"); setMessage(null); }} className="login-link" style={{ fontSize: 11 }}>
            Password dimenticata?
          </button>
        </div>

        <div style={DIVIDER}><p style={INST_NOTE}>Accesso riservato agli utenti autorizzati di Gruppo Over.</p></div>
      </div>
    );
  }

  if (!mounted) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "#060b14" }}>

      {/* ══════════════════════════════════════════════════════
          PANNELLO SINISTRO — 70% / 60% / 55% / hidden mobile
      ══════════════════════════════════════════════════════ */}
      <div className="login-panel-left">
        {/* BG: radial gradients */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: [
            "radial-gradient(ellipse 65% 55% at 38% 55%, rgba(58,109,240,.13), transparent)",
            "radial-gradient(ellipse 50% 45% at 82% 14%, rgba(62,207,142,.07), transparent)",
            "radial-gradient(ellipse 48% 42% at 8%  88%, rgba(30,63,156,.18),  transparent)",
          ].join(", "),
        }} />

        {/* BG: grid masked to radar area */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: [
            "linear-gradient(rgba(238,241,248,.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(238,241,248,.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "48px 48px",
          maskImage:         "radial-gradient(ellipse 78% 72% at 44% 50%, black 25%, transparent 75%)",
          WebkitMaskImage:   "radial-gradient(ellipse 78% 72% at 44% 50%, black 25%, transparent 75%)",
        }} />

        {/* BG: scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.02) 3px, rgba(0,0,0,.02) 4px)",
        }} />

        {/* ── RADAR ──────────────────────────────────────────── */}
        <div className="radar-container">
          {/* Rings — proporzioni 20/40/63/87/100%, opacity decrescente verso l'esterno */}
          {([
            [100, .05],
            [87,  .09],
            [63,  .13],
            [40,  .20],
            [20,  .32],
          ] as [number, number][]).map(([pct, op], i) => (
            <div key={i} style={{
              position: "absolute",
              width: `${pct}%`,
              height: `${pct}%`,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: `1px solid rgba(94,134,245,${op})`,
              pointerEvents: "none",
            }} />
          ))}

          {/* Crosshair */}
          <div style={{ position: "absolute", top: "50%", left: 0, width: "100%", height: 1, background: "rgba(94,134,245,.12)", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(94,134,245,.12)", transform: "translateX(-50%)", pointerEvents: "none" }} />

          {/* Sweep — solo in login mode (radar fermo in forgot/reset) */}
          {mode === "login" && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transformOrigin: "0 0",
              animation: "radarRotate 5s linear infinite",
              pointerEvents: "none",
            }}>
              <div style={{
                position: "absolute",
                width: "var(--R)",
                height: "var(--R)",
                top: "calc(var(--r) * -1)",
                left: "calc(var(--r) * -1)",
                borderRadius: "50%",
                background: "conic-gradient(from 35deg at 50% 50%, rgba(62,207,142,.07) 0deg, rgba(62,207,142,.07) 55deg, transparent 55deg)",
                overflow: "hidden",
              }} />
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "var(--r)",
                height: 1,
                background: "linear-gradient(90deg, rgba(62,207,142,.9), transparent)",
              }} />
            </div>
          )}

          {/* Blips — solo in login mode */}
          {mode === "login" && BLIPS.map((blip, i) => (
            <div key={i} style={{
              position: "absolute",
              top: blip.top,
              left: blip.left,
              transform: "translate(-50%, -50%)",
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: blip.color, position: "relative", zIndex: 2 }} />
              <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 5,
                height: 5,
                borderRadius: "50%",
                border: `1px solid ${blip.color}`,
                animation: `blipPulse 3s ${blip.delay} ease-out infinite`,
                zIndex: 1,
              }} />
            </div>
          ))}
        </div>
        {/* ── fine radar ──────────────────────────────────────── */}

        {/* ── CONTENUTO OVERLAY — z-index: 6 ─────────────────── */}

        {/* Logo — solo in login mode */}
        {mode === "login" && (
          <div style={{ position: "absolute", top: 26, left: 30, zIndex: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldMark size={20} />
            <span style={{
              fontFamily: "'Syne', system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "0.95rem",
              letterSpacing: ".22em",
              color: "#eef1f8",
              textTransform: "uppercase",
            }}>CLAVIS</span>
          </div>
        )}

        {/* Messaggio giornaliero — solo in login mode */}
        {mode === "login" && <div className="login-daily-msg">{dailyMsg}</div>}

        {/* Headline — contenuto differente per mode */}
        <div className="radar-headline">
          {mode === "login" && <>
            <p className="radar-headline-text" style={{ color: "rgba(238,241,248,.9)" }}>Ogni giorno,</p>
            <p className="radar-headline-text" style={{ fontStyle: "italic", color: "#5e86f5" }}>qualcuno controlla per te.</p>
          </>}
          {mode === "forgot" && <>
            <p className="radar-headline-text" style={{ color: "rgba(238,241,248,.9)" }}>Un momento,</p>
            <p className="radar-headline-text" style={{ fontStyle: "italic", color: "#5e86f5" }}>ci pensiamo noi.</p>
          </>}
          {mode === "reset" && <>
            <p className="radar-headline-text" style={{ color: "rgba(238,241,248,.9)" }}>Quasi fatto,</p>
            <p className="radar-headline-text" style={{ fontStyle: "italic", color: "#5e86f5" }}>scegli la nuova chiave.</p>
          </>}
        </div>

        {/* Status lines — solo in login mode */}
        {mode === "login" && (
          <div className="login-status-lines">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="clavis-pulse-emerald" />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#eef1f8" }}>
                Monitoraggio normativo attivo
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(154,163,189,.28)", flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(154,163,189,.45)" }}>
                GDPR · NIS2 · AI Act · D.Lgs 231
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(154,163,189,.28)", flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(154,163,189,.45)" }}>
                Aggiornato al {currentDate}
              </span>
            </div>
          </div>
        )}

        {/* Footer — solo in forgot/reset mode */}
        {mode !== "login" && (
          <p style={{
            position: "absolute", bottom: 26, left: 30, zIndex: 6,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            letterSpacing: "0.1em", color: "rgba(154,163,189,.25)",
          }}>
            CLAVIS · Governance Normativa Autonoma
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          PANNELLO DESTRO — 30% / 40% / 45% / 100% mobile
      ══════════════════════════════════════════════════════ */}
      <div className="login-panel-right">

        {/* Logo mobile — visibile solo ≤600px */}
        <div className="login-mobile-logo">
          <ShieldMark size={22} />
          <span style={{
            fontFamily: "'Syne', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "1.15rem",
            letterSpacing: ".18em",
            color: "#eef1f8",
          }}>CLAVIS</span>
        </div>
        <p className="login-mobile-tagline">Governance Normativa Autonoma</p>

        <div className="login-form-inner">
          {renderForm()}
        </div>
      </div>
    </div>
  );
}
