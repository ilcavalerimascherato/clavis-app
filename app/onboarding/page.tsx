"use client";

/**
 * CLAVIS — Onboarding primo accesso
 * Path: app/onboarding/page.tsx
 *
 * Flusso:
 * 1. Benvenuto + spiegazione
 * 2. Dati società (company)
 * 3. Dati struttura (entity)
 * 4. Redirect dashboard
 *
 * Regole:
 * - Solo dati necessari per calibrare le analisi normative
 * - Niente di superfluo
 * - Palette Institutional Shield
 */

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── DESIGN TOKENS
const T = {
  navy:     "#0F172A",
  slate50:  "#F8FAFC",
  slate100: "#E2E8F0",
  slate200: "#CBD5E1",
  slate400: "#94A3B8",
  slate600: "#475569",
  slate800: "#1E293B",
  bronze:   "#B45309",
  bronzeBg: "#FEF3C7",
  critical: "#991B1B",
  critBg:   "#FEF2F2",
};

type Step = "benvenuto" | "company" | "entity" | "saving" | "import";

const UDO_OPTIONS = [
  "RSA — Residenza Sanitaria Assistenziale",
  "RSSA — Residenza Sanitaria e Socio-Assistenziale",
  "CDI — Centro Diurno Integrato",
  "Hospice — Cure Palliative",
  "OdC — Ospedale di Comunità",
  "RSD — Residenza Sanitaria Disabili",
  "CSS — Comunità Socio-Sanitaria",
  "CDD — Centro Diurno Disabili",
  "CSE — Centro Socio Educativo",
  "CRA — Comunità Riabilitativa Alta intensità (psichiatria)",
  "CRM — Comunità Riabilitativa Media intensità (psichiatria)",
  "SRP — Struttura Residenziale Psichiatrica",
  "CPS — Centro Psicosociale",
  "SPDC — Servizio Psichiatrico Diagnosi e Cura",
  "REMS — Residenza Esecuzione Misure di Sicurezza",
  "SerD — Servizio Dipendenze",
  "CT — Comunità Terapeutica",
  "Comunità Educativa Minori",
  "ADI — Assistenza Domiciliare Integrata",
  "Poliambulatorio / Centro Riabilitativo ex art.26",
  "Altro",
];

const REGIONI = [
  "Lombardia", "Veneto", "Lazio", "Piemonte", "Emilia-Romagna",
  "Toscana", "Campania", "Sicilia", "Liguria", "Puglia",
  "Sardegna", "Calabria", "Marche", "Abruzzo", "Friuli-Venezia Giulia",
  "Trentino-Alto Adige", "Umbria", "Basilicata", "Molise", "Valle d'Aosta",
];

const ENTITY_TYPE_MAP: Record<string, string> = {
  "RSA": "RSA", "RSSA": "RSA", "CDI": "CDI", "Hospice": "HOSPICE",
  "OdC": "ALTRO", "RSD": "RSD", "CSS": "CSS", "CDD": "ALTRO",
  "CSE": "ALTRO", "CRA": "ALTRO", "CRM": "ALTRO", "SRP": "ALTRO",
  "CPS": "ALTRO", "SPDC": "ALTRO", "REMS": "ALTRO", "SerD": "ALTRO",
  "CT": "ALTRO", "Comunità": "ALTRO", "ADI": "ADI", "Poliambulatorio": "ALTRO", "Altro": "ALTRO",
};

function getEntityTypeEnum(udoLabel: string): string {
  const sigla = udoLabel.split("—")[0].trim().split(" ")[0];
  return ENTITY_TYPE_MAP[sigla] ?? "ALTRO";
}

function udoFromEntityTypeEnum(typeEnum: string): string {
  if (!typeEnum || typeEnum === "ALTRO") return "";
  return UDO_OPTIONS.find(o => getEntityTypeEnum(o) === typeEnum) ?? "";
}

// ─── COMPONENTI UI

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
            style={{
              backgroundColor: i < current ? T.navy : i === current ? T.bronze : T.slate200,
              color: i <= current ? "white" : T.slate400,
            }}>
            {i < current ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div className="w-8 h-0.5 transition-all"
              style={{ backgroundColor: i < current ? T.navy : T.slate200 }} />
          )}
        </div>
      ))}
    </div>
  );
}

