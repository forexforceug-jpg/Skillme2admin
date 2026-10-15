// Supabase Edge Function: send-admin-email
// Sends an email via Resend. Called by the admin console (not the public app).
//
// Required secrets (set with: supabase secrets set KEY=value):
//   RESEND_API_KEY   - your Resend API key
//   ADMIN_FROM       - e.g. "Skillme2 <hello@skillme2.com>"
//
// Deploy: supabase functions deploy send-admin-email

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

interface Payload {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  replyTo?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const ADMIN_FROM = Deno.env.get("ADMIN_FROM") ?? "Skillme2 <noreply@skillme2.com>";

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, toName, subject, body, replyTo }: Payload = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing to, subject, or body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = renderHtml({ toName: toName ?? to, body });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ADMIN_FROM,
        to: [to],
        subject,
        html,
        reply_to: replyTo,
      }),
    });

    const data = await resendRes.json();

    if (!resendRes.ok) {
      return new Response(
        JSON.stringify({ error: "Resend failed", details: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function renderHtml({ toName, body }: { toName: string; body: string }) {
  const safeBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#061019;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#061019;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#0A1B2A;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
                  Skillme2
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.7;">
                <p style="margin:0 0 16px;color:#C9A24A;font-weight:600;font-size:13px;">
                  Hi ${escapeHtml(toName)},
                </p>
                <div style="color:rgba(255,255,255,0.85);">${safeBody}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);font-size:12px;">
                This message was sent by the Skillme2 admin team.
                Reply to this email if you need help.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
