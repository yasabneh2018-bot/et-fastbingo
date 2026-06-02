import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  getUsers,
  saveUsers,
  getSession,
  setSession,
  getCurrentUser,
  updateUser,
  getTx,
  saveTx,
  addTx,
  addHistory,
  getHistory,
  getLang,
  setLang,
  getForcedDraw,
  setForcedDraw,
  clearForcedDraw,
  getChat,
  addChat,
  getPayInfo,
  setPayInfo,
  getCoupons,
  addCoupon,
  redeemCoupon,
  getProfit,
  addProfit,
  SIGNUP_BONUS,
  REFERRAL_SIGNUP_BONUS,
  REFERRAL_DEPOSIT_BONUS,
  REFERRAL_DEPOSIT_THRESHOLD,
  type User,
  type TxRequest,
  type ChatMsg,
  type Coupon,
  heartbeatPresence,
  removePresence,
} from "@/lib/store";
import { useLivePlayers } from "@/hooks/useLivePlayers";
import {
  getSoundOn,
  setSoundOn,
  getCallSpeed,
  setCallSpeed,
  getStopSignal,
  raiseStopSignal,
  clearStopSignal,
  getPauseSignal,
  raisePauseSignal,
  clearPauseSignal,
  getResumeSignal,
  raiseResumeSignal,
  getRestartSignal,
  raiseRestartSignal,
  clearRestartSignal,
  logActivity,
  getActivities,
  SPEED_MIN,
  SPEED_MAX,
  type Activity,
} from "@/lib/store";
import { notifyTelegram, fmtEtb } from "@/lib/notify";
import { dict, type Lang, type Key } from "@/lib/i18n";
import logo from "@/assets/fastbingo-logo.png";
import telebirrLogo from "@/assets/telebirr-logo.png";
import cbeLogo from "@/assets/cbe-logo.png";
import telegramLogo from "@/assets/telegram-logo.png";


import { PATTERNS, patternById, checkWin, previewMask, type PatternDef } from "@/lib/patterns";
import { getActivePattern, setActivePattern, getActivePatternIds, setActivePatternIds, getPatternRotate, setPatternRotate, getForceWinner, setForceWinner, clearForceWinner } from "@/lib/store";
import { downloadCartellaPdf } from "@/lib/cartella-pdf";
import {
  LogOut, Wallet, Play, History as HistoryIcon, Check, X, ShieldCheck,
  Languages, Minus, Plus, Menu, MessageCircle, Send, Home, Trophy,
  BarChart3, Crown, User as UserIcon, Download, Share2, Phone,
  Ticket, Receipt, Users as UsersIcon, DollarSign, Gift, Eye, EyeOff,
  Volume2, VolumeX, Square, Gauge, Printer, Move,
} from "lucide-react";

export const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string) || "ETfastbingo_bot";

export const Route = createFileRoute("/")({ component: App });


// Payout multipliers per pick count -> per hit count
const PAYOUTS: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 2: 10 },
  3: { 2: 1, 3: 35 },
  4: { 2: 1, 3: 3, 4: 100 },
  5: { 2: 1, 3: 3, 4: 30, 5: 150 },
  6: { 3: 1, 4: 4, 5: 50, 6: 1500 },
  7: { 4: 1, 5: 20, 6: 200, 7: 5000 },
  8: { 4: 1, 5: 10, 6: 80, 7: 500, 8: 10000 },
  9: { 4: 1, 5: 5, 6: 40, 7: 300, 8: 4000, 9: 20000 },
  10: { 5: 1, 6: 5, 7: 20, 8: 100, 9: 500, 10: 1000 },
};
const payoutFor = (picks: number, hits: number) => PAYOUTS[picks]?.[hits] ?? 0;
const maxMult = (picks: number) =>
  Math.max(0, ...Object.values(PAYOUTS[picks] ?? {}));

const COLORS = ['#16a34a', '#171717', '#dc2626', '#facc15', '#2563eb']; // Green, Black, Red, Yellow, Blue
const ROW_STARTS = [0, 2, 4, 1, 4, 0, 2, 4, 1];
const ballColor = (n: number) => {
  const row = Math.floor((n - 1) / 10);
  const col = (n - 1) % 10;
  const start = ROW_STARTS[row] || 0;
  return COLORS[(start + col) % 5];
};
const ballStyle = (n: number) => ({ ["--ball-color" as any]: ballColor(n) });


// BINGO letter for a number (1-75 split into 5 columns of 15)
function bingoLetter(n: number): "B" | "I" | "N" | "G" | "O" {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}
const COL_RANGES: Record<"B"|"I"|"N"|"G"|"O", [number, number]> = {
  B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75],
};
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function genCartella(): number[] {
  const card: number[] = Array(25).fill(0);
  (Object.keys(COL_RANGES) as ("B"|"I"|"N"|"G"|"O")[]).forEach((L, colIdx) => {
    const [lo, hi] = COL_RANGES[L];
    const pool: number[] = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    const picks = shuffle(pool).slice(0, 5);
    for (let r = 0; r < 5; r++) card[r * 5 + colIdx] = picks[r];
  });
  card[12] = 0; // FREE
  return card;
}

// Deterministic cartella by id (1..75) — every player who picks the same id gets the same card.
function cartellaById(id: number): number[] {
  const card: number[] = Array(25).fill(0);
  const rng = (i: number) => ((Math.sin(id * 9301 + i * 49297) + 1) / 2);
  (Object.keys(COL_RANGES) as ("B"|"I"|"N"|"G"|"O")[]).forEach((L, colIdx) => {
    const [lo, hi] = COL_RANGES[L];
    const pool: number[] = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    for (let k = pool.length - 1; k > 0; k--) {
      const j = Math.floor(rng(colIdx * 17 + k) * (k + 1));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    const picks = pool.slice(0, 5);
    for (let r = 0; r < 5; r++) card[r * 5 + colIdx] = picks[r];
  });
  card[12] = 0;
  return card;
}
const BINGO_COL_BG: Record<string, string> = {
  B: "#1e63d6", I: "#e02424", N: "#374151", G: "#16803c", O: "#ef7c1f",

};

function useT() {
  const [lang, setLangState] = useState<Lang>("am");
  useEffect(() => setLangState(getLang()), []);
  const t = (k: Key) => dict[lang][k];
  const change = (l: Lang) => {
    setLang(l);
    setLangState(l);
  };
  return { t, lang, setLang: change };
}

type GameStatus = { countdown: number; drawing: boolean; drawnCount: number; gameNo: number };

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"home" | "game" | "wallet" | "invite" | "admin" | "history" | "results" | "stats" | "leaders" | "me" | "help">("game");
  const [tick, setTick] = useState(0);
  const { t, lang, setLang } = useT();
  const [status, setStatus] = useState<GameStatus>({ countdown: 25, drawing: false, drawnCount: 0, gameNo: 0 });
  const [soundOn, setSoundOnState] = useState(true);
  const [splash, setSplash] = useState(true);

  useEffect(() => { setSoundOnState(getSoundOn()); }, []);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundOnState(next);
  };


  useEffect(() => {
    getUsers();
    // Read deep-link params (bot sends ?tg=&name=&phone=&view=&code=&ref=)
    let urlTg: { id: number; first_name?: string; username?: string } | null = null;
    let urlPhone: string | undefined;
    let urlView: string | undefined;
    let urlCode: string | undefined;
    try {
      const url = new URL(window.location.href);
      const tgId = Number(url.searchParams.get("tg"));
      const name = url.searchParams.get("name") || undefined;
      const uname = url.searchParams.get("uname") || undefined;
      urlPhone = url.searchParams.get("phone") || undefined;
      urlView = url.searchParams.get("view") || undefined;
      urlCode = url.searchParams.get("code") || undefined;
      const ref = url.searchParams.get("ref");
      if (ref) sessionStorage.setItem("fk_ref", ref);
      if (tgId && Number.isFinite(tgId)) {
        urlTg = { id: tgId, first_name: name, username: uname };
      }
      if (urlPhone) sessionStorage.setItem("fk_tg_phone", urlPhone);
      if (urlCode) sessionStorage.setItem("fk_tg_code", urlCode);
      if (urlView) sessionStorage.setItem("fk_tg_view", urlView);
    } catch {/* ignore */}

    // Telegram Mini App init: expand, theme, prefer initData over URL params
    try {
      const w = window as any;
      const tg = w?.Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
        const tgUser = tg.initDataUnsafe?.user;
        const startParam = tg.initDataUnsafe?.start_param as string | undefined;
        if (startParam) sessionStorage.setItem("fk_ref", startParam);
        if (tgUser?.id) urlTg = { id: tgUser.id, first_name: tgUser.first_name, username: tgUser.username };
      }
    } catch {/* ignore */}

    // Auto-login or stash for AuthScreen
    if (urlTg?.id) {
      const users = getUsers();
      const existing = users.find((u) => (u as any).telegramId === urlTg!.id);
      if (existing) {
        setSession(existing.username);
        // Tell the user via the bot what their balance is
        notifyTelegram({
          chatId: urlTg.id,
          text:
            `👋 Welcome back <b>${existing.username}</b>!\n` +
            `💰 Current balance: <b>${fmtEtb(existing.balance)}</b>`,
        });
      } else if (urlPhone) {
        // Auto-register on first open (Telegram-verified phone)
        const seq = Math.max(0, ...users.map((u) => u.seq ?? 0)) + 1;
        const ref = sessionStorage.getItem("fk_ref") || undefined;
        let referredBy: string | undefined;
        if (ref) {
          const inv = users.find((u) => u.username === ref || (u as any).refCode === ref);
          if (inv) { inv.balance += REFERRAL_SIGNUP_BONUS; referredBy = inv.username; }
        }
        const uname = urlTg.username || `tg${urlTg.id}`;
        const newUser: any = {
          username: uname,
          password: `tg_${urlTg.id}`,
          phone: urlPhone,
          balance: SIGNUP_BONUS,
          seq, games: 0, wins: 0, referredBy,
          firstDepositDone: false,
          refCode: `R${urlPhone.slice(-6)}${Math.floor(Math.random() * 75 + 10)}`,
          telegramId: urlTg.id,
        };
        users.push(newUser);
        saveUsers(users);
        setSession(uname);
        // Record bonus tx for signup (+ inviter referral) so it shows in Top-up
        addTx({
          id: `b${Date.now()}s`, username: uname, type: "bonus", subtype: "signup",
          amount: SIGNUP_BONUS, status: "approved", createdAt: Date.now(),
          note: "Welcome bonus",
        });
        if (referredBy) {
          addTx({
            id: `b${Date.now()}r`, username: referredBy, type: "bonus", subtype: "referral",
            amount: REFERRAL_SIGNUP_BONUS, status: "approved", createdAt: Date.now(),
            note: `Invited ${uname}`,
          });
        }
        notifyTelegram({
          chatId: urlTg.id,
          text:
            `🎉 Welcome to <b>Adey Bingo</b>, ${urlTg.first_name ?? uname}!\n` +
            `🎁 +${SIGNUP_BONUS} ETB welcome bonus added.\n` +
            `💰 Current balance: <b>${fmtEtb(SIGNUP_BONUS)}</b>`,
          adminText: `🆕 New signup: <b>${uname}</b> · ${urlPhone} · tg:${urlTg.id}`,
        });
      } else {
        try { sessionStorage.setItem("fk_tg", JSON.stringify(urlTg)); } catch {}
      }
    }

    let current = getCurrentUser();
    if (!current) {
      const users = getUsers();
      current = users.find((u) => u.username === "player") ?? {
        username: "player",
        password: "",
        balance: 1000,
        seq: 1,
        games: 0,
        wins: 0,
        firstDepositDone: true,
      };
      if (!users.some((u) => u.username === current!.username)) saveUsers([...users, current]);
      setSession(current.username);
    }
    setUser(current);
    // Honor ?view= deep-link from the bot (wallet / deposit / withdraw / redeem)
    try {
      const v = sessionStorage.getItem("fk_tg_view");
      if (v) {
        sessionStorage.removeItem("fk_tg_view");
        if (v === "wallet" || v === "deposit" || v === "withdraw") setView("wallet");
        else if (v === "redeem") setView("home");
      }
    } catch {/* ignore */}
    const id = setTimeout(() => setSplash(false), 1200);
    return () => clearTimeout(id);
  }, []);


  const refresh = () => {
    setUser(getCurrentUser());
    setTick((x) => x + 1);
  };

  if (splash) {
    return (
      <div className="splash">
        <img src={logo} alt="Fast Bingo" className="h-20 w-auto" />
        <div className="splash-spinner" />
        <div className="text-primary font-bold tracking-wider text-sm">FAST BINGO</div>
        <a
          href="https://fastbingo-et.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary/80 underline underline-offset-2 hover:text-primary"
        >
          fastbingo-et.vercel.app
        </a>
      </div>
    );
  }

  if (!user) return <AuthScreen onAuth={refresh} t={t} lang={lang} setLang={setLang} />;


  const seq = user.seq ?? 1;
  const roundId = 254700 + seq * 47 + status.gameNo;
  // Stable numeric profile ID (same value used in Header, Profile, Invite).
  const profileId = (user as any).telegramId || (1000000 + seq * 137);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <Toaster theme="dark" position="top-center" offset="40vh" richColors closeButton />
      <Header
        user={user}
        t={t}
        lang={lang}
        setLang={setLang}
        onLogout={() => {
          setSession(null);
          setUser(null);
        }}
        roundId={profileId}
        countdown={status.countdown}
        drawing={status.drawing}
        drawnCount={status.drawnCount}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onNavigate={setView}
        currentView={view}
      />
      <main className="flex-1 overflow-y-auto px-2 py-1 w-full">
        {view === "home" && <HomeView t={t} onPlay={() => setView("game")} onWallet={() => setView("wallet")} onNavigate={setView} user={user} onChange={refresh} />}
        {view === "help" && <HelpView t={t} />}
        {/* Keep GameView mounted across tab switches so the calling loop
            and its local state (drawn balls, current ball) survive. */}
        <div className={view === "game" ? "block" : "hidden"}>
          <GameView
            user={user}
            onChange={refresh}
            t={t}
            tick={tick}
            status={status}
            setStatus={setStatus}
            soundOn={soundOn}
            isActive={view === "game"}
          />
        </div>
        {view === "wallet" && <WalletView user={user} onChange={refresh} t={t} />}
        {view === "admin" && user.isAdmin && <AdminView t={t} onChange={refresh} user={user} />}
        {view === "history" && <HistoryView user={user} t={t} />}
        {view === "results" && <ResultsView t={t} />}
        {view === "stats" && <StatsView t={t} />}
        {view === "leaders" && <LeadersView t={t} />}
        {view === "me" && <MeView user={user} t={t} />}
        {view === "invite" && <InviteView user={user} t={t} />}
      </main>
      <nav className="shrink-0 grid grid-cols-4 bg-card border-t border-border">
        <TabBtn active={view === "game"} onClick={() => setView("game")} icon={<span className="text-xl leading-none">🏆</span>} label={t("game")} />
        <TabBtn active={view === "invite"} onClick={() => setView("invite")} icon={<Share2 size={20} />} label={t("invite")} />
        <TabBtn active={view === "wallet"} onClick={() => setView("wallet")} icon={<Wallet size={20} />} label={t("balance")} />
        <TabBtn active={view === "me"} onClick={() => setView("me")} icon={<UserIcon size={20} />} label={t("profile")} />
      </nav>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center py-2 text-xs gap-1 ${active ? "text-[#f5c518]" : "text-muted-foreground"}`}>

      {icon}
      <span>{label}</span>
    </button>
  );
}

function Header({
  user, t, lang, setLang, onLogout, roundId, countdown, drawing, drawnCount, soundOn, onToggleSound, onNavigate, currentView,
}: {
  user: User; t: (k: Key) => string; lang: Lang; setLang: (l: Lang) => void; onLogout: () => void;
  roundId: number; countdown: number; drawing: boolean; drawnCount: number; soundOn: boolean; onToggleSound: () => void;
  onNavigate: (v: "home" | "game" | "wallet" | "invite" | "admin" | "history" | "results" | "stats" | "leaders" | "me" | "help") => void;
  currentView: string;
}) {
  const [menu, setMenu] = useState(false);
  const go = (v: Parameters<typeof onNavigate>[0]) => { onNavigate(v); setMenu(false); };
  const items: { v: Parameters<typeof onNavigate>[0]; icon: React.ReactNode; label: string }[] = [
    { v: "game", icon: <Play size={16} />, label: t("game") },
    { v: "results", icon: <Trophy size={16} />, label: t("results") },
    { v: "stats", icon: <BarChart3 size={16} />, label: t("statistics") },
    { v: "leaders", icon: <Crown size={16} />, label: t("leaders") },
    { v: "history", icon: <HistoryIcon size={16} />, label: t("history") },
    { v: "wallet", icon: <Wallet size={16} />, label: t("balance") },
    { v: "me", icon: <UserIcon size={16} />, label: t("me") },
  ];
  return (
    <header className="shrink-0 bg-card border-b border-border">
      <div className="w-full flex items-center gap-2 px-2 py-1.5">
        <button onClick={() => setMenu((m) => !m)} className="text-primary p-1" aria-label="menu">
          <Menu size={22} />
        </button>
        <img src={logo} alt="Fast Keno" className="h-7 w-auto" />
        <div className="flex items-center gap-1 border border-primary/50 rounded-full px-2 py-0.5">
          <span className="text-primary font-bold text-sm">{user.balance.toFixed(2)}</span>
          <span className="text-[9px] text-muted-foreground">ETB</span>
        </div>
        <div className="flex items-center gap-1 border rounded-full px-2 py-0.5 bg-secondary/40">
          <span className="text-[11px] text-muted-foreground">ID:</span>
          <span className="text-[11px] text-foreground font-semibold">{roundId}</span>
          <span className="w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
            <Check size={9} className="text-primary-foreground" strokeWidth={4} />
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded-md border ${soundOn ? "text-primary border-primary/50 bg-primary/10" : "text-muted-foreground border-border"}`}
            aria-label={soundOn ? "Sound off" : "Sound on"}
            title={soundOn ? "Sound: ON (tap to mute)" : "Sound: OFF (tap to enable)"}
          >
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>
      {currentView === "game" && (
        <div className="text-center text-primary font-bold tracking-[0.25em] text-sm pb-1.5">
          {drawing ? `${drawnCount}/75` : `00 : ${countdown.toString().padStart(2, "0")}`}
        </div>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute left-2 top-12 bg-card border rounded-lg shadow-lg w-52 py-1 text-sm z-30">
            {items.map((it) => (
              <button key={it.v} onClick={() => go(it.v)} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/50 ${currentView === it.v ? "text-primary" : ""}`}>
                {it.icon} {it.label}
              </button>
            ))}
            {user.isAdmin && (
              <button onClick={() => go("admin")} className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/50 ${currentView === "admin" ? "text-primary" : ""}`}>
                <ShieldCheck size={16} /> {t("admin")}
              </button>
            )}
            <div className="border-t my-1" />
            <button onClick={() => { setLang(lang === "am" ? "en" : "am"); setMenu(false); }} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/50">
              <Languages size={16} /> {lang === "am" ? "English" : "አማርኛ"}
            </button>
            <button onClick={() => { onLogout(); setMenu(false); }} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary/50 text-destructive">
              <LogOut size={16} /> {t("logout")}
            </button>
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">{user.username}{user.phone ? ` · ${user.phone}` : ""}</div>
          </div>
        </>
      )}
    </header>
  );
}

