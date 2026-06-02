// Tiny client-side helper to ping the Telegram bot from the site.
// Fails silently if the user isn't a Telegram user or the bot token isn't set.

export async function notifyTelegram(input: {
  chatId?: number | string | null;
  text?: string;
  adminText?: string;
}): Promise<void> {
  if (!input.chatId && !input.adminText) return;
  try {
    await fetch("/api/public/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function fmtEtb(n: number): string {
  return `${n.toFixed(2)} ETB`;
}
