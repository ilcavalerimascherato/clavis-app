"use client";

import { BgLayout, ClavisTitle } from "./shared";
import { getSectionAnswers, calcSectionScore, getSectionRisk, getBand } from "./utils";
import type { Section, Question } from "./types";

// ─── SectionProgressBar

function SectionProgressBar({
  sections,
  currentIdx,
  answers,
}: {
  sections: Section[];
  currentIdx: number;
  answers: Record<string, number[]>;
}) {
  return (
    <div className="flex gap-1 w-full">
      {sections.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const ans = answers[s.id];
        const filled = ans && ans.some(v => v > 0);
        return (
          <div key={s.id} className="flex-1 space-y-1">
            <div
              className={`h-1 rounded-full transition-all duration-300 ${
                active ? "bg-white" : done && filled ? "bg-zinc-400" : "bg-zinc-800"
              }`}
            />
            <p
              className={`text-center text-xs uppercase tracking-wider hidden sm:block ${
                active ? "text-white" : "text-zinc-700"
              }`}
            >
              {s.id}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── SliderQuestion

function SliderQuestion({
  question,
  value,
  onChange,
  index,
  total,
}: {
  question: Question;
  value: number;
  onChange: (v: number) => void;
  index: number;
  total: number;
}) {
  const risk = getSectionRisk(value);
  const band = getBand(risk);
  const labelIndex = Math.round(value / 25);
  const currentLabel = question.labels[Math.min(labelIndex, 4)];

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-mono font-black text-white leading-none">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-lg font-mono text-zinc-600 leading-none">
            / {String(total).padStart(2, "0")}
          </span>
          <span className="text-base text-zinc-700 font-mono ml-1 hidden sm:inline">nella sezione</span>
        </div>
        <span className="text-sm text-zinc-600 uppercase tracking-widest text-right leading-relaxed">
          {question.normativa}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-lg font-semibold text-white leading-snug">{question.text}</p>
        <p className="text-base text-zinc-500 leading-relaxed">{question.sublabel}</p>
      </div>

      <div className="space-y-3">
        <input
          type="range" min={0} max={100} step={25}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 appearance-none bg-zinc-800 rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-lg"
          style={{
            background: `linear-gradient(to right, #ffffff ${value}%, #27272a ${value}%)`,
          }}
        />

        <div className="flex justify-between text-xs text-zinc-700 px-0.5 select-none">
          {["0%", "25%", "50%", "75%", "100%"].map(l => (
            <span key={l}>{l}</span>
          ))}
        </div>

        <div className="border border-zinc-800 bg-zinc-950 px-4 py-3 min-h-[56px] flex items-center gap-3">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: band.color }} />
          <p className="text-base text-zinc-300 leading-snug">{currentLabel}</p>
        </div>

        <div className="flex items-center justify-between text-base">
          <span className="text-zinc-600">Rischio su questo punto</span>
          <span className="font-mono font-bold" style={{ color: band.color }}>
            {risk}% — {band.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── TriageSlider (step view)

interface TriageSliderProps {
  sections: Section[];
  currentSection: number;
  currentQ: number;
  answers: Record<string, number[]>;
  onSetAnswer: (sid: string, qIdx: number, val: number, qCount: number) => void;
  onBack: () => void;
  onNavigateSection: (idx: number) => void;
  onNextQuestion: () => void;
  onNextSection: () => void;
  onComplete: () => void;
}

export default function TriageSlider({
  sections,
  currentSection,
  currentQ,
  answers,
  onSetAnswer,
  onBack,
  onNavigateSection,
  onNextQuestion,
  onNextSection,
  onComplete,
}: TriageSliderProps) {
  const section = sections[currentSection];
  const q = section.questions[currentQ];
  const sectionAnswers = getSectionAnswers(answers, section.id, section.questions.length);
  const currentVal = sectionAnswers[currentQ];
  const isLastSection = currentSection === sections.length - 1;
  const isLastQuestion = currentQ === section.questions.length - 1;

  function getSectionMeanScore(sid: string, questions: Section["questions"]) {
    const ans = getSectionAnswers(answers, sid, questions.length);
    return calcSectionScore(ans, questions);
  }

  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0);
  const globalQuestionIdx =
    sections.slice(0, currentSection).reduce((acc, s) => acc + s.questions.length, 0) + currentQ + 1;

  return (
    <BgLayout centered>
      <div className="max-w-3xl w-full mx-auto space-y-6">

        {/* Header sezione */}
        <div className="space-y-3">
          <SectionProgressBar sections={sections} currentIdx={currentSection} answers={answers} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-600 uppercase tracking-widest">{section.framework}</p>
              <ClavisTitle it={section.label_it} en={section.label_en} size="lg" />
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm text-zinc-700 uppercase tracking-widest mb-1">Domanda</p>
              <p className="font-mono text-white">
                <span className="text-2xl font-black">{globalQuestionIdx}</span>
                <span className="text-zinc-600 text-base"> / {totalQuestions}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Domanda con slider */}
        <div className="border border-zinc-800 p-6">
          <SliderQuestion
            question={q}
            value={currentVal ?? 50}
            onChange={v => onSetAnswer(section.id, currentQ, v, section.questions.length)}
            index={currentQ}
            total={section.questions.length}
          />
        </div>

        {/* Navigazione */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors"
          >
            ← Prec.
          </button>

          {!isLastQuestion && (
            <button
              onClick={onNextQuestion}
              className="flex-grow border border-zinc-700 py-3 text-zinc-300 hover:text-white hover:border-zinc-500 text-base transition-colors"
            >
              Domanda successiva →
            </button>
          )}

          {isLastQuestion && !isLastSection && (
            <button
              onClick={onNextSection}
              className="flex-grow border border-white py-3 font-bold tracking-widest uppercase text-sm hover:bg-white hover:text-black transition-colors"
            >
              Sezione successiva →
            </button>
          )}

          {isLastQuestion && isLastSection && (
            <button
              onClick={onComplete}
              className="flex-grow border border-white py-3 font-bold tracking-widest uppercase text-sm hover:bg-white hover:text-black transition-colors"
            >
              Genera Report →
            </button>
          )}
        </div>

        {/* Mini-radar sezioni */}
        <div className="border border-zinc-900 p-4">
          <p className="text-sm text-zinc-600 uppercase tracking-widest mb-3">Avanzamento sezioni</p>
          <div className="grid grid-cols-6 gap-2">
            {sections.map((s, i) => {
              const ms = getSectionMeanScore(s.id, s.questions);
              const risk = getSectionRisk(ms);
              const band = getBand(risk);
              const active = i === currentSection;
              return (
                <button
                  key={s.id}
                  onClick={() => onNavigateSection(i)}
                  className={`p-2 border text-center transition-colors ${
                    active ? "border-white" : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-xs text-zinc-600 font-mono">{s.id}</p>
                  <p className="text-base font-mono font-bold mt-1" style={{ color: band.color }}>
                    {answers[s.id] ? `${risk}%` : "—"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </BgLayout>
  );
}