function AuthScreen({ onAuth, t, lang, setLang }: { onAuth: () => void; t: (k: Key) => string; lang: Lang; setLang: (l: Lang) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [referral, setReferral] = useState("");
  const [refLocked, setRefLocked] = useState(false);
  const [tgUser, setTgUser] = useState<{ id: number; first_name?: string; username?: string } | null>(null);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref") || sessionStorage.getItem("fk_ref") || "";
      if (ref) { setReferral(ref); setRefLocked(true); setMode("register"); }
      const p = url.searchParams.get("phone") || sessionStorage.getItem("fk_tg_phone") || "";
      if (p) { setPhone(p); setMode("register"); }
      const tgRaw = sessionStorage.getItem("fk_tg");
      if (tgRaw) {
        const u = JSON.parse(tgRaw);
        setTgUser(u);
        setMode("register");
        // Telegram-verified users don't need a password — prefill a deterministic one
        if (!password) setPassword(`tg_${u.id}`);
      }
    } catch {/* ignore */}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask Telegram to share contact (phone) via WebApp API
  const requestContact = () => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg?.requestContact) {
      toast.error("Open inside Telegram to share contact");
      return;
    }
    tg.requestContact((ok: boolean, data: any) => {
      if (!ok) return;
      const p = data?.responseUnsafe?.contact?.phone_number || data?.contact?.phone_number;
      if (p) setPhone(String(p).replace(/^\+/, ""));
    });
  };

  const genRefCode = (phone: string) => `R${phone.slice(-6)}${Math.floor(Math.random() * 75 + 10)}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.replace(/\D/g, "").length < 9) return toast.error("Phone required");
    const users = getUsers();
    // Auto-login: if phone is already registered, log them in regardless of mode
    const existing = users.find((u) => u.phone === phone);
    if (existing) {
      // Admin must always verify with password; everyone else gets auto-login
      if (existing.isAdmin) {
        if (!password || password !== existing.password) return toast.error("Wrong admin password");
      }
      setSession(existing.username);
      toast.success(`${t("welcome")} ${existing.username}`);
      try { sessionStorage.removeItem("fk_tg"); sessionStorage.removeItem("fk_ref"); } catch {}
      onAuth();
      return;
    }
    if (mode === "login") {
      return toast.error("Not registered — please register first");
    }
    if (!password) return toast.error("Password required");
    const seq = Math.max(0, ...users.map((u) => u.seq ?? 0)) + 1;
    let referredBy: string | undefined;
    if (referral.trim()) {
      const code = referral.trim();
      const inv = users.find((u) => u.username === code || (u as any).refCode === code);
      if (inv) {
        inv.balance += REFERRAL_SIGNUP_BONUS;
        referredBy = inv.username;
      }
    }
    const username = tgUser?.username || `user${phone.slice(-4)}${seq}`;
    const newUser: any = {
      username, password, phone, balance: SIGNUP_BONUS, seq,
      games: 0, wins: 0, referredBy, firstDepositDone: false,
      refCode: genRefCode(phone),
      telegramId: tgUser?.id,
    };
    users.push(newUser);
    saveUsers(users);
    setSession(username);
    addTx({
      id: `b${Date.now()}s`, username, type: "bonus", subtype: "signup",
      amount: SIGNUP_BONUS, status: "approved", createdAt: Date.now(),
      note: "Welcome bonus",
    });
    if (referredBy) {
      addTx({
        id: `b${Date.now()}r`, username: referredBy, type: "bonus", subtype: "referral",
        amount: REFERRAL_SIGNUP_BONUS, status: "approved", createdAt: Date.now(),
        note: `Invited ${username}`,
      });
    }
    try { sessionStorage.removeItem("fk_tg"); sessionStorage.removeItem("fk_ref"); } catch {}
    toast.success(`${t("welcome")} +${SIGNUP_BONUS} ETB`);
    onAuth();
  };


  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col items-center justify-center px-6">
      <Toaster theme="dark" position="top-center" />
      <button onClick={() => setLang(lang === "am" ? "en" : "am")} className="absolute top-4 right-4 text-xs px-2 py-1 rounded border text-muted-foreground">
        {lang === "am" ? "EN" : "አማ"}
      </button>
      <img src={logo} alt="Fast Bingo" className="h-16 w-auto mb-6" />
      {mode === "register" && (
        <div className="text-xs text-primary mb-3 font-semibold">🎁 {t("bonus20")}</div>
      )}
      {tgUser && (
        <div className="text-xs text-muted-foreground mb-3">👋 {tgUser.first_name ?? "Player"}</div>
      )}
      <form onSubmit={submit} className="w-full max-w-xs space-y-3">
        <div className="flex gap-2">
          <input className="flex-1 bg-card border rounded-md px-3 py-2 text-sm" placeholder={t("phone")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {mode === "register" && (
            <button type="button" onClick={requestContact} title="Share contact" className="px-2 bg-secondary border rounded-md text-primary">
              <Phone size={16} />
            </button>
          )}
        </div>
        <div className="relative">
          <input className="w-full bg-card border rounded-md px-3 py-2 pr-10 text-sm" placeholder={t("password")} type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {mode === "register" && (
          <>
            <input className="w-full bg-card border rounded-md px-3 py-2 text-sm disabled:opacity-60" placeholder={t("referral")} value={referral} onChange={(e) => setReferral(e.target.value)} disabled={refLocked} readOnly={refLocked} />
            {refLocked && <div className="text-[10px] text-primary -mt-1">✓ Invited by {referral}</div>}
          </>
        )}
        <button className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-md">{mode === "login" ? t("login") : t("register")}</button>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="w-full text-sm text-muted-foreground">{mode === "login" ? t("register") : t("login")}</button>
      </form>
    </div>
  );
}



// Real gaming: no mocked players. Live opponents will come from the backend later.
const FAKE_NAMES: string[] = [];
function fakePlayers(_seed: number): { name: string; cartella: number[]; bet: number }[] {
  return [];
}


// daubed cells on a cartella given the called balls; FREE (index 12) is always daubed
function daubedSet(cartella: number[], called: number[]): Set<number> {
  const s = new Set<number>([12]);
  const callSet = new Set(called);
  cartella.forEach((n, i) => { if (i !== 12 && callSet.has(n)) s.add(i); });
  return s;
}

function GameView({
  user, onChange, t, status, setStatus, soundOn, isActive,
}: {
  user: User;
  onChange: () => void;
  t: (k: Key) => string;
  tick: number;
  status: GameStatus;
  setStatus: React.Dispatch<React.SetStateAction<GameStatus>>;
  soundOn: boolean;
  isActive: boolean;
}) {
  // ---- AUDIO ----
  // Hard gate audio when: master mute, tab hidden, or user not on game page.
  // We keep a ref to the currently-playing element so we can stop it on mute/blur.
  const soundOnRef = useRef(soundOn);
  const isActiveRef = useRef(isActive);
  const audibleRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { soundOnRef.current = soundOn; if (!soundOn) audibleRef.current?.pause(); }, [soundOn]);
  useEffect(() => { isActiveRef.current = isActive; if (!isActive) audibleRef.current?.pause(); }, [isActive]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState !== "visible") audibleRef.current?.pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const canPlay = () =>
    soundOnRef.current && isActiveRef.current && (typeof document === "undefined" || document.visibilityState === "visible");
  const stopCurrentAudio = () => {
    const prev = audibleRef.current;
    if (prev) {
      try { prev.onended = null; prev.onerror = null; prev.pause(); } catch { /* ignore */ }
      audibleRef.current = null;
    }
  };
  const playOneShot = (src: string) => {
    if (!canPlay()) return;
    try {
      stopCurrentAudio();
      const a = new Audio(src);
      audibleRef.current = a;
      a.play().catch(() => {});
    } catch { /* ignore */ }
  };
  const playAwaitable = (src: string, safetyMs: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!canPlay()) { resolve(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      try {
        stopCurrentAudio();
        const a = new Audio(src);
        audibleRef.current = a;
        a.onended = finish;
        a.onerror = finish;
        a.play().catch(finish);
        // Safety cap in case 'ended' never fires (missing file, decode error).
        setTimeout(finish, safetyMs);
      } catch { finish(); }
    });
  };
  const playBallSound = (n: number): Promise<void> => {
    const letter = bingoLetter(n);
    return playAwaitable(`/sounds/${letter}_${n}.mp3`, 4000);
  };
  // Intro / pre-call sound that MUST play before the first bingo call.
  const playIntroSound = (): Promise<void> => playAwaitable("/sounds/Shekshik.mp3", 5000);
  // Game_Start.mp3 plays right before the first ball is called and MUST finish first.
  const playStartSound = (): Promise<void> => playAwaitable("/sounds/Game_Start.mp3", 6000);
  const playWinSound  = () => playOneShot("/sounds/Good_Bingo.mp3");
  const playStopSound  = () => playOneShot("/sounds/Game_Stop.mp3");

  // ---- BINGO 5x5 STATE ----
  const [cartella, setCartella] = useState<number[]>(() => Array(25).fill(0));
  const [cartellaId, setCartellaId] = useState<number | null>(null);
  const [autoDaub, setAutoDaub] = useState(false);
  const [daubedManual, setDaubedManual] = useState<Set<number>>(() => new Set([12]));
  // Draggable position for the selected cartella tile
  const [cartOffset, setCartOffset] = useState({ x: 0, y: 0 });
  const cartDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onCartDragDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    cartDragRef.current = { sx: e.clientX, sy: e.clientY, ox: cartOffset.x, oy: cartOffset.y };
  };
  const onCartDragMove = (e: React.PointerEvent) => {
    const d = cartDragRef.current; if (!d) return;
    setCartOffset({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy });
  };
  const onCartDragUp = () => { cartDragRef.current = null; };
  const MIN_BET = 10;
  const HOUSE_CUT = 0.2; // 20% house edge (legacy)
  const POOL_PERCENT = 0.35; // Live prize pool = 35% of total live bet amount
  const [bet, setBet] = useState(MIN_BET);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [ballKey, setBallKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [revealing, setRevealing] = useState<{ cartella: number[]; drawn: number[]; won: boolean } | null>(null);
  const [winner, setWinner] = useState<{ name: string; cartella: number[]; drawn: number[]; bet: number; ticketId: number; patternLabel: string } | null>(null);
  const lockedTicketRef = useRef<{ cartella: number[]; bet: number } | null>(null);
  const runningRef = useRef(false);

  // Stake-selection lobby: user must pick a Medeb (10/20/50/100) each round
  // before the cartella picker / game UI appears.
  const STAKES = [10, 20, 50, 100] as const;
  const [stakeChosen, setStakeChosen] = useState(false);
  const [spectator, setSpectator] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // Reset stake when a new game round starts
  useEffect(() => { setStakeChosen(false); setSpectator(false); }, [status.gameNo]);
  const pickStake = (amount: number) => {
    if (status.drawing) { setErr("Game already started"); return; }
    const fresh = getCurrentUser();
    if (!fresh || fresh.balance < amount) { setErr(t("errInsufficient")); return; }
    updateUser({ ...fresh, balance: fresh.balance - amount, games: (fresh.games ?? 0) + 1 });
    setBet(amount);
    setStakeChosen(true);
    setLocked(true);
    logActivity({ username: user.username, type: "play", detail: `joined ${amount} ETB` });
    onChange();
  };

  // No auto cartella — user must pick a number 1..75.

  // Active pattern (admin-configured). Supports multi-select + auto-rotate.
  const [patternId, setPatternIdState] = useState<string>("single_line");
  useEffect(() => {
    const pick = () => {
      const ids = getActivePatternIds();
      const rotate = getPatternRotate();
      if (ids.length > 0 && rotate) {
        // Deterministic per-game rotation so all viewers see the same pattern.
        const idx = Math.abs(status.gameNo) % ids.length;
        setPatternIdState(ids[idx]);
      } else if (ids.length > 0) {
        setPatternIdState(ids[0]);
      } else {
        setPatternIdState(getActivePattern());
      }
    };
    pick();
    const onStorage = () => pick();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [status.gameNo]);
  const pattern = useMemo(() => patternById(patternId), [patternId]);

  useEffect(() => {
    if (!err) return;
    const id = setTimeout(() => setErr(null), 3500);
    return () => clearTimeout(id);
  }, [err]);

  const seed = (user.seq ?? 1) * 47 + status.gameNo;
  // Real live players from localStorage presence (cross-tab). Heartbeat below.
  const livePlayers = useLivePlayers();
  // Players in MY current stake room (including me once I've picked a stake)
  const players = useMemo(
    () =>
      livePlayers
        .filter((p) => p.joined && p.stake === bet && p.gameNo === status.gameNo)
        .map((p) => ({ name: p.username, cartella: [] as number[], bet: p.stake })),
    [livePlayers, bet, status.gameNo],
  );
  const roundId = 254700 + (user.seq ?? 1) * 47 + status.gameNo;

  // Heartbeat my presence every 3s so others see me in real-time
  useEffect(() => {
    if (!user?.username) return;
    const beat = () =>
      heartbeatPresence({
        username: user.username,
        stake: bet,
        joined: stakeChosen,
        gameNo: status.gameNo,
      });
    beat();
    const id = window.setInterval(beat, 1500);
    const onLeave = () => removePresence(user.username);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [user?.username, stakeChosen, bet, status.gameNo]);

  // Auto countdown
  useEffect(() => {
    if (status.drawing) return;
    const id = setInterval(() => {
      setStatus((s) => (s.drawing ? s : { ...s, countdown: Math.max(0, s.countdown - 1) }));
    }, 1000);
    return () => clearInterval(id);
  }, [status.drawing, setStatus]);

  // Auto run draw when countdown hits 0
  useEffect(() => {
    if (status.countdown !== 0 || status.drawing || runningRef.current) return;
    runningRef.current = true;
    void runDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.countdown, status.drawing]);


  // Choose the cartella that should win, then build draw order so it completes
  // the active pattern with the minimum number of balls (house-friendly).
  const buildDrawOrder = (ticket: { cartella: number[]; bet: number } | null): { order: number[]; winnerIdx: number } => {
    const forced = getForcedDraw().filter((n) => n >= 1 && n <= 75);

    type Cand = { kind: "user" | "bot"; idx: number; name: string; cartella: number[]; bet: number };
    const cands: Cand[] = players.map((p, i) => ({ kind: "bot" as const, idx: i, name: p.name, cartella: p.cartella, bet: p.bet }));
    if (ticket) cands.push({ kind: "user", idx: -1, name: user.username, cartella: ticket.cartella, bet: ticket.bet });

    // For each cartella, compute one minimal completion set for the pattern.
    const minCompletion = (cart: number[]): number[] | null => {
      let bestSize = Infinity;
      let best: number[] | null = null;
      for (const mask of pattern.masks) {
        const needIdx: number[] = [];
        for (let i = 0; i < 25; i++) if (mask[i] === 1 && i !== 12) needIdx.push(i);
        const nums = needIdx.map((i) => cart[i]).filter((n) => n > 0);
        if (nums.length < bestSize) { bestSize = nums.length; best = nums; }
      }
      // requiredCount > 1: need N independent masks
      if (pattern.requiredCount && pattern.requiredCount > 1) {
        const sets: number[][] = [];
        for (const mask of pattern.masks) {
          const needIdx: number[] = [];
          for (let i = 0; i < 25; i++) if (mask[i] === 1 && i !== 12) needIdx.push(i);
          sets.push(needIdx.map((i) => cart[i]).filter((n) => n > 0));
        }
        sets.sort((a, b) => a.length - b.length);
        const merged = new Set<number>();
        for (let k = 0; k < pattern.requiredCount && k < sets.length; k++) sets[k].forEach((n) => merged.add(n));
        best = Array.from(merged);
      }
      return best;
    };

    // Rank: cheapest payout to house = smallest bet + fewest balls to complete
    const ranked = cands.map((c) => ({ c, need: minCompletion(c.cartella) ?? [] }))
      .sort((a, b) => (a.c.bet - b.c.bet) || (a.need.length - b.need.length));
    let chosen = ranked[0] ?? null;

    // Admin override: force a specific player (by username OR profile ID) to win.
    const forceWin = getForceWinner().trim();
    if (forceWin && ticket) {
      const userProfileId = String((user as any).telegramId || (1000000 + ((user.seq ?? 1) * 137)));
      const matchesUser =
        forceWin === user.username || forceWin === userProfileId || forceWin === String(user.seq ?? "");
      if (matchesUser) {
        const userCand = cands.find((c) => c.kind === "user");
        if (userCand) {
          const userRanked = ranked.find((r) => r.c === userCand);
          if (userRanked) chosen = userRanked;
        }
      } else {
        const botCand = cands.find((c) => c.kind === "bot" && (c.name === forceWin || String(c.idx + 1) === forceWin));
        if (botCand) {
          const botRanked = ranked.find((r) => r.c === botCand);
          if (botRanked) chosen = botRanked;
        }
      }
    }

    const winnerIdx = chosen ? cands.indexOf(chosen.c) : -1;

    // Build call order: forced first, then chosen winner's needed numbers, then random fillers up to 90
    const used = new Set<number>();
    const order: number[] = [];
    for (const n of forced) if (!used.has(n) && n >= 1 && n <= 75) { used.add(n); order.push(n); }
    if (chosen) {
      for (const n of chosen.need) if (!used.has(n) && n >= 1 && n <= 75) { used.add(n); order.push(n); }
    }
    const rest: number[] = [];
    for (let n = 1; n <= 75; n++) if (!used.has(n)) rest.push(n);
    for (let k = rest.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    return { order: [...order, ...rest], winnerIdx };
  };


  const runDraw = async () => {
    const ticket = lockedTicketRef.current;
    setStatus((s) => ({ ...s, drawing: true, drawnCount: 0 }));
    setDrawn([]);
    setWinner(null);
    clearStopSignal();
    clearPauseSignal();
    clearRestartSignal();
    const stopBaseline = getStopSignal();
    const restartBaseline = getRestartSignal();
    // Pre-call sounds must finish before the first bingo number is called.
    await playIntroSound();
    await playStartSound();

    if (getForcedDraw().length > 0) clearForcedDraw();
    if (getForceWinner()) clearForceWinner();

    type Cand = { kind: "user" | "bot"; idx: number; name: string; cartella: number[]; bet: number };
    const cands: Cand[] = players.map((p, i) => ({ kind: "bot" as const, idx: i, name: p.name, cartella: p.cartella, bet: p.bet }));
    if (ticket) cands.push({ kind: "user", idx: -1, name: user.username, cartella: ticket.cartella, bet: ticket.bet });

    const { order, winnerIdx } = buildDrawOrder(ticket);
    const chosen = cands[winnerIdx];

    const calledSoFar: number[] = [];
    let pauseBaseline = getPauseSignal();
    let restarted = false;
    for (let i = 0; i < order.length; i++) {
      // Honor admin "Stop Calling" signal between balls.
      if (getStopSignal() > stopBaseline) break;
      if (getRestartSignal() > restartBaseline) { restarted = true; break; }
      // Honor admin "Pause" — block until Continue or Stop/Restart.
      if (getPauseSignal() > pauseBaseline) {
        while (true) {
          await new Promise((r) => setTimeout(r, 250));
          if (getStopSignal() > stopBaseline) break;
          if (getRestartSignal() > restartBaseline) { restarted = true; break; }
          if (getResumeSignal() > pauseBaseline) { pauseBaseline = getPauseSignal(); break; }
        }
        if (getStopSignal() > stopBaseline) break;
        if (restarted) break;
      }
      const n = order[i];
      setCurrentBall(n);
      setBallKey((k) => k + 1);
      setStatus((s) => ({ ...s, drawnCount: i + 1 }));
      // Wait for the ball's audio to fully finish AND for the admin-configured
      // minimum spacing — whichever is longer. This prevents the sound from
      // being cut off mid-playback and prevents two ball sounds overlapping.
      await Promise.all([
        playBallSound(n),
        new Promise((r) => setTimeout(r, Math.max(200, getCallSpeed()))),
      ]);

      calledSoFar.push(n);
      setDrawn([...calledSoFar]);
      if (chosen && checkWin(pattern, daubedSet(chosen.cartella, calledSoFar))) break;
      if (i >= 60) break; // safety cap
    }

    const finalDrawn = calledSoFar.slice();

    if (ticket) {
      const userDaubed = daubedSet(ticket.cartella, finalDrawn);
      const userWon = checkWin(pattern, userDaubed);
      // Real bingo prize: total pool from all players × bet, minus house cut.
      // Winner takes the entire net pool.
      const totalPool = players.reduce((s, p) => s + p.bet, 0) + ticket.bet;
      const netPool = Math.floor(totalPool * POOL_PERCENT);
      const payout = userWon ? netPool : 0;
      const u2 = getCurrentUser();
      if (u2) {
        if (payout > 0) {
          updateUser({ ...u2, balance: u2.balance + payout, wins: (u2.wins ?? 0) + 1 });
          addProfit(ticket.bet - payout);
          toast.success(`${t("won")} +${payout} ETB`);
          logActivity({ username: user.username, type: "win", detail: `+${payout} ETB · ${pattern.label}` });
        } else {
          addProfit(ticket.bet);
          toast.message(t("lost"));
          logActivity({ username: user.username, type: "loss", detail: `-${ticket.bet} ETB · ${pattern.label}` });
        }
      }
      addHistory({
        id: String(Date.now()),
        picks: ticket.cartella.filter((n) => n > 0),
        drawn: finalDrawn,
        hits: ticket.cartella.filter((n) => finalDrawn.includes(n)).length,
        bet: ticket.bet,
        payout,
        at: Date.now(),
        username: user.username,
      });
    }

    setCurrentBall(null);
    const ticketId = 254700 + (user.seq ?? 1) * 47 + status.gameNo;
    playStopSound();

    if (chosen) {
      setWinner({
        name: chosen.name.toUpperCase(),
        cartella: chosen.cartella,
        drawn: finalDrawn,
        bet: chosen.bet,
        ticketId,
        patternLabel: pattern.label,
      });
      playWinSound();
      await new Promise((r) => setTimeout(r, 4000));
      setWinner(null);
    }

    if (ticket) {
      setRevealing({ cartella: ticket.cartella, drawn: finalDrawn, won: checkWin(pattern, daubedSet(ticket.cartella, finalDrawn)) });
      await new Promise((r) => setTimeout(r, 5000));
      setRevealing(null);
    }

    setDrawn([]);
    setDaubedManual(new Set([12]));
    setCartella(Array(25).fill(0));
    setCartellaId(null);
    lockedTicketRef.current = null;
    setLocked(false);
    setStatus((s) => ({ countdown: 25, drawing: false, drawnCount: 0, gameNo: s.gameNo + 1 }));
    runningRef.current = false;
    onChange();
  };

  const pickCartella = (id: number) => {
    if (status.drawing) return;
    setCartellaId(id);
    const cart = cartellaById(id);
    setCartella(cart);
    setDaubedManual(new Set([12]));
    lockedTicketRef.current = { cartella: [...cart], bet };
  };
  const clearCartella = () => {
    if (status.drawing) return;
    setCartellaId(null);
    setCartella(Array(25).fill(0));
    setDaubedManual(new Set([12]));
    lockedTicketRef.current = null;
  };

  const daubed = autoDaub ? daubedSet(cartella, drawn) : daubedManual;

  const toggleDaub = (idx: number) => {
    if (idx === 12) return;
    if (autoDaub) return;
    setDaubedManual((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ---- Stake selection lobby (forced before entering the game) ----
  if (!stakeChosen && !spectator) {
    const stakeColor = (s: number) =>
      s === 10 ? "from-cyan-400 to-cyan-600"
      : s === 20 ? "from-amber-400 to-orange-500"
      : s === 50 ? "from-emerald-400 to-green-600"
      : "from-fuchsia-400 to-purple-600";
    return (
      <div className="space-y-2">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[70px_50px_50px_1fr_65px] sm:grid-cols-[110px_70px_70px_1fr_90px] text-[10px] sm:text-[11px] tracking-widest text-primary font-bold px-2 sm:px-3 py-2 border-b border-border">
            <span>MEDEB</span><span>DERASH</span><span>PLAYERS</span><span>STATUS</span><span className="text-right">ACTION</span>
          </div>
          {STAKES.map((s) => {
            const stakeCount = livePlayers.filter(
              (p) => p.joined && p.stake === s && p.gameNo === status.gameNo,
            ).length;
            const isActive = bet === s && stakeCount > 0;
            const liveBet = stakeCount * s;
            const pool = Math.floor(liveBet * POOL_PERCENT);
            return (
              <div key={s} className="grid grid-cols-[70px_50px_50px_1fr_65px] sm:grid-cols-[110px_70px_70px_1fr_90px] items-center px-2 sm:px-3 py-1.5 sm:py-2 border-b border-border last:border-b-0">
                <div>
                  <span className={`inline-flex items-center justify-center min-w-[50px] sm:min-w-[80px] px-2 sm:px-4 py-1 sm:py-1.5 rounded-full font-black text-black bg-gradient-to-b ${stakeColor(s)} shadow-md text-xs sm:text-sm`}>
                    ብር {s}
                  </span>
                </div>
                <span className="text-foreground text-xs sm:text-sm">{pool} ETB</span>
                <span className="text-foreground text-xs sm:text-sm flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {stakeCount}
                </span>
                <span className="text-foreground text-xs sm:text-sm truncate">
                  {status.drawing ? "Active" : stakeCount > 0 ? "Waiting" : "Open"}
                </span>
                <div className="text-right">
                  <button
                    onClick={() => pickStake(s)}
                    className="px-2 sm:px-4 py-1 sm:py-1.5 rounded-md bg-gradient-to-b from-cyan-300 to-cyan-500 text-black font-bold text-xs sm:text-sm shadow hover:brightness-110"
                  >
                    {isActive ? "Play" : "Join"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center items-stretch">
          <button
            onClick={() => { setSpectator(true); toast.message("Watching as spectator · no balance deducted"); }}
            className="group relative overflow-hidden px-5 py-3 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-bold text-sm shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span className="relative">Enter Room · Watch Only</span>
            <span className="relative text-[10px] opacity-80 px-1.5 py-0.5 rounded bg-white/15 border border-white/20">FREE</span>
          </button>
          <button
            onClick={() => setShowInfo(true)}
            className="px-4 py-2 rounded-xl bg-card border border-border text-sm text-foreground flex items-center justify-center gap-2 hover:bg-accent transition"
          >
            <span>ℹ️</span><span className="font-semibold">Game Information</span>
          </button>
        </div>
        {showInfo && (
          <GameInfoModal
            onClose={() => setShowInfo(false)}
            roundId={roundId}
            gameNo={status.gameNo}
            stakes={STAKES as unknown as number[]}
            players={players.length}
            houseCut={HOUSE_CUT}
            pattern={pattern.label}
            status={status.drawing ? "Active" : `Starts in 00:${status.countdown.toString().padStart(2, "0")}`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {err && (
        <div className="err-banner flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="w-5 h-5 rounded-full border border-current/60 flex items-center justify-center text-xs">✕</span>
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Spectator / Cancel-Bet bar */}
      {(spectator || (stakeChosen && !status.drawing)) && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-transparent border border-violet-500/30">
          {spectator ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-violet-200">Spectator mode</span>
              <span className="text-muted-foreground">· no balance deducted</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="font-bold text-primary">Joined</span>
              <span className="text-muted-foreground">· {bet} ETB locked in</span>
            </div>
          )}
          <button
            onClick={() => {
              if (spectator) {
                setSpectator(false);
                removePresence(user.username);
                toast.message("Left room");
                return;
              }
              // Refund the bet and exit the round (only allowed before drawing)
              if (status.drawing) { setErr("Cannot cancel — drawing started"); return; }
              const u = getCurrentUser();
              if (u) updateUser({ ...u, balance: u.balance + bet, games: Math.max(0, (u.games ?? 1) - 1) });
              setStakeChosen(false);
              setLocked(false);
              setCartellaId(null);
              setCartella(Array(25).fill(0));
              lockedTicketRef.current = null;
              removePresence(user.username);
              toast.success(`Refunded ${bet} ETB`);
              logActivity({ username: user.username, type: "play", detail: `cancelled ${bet} ETB · refunded` });
              onChange();
            }}
            className="px-3 py-1.5 rounded-md bg-card border border-border text-xs font-bold hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition"
          >
            {spectator ? "Leave Room" : "Cancel & Refund"}
          </button>
        </div>
      )}

      {/* HUD STAT BAR */}
      {(() => {
        const liveBetTotal = players.reduce((s, p) => s + p.bet, 0) + (spectator ? 0 : bet);
        const pool = Math.floor(liveBetTotal * POOL_PERCENT);
        const locked = lockedTicketRef.current;
        const lockedDaubed = locked ? daubedSet(locked.cartella, drawn).size + 1 /* free */ : 0;
        const patternTarget = (() => {
          // crude: 5 for single line, 12 for double, full 25 etc. Use mask if available.
          const m = previewMask(pattern);
          return m.filter(Boolean).length || 5;
        })();
        const progress = locked ? Math.min(100, Math.round((lockedDaubed / patternTarget) * 100)) : 0;
        return (
          <div className="hud-bar">
            <div className="hud-cell hud-pool">
              <div className="hud-label">POOL</div>
              <div className="hud-value">{pool}<span className="hud-unit"> ETB</span></div>
            </div>
            <div className="hud-divider" />
            <div className="hud-cell">
              <div className="hud-label">PLAYERS</div>
              <div className="hud-value hud-value-sm">{players.length}</div>
            </div>
            <div className="hud-divider" />
            <div className="hud-cell">
              <div className="hud-label">{status.drawing ? "DRAWN" : "STARTS IN"}</div>
              <div className="hud-value hud-value-sm">
                {status.drawing
                  ? `${status.drawnCount}/75`
                  : `00:${status.countdown.toString().padStart(2, "0")}`}
              </div>
            </div>
            <div className="hud-divider" />
            <div className="hud-cell hud-pattern">
              <div className="hud-label">PATTERN</div>
              <div className="hud-value hud-value-xs">{pattern.label}</div>
              {locked && status.drawing && (
                <div className="hud-progress">
                  <div className="hud-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* DRAWING MODE */}
      {status.drawing ? (
        <div className="bg-card border rounded-lg p-2 relative overflow-visible flex flex-col gap-2">
          <div className="rings" />

          {/* Current ball big animated on top */}
          <div className="relative flex items-center justify-center h-28">
            {currentBall !== null && (
              <div key={ballKey} className="keno-ball big ball-pop flex-col leading-none relative z-10" style={ballStyle(currentBall)}>
                <span className="text-[11px] opacity-90 font-black tracking-wider">{bingoLetter(currentBall)}</span>
                <span>{currentBall}</span>
              </div>
            )}
          </div>

          {/* BINGO column header strip — sits just below the HUD/stats */}
          <div className="bingo-board" style={{ padding: 6, gap: 4 }}>
            {(["B","I","N","G","O"] as const).map((L) => (
              <div key={L} className="bingo-board-head" style={{ background: BINGO_COL_BG[L] }}>{L}</div>
            ))}
          </div>

          {/* Called numbers strip — shown above the 75-ball board */}
          <div className="bg-card/60 border rounded-md p-2">
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground mb-1">CALLED ({drawn.length})</div>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {drawn.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">—</span>
              ) : (
                drawn.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center justify-center min-w-[28px] h-6 px-1 rounded text-[11px] font-bold text-white"
                    style={{ background: BINGO_COL_BG[bingoLetter(n) as "B"|"I"|"N"|"G"|"O"] }}
                  >
                    {bingoLetter(n)}{n}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* BINGO 75-ball board — 5 cols × 15 numbers */}
          <div className="bingo-board">
            {(["B","I","N","G","O"] as const).map((L, ci) => {
              const start = ci * 15 + 1;
              const nums = Array.from({ length: 15 }, (_, i) => start + i);
              return (
                <div key={L} className="bingo-board-col">
                  {nums.map((n) => {
                    const called = drawn.includes(n);
                    const isCurrent = currentBall === n;
                    return (
                      <div
                        key={n}
                        className={`bingo-board-cell ${called ? "called" : ""} ${isCurrent ? "current" : ""}`}
                      >
                        {n}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>





          {/* Floating cartella overlay, draggable */}
          {lockedTicketRef.current && (
            <div
              className="absolute z-40 left-2 top-2 w-[130px] rounded-md bg-white shadow-xl ring-2 ring-primary/60 p-1 touch-none select-none"
              style={{ transform: `translate(${cartOffset.x}px, ${cartOffset.y}px)`, willChange: "transform" }}
            >
              <button
                type="button"
                onPointerDown={onCartDragDown}
                onPointerMove={onCartDragMove}
                onPointerUp={onCartDragUp}
                onPointerCancel={onCartDragUp}
                className="absolute -top-2 -right-2 z-50 bg-primary text-primary-foreground rounded-full p-1 shadow cursor-grab active:cursor-grabbing"
                title="Drag cartella"
                aria-label="Drag cartella"
              >
                <Move size={12} />
              </button>
              <CartellaGrid
                cartella={lockedTicketRef.current.cartella}
                daubed={daubedSet(lockedTicketRef.current.cartella, drawn)}
                onTap={() => {}}
                small
                flush
              />
            </div>
          )}

        </div>
      ) : winner ? null : revealing ? (
        <div className={`bg-card border-2 rounded-lg p-2 space-y-2 ${revealing.won ? "border-primary pulse-glow" : "border-border"}`}>
          <div className={`text-center text-sm font-bold ${revealing.won ? "text-primary" : "text-muted-foreground"}`}>
            {revealing.won ? t("won") : t("lost")} · {pattern.label}
          </div>
          <CartellaGrid
            cartella={revealing.cartella}
            daubed={daubedSet(revealing.cartella, revealing.drawn)}
            onTap={() => {}}
          />
          <div className="flex flex-wrap gap-1 justify-center pt-1 border-t border-border">
            {revealing.drawn.map((n, i) => (
              <div key={`${n}-${i}`} className="keno-ball w-7 h-7 text-[11px]" style={ballStyle(n)}>{n}</div>
            ))}
          </div>
        </div>
      ) : spectator ? (
        <div className="bg-card border rounded-lg p-6 text-center text-sm text-muted-foreground">
          You are watching this room. The next draw will appear here live.
        </div>
      ) : (
        <>
          {/* Stats sidebar + Cartella */}
          <div className="flex gap-1 items-stretch">
            <div className="flex-1 min-w-0">
              {cartellaId === null ? (
                <div className="bg-card border rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] font-medium">ካርቴላ ይምረጡ ({bet} ብር)</div>
                    <div className="text-primary text-xs font-bold">0/1</div>
                  </div>
                  <div className="cart-grid lined compact">
                    {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
                      <button key={n} onClick={() => pickCartella(n)} className="cart-cell">
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-[11px] font-medium">ካርቴላ #{cartellaId} ({bet} ብር)</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => downloadCartellaPdf({
                          cartella, cartellaId, username: user.username, bet, patternLabel: pattern.label,
                        })}
                        className="text-[10px] text-primary border border-primary/50 rounded-md px-2 py-0.5 flex items-center gap-1"
                        title="Download cartella as PDF"
                      >
                        <Printer size={11} /> PDF
                      </button>
                      <button
                        onClick={clearCartella}
                        disabled={status.drawing}
                        className="text-[10px] text-primary border border-primary/50 rounded-md px-2 py-0.5 disabled:opacity-40"
                      >
                        ቀይር
                      </button>
                    </div>
                  </div>
                  <div className="bg-card border rounded-lg p-2 relative overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-start">
                      <div
                        className="relative touch-none select-none"
                        style={{ transform: `translate(${cartOffset.x}px, ${cartOffset.y}px)`, willChange: "transform" }}
                      >
                        <button
                          type="button"
                          onPointerDown={onCartDragDown}
                          onPointerMove={onCartDragMove}
                          onPointerUp={onCartDragUp}
                          onPointerCancel={onCartDragUp}
                          className="absolute -top-1 -right-1 z-30 bg-primary text-primary-foreground rounded-full p-1 shadow cursor-grab active:cursor-grabbing"
                          title="Drag to move cartella"
                          aria-label="Drag cartella"
                        >
                          <Move size={12} />
                        </button>
                        <CartellaGrid cartella={cartella} daubed={daubed} onTap={toggleDaub} small />
                        {(cartOffset.x !== 0 || cartOffset.y !== 0) && (
                          <button
                            type="button"
                            onClick={() => setCartOffset({ x: 0, y: 0 })}
                            className="absolute -top-1 -left-1 z-30 bg-secondary text-foreground rounded-full p-1 shadow text-[9px]"
                            title="Reset position"
                            aria-label="Reset cartella position"
                          >
                            <X size={10} />
                          </button>
                        )}
                        <label className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={autoDaub}
                            onChange={(e) => setAutoDaub(e.target.checked)}
                            className="accent-primary"
                          />
                          Auto-daub
                        </label>
                      </div>
                      <div className="cart-grid lined compact">
                        {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            onClick={() => pickCartella(n)}
                            className={`cart-cell ${cartellaId === n ? "sel" : ""}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>




          {/* Joined: balance already deducted at Join. Pick a cartella to play. */}
          <div className="w-full text-center py-2 rounded-md bg-card border text-xs text-muted-foreground">
            {cartellaId === null ? "ካርቴላ ይምረጡ" : `Joined · ${bet} ETB · ካርቴላ #${cartellaId}`}
          </div>
        </>
      )}



      {winner && <BingoWinnerOverlay winner={winner} t={t} />}
    </div>
  );
}

