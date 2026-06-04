"use client";

import React, { useState, useCallback, useEffect } from "react";
import { SECTIONS_FALLBACK } from "@/components/triage/constants";
import {
  getUdoGroup,
  getEffectiveSections,
  getSectionAnswers,
  calcSectionScore,
  getSectionRisk,
  calcTotalScore,
  getBand,
} from "@/components/triage/utils";
import type { Step, Profilo, Anagrafica } from "@/components/triage/types";
import TriageIntro from "@/components/triage/TriageIntro";
import TriageProfilo from "@/components/triage/TriageProfilo";
import TriageSlider from "@/components/triage/TriageSlider";
import TriageAnagrafica from "@/components/triage/TriageAnagrafica";
import TriageResult from "@/components/triage/TriageResult";
import GuideModal from "./components/GuideModal";

// ─── Brevo list IDs
const BREVO_LIST_NEWSLETTER = 3; // Newsletter CLAVIS
// const BREVO_LIST_BETA = 2;    // Beta test — per uso futuro

export default function TriagePubblicoPage() {
  const [step, setStep] = useState<Step>("intro");

  const [profilo, setProfilo] = useState<Profilo>({
    tipo_struttura: "", n_ospiti: "", n_dipendenti: "",
    regione: "", gestione_it: "", modello_231: "",
  });

  const [anagrafica, setAnagrafica] = useState<Anagrafica>({
    nome_struttura: "", nome_referente: "", email: "",
  });

  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentReport, setConsentReport] = useState(false);
  const [consentNewsletter, setConsentNewsletter] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [baseSections, setBaseSections] = useState(SECTIONS_FALLBACK);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    fetch("/api/legal-dictionary")
      .then(r => r.json())
      .then((data: {
        sections: Record<string, {
          id: string; label_it: string; label_en: string;
          weight_pct: number; primary_framework: string;
          questions: Array<{
            id: string; text: string; sublabel: string;
            normativa: string; weight: number;
            slider_labels: Record<string, string>;
            threshold_flag: number;
          }>;
        }>;
      }) => {
        const mapped = ["S1", "S2", "S3", "S4", "S5", "S6"]
          .map(id => {
            const s = data.sections?.[id];
            if (!s) return null;
            return {
              id: s.id,
              label_it: s.label_it,
              label_en: s.label_en,
              weight_pct: s.weight_pct,
              framework: s.primary_framework,
              questions: s.questions.map(q => ({
                id: q.id,
                weight: q.weight,
                threshold: q.threshold_flag,
                text: q.text,
                sublabel: q.sublabel,
                normativa: q.normativa,
                labels: ["0", "25", "50", "75", "100"].map(k => q.slider_labels[k] ?? ""),
              })),
            };
          })
          .filter(Boolean) as typeof SECTIONS_FALLBACK;
        if (mapped.length === 6) setBaseSections(mapped);
      })
      .catch(() => {
        // Fallback silenzioso su SECTIONS_FALLBACK
      });
  }, []);

  const udoGroup = getUdoGroup(profilo.tipo_struttura);
  const sections = getEffectiveSections(udoGroup, baseSections);

  const getAnswersForSection = useCallback(
    (sid: string, qCount: number) => getSectionAnswers(answers, sid, qCount),
    [answers],
  );

  function setAnswer(sid: string, qIdx: number, val: number, qCount: number) {
    const current = getAnswersForSection(sid, qCount);
    const updated = [...current];
    updated[qIdx] = val;
    setAnswers(prev => ({ ...prev, [sid]: updated }));
  }

  const totalScore = calcTotalScore(answers, sections);
  const totalBand = getBand(totalScore);

  // ─── Triage navigation

  function handleTriageBack() {
    if (currentQ > 0) {
      setCurrentQ(q => q - 1);
    } else if (currentSection > 0) {
      const prevIdx = currentSection - 1;
      setCurrentSection(prevIdx);
      setCurrentQ(sections[prevIdx].questions.length - 1);
    } else {
      setStep("profilo");
    }
  }

  // ─── Bridge Brevo via API route Next.js (server-side, key protetta)

  async function subscribeToBrevo(
    email: string,
    listId: number,
    attributes: Record<string, string> = {}
  ) {
    try {
      const res = await fetch("/api/brevo-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, list_id: listId, attributes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("Brevo subscribe warning:", err);
        // Non blocchiamo il flusso: best-effort
      }
    } catch (e) {
      console.warn("Brevo subscribe exception:", e);
    }
  }

  // ─── Save session

  async function saveSession() {
    setSaving(true);
    setError(null);

    const bedsMap: Record<string, number> = {
      "Meno di 30": 20, "30–80": 55, "81–150": 115, "Oltre 150": 200,
    };

    const sectionRisksForSave = sections.map(s => ({
      section: s.id,
      label: s.label_it,
      risk: getSectionRisk(calcSectionScore(getAnswersForSection(s.id, s.questions.length), s.questions)),
    }));

    const flagsTriggered = sectionRisksForSave
      .filter(s => s.risk >= 50)
      .map(s => ({ section: s.section, label: s.label, risk: s.risk }));

    const answersPayload = sections.reduce((acc, s) => {
      const ans = getAnswersForSection(s.id, s.questions.length);
      acc[s.id] = {
        label: s.label_it,
        values: ans,
        section_risk: getSectionRisk(calcSectionScore(ans, s.questions)),
      };
      return acc;
    }, {} as Record<string, unknown>);

    const ENUM_MAP: Record<string, string> = {
      "RSA": "RSA", "RSSA": "RSA", "CDI": "CDI", "Hospice": "HOSPICE",
      "OdC": "ALTRO", "RSD": "RSD", "CSS": "CSS", "CDD": "ALTRO",
      "CSE": "ALTRO", "Comunità Alloggio Disabili": "ALTRO",
      "CRA": "ALTRO", "CRM": "ALTRO", "SRP": "ALTRO", "CPS": "ALTRO",
      "SPDC": "ALTRO", "REMS": "ALTRO", "SerD": "ALTRO", "CT": "ALTRO",
      "Comunità Educativa Minori": "ALTRO", "Casa Famiglia": "ALTRO",
      "ADI": "ADI",
      "Poliambulatorio": "ALTRO",
      "SL": "ALTRO",   // Senior Living
      "Altro": "ALTRO",
    };
    const sigla = profilo.tipo_struttura.split("—")[0].trim();
    const entityTypeEnum = ENUM_MAP[sigla] ?? "ALTRO";

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const body = {
      entity_name:        anagrafica.nome_struttura || null,
      entity_type:        entityTypeEnum,
      entity_region:      profilo.regione || null,
      total_beds:         bedsMap[profilo.n_ospiti] ?? null,
      answers:            answersPayload,
      flags_triggered:    flagsTriggered,
      risk_score:         totalScore,
      referente_nome:     anagrafica.nome_referente || null,
      email:              anagrafica.email || null,
      newsletter_consent: consentNewsletter,
      consent_timestamp:  consentReport ? new Date().toISOString() : null,
      user_agent:         typeof navigator !== "undefined" ? navigator.userAgent : null,
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/triage_anonymous?select=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error("triage_anonymous insert error:", errJson);
      setError(`Errore salvataggio (${res.status}): ${errJson.message ?? "risposta non valida"}`);
      setSaving(false);
      setStep("result");
      return;
    }

    const rows = await res.json();
    setSessionId(rows?.[0]?.id ?? null);

    // ─── Bridge Brevo: solo se consenso + email presente
    if (consentNewsletter && anagrafica.email) {
      await subscribeToBrevo(
        anagrafica.email,
        BREVO_LIST_NEWSLETTER,
        {
          FONTE:      "triage_pubblico",
          STRUTTURA:  anagrafica.nome_struttura || "",
          TIPO_UDO:   sigla,
          REGIONE:    profilo.regione || "",
          RISK_SCORE: String(Math.round(totalScore)),
        }
      );
    }

    setSaving(false);
    setStep("result");
  }

  function resetAll() {
    setStep("intro");
    setProfilo({ tipo_struttura: "", n_ospiti: "", n_dipendenti: "", regione: "", gestione_it: "", modello_231: "" });
    setAnagrafica({ nome_struttura: "", nome_referente: "", email: "" });
    setAnswers({});
    setCurrentSection(0);
    setCurrentQ(0);
    setSessionId(null);
    setError(null);
  }

  // ─── Step routing

  if (step === "intro") {
    return <TriageIntro onStart={() => setStep("profilo")} beforeButton={<GuideModal />} />;
  }

  if (step === "profilo") {
    return (
      <TriageProfilo
        profilo={profilo}
        setProfilo={setProfilo}
        onBack={() => setStep("intro")}
        onNext={() => setStep("triage")}
      />
    );
  }

  if (step === "triage") {
    return (
      <TriageSlider
        sections={sections}
        currentSection={currentSection}
        currentQ={currentQ}
        answers={answers}
        onSetAnswer={setAnswer}
        onBack={handleTriageBack}
        onNavigateSection={idx => { setCurrentSection(idx); setCurrentQ(0); }}
        onNextQuestion={() => setCurrentQ(q => q + 1)}
        onNextSection={() => { setCurrentSection(s => s + 1); setCurrentQ(0); }}
        onComplete={() => setStep("anagrafica")}
      />
    );
  }

  if (step === "anagrafica") {
    return (
      <TriageAnagrafica
        anagrafica={anagrafica}
        setAnagrafica={setAnagrafica}
        totalScore={totalScore}
        totalBand={totalBand}
        consentReport={consentReport}
        setConsentReport={setConsentReport}
        consentNewsletter={consentNewsletter}
        setConsentNewsletter={setConsentNewsletter}
        saving={saving}
        error={error}
        onBack={() => setStep("triage")}
        onSubmit={saveSession}
      />
    );
  }

  return (
    <TriageResult
      anagrafica={anagrafica}
      profilo={profilo}
      sections={sections}
      answers={answers}
      totalScore={totalScore}
      totalBand={totalBand}
      sessionId={sessionId}
      isDesktop={isDesktop}
      onReset={resetAll}
    />
  );
}
