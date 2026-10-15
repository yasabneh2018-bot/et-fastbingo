import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Data store backed by Lovable Cloud (shared across devices) with a sync in-memory cache.
export type User = {
  id?: string;
  username: string;
  password: string;
  phone?: string;
  balance: number;
  isAdmin?: boolean;
  seq?: number;
  games?: number;
  wins?: number;
  referredBy?: string;
  firstDepositDone?: boolean;
  refCode?: string;
  telegramId?: number;
};
export type TxRequest = {
  id: string;
  username: string;
  phone?: string;
  method?: "telebirr" | "cbe" | "other";
  type: "deposit" | "withdraw" | "bonus";
  subtype?: "signup" | "referral" | "referral_deposit" | "coupon";
  amount: number;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  note?: string;
};
export type ChatMsg = { id: string; user: string; text: string; at: number };
export type PaymentInfo = { telebirr: string; cbe: string };
export type Coupon = {
  code: string;
  amount: number;
  expiresAt: number;
  maxUses: number;
  usedBy: string[]; // usernames
  createdAt: number;
};

const USERS_KEY = "fk_users";
const SESSION_KEY = "fk_session";
const TX_KEY = "fk_tx";
const HISTORY_KEY = "fk_history";
const LANG_KEY = "fk_lang";
const FORCE_KEY = "fk_force";
const CHAT_KEY = "fk_chat";
const PAY_KEY = "fk_pay";
const COUPON_KEY = "fk_coupons";
const PROFIT_KEY = "fk_profit";
const PATTERN_KEY = "fk_pattern";
const SOUND_KEY = "fk_sound_on";
const SPEED_KEY = "fk_call_speed_ms";
const STOP_KEY = "fk_stop_signal";
const ACTIVITY_KEY = "fk_activity";
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SIGNUP_BONUS = 20;
export const REFERRAL_SIGNUP_BONUS = 15;
export const REFERRAL_DEPOSIT_BONUS = 50;
export const REFERRAL_DEPOSIT_THRESHOLD = 100;

// ---------- Cloud-backed cache ----------
// Shared keys live in the Lovable Cloud database (app_kv) and are mirrored in an
// in-memory cache so the rest of the app can keep reading synchronously.
const LOCAL_KEYS = new Set(["fk_lang", "fk_sound_on"]);
const cache = new Map<string, unknown>();
const listeners = new Set<() => void>();
export function onStoreChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach((f) => f()); });
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  if (LOCAL_KEYS.has(key)) {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch { return fallback; }
  }
  if (!cache.has(key)) return fallback;
  const v = cache.get(key);
  return (v === null || v === undefined ? fallback : structuredClone(v)) as T;
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  if (LOCAL_KEYS.has(key)) { localStorage.setItem(key, JSON.stringify(value)); return; }
  cache.set(key, structuredClone(value));
  notify();
  void supabase.from("app_kv").upsert({ key, value: value as never, updated_at: new Date().toISOString() })
    .then(({ error }) => { if (error) console.warn("[store] save failed", key, error.message); });
}
function removeKey(key: string) {
  if (typeof window === "undefined") return;
  cache.delete(key);
  notify();
  void supabase.from("app_kv").delete().eq("key", key)
    .then(({ error }) => { if (error) console.warn("[store] delete failed", key, error.message); });
}

// ---------- Accounts (Lovable Cloud auth + profiles) ----------
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
const profiles = new Map<string, ProfileRow>(); // by id
let currentUserId: string | null = null;
const presence = new Map<string, LivePlayer>();

function rowToUser(r: ProfileRow): User {
  return {
    id: r.id, username: r.username, password: "", phone: r.phone ?? undefined,
    balance: Number(r.balance), isAdmin: r.is_admin, seq: r.seq, games: r.games, wins: r.wins,
    referredBy: r.referred_by ?? undefined, firstDepositDone: r.first_deposit_done,
    refCode: r.ref_code ?? undefined, telegramId: r.telegram_id ?? undefined,
  };
}
function userPatch(u: User) {
  return {
    username: u.username, phone: u.phone ?? null, balance: u.balance, games: u.games ?? 0,
    wins: u.wins ?? 0, referred_by: u.referredBy ?? null, first_deposit_done: !!u.firstDepositDone,
    ref_code: u.refCode ?? null, telegram_id: u.telegramId ?? null,
  };
}