const inputClass = {
  base: "w-full border px-4 py-3 text-base outline-none transition-colors",
  style: { borderColor: T.slate200, borderRadius: "4px", color: T.slate800, backgroundColor: "white", fontFamily: "Inter, system-ui" },
  focusStyle: { borderColor: T.navy },
};

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold"
        style={{ color: T.slate600, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "11px" }}>
        {label} {required && <span style={{ color: T.critical }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: T.slate400 }}>{hint}</p>}
    </div>
  );
}

// ─── MAIN
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("benvenuto");
  const [error, setError] = useState<string | null>(null);
  const [newEntityId, setNewEntityId] = useState<string | null>(null);
  const [anonSession, setAnonSession] = useState<{
    id: string; entity_name: string | null; risk_score: number | null;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [company, setCompany] = useState({
    name: "",
    vat_number: "",
    region: "",
    legal_address: "",
  });

  const [entity, setEntity] = useState({
    name: "",
    udo_type: "",
    region: "",
    total_beds: "",
    accreditation_code: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? null);

      const params = new URLSearchParams(window.location.search);
      const isPrefill = params.get("prefill") === "true";

      // Se ha già una entity e non siamo in prefill → vai direttamente in dashboard
      supabase.from("entities").select("id").eq("created_by", data.user.id).limit(1)
        .then(({ data: entities }) => {
          if (entities && entities.length > 0 && !isPrefill) router.push("/dashboard");
        });
    });
  }, [supabase, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("prefill") !== "true") return;
    const sessionId = params.get("session");
    if (!sessionId) return;

    setStep("company");
    fetch(`/api/triage-session?id=${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEntity(e => ({
          ...e,
          name: data.entity_name ?? e.name,
          udo_type: data.entity_type ? udoFromEntityTypeEnum(data.entity_type) : e.udo_type,
          region: data.entity_region ?? e.region,
          total_beds: data.total_beds != null ? String(data.total_beds) : e.total_beds,
        }));
        if (data.answers) {
          sessionStorage.setItem("clavis_triage_prefill", JSON.stringify({
            answers: data.answers,
            flags_triggered: data.flags_triggered,
            risk_score: data.risk_score,
            context_note: data.context_note,
            from_anonymous: true,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const companyValid = company.name.trim().length > 2 &&
    company.vat_number.trim().length >= 11 && company.region.length > 0;

  const entityValid = entity.name.trim().length > 2 &&
    entity.udo_type.length > 0 && entity.region.length > 0;

  async function handleSave() {
    if (!userId) return;
    setStep("saving");
    setError(null);

    try {
      // 1. Crea company
      const { data: companyData, error: companyErr } = await supabase
        .from("companies")
        .insert({
          name: company.name.trim(),
          vat_number: company.vat_number.trim(),
          region: company.region,
          legal_address: company.legal_address.trim() || null,
          country: "IT",
          created_by: userId,
        })
        .select("id")
        .single();

      if (companyErr) throw new Error(`Errore società: ${companyErr.message}`);

      // 2. Crea entity
      const { data: newEntity, error: entityErr } = await supabase
        .from("entities")
        .insert({
          company_id: companyData.id,
          name: entity.name.trim(),
          entity_type: getEntityTypeEnum(entity.udo_type),
          region: entity.region,
          total_beds: entity.total_beds ? parseInt(entity.total_beds) : null,
          accreditation_code: entity.accreditation_code.trim() || null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (entityErr) throw new Error(`Errore struttura: ${entityErr.message}`);
      if (newEntity) {
        localStorage.setItem("clavis_active_entity_id", newEntity.id);
        setNewEntityId(newEntity.id);
      }

      // 3. Aggiorna profilo come onboarded
      await supabase.from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", userId);

      // 4. Controlla triage_anonymous non ancora migrato per questa email
      if (userEmail && newEntity) {
        const { data: anonRows } = await supabase
          .from("triage_anonymous")
          .select("id, entity_name, risk_score")
          .eq("email", userEmail)
          .order("created_at", { ascending: false })
          .limit(5);

        if (anonRows && anonRows.length > 0) {
          const { data: alreadyImported } = await supabase
            .from("triage_sessions")
            .select("anonymous_session_id")
            .in("anonymous_session_id", anonRows.map(r => r.id));

          const importedIds = new Set(
            (alreadyImported ?? []).map(r => r.anonymous_session_id)
          );
          const unmigrated = anonRows.find(r => !importedIds.has(r.id));

          if (unmigrated) {
            setAnonSession(unmigrated);
            setStep("import");
            return;
          }
        }
      }

      // 5. Redirect dashboard (nessun triage da importare)
      router.push("/dashboard");

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio.");
      setStep("entity");
    }
  }

  async function handleImport() {
    if (!anonSession || !newEntityId || !userId) { router.push("/dashboard"); return; }
    setImporting(true);
    await fetch("/api/import-triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymous_id: anonSession.id,
        entity_id: newEntityId,
        user_id: userId,
      }),
    }).catch(() => {});
    router.push("/dashboard");
  }

  // ─── STEP: IMPORT
  if (step === "import") return (
    <div className="clavis-workspace min-h-screen flex items-center justify-center px-6"
      style={{ fontFamily: "Inter, system-ui" }}>
      <div className="max-w-xl w-full space-y-8">

        <div className="flex items-center gap-4">
          <div className="px-3 py-2 flex-shrink-0"
            style={{ backgroundColor: T.navy, borderRadius: "4px" }}>
            <p className="font-black tracking-widest text-white text-xl">CLAVIS</p>
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: T.slate800 }}>Configurazione completata</p>
            <p className="text-sm" style={{ color: T.slate400 }}>(Setup Complete)</p>
          </div>
        </div>

        <div className="border-l-4 pl-6 py-4 space-y-2"
          style={{ borderColor: T.bronze, backgroundColor: T.bronzeBg, borderRadius: "0 4px 4px 0" }}>
          <p className="font-bold text-base" style={{ color: T.slate800 }}>
            Abbiamo trovato un triage precedente
          </p>
          <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
            Prima di registrarti, hai completato un triage anonimo
            {anonSession?.entity_name ? ` per «${anonSession.entity_name}»` : ""}.
            {anonSession?.risk_score != null && (
              <> Score di rischio: <strong>{anonSession.risk_score}/100</strong>.</>
            )}{" "}
            Vuoi importarlo nella struttura che hai appena creato?
          </p>
        </div>

        <div className="space-y-3">
          <button
            disabled={importing}
            onClick={handleImport}
            className="w-full py-4 font-black tracking-widest uppercase text-sm transition-colors"
            style={{
              backgroundColor: importing ? T.slate200 : T.navy,
              color: importing ? T.slate400 : "white",
              borderRadius: "4px",
              cursor: importing ? "not-allowed" : "pointer",
            }}>
            {importing ? "Importazione in corso..." : "Importa triage precedente →"}
          </button>
          <button
            disabled={importing}
            onClick={() => router.push("/dashboard")}
            className="w-full py-3 text-sm font-semibold border transition-colors"
            style={{ borderColor: T.slate200, color: T.slate600, borderRadius: "4px" }}>
            Salta — Vai alla dashboard
          </button>
        </div>

        <p className="text-xs text-center" style={{ color: T.slate400 }}>
          Potrai sempre eseguire un nuovo triage dalla dashboard.
        </p>
      </div>
    </div>
  );

  // ─── STEP: BENVENUTO
  if (step === "benvenuto") return (
    <div className="clavis-workspace min-h-screen flex items-center justify-center px-6"
      style={{ fontFamily: "Inter, system-ui" }}>
      <div className="max-w-2xl w-full space-y-10">

        {/* Brand */}
        <div className="flex items-center gap-4">
          <div className="px-3 py-2 flex-shrink-0"
            style={{ backgroundColor: T.navy, borderRadius: "4px" }}>
            <p className="font-black tracking-widest text-white text-xl">CLAVIS</p>
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: T.slate800 }}>Governance Normativa Sociosanitaria</p>
            <p className="text-sm" style={{ color: T.slate400 }}>(Regulatory Governance Platform)</p>
          </div>
        </div>

        {/* Benvenuto */}
        <div className="border-l-4 pl-6 space-y-3"
          style={{ borderColor: T.bronze }}>
          <p className="text-3xl font-bold" style={{ color: T.slate800 }}>
            Benvenuto in CLAVIS.
          </p>
          <p className="text-lg leading-relaxed" style={{ color: T.slate600 }}>
            Prima di iniziare, configuriamo la tua struttura. Ci vorranno meno di 2 minuti.
            I dati che raccogliamo servono esclusivamente a calibrare l&apos;analisi normativa
            — niente di superfluo.
          </p>
        </div>

        {/* Cosa faremo */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { step: "01", title: "Dati della Società", desc: "Ragione sociale, P.IVA, regione — per identificare la titolarità del trattamento e gli obblighi NIS2." },
            { step: "02", title: "Dati della Struttura", desc: "Tipo di struttura, regione, posti letto — per calibrare i framework normativi applicabili." },
          ].map(item => (
            <div key={item.step} className="border p-5 space-y-2"
              style={{ borderColor: T.slate200, backgroundColor: "white", borderRadius: "4px" }}>
              <p className="font-mono font-black text-2xl" style={{ color: T.bronze }}>{item.step}</p>
              <p className="font-bold text-base" style={{ color: T.slate800 }}>{item.title}</p>
              <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Nota privacy */}
        <div className="border px-4 py-3 flex items-start gap-3"
          style={{ borderColor: T.slate200, backgroundColor: "white", borderRadius: "4px" }}>
          <span style={{ color: T.slate400 }}>🔒</span>
          <p className="text-sm" style={{ color: T.slate600 }}>
            I dati inseriti sono riservati al tuo account e non vengono condivisi con terzi.
            Potrai modificarli in qualsiasi momento dalla sezione Struttura.
          </p>
        </div>

        <button onClick={() => setStep("company")}
          className="w-full py-4 font-black tracking-widest uppercase text-base transition-colors"
          style={{ backgroundColor: T.navy, color: "white", borderRadius: "4px" }}>
          Inizia la Configurazione →
        </button>
      </div>
    </div>
  );

  // ─── STEP: COMPANY
  if (step === "company") return (
    <div className="clavis-workspace min-h-screen flex items-center justify-center px-6"
      style={{ fontFamily: "Inter, system-ui" }}>
      <div className="max-w-xl w-full space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: T.slate400 }}>CLAVIS — Configurazione</p>
            <p className="text-2xl font-bold" style={{ color: T.slate800 }}>Dati della Società</p>
            <p className="text-sm" style={{ color: T.slate400 }}>(Company Data)</p>
          </div>
          <StepIndicator current={0} total={2} />
        </div>

        {/* Spiegazione */}
        <div className="border-l-4 pl-4 py-1"
          style={{ borderColor: T.bronze }}>
          <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
            La <strong>società</strong> è il titolare del trattamento dei dati ai sensi del GDPR
            e il soggetto responsabile degli obblighi NIS2 e D.Lgs. 231.
            Se gestisci più strutture della stessa società, le aggiungerai in seguito.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <Field label="Ragione Sociale" required hint="Es: RSA Villa Serena Srl, Cooperativa Il Gelso">
            <input
              type="text"
              value={company.name}
              onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}
              placeholder="Es: Avvittuone Srl"
              className={inputClass.base}
              style={inputClass.style}
            />
          </Field>

          <Field label="Partita IVA" required hint="11 cifre senza spazi">
            <input
              type="text"
              value={company.vat_number}
              onChange={e => setCompany(c => ({ ...c, vat_number: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
              placeholder="12345678901"
              className={inputClass.base}
              style={inputClass.style}
              maxLength={11}
            />
            {company.vat_number.length > 0 && company.vat_number.length < 11 && (
              <p className="text-xs mt-1" style={{ color: T.critical }}>
                La P.IVA deve essere di 11 cifre ({company.vat_number.length}/11)
              </p>
            )}
          </Field>

          <Field label="Regione sede legale" required>
            <select
              value={company.region}
              onChange={e => setCompany(c => ({ ...c, region: e.target.value }))}
              className={inputClass.base}
              style={{ ...inputClass.style, appearance: "none" }}>
              <option value="">— Seleziona regione —</option>
              {REGIONI.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Indirizzo sede legale" hint="Facoltativo">
            <input
              type="text"
              value={company.legal_address}
              onChange={e => setCompany(c => ({ ...c, legal_address: e.target.value }))}
              placeholder="Es: Via Roma 1, 20100 Milano"
              className={inputClass.base}
              style={inputClass.style}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStep("benvenuto")}
            className="px-5 py-3 text-sm font-semibold border transition-colors"
            style={{ borderColor: T.slate200, color: T.slate600, borderRadius: "4px" }}>
            ← Indietro
          </button>
          <button
            disabled={!companyValid}
            onClick={() => setStep("entity")}
            className="flex-1 py-3 font-black tracking-widest uppercase text-sm transition-colors"
            style={{
              backgroundColor: companyValid ? T.navy : T.slate200,
              color: companyValid ? "white" : T.slate400,
              borderRadius: "4px",
              cursor: companyValid ? "pointer" : "not-allowed",
            }}>
            Avanti — Dati Struttura →
          </button>
        </div>
      </div>
    </div>
  );

  // ─── STEP: ENTITY
  if (step === "entity") return (
    <div className="clavis-workspace min-h-screen flex items-center justify-center px-6"
      style={{ fontFamily: "Inter, system-ui" }}>
      <div className="max-w-xl w-full space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: T.slate400 }}>CLAVIS — Configurazione</p>
            <p className="text-2xl font-bold" style={{ color: T.slate800 }}>Dati della Struttura</p>
            <p className="text-sm" style={{ color: T.slate400 }}>(Facility Data)</p>
          </div>
          <StepIndicator current={1} total={2} />
        </div>

        {/* Riepilogo company */}
        <div className="border px-4 py-3 flex items-center justify-between gap-4"
          style={{ borderColor: T.slate200, backgroundColor: "white", borderRadius: "4px" }}>
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: T.slate400, fontSize: "10px" }}>Società</p>
            <p className="font-semibold text-sm" style={{ color: T.slate800 }}>{company.name}</p>
          </div>
          <button onClick={() => setStep("company")}
            className="text-xs font-semibold" style={{ color: T.bronze }}>
            Modifica
          </button>
        </div>

        {/* Spiegazione */}
        <div className="border-l-4 pl-4 py-1" style={{ borderColor: T.bronze }}>
          <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
            La <strong>struttura</strong> è l&apos;unità operativa soggetta all&apos;accreditamento regionale.
            Se hai più strutture della stessa società, le aggiungerai dalla dashboard.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <Field label="Nome struttura" required hint="Es: RSA Il Gelso, CDI Villa Serena">
            <input
              type="text"
              value={entity.name}
              onChange={e => setEntity(en => ({ ...en, name: e.target.value }))}
              placeholder="Es: RSA Il Gelso"
              className={inputClass.base}
              style={inputClass.style}
            />
          </Field>

          <Field label="Tipologia (UDO)" required hint="Unità di Offerta — determina la normativa regionale applicabile">
            <select
              value={entity.udo_type}
              onChange={e => setEntity(en => ({ ...en, udo_type: e.target.value }))}
              className={inputClass.base}
              style={{ ...inputClass.style, appearance: "none" }}>
              <option value="">— Seleziona tipologia —</option>
              {UDO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Regione" required>
            <select
              value={entity.region}
              onChange={e => setEntity(en => ({ ...en, region: e.target.value }))}
              className={inputClass.base}
              style={{ ...inputClass.style, appearance: "none" }}>
              <option value="">— Seleziona regione —</option>
              {REGIONI.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Posti letto / Ospiti" hint="Capacità autorizzata — calibra il rischio GDPR">
              <input
                type="number"
                value={entity.total_beds}
                onChange={e => setEntity(en => ({ ...en, total_beds: e.target.value }))}
                placeholder="Es: 80"
                min={1} max={500}
                className={inputClass.base}
                style={inputClass.style}
              />
            </Field>

            <Field label="Codice accreditamento" hint="Facoltativo">
              <input
                type="text"
                value={entity.accreditation_code}
                onChange={e => setEntity(en => ({ ...en, accreditation_code: e.target.value }))}
                placeholder="Es: RSA-MI-0042"
                className={inputClass.base}
                style={inputClass.style}
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="border px-4 py-3 text-sm"
            style={{ borderColor: T.critical, backgroundColor: T.critBg, color: T.critical, borderRadius: "4px" }}>
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => setStep("company")}
            className="px-5 py-3 text-sm font-semibold border transition-colors"
            style={{ borderColor: T.slate200, color: T.slate600, borderRadius: "4px" }}>
            ← Indietro
          </button>
          <button
            disabled={!entityValid}
            onClick={handleSave}
            className="flex-1 py-3 font-black tracking-widest uppercase text-sm transition-colors"
            style={{
              backgroundColor: entityValid ? T.navy : T.slate200,
              color: entityValid ? "white" : T.slate400,
              borderRadius: "4px",
              cursor: entityValid ? "pointer" : "not-allowed",
            }}>
            Completa Configurazione →
          </button>
        </div>
      </div>
    </div>
  );

  // ─── STEP: SAVING
  return (
    <div className="clavis-workspace min-h-screen flex items-center justify-center"
      style={{ fontFamily: "Inter, system-ui" }}>
      <div className="text-center space-y-4">
        <div className="px-3 py-2 inline-block" style={{ backgroundColor: T.navy, borderRadius: "4px" }}>
          <p className="font-black tracking-widest text-white text-xl">CLAVIS</p>
        </div>
        <p className="text-lg font-semibold" style={{ color: T.slate800 }}>Configurazione in corso...</p>
        <p className="text-sm" style={{ color: T.slate400 }}>Stiamo salvando i dati della struttura.</p>
      </div>
    </div>
  );
}
