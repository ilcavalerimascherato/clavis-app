const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, list_id, attributes } = await req.json();

    if (!email || !list_id) {
      return new Response(
        JSON.stringify({ error: "email e list_id sono obbligatori" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      console.error("BREVO_API_KEY non configurata");
      return new Response(
        JSON.stringify({ error: "Configurazione mancante" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        listIds: [list_id],
        updateEnabled: true,
        attributes: attributes ?? {},
      }),
    });

    // 201 = creato, 204 = aggiornato — entrambi successo
    if (!brevoRes.ok && brevoRes.status !== 204) {
      const err = await brevoRes.json().catch(() => ({}));
      console.error("Brevo API error:", err);
      return new Response(
        JSON.stringify({ error: "Errore Brevo", detail: err }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email, list_id }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("brevo-subscribe exception:", e);
    return new Response(
      JSON.stringify({ error: "Errore interno", detail: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