export const phoneToEmail = (phone: string) => `${phone.replace(/\D/g, "")}@phone.fastbingo.app`;

let channel: ReturnType<typeof supabase.channel> | null = null;
async function loadAll() {
  const { data: auth } = await supabase.auth.getUser();
  currentUserId = auth.user?.id ?? null;
  profiles.clear();
  cache.clear();
  presence.clear();
  if (!currentUserId) { notify(); return; }
  const [p, kv, pr] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("app_kv").select("key,value"),
    supabase.from("presence").select("*"),
  ]);
  (p.data ?? []).forEach((r) => profiles.set(r.id, r));
  (kv.data ?? []).forEach((r) => cache.set(r.key, r.value));
  (pr.data ?? []).forEach((r) => presence.set(r.username, {
    username: r.username, stake: Number(r.stake), joined: r.joined, gameNo: r.game_no, at: Number(r.at),
  }));
  if (!channel) {
    channel = supabase.channel("fk-store")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_kv" }, (pl) => {
        if (pl.eventType === "DELETE") cache.delete((pl.old as { key: string }).key);
        else { const r = pl.new as { key: string; value: unknown }; cache.set(r.key, r.value); }
        notify();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, (pl) => {
        if (pl.eventType === "DELETE") presence.delete((pl.old as { username: string }).username);
        else {
          const r = pl.new as { username: string; stake: number; joined: boolean; game_no: number; at: number };
          presence.set(r.username, { username: r.username, stake: Number(r.stake), joined: r.joined, gameNo: r.game_no, at: Number(r.at) });
        }
        notify();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (pl) => {
        if (pl.eventType !== "DELETE") { const r = pl.new as ProfileRow; profiles.set(r.id, r); notify(); }
      })
      .subscribe();
  }
  notify();
}

let initPromise: Promise<void> | null = null;
/** Load accounts and shared game state from Lovable Cloud. Safe to call repeatedly. */
export function initCloud(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = loadAll();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        initPromise = loadAll();
      }
    });
  }
  return initPromise;
}

export async function signInWithPhone(phone: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password });
  if (error) return { ok: false as const, msg: error.message };
  await (initPromise = loadAll());
  return { ok: true as const };
}

export async function signUpWithPhone(opts: { phone: string; password: string; username: string; refCode: string; referral?: string; telegramId?: number }) {
  let referredBy: string | undefined;
  const { data, error } = await supabase.auth.signUp({
    email: phoneToEmail(opts.phone),
    password: opts.password,
    options: { data: { phone: opts.phone, username: opts.username, ref_code: opts.refCode, telegram_id: opts.telegramId ?? "" } },
  });
  if (error) return { ok: false as const, msg: error.message };
  if (!data.session) return { ok: false as const, msg: "Account created — please log in" };
  if (opts.referral?.trim()) {
    const { data: inv } = await supabase.rpc("credit_referrer", { _ref: opts.referral.trim(), _amount: REFERRAL_SIGNUP_BONUS });
    if (inv) {
      referredBy = inv;
      await supabase.from("profiles").update({ referred_by: inv }).eq("id", data.session.user.id);
    }
  }
  await (initPromise = loadAll());
  return { ok: true as const, referredBy };
}

export async function signOutCloud() {
  if (currentUserId) {
    const me = profiles.get(currentUserId);
    if (me) await supabase.from("presence").delete().eq("username", me.username);
  }
  await supabase.auth.signOut();
}

export const ADMIN_PHONE = "0941815119";
export const ADMIN_PASSWORD = "14141312";
export function getUsers(): User[] {
  return Array.from(profiles.values()).sort((a, b) => a.seq - b.seq).map(rowToUser);
}
export function saveUsers(users: User[]) {
  users.forEach((u) => {
    const row = Array.from(profiles.values()).find((r) => (u.id ? r.id === u.id : r.username === u.username));
    if (!row) return;
    const before = JSON.stringify(userPatch(rowToUser(row)));
    if (before !== JSON.stringify(userPatch(u))) updateUser({ ...u, id: row.id });
  });
}
export function getSession(): string | null {
  const me = currentUserId ? profiles.get(currentUserId) : undefined;
  return me?.username ?? null;
}
/** Passing null signs out; signing in happens via signInWithPhone/signUpWithPhone. */
export function setSession(username: string | null) {
  if (username === null) void signOutCloud();
}
export function getCurrentUser(): User | null {
  const me = currentUserId ? profiles.get(currentUserId) : undefined;
  return me ? rowToUser(me) : null;
}
export function updateUser(updated: User) {
  const row = Array.from(profiles.values()).find((r) => (updated.id ? r.id === updated.id : r.username === updated.username));
  if (!row) return;
  const patch = userPatch(updated);
  profiles.set(row.id, { ...row, ...patch });
  notify();
  void supabase.from("profiles").update(patch).eq("id", row.id)
    .then(({ error }) => { if (error) console.warn("[store] profile save failed", error.message); });
}


