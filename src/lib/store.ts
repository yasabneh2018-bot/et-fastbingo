// Local-only data store (localStorage). No backend.
export type User = {
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

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const ADMIN_PHONE = "0941815119";
export const ADMIN_PASSWORD = "14141312";
export function getUsers(): User[] {
  const users = read<User[]>(USERS_KEY, []);
  const adminIdx = users.findIndex((u) => u.isAdmin);
  if (adminIdx === -1) {
    users.push({ username: "admin", password: ADMIN_PASSWORD, phone: ADMIN_PHONE, balance: 0, isAdmin: true });
    write(USERS_KEY, users);
  } else {
    const cur = users[adminIdx];
    if (cur.phone !== ADMIN_PHONE || cur.password !== ADMIN_PASSWORD) {
      users[adminIdx] = { ...cur, phone: ADMIN_PHONE, password: ADMIN_PASSWORD };
      write(USERS_KEY, users);
    }
  }
  return users;
}
export function saveUsers(users: User[]) { write(USERS_KEY, users); }
export function getSession(): string | null { return read<string | null>(SESSION_KEY, null); }
export function setSession(username: string | null) { write(SESSION_KEY, username); }
export function getCurrentUser(): User | null {
  const s = getSession();
  if (!s) return null;
  return getUsers().find((u) => u.username === s) ?? null;
}
export function updateUser(updated: User) {
  const users = getUsers().map((u) => (u.username === updated.username ? updated : u));
  saveUsers(users);
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
  if (typeof window !== "undefined") localStorage.removeItem(FORCE_KEY);
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
  if (typeof window !== "undefined") localStorage.removeItem(FORCE_WIN_KEY);
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
  if (typeof window !== "undefined") localStorage.removeItem(STOP_KEY);
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
const LIVE_KEY = "fk_live_players";
export const LIVE_TTL_MS = 12_000;

export function getLivePlayers(): LivePlayer[] {
  const all = read<LivePlayer[]>(LIVE_KEY, []);
  const cutoff = Date.now() - LIVE_TTL_MS;
  return all.filter((p) => p.at >= cutoff);
}
export function heartbeatPresence(p: Omit<LivePlayer, "at">) {
  if (typeof window === "undefined") return;
  const all = read<LivePlayer[]>(LIVE_KEY, []).filter(
    (x) => x.username !== p.username && x.at >= Date.now() - LIVE_TTL_MS,
  );
  all.push({ ...p, at: Date.now() });
  write(LIVE_KEY, all);
}
export function removePresence(username: string) {
  if (typeof window === "undefined") return;
  const all = read<LivePlayer[]>(LIVE_KEY, []).filter((x) => x.username !== username);
  write(LIVE_KEY, all);
}
