import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import LEGAL_DICT from "@/config/legal_dictionary.json";

type DictQuestion = {
  id: string;
  weight: number;
  threshold_flag: number;
  flag: string;
};

type DictSection = {
  id: string;
  label_it: string;
  weight_pct: number;
  questions: DictQuestion[];
};

type FlagEntry = {
  control_code: string;
  severity: number;
  execution_order: number;
  remediation: {
    action: string;
    deadline: string;
    responsible: string;
    priority: string;
  };
};

const dict = LEGAL_DICT as unknown as {
  sections: Record<string, DictSection>;
  flags: Record<string, FlagEntry>;
};

const SECTION_ORDER = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

function calcSectionScore(values: number[], questions: DictQuestion[]): number {
  let weighted = 0, totalW = 0;
  questions.forEach((q, i) => {
    weighted += (values[i] ?? 0) * q.weight;
    totalW += q.weight;
  });
  return totalW > 0 ? weighted / totalW : 0;
}

function getSectionRisk(score: number): number {
  return Math.round((1 - score / 100) * 100);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { anonymous_id, entity_id, user_id } = body ?? {};
if (!anonymous_id || !entity_id || !user_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: anon, error: anonErr } = await admin
    .from("triage_anonymous")
    .select("id, answers, risk_score")
    .eq("id", anonymous_id)
    .is("migrated_at", null)
    .single();

  if (anonErr || !anon) {
    return NextResponse.json(
      { error: "Anonymous session not found", detail: anonErr?.message },
      { status: 404 }
    );
  }

  // triage_anonymous.answers: Record<string, { label, values: number[], section_risk: number }>
  const storedAnswers = anon.answers as Record<string, { values?: number[] }>;

  const sections = SECTION_ORDER.map(id => dict.sections[id]).filter(Boolean);

  const rawAnswers: Record<string, number[]> = {};
  for (const s of sections) {
    rawAnswers[s.id] = storedAnswers[s.id]?.values ?? new Array(s.questions.length).fill(0);
  }

  const answersPayload: Record<string, unknown> = {};
  for (const s of sections) {
    const values = rawAnswers[s.id];
    answersPayload[s.id] = {
      label: s.label_it,
      values,
      section_risk: getSectionRisk(calcSectionScore(values, s.questions)),
    };
  }

  const flagsTriggered = sections
    .map(s => ({
      section: s.id,
      label: s.label_it,
      risk: getSectionRisk(calcSectionScore(rawAnswers[s.id], s.questions)),
    }))
    .filter(f => f.risk >= 50);

  let total = 0;
  for (const s of sections) {
    total += (1 - calcSectionScore(rawAnswers[s.id], s.questions) / 100) * s.weight_pct;
  }
  const riskScore = anon.risk_score ?? Math.round(Math.min(100, total));

  const { data: sessionData, error: sessionErr } = await supabase
    .from("triage_sessions")
    .insert({
      entity_id,
      user_id,
      anonymous_session_id: anon.id,
      answers: answersPayload,
      flags_triggered: flagsTriggered,
      risk_score: riskScore,
      status: "generated",
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionErr || !sessionData) {
    return NextResponse.json(
      { error: "Failed to create session", detail: sessionErr?.message },
      { status: 500 },
    );
  }

  const seen = new Set<string>();
  const remItems: object[] = [];

  for (const s of sections) {
    const values = rawAnswers[s.id];
    for (let qi = 0; qi < s.questions.length; qi++) {
      const q = s.questions[qi];
      const val = values[qi] ?? 0;
      if (val <= q.threshold_flag && q.flag && !seen.has(q.flag)) {
        const flagData = dict.flags[q.flag];
        if (!flagData) continue;
        seen.add(q.flag);
        remItems.push({
          session_id:     sessionData.id,
          entity_id,
          control_code:   flagData.control_code,
          flag_key:       q.flag,
          planned_action: flagData.remediation.action,
          responsible:    flagData.remediation.responsible,
          deadline_label: flagData.remediation.deadline,
          status:         "open",
          priority:       flagData.remediation.priority,
          severity:       flagData.severity,
        });
      }
    }
  }

  if (remItems.length > 0) {
    await supabase
      .from("remediation_plans")
      .upsert(remItems, { onConflict: "session_id,flag_key" });
  }

  await admin
    .from("triage_anonymous")
    .update({ migrated_at: new Date().toISOString() })
    .eq("id", anon.id);

  return NextResponse.json({ session_id: sessionData.id, remediation_count: remItems.length });
}