export function getTx(): TxRequest[] { return read<TxRequest[]>(TX_KEY, []); }
export function saveTx(tx: TxRequest[]) { write(TX_KEY, tx); }
export function addTx(tx: TxRequest) {
  const all = getTx();
  all.unshift(tx);
  saveTx(all);
}

export type GameRound = {
  id: string;
  picks: number[];
  drawn: number[];
  hits: number;
  bet: number;
  payout: number;
  at: number;
  username: string;
};
export function getHistory(): GameRound[] { return read<GameRound[]>(HISTORY_KEY, []); }
export function addHistory(r: GameRound) {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  const all = getHistory().filter((x) => (x.at ?? 0) >= cutoff);
  all.unshift(r);
  write(HISTORY_KEY, all);
}

export function getLang(): "am" | "en" {
  return (read<string>(LANG_KEY, "am") as "am" | "en") || "am";
}
export function setLang(l: "am" | "en") { write(LANG_KEY, l); }

export function getForcedDraw(): number[] { return read<number[]>(FORCE_KEY, []); }
export function setForcedDraw(nums: number[]) { write(FORCE_KEY, nums); }
export function clearForcedDraw() {
  removeKey(FORCE_KEY);
}

export function getChat(): ChatMsg[] { return read<ChatMsg[]>(CHAT_KEY, []); }
export function addChat(m: ChatMsg) {
  const all = getChat();
  all.push(m);
  write(CHAT_KEY, all.slice(-200));
}

export function getPayInfo(): PaymentInfo {
  return read<PaymentInfo>(PAY_KEY, { telebirr: "0911000000", cbe: "1000123456789" });
}
export function setPayInfo(p: PaymentInfo) { write(PAY_KEY, p); }

// ---- Coupons ----
export function getCoupons(): Coupon[] { return read<Coupon[]>(COUPON_KEY, []); }
export function saveCoupons(c: Coupon[]) { write(COUPON_KEY, c); }
export function addCoupon(c: Coupon) {
  const all = getCoupons();
  all.unshift(c);
  saveCoupons(all);
}
export function redeemCoupon(code: string, username: string): { ok: boolean; amount?: number; msg: string } {
  const all = getCoupons();
  const c = all.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!c) return { ok: false, msg: "Invalid code" };
  if (Date.now() > c.expiresAt) return { ok: false, msg: "Expired" };
  if (c.usedBy.includes(username)) return { ok: false, msg: "Already used" };
  if (c.usedBy.length >= c.maxUses) return { ok: false, msg: "Limit reached" };
  c.usedBy.push(username);
  saveCoupons(all);
  const users = getUsers();
  const u = users.find((x) => x.username === username);
  if (u) { u.balance += c.amount; saveUsers(users); }
  return { ok: true, amount: c.amount, msg: `+${c.amount} ETB` };
}

// ---- Site profit ----
export function getProfit(): number { return read<number>(PROFIT_KEY, 0); }
export function addProfit(delta: number) { write(PROFIT_KEY, getProfit() + delta); }

// ---- Active bingo pattern ----
export function getActivePattern(): string {
  return read<string>(PATTERN_KEY, "single_line") || "single_line";
}
export function setActivePattern(id: string) { write(PATTERN_KEY, id); }

