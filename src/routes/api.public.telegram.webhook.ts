import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE_URL = (process.env.SITE_URL as string) || "https://fastbingo-etho.onrender.com";
const BOT_USERNAME = (process.env.BOT_USERNAME as string) || "fastbingo_bot";

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

function reply(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

function appUrl(params: Record<string, string | number | undefined> = {}) {
  const u = new URL(SITE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

const miniApp = (label: string, url: string) => ({
  inline_keyboard: [[{ text: label, web_app: { url } }]],
});

const contactKb = {
  keyboard: [[{ text: "📱 Share my contact", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function getRegistration(tgId: number) {
  try {
    const { data } = await supabaseAdmin
      .from("telegram_registrations" as any)
      .select("phone, first_name, username")
      .eq("tg_id", tgId)
      .maybeSingle();
    return data as { phone: string; first_name: string | null; username: string | null } | null;
  } catch (e) {
    console.error("getRegistration error", e);
    return null;
  }
}

async function saveRegistration(
  tgId: number,
  phone: string,
  firstName: string,
  username: string,
) {
  try {
    await supabaseAdmin
      .from("telegram_registrations" as any)
      .upsert(
        { tg_id: tgId, phone, first_name: firstName, username },
        { onConflict: "tg_id" },
      );
  } catch (e) {
    console.error("saveRegistration error", e);
  }
}

// Persistent reply keyboard that mirrors the Fast Bingo menu.
// Only the buttons the user requested: Play / Deposit / Withdraw / Balance / Help / Invite.
const mainMenuKb = (
  tgId: number,
  name: string,
  uname: string,
  phone?: string,
) => {
  const base = { tg: tgId, name, uname, ...(phone ? { phone } : {}) };
  return {
    keyboard: [
      [{ text: "🎮 Play Bingo", web_app: { url: appUrl(base) } }],
      [
        { text: "💰 Deposit" },
        { text: "💸 Withdraw" },
        { text: "💵 Balance" },
      ],
      [
        { text: "📘 Help" },
        { text: "🎁 Invite" },
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
};

function startMessage(
  chatId: number,
  name: string,
  tgId: number,
  uname: string,
  phone?: string,
  ref?: string,
) {
  const refLine = ref ? `\n🎁 Invited by: <b>${ref}</b>` : "";
  const text =
    `🎮 <b>Fast Bingo</b>\n\n` +
    `💰 Total Balance: <b>0.00 birr</b>\n` +
    `✅ Withdrawable: <b>0.00 birr</b>\n` +
    `🔒 Non-Withdrawable: <b>0.00 birr</b>${refLine}\n\n` +
    `Select an option:`;
  return reply(chatId, text, { reply_markup: mainMenuKb(tgId, name, uname, phone) });
}

async function handleUpdate(update: any) {
  const msg = update.message ?? update.edited_message;
  if (!msg?.chat?.id) return;
  const chatId: number = msg.chat.id;
  const user = msg.from ?? { id: chatId };
  const tgId = user.id as number;
  const firstName = (user.first_name ?? "Player") as string;
  const username = (user.username ?? "") as string;

  // Contact shared → confirm + deep-link with phone & name
  if (msg.contact) {
    const phone = String(msg.contact.phone_number || "").replace(/^\+/, "");
    await saveRegistration(tgId, phone, firstName, username);
    const url = appUrl({ tg: tgId, name: firstName, phone, uname: username });
    return reply(
      chatId,
      `✅ Thanks <b>${firstName}</b>! Phone <code>${phone}</code> received.\n\n` +
        `🎁 You'll receive a <b>20 ETB welcome bonus</b> on first login.`,
      { reply_markup: miniApp("🎮 Open Fast Bingo", url) },
    );
  }

  if (!msg.text) return;
  const raw: string = msg.text.trim();
  const parts = raw.split(/\s+/);
  const cmd = parts[0].split("@")[0].toLowerCase();
  const arg = parts.slice(1).join(" ").trim() || undefined;
  const ref = username || String(tgId);

  // Map both slash-commands AND the reply-keyboard button labels (image 2).
  const norm = raw.toLowerCase();
  const is = (...keys: string[]) => keys.some((k) => cmd === k || norm.includes(k));

  // Look up registration status once per update.
  const registered = await getRegistration(tgId);
  const phone = registered?.phone;
  const linkBase = { tg: tgId, name: firstName, uname: username, ...(phone ? { phone } : {}) };

  if (cmd === "/start") {
    if (!registered) {
      return reply(
        chatId,
        `👋 Welcome <b>${firstName}</b>! Tap below to share your phone number and finish registration.`,
        { reply_markup: contactKb },
      );
    }
    return startMessage(chatId, firstName, tgId, username, phone, arg);
  }
  if (cmd === "/register") {
    if (registered) {
      return startMessage(chatId, firstName, tgId, username, phone);
    }
    return reply(
      chatId,
      `📱 Tap the button below to share your phone number — that's all we need to register.`,
      { reply_markup: contactKb },
    );
  }
  if (cmd === "/play" || is("play bingo")) {
    return reply(chatId, `🎮 Tap to open Fast Bingo:`, {
      reply_markup: miniApp("🎮 Play Bingo", appUrl(linkBase)),
    });
  }
  if (cmd === "/balance" || (is("balance") && !is("deposit") && !is("withdraw"))) {
    return reply(
      chatId,
      `💵 Open the app to see your current balance:`,
      { reply_markup: miniApp("💵 Show My Balance", appUrl({ ...linkBase, view: "wallet" })) },
    );
  }
  if (cmd === "/deposit" || is("deposit")) {
    return reply(
      chatId,
      `💰 <b>Deposit</b>\n\nMinimum: 10 ETB. Tap below to open the deposit screen.`,
      { reply_markup: miniApp("💰 Make a Deposit", appUrl({ ...linkBase, view: "deposit" })) },
    );
  }
  if (cmd === "/withdraw" || is("withdraw")) {
    return reply(
      chatId,
      `💸 <b>Withdraw</b>\n\nMinimum: 50 ETB. Tap below to request a withdrawal.`,
      { reply_markup: miniApp("💸 Withdraw", appUrl({ ...linkBase, view: "withdraw" })) },
    );
  }
  if (cmd === "/invite" || is("invite")) {
    return reply(
      chatId,
      `🎁 <b>Invite Friends</b>\n\n` +
        `Earn <b>15 ETB</b> when a friend signs up and <b>50 ETB</b> when they deposit 100+ ETB.\n\n` +
        `Your link:\n<code>https://t.me/${BOT_USERNAME}?start=${ref}</code>`,
      {
        reply_markup: {
          inline_keyboard: [[{
            text: "📤 Share",
            url: `https://t.me/share/url?url=${encodeURIComponent(
              `https://t.me/${BOT_USERNAME}?start=${ref}`,
            )}&text=${encodeURIComponent("🎯 Join me on Fast Bingo!")}`,
          }]],
        },
      },
    );
  }
  if (cmd === "/redeem") {
    const code = arg?.toUpperCase();
    return reply(
      chatId,
      code
        ? `🎟️ Tap below to redeem <code>${code}</code>.`
        : `🎟️ Send <code>/redeem YOURCODE</code>, or tap below to open the redeem screen.`,
      { reply_markup: miniApp(code ? `🎟️ Redeem ${code}` : "🎟️ Open Redeem",
          appUrl({ ...linkBase, view: "redeem", code })) },
    );
  }
  if (cmd === "/help" || cmd === "/howtoplay" || is("help", "how to play")) {
    return reply(
      chatId,
      `📘 <b>Help — How To Play</b>\n\n` +
        `1️⃣ Pick a stake (10 / 20 / 50 / 100 ETB)\n` +
        `2️⃣ Choose a cartella number\n` +
        `3️⃣ Wait for the round to start\n` +
        `4️⃣ Numbers are called automatically — first to complete the pattern wins the pool!\n\n` +
        `Commands: /play /deposit /withdraw /balance /invite`,
      { reply_markup: mainMenuKb(tgId, firstName, username, phone) },
    );
  }

  // Default: show the main menu again
  return startMessage(chatId, firstName, tgId, username, phone);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const update = await request.json();
          await handleUpdate(update);
        } catch (e) {
          console.error("telegram webhook error", e);
        }
        return Response.json({ ok: true });
      },
      GET: async () => Response.json({ ok: true, info: "fast bingo telegram webhook" }),
    },
  },
});
