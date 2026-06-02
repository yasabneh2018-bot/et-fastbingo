import { createFileRoute } from "@tanstack/react-router";

// Bot command list — appears in the Telegram "/" menu.
const COMMANDS = [
  { command: "start",        description: "🎯 Start / show menu" },
  { command: "play",         description: "🎮 Play Bingo" },
  { command: "deposit",      description: "💰 Deposit" },
  { command: "withdraw",     description: "💸 Withdraw" },
  { command: "transfer",     description: "🔄 Transfer" },
  { command: "balance",      description: "💵 Balance" },
  { command: "transactions", description: "🧾 Transactions" },
  { command: "howtoplay",    description: "📘 How To Play" },
  { command: "invite",       description: "🎁 Invite" },
];

async function tg(method: string, payload: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export const Route = createFileRoute("/api/public/telegram/setup")({
  server: {
    handlers: {
      GET: async () => {
        const SITE_URL = (process.env.SITE_URL as string) || "https://fastbingo-etho.onrender.com";
        const results: Record<string, unknown> = {};

        // Bot name & descriptions
        results.setName = await tg("setMyName", { name: "Fast Bingo" });
        results.shortDescription = await tg("setMyShortDescription", {
          short_description: "Play live Bingo and win real ETB.",
        });
        results.description = await tg("setMyDescription", {
          description:
            "Fast Bingo — play live bingo rounds, deposit & withdraw in ETB, transfer to friends, and invite to earn bonuses.",
        });

        // Reset and set commands for all chats
        results.deleteAll     = await tg("deleteMyCommands", { scope: { type: "default" } });
        results.deletePrivate = await tg("deleteMyCommands", { scope: { type: "all_private_chats" } });
        results.setDefault = await tg("setMyCommands", {
          commands: COMMANDS, scope: { type: "default" }, language_code: "",
        });
        results.setPrivate = await tg("setMyCommands", {
          commands: COMMANDS, scope: { type: "all_private_chats" }, language_code: "",
        });

        // Persistent "Play Bingo" menu button next to the input
        results.menuButton = await tg("setChatMenuButton", {
          menu_button: {
            type: "web_app",
            text: "🎮 Play Bingo",
            web_app: { url: SITE_URL },
          },
        });

        // Register webhook so Telegram delivers updates to our handler.
        const webhookUrl = `${SITE_URL.replace(/\/$/, "")}/api/public/telegram/webhook`;
        results.setWebhook = await tg("setWebhook", {
          url: webhookUrl,
          allowed_updates: ["message", "edited_message", "callback_query"],
          drop_pending_updates: false,
        });
        results.webhookInfo = await tg("getWebhookInfo", {});

        return Response.json({ ok: true, results });
      },
    },
  },
});