// ---- Multiple active patterns (admin can pick several; engine picks one per game) ----
const PATTERN_IDS_KEY = "fk_pattern_ids";
const PATTERN_ROTATE_KEY = "fk_pattern_rotate";
export function getActivePatternIds(): string[] {
  const arr = read<string[]>(PATTERN_IDS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}
export function setActivePatternIds(ids: string[]) {
  write(PATTERN_IDS_KEY, Array.from(new Set(ids)));
}
export function getPatternRotate(): boolean {
  return read<boolean>(PATTERN_ROTATE_KEY, false);
}
export function setPatternRotate(v: boolean) { write(PATTERN_ROTATE_KEY, v); }

// ---- Admin force-winner (by player id / username) ----
const FORCE_WIN_KEY = "fk_force_winner";
export function getForceWinner(): string {
  return read<string>(FORCE_WIN_KEY, "") || "";
}
export function setForceWinner(v: string) { write(FORCE_WIN_KEY, v); }
export function clearForceWinner() {
  removeKey(FORCE_WIN_KEY);
}

// ---- Sound master toggle (per device) ----
export function getSoundOn(): boolean { return read<boolean>(SOUND_KEY, true); }
export function setSoundOn(v: boolean) { write(SOUND_KEY, v); }

// ---- Calling speed (ms between balls) ----
export const SPEED_MIN = 200;
export const SPEED_MAX = 4000;
export const SPEED_DEFAULT = 1000;
export function getCallSpeed(): number {
  const v = read<number>(SPEED_KEY, SPEED_DEFAULT);
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, v || SPEED_DEFAULT));
}
export function setCallSpeed(ms: number) {
  write(SPEED_KEY, Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(ms))));
}

// ---- Stop-calling signal (admin-pushed, game-consumed) ----
export function getStopSignal(): number { return read<number>(STOP_KEY, 0); }
export function raiseStopSignal() { write(STOP_KEY, Date.now()); }
export function clearStopSignal() {
  removeKey(STOP_KEY);
}

// ---- Pause / Resume / Restart signals (admin-pushed, game-consumed) ----
const PAUSE_KEY = "fk_pause_signal";
const RESUME_KEY = "fk_resume_signal";
const RESTART_KEY = "fk_restart_signal";
export function getPauseSignal(): number { return read<number>(PAUSE_KEY, 0); }
export function raisePauseSignal() { write(PAUSE_KEY, Date.now()); }
export function clearPauseSignal() {
  removeKey(PAUSE_KEY);
}
export function getResumeSignal(): number { return read<number>(RESUME_KEY, 0); }
export function raiseResumeSignal() { write(RESUME_KEY, Date.now()); }
export function getRestartSignal(): number { return read<number>(RESTART_KEY, 0); }
export function raiseRestartSignal() { write(RESTART_KEY, Date.now()); }
export function clearRestartSignal() {
  removeKey(RESTART_KEY);
}

// ---- Admin activity log ----
export type Activity = {
  id: string;
  username: string;
  type: "login" | "play" | "win" | "loss" | "deposit_req" | "withdraw_req" | "coupon" | "admin";
  detail?: string;
  at: number;
};
const ACTIVITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export function getActivities(): Activity[] { return read<Activity[]>(ACTIVITY_KEY, []); }
export function logActivity(a: Omit<Activity, "id" | "at"> & { at?: number }) {
  const cutoff = Date.now() - ACTIVITY_RETENTION_MS;
  const all = getActivities().filter((x) => x.at >= cutoff);
  all.unshift({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...a });
  write(ACTIVITY_KEY, all.slice(0, 2000));
}

// ---- Live presence (real-time players via localStorage + storage events) ----
export type LivePlayer = {
  username: string;
  stake: number;       // chosen stake; 0 = in lobby
  joined: boolean;     // true once they've picked a stake & locked in this round
  gameNo: number;
  at: number;          // last heartbeat timestamp
};
export const LIVE_TTL_MS = 12_000;

export function getLivePlayers(): LivePlayer[] {
  const cutoff = Date.now() - LIVE_TTL_MS;
  return Array.from(presence.values()).filter((p) => p.at >= cutoff);
}
export function heartbeatPresence(p: Omit<LivePlayer, "at">) {
  if (typeof window === "undefined" || !currentUserId) return;
  const at = Date.now();
  presence.set(p.username, { ...p, at });
  void supabase.from("presence").upsert({
    username: p.username, user_id: currentUserId, stake: p.stake, joined: p.joined, game_no: p.gameNo, at,
  }).then(({ error }) => { if (error) console.warn("[store] presence failed", error.message); });
}
export function removePresence(username: string) {
  if (typeof window === "undefined") return;
  presence.delete(username);
  void supabase.from("presence").delete().eq("username", username);
}
