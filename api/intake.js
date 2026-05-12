// /api/intake — handles leads from the landing page.
// Persists to the demo_submissions table (separated from main pipeline).

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL      || "https://jfphwmzwteermalzwojp.supabase.co";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_cOWY-O9gg5-jPbxnIta4AA_qzogKrSr";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    
    // We use the anon key + client-side-style fetch to respect the anon insert policy.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/demo_submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        full_name: `${body.first_name || ""} ${body.last_name || ""}`.trim(),
        email: body.email,
        phone: body.phone,
        company: body.current_situation,
        message: body.motivation,
        source_url: body.source,
        metadata: body
      })
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Supabase error: ${err}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}
