import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userMessage } = await req.json();
    if (!userMessage) {
      return NextResponse.json({ error: "userMessage richiesto" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: "Claude API error: " + err }, { status: 500 });
    }

    const data = await response.json();
    const rawText =
      data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "{}";

    let result: { passed: boolean; note: string };
    try {
      result = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      result = { passed: false, note: rawText.slice(0, 200) };
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