// ---- 5x5 cartella renderer ----
function GameInfoModal({
  onClose, roundId, gameNo, stakes, players, houseCut, pattern, status,
}: {
  onClose: () => void;
  roundId: number;
  gameNo: number;
  stakes: number[];
  players: number;
  houseCut: number;
  pattern: string;
  status: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/20 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            <span className="font-bold text-foreground">Game Information</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <InfoRow label="Round ID" value={`#${roundId}`} />
          <InfoRow label="Game No" value={`${gameNo}`} />
          <InfoRow label="Status" value={status} />
          <InfoRow label="Pattern" value={pattern} />
          <InfoRow label="Players" value={`${players}`} />
          <InfoRow label="Stakes" value={stakes.map((s) => `${s} Br`).join(" · ")} />
          <InfoRow label="House Cut" value={`${Math.round(houseCut * 100)}%`} />
          <div className="pt-2 border-t border-border text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">How it works</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Pick a stake (Medeb), choose a cartella, then wait for the draw.</li>
              <li>Mark called numbers on your card. Complete the pattern to win.</li>
              <li>Prize pool = total stakes minus house cut, paid to the winner.</li>
              <li>Tap BINGO the moment your pattern is complete.</li>
            </ul>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground font-bold hover:brightness-110"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-semibold">{value}</span>
    </div>
  );
}

