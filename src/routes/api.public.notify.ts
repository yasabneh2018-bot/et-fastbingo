import { createFileRoute } from "@tanstack/react-router";

// Site → Telegram notifier. Called from the browser when the user
// submits a deposit, withdraw, redeems a coupon, or auto-logs-in from
// Telegram. Sends a message to the user (chatId) and optionally to the
// admin chat (ADMIN_TG_CHAT_ID env).
//
// This is the ONLY way bot ↔ site can communicate without a shared DB.

async function tg(method: string, payload: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN missing" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export const Route = createFileRoute("/api/public/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            chatId?: number | string;
            text?: string;
            adminText?: string;
          };
          const results: Record<string, unknown> = {};
          if (body.chatId && body.text) {
            results.user = await tg("sendMessage", {
              chat_id: body.chatId,
              text: body.text,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
          }
          const adminId = process.env.ADMIN_TG_CHAT_ID;
          if (adminId && body.adminText) {
            results.admin = await tg("sendMessage", {
              chat_id: adminId,
              text: body.adminText,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
          }
          return Response.json({ ok: true, results });
        } catch (e) {
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
