"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClavisTitle } from "@/components/ui/ClavisTitle";

function BgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-white relative overflow-hidden flex flex-col items-center justify-center"
      style={{
        backgroundColor: "#080c14",
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,165,233,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 60% 40% at 80% 100%, rgba(99,102,241,0.05) 0%, transparent 60%),
          radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 100% 100%, 28px 28px",
      }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(148,163,184,0.03) 1px, transparent 1px)",
          backgroundSize: "100% 56px",
        }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(8,12,20,0.8) 100%)"
        }} />
      <div className="relative z-10 w-full px-4 py-12">
        {children}
      </div>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ caratteri", ok: password.length >= 8 },
    { label: "Maiuscola", ok: /[A-Z]/.test(password) },
    { label: "Numero", ok: /[0-9]/.test(password) },
    { label: "Simbolo", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const color = score <= 1 ? "#DC2626" : score === 2 ? "#CA8A04" : score === 3 ? "#EA580C" : "#16A34A";
  const label = score <= 1 ? "Debole" : score === 2 ? "Sufficiente" : score === 3 ? "Buona" : "Ottima";

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: i <= score ? color : "#27272a" }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {checks.map(c => (
            <span key={c.label} className={`text-xs ${c.ok ? "text-zinc-400" : "text-zinc-700"}`}>
              {c.ok ? "✓" : "○"} {c.label}
            </span>
          ))}
        </div>
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const sessionId = searchParams.get("session") ?? "";
  const fromTriage = searchParams.get("from") === "triage";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (fromTriage && sessionId) {
      localStorage.setItem("clavis_pending_triage_session", sessionId);
    }
  }, [fromTriage, sessionId]);

  const emailOk = email.includes("@") && email.includes(".");
  const passwordOk = password.length >= 8;
  const passwordMatch = password === confirm;
  const canSubmit = emailOk && passwordOk && passwordMatch && !loading;

  async function handleSignup() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: signupErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: "" },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signupErr) throw new Error(signupErr.message);
      if (!authData.user) throw new Error("Registrazione non completata.");

      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore durante la registrazione.";
      if (msg.includes("already registered")) {
        setError("Questa email è già registrata. Prova ad accedere.");
      } else if (msg.includes("password")) {
        setError("La password non soddisfa i requisiti minimi.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <BgLayout>
        <div className="max-w-lg w-full mx-auto space-y-8 text-center">
          <div className="space-y-2">
            <p className="text-sm text-zinc-500 tracking-[0.3em] uppercase">CLAVIS</p>
            <ClavisTitle it="Controlla la tua Email" en="Check Your Email" variant="page" as="h1" className="text-center" />
          </div>
          <div className="border border-green-900 bg-green-950/10 p-8 space-y-4">
            <p className="text-5xl">✓</p>
            <p className="text-white font-bold text-xl">
              Controlla la tua email per confermare l&apos;account.
            </p>
            <p className="text-zinc-400 text-base leading-relaxed">
              Abbiamo inviato un link di conferma a{" "}
              <span className="text-white font-semibold">{email}</span>.
            </p>
          </div>
          <p className="text-zinc-600 text-sm">Non hai ricevuto l&apos;email? Controlla la cartella spam.</p>
        </div>
      </BgLayout>
    );
  }

  const inputClass = "w-full bg-zinc-950 border border-zinc-800 px-4 py-3 text-white placeholder-zinc-700 focus:border-zinc-500 outline-none text-lg";

  return (
    <BgLayout>
      <div className="max-w-lg w-full mx-auto space-y-8">

        <div className="space-y-4">
          <button onClick={() => router.back()}
            className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors flex items-center gap-2">
            ← Indietro
          </button>
          <div>
            <p className="text-sm text-zinc-500 tracking-[0.3em] uppercase mb-1">CLAVIS</p>
            <ClavisTitle it="Crea il tuo Account" en="Create Your Account" variant="page" as="h1" />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-2">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="es. qualita@struttura.it"
              className={inputClass}
              autoComplete="email"
            />
            {email && !emailOk && (
              <p className="text-sm text-red-400 mt-1">Inserisci un indirizzo email valido.</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-2">Password *</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimo 8 caratteri"
                className={inputClass}
                autoComplete="new-password"
              />
              <button
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-sm transition-colors">
                {showPassword ? "Nascondi" : "Mostra"}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <div>
            <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-2">Conferma Password *</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ripeti la password"
              className={`${inputClass} ${confirm && !passwordMatch ? "border-red-900" : ""}`}
              autoComplete="new-password"
            />
            {confirm && !passwordMatch && (
              <p className="text-sm text-red-400 mt-1">Le password non coincidono.</p>
            )}
            {confirm && passwordMatch && confirm.length > 0 && (
              <p className="text-sm text-green-400 mt-1">✓ Le password coincidono.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="border border-red-900 bg-red-950/20 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
            {error.includes("già registrata") && (
              <button
                onClick={() => router.push(`/login?email=${encodeURIComponent(email)}`)}
                className="text-sm text-zinc-400 hover:text-white mt-2 underline transition-colors">
                Vai al login →
              </button>
            )}
          </div>
        )}

        <button
          disabled={!canSubmit}
          onClick={handleSignup}
          className="w-full border py-4 font-black tracking-widest uppercase text-lg transition-colors duration-200 disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed border-white hover:bg-white hover:text-black">
          {loading ? "Creazione account..." : "Registrati →"}
        </button>

        <p className="text-center text-zinc-600 text-base">
          Hai già un account?{" "}
          <button
            onClick={() => router.push("/login")}
            className="text-zinc-400 hover:text-white transition-colors underline">
            Accedi
          </button>
        </p>
      </div>
    </BgLayout>
  );
}