function CartellaGrid({
  cartella, daubed, onTap, small, flush,
}: { cartella: number[]; daubed: Set<number>; onTap: (i: number) => void; small?: boolean; flush?: boolean }) {
  return (
    <div
      className={flush ? "winner-card-flush" : "winner-card mx-auto"}
      style={{ maxWidth: small ? 160 : 220 }}
    >
      <div className="bingo-col-head">
        {(["B","I","N","G","O"] as const).map((L) => (
          <div key={L} style={{ background: BINGO_COL_BG[L] }}>{L}</div>
        ))}
      </div>
      <div className="bingo-grid">
        {cartella.map((n, i) => {
          const free = i === 12;
          const hit = free || daubed.has(i);
          return (
            <button
              key={i}
              onClick={() => onTap(i)}
              className={`bingo-cell ${hit ? "hit" : ""} ${free ? "free" : ""}`}
            >
              {free ? "★" : n || ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PatternPreviewBar({ pattern }: { pattern: PatternDef }) {
  const mask = previewMask(pattern);
  return (
    <div className="bg-card border rounded-md p-2 flex items-center gap-3">
      <div className="grid grid-cols-5 gap-[2px] w-14">
        {mask.map((v, i) => (
          <div key={i} className="aspect-square rounded-sm" style={{
            background: i === 12 ? "var(--primary)" : v ? "var(--primary)" : "var(--secondary)",
            opacity: v || i === 12 ? 1 : 0.4,
          }} />
        ))}
      </div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">Win Pattern</div>
        <div className="text-sm font-bold text-primary">{pattern.label}</div>
      </div>
    </div>
  );
}

function WalletView({ user, onChange, t }: { user: User; onChange: () => void; t: (k: Key) => string }) {
  const [screen, setScreen] = useState<"main" | "deposit" | "withdraw-method" | "withdraw-form">("main");
  const [method, setMethod] = useState<"telebirr" | "cbe">("telebirr");
  const [amount, setAmount] = useState(100);
  const [account, setAccount] = useState(user.phone || "");
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState("");
  const [txTab, setTxTab] = useState<"deposit" | "withdraw" | "game" | "topup">("deposit");
  const [myTx, setMyTx] = useState<TxRequest[]>([]);
  const [timer, setTimer] = useState(180);
  const pay = getPayInfo();
  const rounds = useMemo(() => getHistory().filter((r) => r.username === user.username), [user.username, screen, txTab]);

  useEffect(() => {
    setMyTx(getTx().filter((x) => x.username === user.username));
  }, [user.username, screen]);

  // Countdown timer on withdraw form
  useEffect(() => {
    if (screen !== "withdraw-form") return;
    setTimer(180);
    const id = setInterval(() => setTimer((v) => (v <= 0 ? 0 : v - 1)), 1000);
    return () => clearInterval(id);
  }, [screen]);

  const withdrawable = user.firstDepositDone ? user.balance : Math.max(0, user.balance - SIGNUP_BONUS);
  const playBalance = user.balance;

  const tgChat = (user as any).telegramId as number | undefined;

  const submitDeposit = () => {
    if (amount <= 0) return;
    addTx({
      id: String(Date.now()), username: user.username, phone: user.phone,
      method, type: "deposit", amount, status: "pending", createdAt: Date.now(),
    });
    notifyTelegram({
      chatId: tgChat,
      text:
        `💰 <b>Deposit request received</b>\n` +
        `Amount: <b>${fmtEtb(amount)}</b> via ${method.toUpperCase()}\n` +
        `Current balance: <b>${fmtEtb(user.balance)}</b>\n` +
        `Status: ⏳ pending admin approval. You'll get a message here once approved.`,
      adminText:
        `🟡 <b>Deposit pending</b>\nUser: <b>${user.username}</b> · ${user.phone ?? "-"}\n` +
        `Amount: <b>${fmtEtb(amount)}</b> via ${method.toUpperCase()}`,
    });
    toast.success(t("requestSent"));
    setScreen("main"); onChange();
  };

  const submitWithdraw = () => {
    if (amount <= 0) return;
    if (!account) return toast.error("Account required");
    if (withdrawable < amount) return toast.error(t("insufficient"));
    if (timer === 0) return toast.error("Session expired");
    addTx({
      id: String(Date.now()), username: user.username, phone: account,
      method, type: "withdraw", amount, status: "pending", createdAt: Date.now(),
    });
    notifyTelegram({
      chatId: tgChat,
      text:
        `💸 <b>Withdrawal request received</b>\n` +
        `Amount: <b>${fmtEtb(amount)}</b> to ${method.toUpperCase()} ${account}\n` +
        `Current balance: <b>${fmtEtb(user.balance)}</b>\n` +
        `Status: ⏳ pending admin approval.`,
      adminText:
        `🟠 <b>Withdraw pending</b>\nUser: <b>${user.username}</b>\n` +
        `Amount: <b>${fmtEtb(amount)}</b> → ${method.toUpperCase()} ${account}`,
    });
    toast.success(t("requestSent"));
    setScreen("main"); onChange();
  };

  const redeem = () => {
    if (!code.trim()) return;
    const r = redeemCoupon(code, user.username);
    if (r.ok) {
      toast.success(r.msg);
      const fresh = getCurrentUser();
      addTx({
        id: `b${Date.now()}c`, username: user.username, type: "bonus",
        subtype: "coupon", amount: r.amount ?? 0,
        status: "approved", createdAt: Date.now(),
        note: `Code ${code.toUpperCase()}`,
      });
      notifyTelegram({
        chatId: tgChat,
        text:
          `🎟️ <b>Coupon redeemed!</b>\n` +
          `Code: <code>${code.toUpperCase()}</code>\n` +
          `Added: <b>+${r.amount} ETB</b>\n` +
          `New balance: <b>${fmtEtb(fresh?.balance ?? user.balance)}</b>`,
      });
      setCode(""); setRedeemOpen(false); onChange();
    } else toast.error(r.msg);
  };

  // ---------- DEPOSIT screen ----------
  if (screen === "deposit") {
    return (
      <div className="space-y-3">
        <button onClick={() => setScreen("main")} className="text-xs text-primary">← Back</button>
        <div className="bg-card border rounded-lg p-3 space-y-3">
          <div className="text-sm font-bold text-primary">{t("deposit")}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod("telebirr")}
              className={`h-12 rounded-md overflow-hidden bg-white p-0 flex items-center justify-center ${method === "telebirr" ? "ring-2 ring-[#f5c518]" : "ring-1 ring-border"}`}
            >
              <img src={telebirrLogo} alt="Telebirr" className="h-full w-full object-contain" />
            </button>
            <button
              onClick={() => setMethod("cbe")}
              className={`h-12 rounded-md overflow-hidden bg-white p-0 flex items-center justify-center ${method === "cbe" ? "ring-2 ring-[#f5c518]" : "ring-1 ring-border"}`}
            >
              <img src={cbeLogo} alt="CBE" className="h-full w-full object-contain" />
            </button>
          </div>

          <div className="bg-background border border-dashed border-primary/50 rounded-md p-3 text-center flex flex-col items-center gap-1">
            <img
              src={method === "telebirr" ? telebirrLogo : cbeLogo}
              alt={method}
              className="h-8 w-auto object-contain"
            />
            <div className="text-[11px] text-muted-foreground">{t("sendTo")}</div>
            <div className="text-lg font-bold text-primary tracking-wider">{method === "telebirr" ? pay.telebirr : pay.cbe}</div>
            <div className="text-[10px] text-muted-foreground">{method === "telebirr" ? "Telebirr" : "CBE"}</div>
          </div>

          <label className="text-xs text-muted-foreground">{t("amount")} (ETB)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-full bg-background border rounded-md px-3 py-2" />
          <div className="flex gap-2">
            {[50, 100, 500, 1000].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="flex-1 text-xs bg-background border rounded py-1">{v}</button>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">{t("afterPayHint")}</div>
          <button onClick={submitDeposit} className="w-full bg-[#f5c518] text-black font-bold py-2 rounded-md hover:brightness-95">{t("submit")}</button>
        </div>
      </div>
    );
  }

  // ---------- WITHDRAW: payment method selection ----------
  if (screen === "withdraw-method") {
    return (
      <div className="space-y-3">
        <button onClick={() => setScreen("main")} className="text-xs text-primary">← Back</button>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm font-bold text-primary mb-3">Select payment method</div>
          <div className="space-y-2">
            {(["telebirr", "cbe"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setScreen("withdraw-form"); }}
                className="w-full bg-secondary hover:bg-secondary/80 border rounded-md p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Wallet size={18} className="text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold">{m === "telebirr" ? t("payTelebirr") : t("payCBE")}</div>
                  <div className="text-[11px] text-muted-foreground">Withdraw to {m === "telebirr" ? "Telebirr" : "CBE"} account</div>
                </div>
                <span className="text-primary">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- WITHDRAW: account + amount + timer ----------
  if (screen === "withdraw-form") {
    const mm = String(Math.floor(timer / 60)).padStart(2, "0");
    const ss = String(timer % 60).padStart(2, "0");
    return (
      <div className="space-y-3">
        <button onClick={() => setScreen("withdraw-method")} className="text-xs text-primary">← Back</button>
        <div className="bg-card border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-primary">{t("withdraw")} · {method === "telebirr" ? t("payTelebirr") : t("payCBE")}</div>
            <div className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${timer < 30 ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
              {mm}:{ss}
            </div>
          </div>
          <div className="bg-background border rounded-md p-2 text-center">
            <div className="text-[11px] text-muted-foreground">Withdrawable</div>
            <div className="text-lg font-bold text-primary">{withdrawable.toFixed(2)} ETB</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{method === "telebirr" ? "Telebirr account" : "CBE account"}</label>
            <input value={account} onChange={(e) => setAccount(e.target.value)} className="w-full bg-background border rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("amount")} (ETB)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-full bg-background border rounded-md px-3 py-2" />
          </div>
          <div className="flex gap-2">
            {[50, 100, 500, 1000].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="flex-1 text-xs bg-background border rounded py-1">{v}</button>
            ))}
          </div>
          <button onClick={submitWithdraw} disabled={timer === 0} className="w-full bg-[#f5c518] text-black font-bold py-2 rounded-md disabled:opacity-50 hover:brightness-95">
            {timer === 0 ? "Expired" : t("submit")}
          </button>
        </div>
      </div>
    );
  }

  // ---------- MAIN wallet ----------
  const txDeposits = myTx.filter((x) => x.type === "deposit");
  const txWithdraws = myTx.filter((x) => x.type === "withdraw");
  const gameRows = rounds;
  const topups = myTx.filter((x) => x.type === "bonus");

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-lg border p-4 text-center">
        <div className="text-xs text-muted-foreground">Balance for play</div>
        <div className="text-3xl font-bold text-primary">{playBalance.toFixed(2)} ETB</div>
        <div className="text-[11px] text-muted-foreground mt-1">Withdrawable: <span className="text-primary font-bold">{withdrawable.toFixed(2)} ETB</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setScreen("deposit")} className="bg-[#f5c518] text-black font-bold py-3 rounded-md flex items-center justify-center gap-2 hover:brightness-95">
          <Plus size={16} /> {t("deposit")}
        </button>
        <button onClick={() => setScreen("withdraw-method")} className="bg-[#f5c518] text-black font-bold py-3 rounded-md flex items-center justify-center gap-2 hover:brightness-95">
          <Minus size={16} /> {t("withdraw")}
        </button>
      </div>


      <button onClick={() => setRedeemOpen(true)} className="w-full bg-card border border-primary/50 rounded-md py-2.5 flex items-center justify-center gap-2 text-primary font-bold">
        <Gift size={16} /> {t("redeem")} {t("code")}
      </button>

      {/* Transactions section with sub-tabs */}
      <div className="bg-card border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <Receipt size={16} /> {t("transactions")}
        </div>
        <div className="grid grid-cols-4 gap-1 bg-background border rounded-md p-1 text-[11px]">
          {(["deposit", "withdraw", "game", "topup"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTxTab(k)}
              className={`py-1.5 rounded ${txTab === k ? "bg-[#f5c518] text-black font-bold" : "text-muted-foreground"}`}

            >
              {k === "deposit" ? t("deposit") : k === "withdraw" ? t("withdraw") : k === "game" ? t("game") : "Bonus"}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {txTab === "deposit" && (txDeposits.length === 0
            ? <Empty />
            : txDeposits.map((x) => <TxRow key={x.id} x={x} t={t} />))}
          {txTab === "withdraw" && (txWithdraws.length === 0
            ? <Empty />
            : txWithdraws.map((x) => <TxRow key={x.id} x={x} t={t} />))}
          {txTab === "game" && (gameRows.length === 0
            ? <Empty />
            : gameRows.slice(0, 50).map((r) => (
              <div key={r.id} className="bg-secondary/30 rounded-md p-2 flex justify-between text-sm">
                <span className="text-muted-foreground text-xs">{new Date(r.at).toLocaleString()}</span>
                <span className={r.payout > 0 ? "text-primary font-bold" : "text-muted-foreground"}>
                  {r.payout > 0 ? `+${r.payout}` : `-${r.bet}`} ETB
                </span>
              </div>
            )))}
          {txTab === "topup" && (topups.length === 0
            ? <Empty />
            : topups.map((x) => <TxRow key={x.id} x={x} t={t} />))}
        </div>
      </div>

      {/* Redeem dialog */}
      {redeemOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setRedeemOpen(false)}>
          <div className="bg-card border rounded-lg p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-primary">
                <Gift size={18} /> {t("redeem")} {t("code")}
              </div>
              <button onClick={() => setRedeemOpen(false)} className="text-muted-foreground"><X size={18} /></button>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("enterCode")}
              className="w-full bg-background border rounded-md px-3 py-2 text-sm tracking-wider font-bold"
            />
            <button onClick={redeem} className="w-full bg-primary text-primary-foreground font-bold py-2 rounded-md">{t("submit")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return <div className="text-center text-muted-foreground text-xs py-4">—</div>;
}
function TxRow({ x, t }: { x: TxRequest; t: (k: Key) => string }) {
  const subLabel =
    x.type === "bonus"
      ? x.subtype === "signup"
        ? "Registration bonus"
        : x.subtype === "referral"
        ? "Invitation bonus"
        : x.subtype === "referral_deposit"
        ? "Invite deposit bonus"
        : x.subtype === "coupon"
        ? "Coupon code"
        : "Bonus"
      : null;
  return (
    <div className="bg-secondary/30 rounded-md p-2 flex justify-between text-sm">
      <div>
        <div className="font-semibold">{x.type === "withdraw" ? "-" : "+"} {x.amount} ETB</div>
        {subLabel && (
          <div className="text-[10px] text-primary font-semibold">
            {subLabel}{x.note ? ` · ${x.note}` : ""}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">{new Date(x.createdAt).toLocaleString()}</div>
      </div>
      <span className={x.status === "approved" ? "text-primary text-xs" : x.status === "rejected" ? "text-destructive text-xs" : "text-yellow-500 text-xs"}>
        {x.status === "approved" ? t("approved") : x.status === "rejected" ? t("rejected") : t("pending")}
      </span>
    </div>
  );
}




function AdminView({ t, onChange, user }: { t: (k: Key) => string; onChange: () => void; user: User }) {
  const [tx, setTxState] = useState<TxRequest[]>([]);
  const [forced, setForced] = useState<string>(getForcedDraw().join(","));
  const [players, setPlayers] = useState<User[]>([]);
  const [pay, setPay] = useState(getPayInfo());
  const [adminTab, setAdminTab] = useState<"pending" | "transactions" | "players" | "live" | "coupons" | "patterns" | "settings" | "activity">("pending");
  const [activePatId, setActivePatId] = useState<string>("single_line");
  const [activePatIds, setActivePatIdsState] = useState<string[]>([]);
  const [rotate, setRotateState] = useState<boolean>(false);
  const [forceWinner, setForceWinnerState] = useState<string>("");
  useEffect(() => {
    setActivePatId(getActivePattern());
    setActivePatIdsState(getActivePatternIds());
    setRotateState(getPatternRotate());
    setForceWinnerState(getForceWinner());
  }, []);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [newCoupon, setNewCoupon] = useState({ code: "", amount: 20, maxUses: 100, days: 7 });
  const [callSpeed, setCallSpeedState] = useState<number>(1000);
  const [activities, setActivities] = useState<Activity[]>([]);
  useEffect(() => { setCallSpeedState(getCallSpeed()); setActivities(getActivities()); }, []);

  const reload = () => {
    setTxState(getTx());
    setForced(getForcedDraw().join(","));
    setPlayers(getUsers().filter((u) => !u.isAdmin));
    setCoupons(getCoupons());
    setActivities(getActivities());
  };
  useEffect(reload, []);

  const decide = (id: string, status: "approved" | "rejected") => {
    const all = getTx();
    const idx = all.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const item = all[idx];
    let notifyChat: number | undefined;
    let newBalance: number | undefined;
    if (status === "approved") {
      const users = getUsers();
      const u = users.find((x) => x.username === item.username);
      if (u) {
        if (item.type === "deposit") {
          u.balance += item.amount;
          if (!u.firstDepositDone && item.amount >= REFERRAL_DEPOSIT_THRESHOLD && u.referredBy) {
            const inv = users.find((x) => x.username === u.referredBy);
            if (inv) {
              inv.balance += REFERRAL_DEPOSIT_BONUS;
              addTx({
                id: `b${Date.now()}rd`, username: inv.username, type: "bonus",
                subtype: "referral_deposit", amount: REFERRAL_DEPOSIT_BONUS,
                status: "approved", createdAt: Date.now(),
                note: `${u.username} first deposit`,
              });
            }
            u.firstDepositDone = true;
          } else if (item.amount >= REFERRAL_DEPOSIT_THRESHOLD) {
            u.firstDepositDone = true;
          }
        } else {
          u.balance = Math.max(0, u.balance - item.amount);
        }
        saveUsers(users);
        notifyChat = (u as any).telegramId;
        newBalance = u.balance;
      }
    } else {
      const u = getUsers().find((x) => x.username === item.username);
      notifyChat = (u as any)?.telegramId;
      newBalance = u?.balance;
    }
    all[idx] = { ...item, status };
    saveTx(all);
    // Notify the user on Telegram
    if (notifyChat) {
      const verb = item.type === "deposit" ? "Deposit" : "Withdrawal";
      const head = status === "approved" ? `✅ <b>${verb} approved</b>` : `❌ <b>${verb} rejected</b>`;
      notifyTelegram({
        chatId: notifyChat,
        text:
          `${head}\nAmount: <b>${fmtEtb(item.amount)}</b>` +
          (newBalance !== undefined ? `\n💰 New balance: <b>${fmtEtb(newBalance)}</b>` : ""),
      });
    }
    reload();
    onChange();
    toast.success(status === "approved" ? t("approved") : t("rejected"));
  };

  const saveForce = () => {
    const nums = forced.split(/[\s,]+/).map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 1 && n <= 80);
    const uniq = Array.from(new Set(nums)).slice(0, 20);
    setForcedDraw(uniq);
    setForced(uniq.join(","));
    toast.success("Saved " + uniq.length + " numbers");
  };
  const clearForce = () => {
    clearForcedDraw();
    setForced("");
    toast.message("Cleared");
  };

  const savePay = () => {
    setPayInfo(pay);
    toast.success("Saved");
  };

  const pending = tx.filter((x) => x.status === "pending");
  const done = tx.filter((x) => x.status !== "pending");

  const previewNums = forced.split(/[\s,]+/).map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 1 && n <= 75);
  const seed = (user.seq ?? 1) * 47;
  const previewPlayers = useMemo(() => fakePlayers(seed), [seed]);
  const activePatternId = getActivePattern();
  const activePattern = patternById(activePatternId);
  const winners = previewNums.length > 0
    ? previewPlayers
        .map((p) => {
          const d = new Set<number>([12]);
          const callSet = new Set(previewNums);
          p.cartella.forEach((n, i) => { if (i !== 12 && callSet.has(n)) d.add(i); });
          const hits = p.cartella.filter((n) => n > 0 && previewNums.includes(n)).length;
          return { ...p, hits, won: checkWin(activePattern, d) };
        })
        .filter((p) => p.won)
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 bg-card border rounded-md p-1 text-[10px]">
        {(["pending","transactions","players","live","coupons","patterns","activity","settings"] as const).map((k) => (
          <button key={k} onClick={() => setAdminTab(k)} className={`py-1.5 rounded ${adminTab===k?"bg-[#f5c518] text-black font-bold":"text-muted-foreground"}`}>

            {k==="pending"?t("pending"):k==="transactions"?t("transactions"):k==="players"?t("players"):k==="live"?t("livePlayers"):k==="coupons"?t("coupons"):k==="patterns"?"Patterns":k==="activity"?"Activity":t("settings")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-card border rounded-md p-2"><div className="text-[10px] text-muted-foreground">{t("totalProfit")}</div><div className="text-primary font-bold">{getProfit().toFixed(0)}</div></div>
        <div className="bg-card border rounded-md p-2"><div className="text-[10px] text-muted-foreground">{t("players")}</div><div className="text-primary font-bold">{players.length}</div></div>
        <div className="bg-card border rounded-md p-2"><div className="text-[10px] text-muted-foreground">{t("transactions")}</div><div className="text-primary font-bold">{tx.length}</div></div>
      </div>

      {adminTab === "transactions" && (
        <div className="bg-card border rounded-md p-2 space-y-1">
          <div className="grid grid-cols-[40px_1fr_60px_70px_70px] gap-1 text-[10px] text-muted-foreground px-1">
            <span>ID</span><span>{t("username")}</span><span>{t("type")}</span><span>{t("amount")}</span><span>{t("status")}</span>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {tx.map((x, i) => (
              <div key={x.id} className="grid grid-cols-[40px_1fr_60px_70px_70px] gap-1 text-[11px] bg-secondary/30 rounded px-2 py-1.5">
                <span className="text-muted-foreground">{i+1}</span>
                <span><span className="font-bold">{x.username}</span>{x.phone?<><br/><span className="text-[9px] text-muted-foreground">{x.phone}</span></>:null}</span>
                <span>{x.type}</span>
                <span className="text-primary font-bold">{x.amount}</span>
                <span className={x.status==="approved"?"text-primary":x.status==="rejected"?"text-destructive":"text-yellow-500"}>{x.status}</span>
              </div>
            ))}
            {tx.length===0 && <div className="text-center text-xs text-muted-foreground py-2">—</div>}
          </div>
        </div>
      )}

      {adminTab === "live" && <AdminLivePlayers t={t} />}


      {adminTab === "coupons" && (
        <div className="bg-card border rounded-md p-3 space-y-2">
          <div className="text-sm font-bold text-primary">{t("create")} {t("coupons")}</div>
          <input value={newCoupon.code} onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} placeholder={t("code")} className="w-full bg-background border rounded px-2 py-1.5 text-sm tracking-wider font-bold" />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-[10px] text-muted-foreground">{t("amount")}</label><input type="number" value={newCoupon.amount} onChange={(e)=>setNewCoupon({...newCoupon,amount:Number(e.target.value)||0})} className="w-full bg-background border rounded px-2 py-1.5 text-sm" /></div>
            <div><label className="text-[10px] text-muted-foreground">{t("maxUses")}</label><input type="number" value={newCoupon.maxUses} onChange={(e)=>setNewCoupon({...newCoupon,maxUses:Number(e.target.value)||1})} className="w-full bg-background border rounded px-2 py-1.5 text-sm" /></div>
            <div><label className="text-[10px] text-muted-foreground">{t("expires")} (d)</label><input type="number" value={newCoupon.days} onChange={(e)=>setNewCoupon({...newCoupon,days:Number(e.target.value)||1})} className="w-full bg-background border rounded px-2 py-1.5 text-sm" /></div>
          </div>
          <button onClick={() => {
            if (!newCoupon.code.trim()) return toast.error("Code required");
            addCoupon({ code: newCoupon.code.trim().toUpperCase(), amount: newCoupon.amount, maxUses: newCoupon.maxUses, expiresAt: Date.now()+newCoupon.days*86400000, usedBy: [], createdAt: Date.now() });
            setNewCoupon({ code: "", amount: 20, maxUses: 100, days: 7 });
            reload(); toast.success("Created");
          }} className="w-full bg-primary text-primary-foreground font-bold py-1.5 rounded text-sm">{t("create")}</button>
          <div className="space-y-1 max-h-60 overflow-y-auto pt-2 border-t">
            {coupons.map((c) => (
              <div key={c.code} className="bg-secondary/30 rounded p-2 text-xs">
                <div className="flex justify-between"><span className="font-bold tracking-wider text-primary">{c.code}</span><span>{c.amount} ETB</span></div>
                <div className="text-[10px] text-muted-foreground flex justify-between mt-0.5">
                  <span>{t("used")}: {c.usedBy.length}/{c.maxUses}</span>
                  <span>{t("expires")}: {new Date(c.expiresAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
            {coupons.length===0 && <div className="text-center text-xs text-muted-foreground py-2">—</div>}
          </div>
        </div>
      )}

      {adminTab === "patterns" && (
        <div className="bg-card border rounded-md p-3 space-y-3">
          <div className="text-sm font-bold text-primary">Active Bingo Patterns</div>
          <div className="text-[11px] text-muted-foreground">
            Tap patterns to add/remove them from the active set. Players win by
            completing any selected pattern. Each pattern already accepts every
            valid position (rotations/translations). Changes apply on the next game.
          </div>
          <label className="flex items-center justify-between bg-secondary/30 rounded-md px-3 py-2 text-xs">
            <span className="font-semibold">Auto-rotate patterns each game</span>
            <input
              type="checkbox"
              checked={rotate}
              onChange={(e) => {
                setRotateState(e.target.checked);
                setPatternRotate(e.target.checked);
                toast.success(e.target.checked ? "Auto-rotate ON" : "Auto-rotate OFF");
              }}
              className="accent-primary w-4 h-4"
            />
          </label>
          <div className="text-[11px] text-muted-foreground">
            Selected: <span className="text-primary font-bold">{activePatIds.length}</span>
            {activePatIds.length > 0 && (
              <button
                onClick={() => { setActivePatternIds([]); setActivePatIdsState([]); toast.message("Cleared"); }}
                className="ml-2 underline"
              >Clear</button>
            )}
          </div>
          {(["lines","letters","blocks","fun"] as const).map((cat) => (
            <section key={cat}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {cat === "lines" ? "Lines & Basics" : cat === "letters" ? "Letter Shapes" : cat === "blocks" ? "Number / Block" : "Fun & Specialty"}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PATTERNS.filter((p) => p.category === cat).map((p) => {
                  const m = previewMask(p);
                  const inSet = activePatIds.includes(p.id);
                  const positions = p.masks.length;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        const next = inSet
                          ? activePatIds.filter((x) => x !== p.id)
                          : [...activePatIds, p.id];
                        setActivePatIdsState(next);
                        setActivePatternIds(next);
                        // Keep legacy single-pattern in sync with the first selection
                        if (next.length > 0) { setActivePattern(next[0]); setActivePatId(next[0]); }
                        toast.success(inSet ? `Removed: ${p.label}` : `Added: ${p.label}`);
                      }}
                      className={`border rounded-md p-1.5 text-left ${inSet ? "border-primary bg-primary/10" : "border-border"}`}
                    >
                      <div className="grid grid-cols-5 gap-[2px]">
                        {m.map((v, i) => (
                          <div key={i} className="aspect-square rounded-sm" style={{
                            background: i === 12 ? "var(--primary)" : v ? "var(--primary)" : "var(--secondary)",
                            opacity: v || i === 12 ? 1 : 0.4,
                          }} />
                        ))}
                      </div>
                      <div className="text-[10px] font-semibold mt-1 leading-tight">{p.label}</div>
                      <div className="text-[9px] text-muted-foreground">{positions} position{positions !== 1 ? "s" : ""}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}


      {adminTab === "settings" && (
      <>
      <div className="bg-card border rounded-md p-3 space-y-3">
        <div className="text-sm font-bold text-primary flex items-center gap-2">
          <Gauge size={14} /> Calling Controls
        </div>
        <button
          onClick={() => { raiseStopSignal(); toast.success("Stop signal sent"); }}
          className="w-full bg-destructive text-destructive-foreground font-bold py-2 rounded-md flex items-center justify-center gap-2"
        >
          <Square size={14} /> Stop Calling Now
        </button>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Calling speed (delay between balls)</span>
            <span className="text-primary font-bold">{(callSpeed / 1000).toFixed(1)}s</span>
          </div>
          <input
            type="range" min={SPEED_MIN} max={SPEED_MAX} step={100}
            value={callSpeed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setCallSpeedState(v); setCallSpeed(v);
            }}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Fast</span><span>Slow</span>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-md p-3 space-y-2">
        <div className="text-sm font-bold text-primary">{t("paySettings")}</div>
        <label className="text-[11px] text-muted-foreground">Telebirr</label>
        <input value={pay.telebirr} onChange={(e) => setPay({ ...pay, telebirr: e.target.value })} className="w-full bg-background border rounded-md px-2 py-1.5 text-sm" />
        <label className="text-[11px] text-muted-foreground">CBE</label>
        <input value={pay.cbe} onChange={(e) => setPay({ ...pay, cbe: e.target.value })} className="w-full bg-background border rounded-md px-2 py-1.5 text-sm" />
        <button onClick={savePay} className="w-full bg-primary text-primary-foreground font-bold py-1.5 rounded-md text-sm">{t("save")}</button>
      </div>

      <div className="bg-card border rounded-md p-3 space-y-2">
        <div className="text-sm font-bold text-primary">{t("forceDraw")}</div>
        <input value={forced} onChange={(e) => setForced(e.target.value)} placeholder={t("forceHint")} className="w-full bg-background border rounded-md px-2 py-1.5 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={saveForce} className="bg-primary text-primary-foreground font-bold py-1.5 rounded-md text-sm">{t("forceSet")}</button>
          <button onClick={clearForce} className="bg-destructive text-destructive-foreground font-bold py-1.5 rounded-md text-sm">{t("forceClear")}</button>
        </div>
        <div className="text-xs text-muted-foreground pt-1">{t("nextWinners")}</div>
        {winners.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("noWinners")}</div>
        ) : (
          <div className="space-y-1">
            {winners.map((w, i) => (
              <div key={i} className="flex justify-between text-xs bg-secondary/40 rounded px-2 py-1">
                <span className="text-primary font-bold">{w.name}</span>
                <span>{w.hits} hits · BINGO</span>
              </div>
            ))}
          </div>
        )}
      </div>

      

      <div className="bg-card border rounded-md p-3 space-y-2">

        <div className="text-sm font-bold text-primary">Force Winner (by Player ID)</div>
        <div className="text-[11px] text-muted-foreground">
          Enter a player's profile ID, username, or sequence number. The next
          game will be biased so that player wins. Cleared automatically after the round.
        </div>
        <input
          value={forceWinner}
          onChange={(e) => setForceWinnerState(e.target.value)}
          placeholder="e.g. 1000137 or playerUsername"
          className="w-full bg-background border rounded-md px-2 py-1.5 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setForceWinner(forceWinner.trim());
              toast.success(forceWinner.trim() ? `Forced winner: ${forceWinner.trim()}` : "Cleared");
            }}
            className="bg-primary text-primary-foreground font-bold py-1.5 rounded-md text-sm"
          >Set</button>
          <button
            onClick={() => { clearForceWinner(); setForceWinnerState(""); toast.message("Cleared"); }}
            className="bg-destructive text-destructive-foreground font-bold py-1.5 rounded-md text-sm"
          >Clear</button>
        </div>
        {getForceWinner() && (
          <div className="text-[11px] text-primary pt-1">
            Active: <b>{getForceWinner()}</b>
          </div>
        )}
      </div>
      </>
      )}

      {adminTab === "players" && (
      <div className="bg-card border rounded-md p-3 space-y-2">
        <div className="text-sm font-bold text-primary">{t("players")} ({players.length})</div>
        <div className="grid grid-cols-[40px_1fr_auto_auto] gap-1 text-[10px] text-muted-foreground px-1">
          <span>ID</span><span>{t("username")} / {t("phone")}</span><span>{t("balance")}</span><span>{t("games")}</span>
        </div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {players.map((p) => (
            <div key={p.username} className="grid grid-cols-[40px_1fr_auto_auto] gap-1 text-xs bg-secondary/30 rounded px-2 py-1.5 items-center">
              <span className="text-primary font-bold">{p.seq ?? "-"}</span>
              <span><span className="font-bold">{p.username}</span><br/><span className="text-[10px] text-muted-foreground">{p.phone || "—"}</span></span>
              <span className="text-primary font-bold">{p.balance.toFixed(0)}</span>
              <span className="text-muted-foreground">{p.games ?? 0}</span>
            </div>
          ))}
          {players.length === 0 && <div className="text-center text-xs text-muted-foreground py-2">—</div>}
        </div>
      </div>
      )}
      {adminTab === "activity" && (
      <div className="bg-card border rounded-md p-3 space-y-1">
        <div className="text-sm font-bold text-primary">User Activity ({activities.length})</div>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {activities.map((a) => (
            <div key={a.id} className="text-[11px] bg-secondary/30 rounded px-2 py-1.5 flex justify-between gap-2">
              <span><b className="text-primary">{a.username}</b> · {a.type}{a.detail ? ` · ${a.detail}` : ""}</span>
              <span className="text-muted-foreground shrink-0">{new Date(a.at).toLocaleString()}</span>
            </div>
          ))}
          {activities.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">—</div>}
        </div>
      </div>
      )}

      {adminTab === "pending" && (
      <>
      <div className="text-xs text-muted-foreground px-1">{t("pending")}</div>
      {pending.length === 0 && <div className="text-center text-muted-foreground text-sm py-4">{t("nothingPending")}</div>}
      {pending.map((x) => (
        <div key={x.id} className="bg-card border rounded-md p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-bold">{x.username}</span>
            <span className="text-muted-foreground">{x.type === "deposit" ? `${t("deposit")} · ${x.method ?? ""}` : t("withdraw")}</span>
          </div>
          {x.phone && (
            <div className="text-xs text-primary flex items-center gap-1">
              <Phone size={12} /> {x.phone}
            </div>
          )}
          <div className="text-2xl font-bold text-primary">{x.amount} ETB</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => decide(x.id, "approved")} className="bg-primary text-primary-foreground font-bold py-2 rounded-md flex items-center justify-center gap-1">
              <Check size={16} /> {t("approve")}
            </button>
            <button onClick={() => decide(x.id, "rejected")} className="bg-destructive text-destructive-foreground font-bold py-2 rounded-md flex items-center justify-center gap-1">
              <X size={16} /> {t("reject")}
            </button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground px-1 pt-2">{t("history")}</div>
          {done.slice(0, 30).map((x) => (
            <div key={x.id} className="bg-card border rounded-md p-2 flex justify-between text-sm">
              <span>{x.username} · {x.type} · {x.amount}{x.phone ? ` · ${x.phone}` : ""}</span>
              <span className={x.status === "approved" ? "text-primary" : "text-destructive"}>{x.status}</span>
            </div>
          ))}
        </>
      )}
      </>
      )}
    </div>
  );
}

function AdminLivePlayers({ t }: { t: (k: Key) => string }) {
  const live = useLivePlayers();
  const sorted = useMemo(
    () => [...live].sort((a, b) => b.at - a.at),
    [live],
  );
  const byStake = useMemo(() => {
    const m = new Map<number, number>();
    sorted.forEach((p) => {
      if (!p.joined) return;
      m.set(p.stake, (m.get(p.stake) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [sorted]);
  return (
    <div className="bg-card border rounded-md p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-primary flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {t("livePlayers")} ({sorted.length})
        </div>
        <div className="text-[10px] text-muted-foreground">live · updates every 1s</div>
      </div>
      {byStake.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {byStake.map(([stake, count]) => (
            <span key={stake} className="text-[10px] bg-secondary/40 border border-border rounded px-2 py-0.5">
              ብር {stake}: <span className="text-primary font-bold">{count}</span>
            </span>
          ))}
        </div>
      )}
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {sorted.map((p) => {
          const age = Math.max(0, Math.floor((Date.now() - p.at) / 1000));
          return (
            <div key={p.username} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[11px] bg-secondary/30 rounded px-2 py-1.5 items-center">
              <span className="font-bold truncate">{p.username}</span>
              <span className={`tabular-nums font-semibold ${p.joined ? "text-primary" : "text-muted-foreground"}`}>
                ብር {p.stake}
                <span className="ml-1 text-[9px] font-normal uppercase tracking-wide opacity-70">
                  {p.joined ? "in" : "lobby"}
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums">G#{p.gameNo}</span>
              <span className="text-[9px] text-muted-foreground text-right tabular-nums w-8">{age}s</span>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">No live players yet</div>
        )}
      </div>
    </div>
  );
}



function HistoryView({ user, t }: { user: User; t: (k: Key) => string }) {
  const rounds = useMemo(() => getHistory().filter((r) => r.username === user.username), [user.username]);
  if (rounds.length === 0) return <div className="text-center text-muted-foreground text-sm py-6">—</div>;
  return (
    <div className="space-y-2">
      {rounds.map((r) => (
        <div key={r.id} className="bg-card border rounded-md p-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
            <span className={r.payout > 0 ? "text-primary font-bold" : "text-muted-foreground"}>
              {r.payout > 0 ? `+${r.payout}` : `-${r.bet}`} ETB
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.picks.map((n) => (
              <span key={n} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded ${r.drawn.includes(n) ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{n}</span>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground">Hits: {r.hits}/{r.picks.length} · Bet {r.bet}</div>
        </div>
      ))}
    </div>
  );
}

// =========== Chat Panel ===========
const BOT_LINES = [
  "ጥሩ ጨዋታ!", "good luck", "I'm in 🔥", "ይሄ ራውንድ ይዘጋል", "let's go",
  "ዛሬ የኔ ቀን ነው", "win win win", "ቆንጆ ቁጥሮች", "next round mine", "💰💰",
];
function ChatPanel({ user, t, onClose }: { user: User; t: (k: Key) => string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = () => setMsgs(getChat());

  useEffect(() => {
    refresh();
    // poll for new (cross-tab)
    const poll = setInterval(refresh, 1500);
    return () => { clearInterval(poll); };
  }, []);


  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs.length]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    addChat({ id: String(Date.now()), user: user.username, text: v, at: Date.now() });
    setText("");
    refresh();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-sm h-full bg-card border-l flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b">
          <div>
            <div className="font-bold">{t("chat")}</div>
            <div className="text-[11px] text-primary">1 {t("online")}</div>

          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground"><X size={20} /></button>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {msgs.length === 0 && <div className="text-xs text-muted-foreground text-center pt-6">—</div>}
          {msgs.map((m) => {
            const mine = m.user === user.username;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  {!mine && <div className="text-[10px] font-bold text-primary opacity-80">{m.user}</div>}
                  <div>{m.text}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-2 border-t flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("typeMsg")}
            className="flex-1 bg-background border rounded-md px-3 py-2 text-sm"
          />
          <button onClick={send} className="bg-primary text-primary-foreground px-3 rounded-md"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

// =========== Home view with PWA install ===========
function HomeView({ t, onPlay, onWallet, onNavigate, user, onChange }: { t: (k: Key) => string; onPlay: () => void; onWallet: () => void; onNavigate: (v: any) => void; user: User; onChange: () => void }) {
  const [code, setCode] = useState("");
  const tgChat = (user as any).telegramId as number | undefined;
  // Prefill coupon code from bot deep-link (?code=XYZ)
  useEffect(() => {
    try {
      const c = sessionStorage.getItem("fk_tg_code");
      if (c) { setCode(c); sessionStorage.removeItem("fk_tg_code"); }
    } catch {/* ignore */}
  }, []);
  const redeem = () => {
    if (!code.trim()) return;
    const r = redeemCoupon(code, user.username);
    if (r.ok) {
      toast.success(r.msg);
      const fresh = getCurrentUser();
      notifyTelegram({
        chatId: tgChat,
        text:
          `🎟️ <b>Coupon redeemed!</b>\nCode: <code>${code.toUpperCase()}</code>\n` +
          `Added: <b>+${r.amount} ETB</b>\n💰 New balance: <b>${fmtEtb(fresh?.balance ?? user.balance)}</b>`,
      });
      setCode(""); onChange();
    } else toast.error(r.msg);
  };
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", handler);
    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = async () => {
    if (!deferred) {
      toast.message("Use your browser's 'Add to Home Screen' option");
      return;
    }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="space-y-3 py-2">
      <div className="bg-card border rounded-lg p-5 text-center">
        <img src={logo} alt="Fast Keno" className="h-16 w-auto mx-auto mb-3" />
        <div className="text-lg font-bold text-primary">{t("appName")}</div>
        <div className="text-xs text-muted-foreground mt-1">{t("welcome")}</div>
      </div>
      <button onClick={install} disabled={installed} className="play-btn w-full py-3.5 rounded-md font-bold text-base flex items-center justify-center gap-2 disabled:opacity-70">
        <Download size={18} /> {installed ? t("installed") : t("install")}
      </button>
      <div className="bg-card border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><Gift size={16} /> {t("redeem")}</div>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("enterCode")} className="flex-1 bg-background border rounded-md px-3 py-2 text-sm tracking-wider font-bold" />
          <button onClick={redeem} className="bg-primary text-primary-foreground font-bold px-4 rounded-md text-sm">{t("submit")}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onPlay} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <span className="text-2xl">🏆</span>
          <div className="font-bold">{t("play")}</div>
        </button>
        <button onClick={() => onNavigate("me")} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <UserIcon className="text-primary" size={22} />
          <div className="font-bold">{t("profile")}</div>
        </button>
        <button onClick={onWallet} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <Wallet className="text-primary" size={22} />
          <div className="font-bold">{t("balance")}</div>
        </button>
        <button onClick={onWallet} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <Plus className="text-primary" size={22} />
          <div className="font-bold">{t("deposit")}</div>
        </button>
        <button onClick={onWallet} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <Minus className="text-primary" size={22} />
          <div className="font-bold">{t("withdraw")}</div>
        </button>
        <button onClick={() => onNavigate("invite")} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left hover:bg-primary/10 transition">
          <Share2 className="text-primary" size={22} />
          <div className="font-bold">{t("invite")}</div>
        </button>
        <button onClick={() => onNavigate("help")} className="bg-card border-2 border-primary/40 rounded-lg p-4 flex items-center gap-3 text-left col-span-2 hover:bg-primary/10 transition">
          <MessageCircle className="text-primary" size={22} />
          <div className="font-bold">Help</div>
        </button>
      </div>
    </div>
  );
}

function HelpView({ t: _t }: { t: (k: Key) => string }) {
  return (
    <div className="space-y-3 py-2">
      <div className="bg-card border rounded-lg p-4 space-y-2">
        <h2 className="text-lg font-bold text-primary">Help & Support</h2>
        <p className="text-sm text-muted-foreground">Welcome to Adey Bingo. Here's how to play and manage your account:</p>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li><b>Start a game:</b> Tap 🏆 at the bottom, pick a cartella number (1–75), set your bet, and press Play.</li>
          <li><b>Deposit:</b> Open Balance, choose Telebirr or CBE, send the amount, and submit your transaction reference. Admin approves it.</li>
          <li><b>Withdraw:</b> Open Balance, enter the amount and your phone, and submit. Admin processes the payout.</li>
          <li><b>Redeem coupon:</b> On Home, paste the code in the Redeem box.</li>
          <li><b>Invite friends:</b> Share your referral link from the Invite page to earn bonuses.</li>
          <li><b>Telegram:</b> Use the bot for quick deposit, withdraw, balance, and game updates.</li>
        </ul>
        <p className="text-xs text-muted-foreground pt-2">Need more help? Tap the chat icon in the header.</p>
      </div>
    </div>
  );
}


// =========== Results view ===========
function ResultsView({ t }: { t: (k: Key) => string }) {
  const rounds = useMemo(() => getHistory().slice(0, 50), []);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>{t("drawId")}</span>
        <span>{t("combination")}</span>
      </div>
      {rounds.length === 0 && <div className="text-center text-muted-foreground text-sm py-6">—</div>}
      {rounds.map((r, idx) => {
        const id = 254700 + idx;
        const time = new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return (
          <div key={r.id} className="bg-card border rounded-md p-2 flex gap-2 items-start">
            <div className="shrink-0 w-20">
              <div className="text-primary font-bold text-sm flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-primary/80 flex items-center justify-center">
                  <Check size={9} className="text-primary-foreground" strokeWidth={4} />
                </span>
                {id}
              </div>
              <div className="text-[11px] text-primary/80">{time}</div>
            </div>
            <div className="grid grid-cols-10 gap-0.5 flex-1">
              {r.drawn.map((n, i) => (
                <div key={i} className="aspect-square bg-secondary rounded text-[10px] flex items-center justify-center text-foreground">{n}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =========== Statistics view ===========
function StatsView({ t }: { t: (k: Key) => string }) {
  const counts = useMemo(() => {
    const rounds = getHistory().slice(0, 100);
    const c = new Array(81).fill(0) as number[];
    for (const r of rounds) for (const n of r.drawn) if (n >= 1 && n <= 80) c[n]++;
    // seed defaults so the page isn't empty
    if (rounds.length === 0) for (let i = 1; i <= 80; i++) c[i] = 18 + Math.floor(Math.random() * 12);
    return c;
  }, []);
  const max = Math.max(1, ...counts.slice(1));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-muted-foreground">{t("last100")}</span>
        <span className="text-primary">{t("sort")}</span>
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 80 }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex items-center gap-2 bg-card border rounded-md px-2 py-1.5">
            <div className="w-8 h-7 bg-secondary rounded text-xs font-bold flex items-center justify-center">{n}</div>
            <div className="flex-1 h-0.5 bg-secondary/50 relative">
              <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${(counts[n] / max) * 100}%` }} />
            </div>
            <div className="w-8 text-right text-sm text-muted-foreground">{counts[n]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========== Leaders view ===========
function LeadersView({ t }: { t: (k: Key) => string }) {
  const rows = useMemo(() => {
    const users = getUsers().filter((u) => !u.isAdmin);
    const live = users.map((u) => ({ name: u.username, games: u.games ?? 0, wins: (u.wins ?? 0) * 1000 }));
    const fakes = FAKE_NAMES.map((name, i) => ({ name, games: 700 + i * 50, wins: 30000 }));
    return [...live, ...fakes].sort((a, b) => b.wins - a.wins).slice(0, 20);
  }, []);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[40px_1fr_80px_90px] gap-2 px-2 text-xs text-muted-foreground">
        <span>{t("rank")}</span><span>{t("id")}</span><span className="text-center">{t("games")}</span><span className="text-right">{t("win")}</span>
      </div>
      {rows.map((r, i) => {
        const top = i < 3;
        return (
          <div key={i} className={`grid grid-cols-[40px_1fr_80px_90px] gap-2 items-center rounded-md border p-2 ${top ? "bg-primary/10 border-primary/30" : "bg-card"}`}>
            <span className={`font-bold ${top ? "text-yellow-400" : "text-muted-foreground"}`}>{i + 1}</span>
            <span className="text-primary font-semibold">{r.name}</span>
            <span className="text-center">{r.games}</span>
            <span className={`text-right font-bold ${top ? "text-yellow-400" : "text-primary"}`}>{r.wins}<span className="text-[10px] ml-0.5">ETB</span></span>
          </div>
        );
      })}
    </div>
  );
}

// =========== Me / Profile view ===========
function MeView({ user, t }: { user: User; t: (k: Key) => string }) {
  const withdrawable = user.firstDepositDone
    ? user.balance
    : Math.max(0, user.balance - SIGNUP_BONUS);
  const playBalance = user.balance;

  // Stable numeric user ID (never changes once assigned).
  const userId =
    (user as any).telegramId ||
    1000000 + ((user.seq ?? 1) * 137);

  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", handler);
    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);
  const install = async () => {
    if (!deferred) { toast.message("Use your browser's 'Add to Home Screen' option"); return; }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-lg p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 mx-auto flex items-center justify-center mb-2">
          <UserIcon size={32} className="text-primary" />
        </div>
        <div className="font-bold text-lg">{user.username}</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          ID: <span className="text-foreground font-semibold">{userId}</span>
        </div>
        {user.phone && <div className="text-xs text-muted-foreground mt-0.5">{user.phone}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border rounded-md p-3 text-center">
          <div className="text-xs text-muted-foreground">Withdrawable</div>
          <div className="text-xl font-bold text-primary">{withdrawable.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">ETB</div>
        </div>
        <div className="bg-card border rounded-md p-3 text-center">
          <div className="text-xs text-muted-foreground">Balance for play</div>
          <div className="text-xl font-bold text-primary">{playBalance.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">ETB</div>
        </div>
        <div className="bg-card border rounded-md p-3 text-center">
          <div className="text-xs text-muted-foreground">{t("myTickets")}</div>
          <div className="text-xl font-bold">{user.games ?? 0}</div>
        </div>
        <div className="bg-card border rounded-md p-3 text-center">
          <div className="text-xs text-muted-foreground">{t("myWins")}</div>
          <div className="text-xl font-bold text-primary">{user.wins ?? 0}</div>
        </div>
      </div>
      <button onClick={install} disabled={installed} className="play-btn w-full py-3.5 rounded-md font-bold text-base flex items-center justify-center gap-2 disabled:opacity-70">
        <Download size={18} /> {installed ? t("installed") : t("install")}
      </button>
    </div>
  );
}

// =========== Invite view ===========
function InviteView({ user, t }: { user: User; t: (k: Key) => string }) {
  const refCode = (user as any).refCode || user.username;
  const profileId = (user as any).telegramId || (1000000 + ((user.seq ?? 1) * 137));
  const url = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(refCode)}`;
  const msg = `${t("inviteMsg")} ${refCode}`;
  const share = () => {
    const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`;
    window.open(tg, "_blank");
  };
  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => toast.success("Copied"));
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-lg p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 mx-auto flex items-center justify-center mb-2">
          <Share2 size={28} className="text-primary" />
        </div>
        <div className="font-bold text-lg">{t("invite")}</div>
        <div className="text-xs text-muted-foreground mt-1">
          +{REFERRAL_SIGNUP_BONUS} ETB on signup · +{REFERRAL_DEPOSIT_BONUS} ETB on first deposit
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 space-y-2">
        <div className="text-[11px] text-muted-foreground">Your invite link</div>
        <div className="bg-background border rounded-md px-3 py-2 text-xs break-all">{url}</div>
        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            onClick={copy}
            className="bg-primary text-primary-foreground rounded-md w-12 h-12 text-sm font-bold"
            aria-label="Copy"
          >
            Copy
          </button>
          <button
            onClick={share}
            className="bg-transparent border-0 p-0"
            aria-label={t("send")}
          >
            <img src={telegramLogo} alt="Telegram" className="h-12 w-12" />
          </button>
        </div>
      </div>
      <div className="bg-card border rounded-md p-3 text-center">
        <div className="text-xs text-muted-foreground">Your referral code</div>
        <div className="text-2xl font-bold text-primary tracking-wider">{refCode}</div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Your ID: <span className="text-foreground font-semibold">{profileId}</span>
        </div>
      </div>

    </div>
  );
}

// =========== BINGO Grand Winner overlay ===========
function BingoWinnerOverlay({
  winner, t,
}: {
  winner: { name: string; cartella: number[]; drawn: number[]; bet: number; ticketId: number; patternLabel: string };
  t: (k: Key) => string;
}) {
  const drawnSet = new Set(winner.drawn);
  return (
    <div className="bingo-winner">
      <div className="grand-badge mb-4">{t("grandWinner")}</div>
      <div className="bingo-text mb-6">BINGO!</div>
      <div className="winner-card">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 px-1 mb-1">
          <span>{t("winningTicket")}</span>
          <span className="text-amber-600">#{winner.ticketId}</span>
        </div>
        <div className="bingo-col-head">
          {(["B","I","N","G","O"] as const).map((L) => (
            <div key={L} style={{ background: BINGO_COL_BG[L] }}>{L}</div>
          ))}
        </div>
        <div className="bingo-grid">
          {winner.cartella.map((n, i) => {
            const free = i === 12;
            const isHit = free || (n > 0 && drawnSet.has(n));
            return (
              <div key={i} className={`bingo-cell ${isHit ? "hit" : ""} ${free ? "free" : ""}`}>
                {free ? "★" : n || ""}
              </div>
            );
          })}
        </div>
        <div className="text-center text-[10px] font-bold text-amber-700 mt-1">
          Pattern: {winner.patternLabel}
        </div>
      </div>
      <div className="mt-6 text-center">
        <div className="text-amber-500 text-xs tracking-widest mb-1">አሸናፊው</div>
        <div className="text-white text-3xl font-black tracking-wider drop-shadow">{winner.name}</div>
        <div className="text-slate-400 text-xs mt-2 tracking-widest">{t("ticket")} #{winner.ticketId} · {winner.bet} ETB</div>
      </div>
    </div>
  );
}

