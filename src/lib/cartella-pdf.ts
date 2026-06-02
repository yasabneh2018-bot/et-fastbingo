// Opens a print-friendly window for a single 5x5 bingo cartella and triggers
// the browser "Save as PDF" dialog. No external dependency, works offline.
export function downloadCartellaPdf(opts: {
  cartella: number[];
  cartellaId: number | null;
  username: string;
  bet?: number;
  patternLabel?: string;
}) {
  const { cartella, cartellaId, username, bet, patternLabel } = opts;
  const cellHtml = cartella
    .map((n, i) => {
      const free = i === 12;
      return `<div class="c${free ? " free" : ""}">${free ? "★" : n || ""}</div>`;
    })
    .join("");
  const title = `Cartella #${cartellaId ?? "-"} — ${username}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  *{box-sizing:border-box;font-family:system-ui,Segoe UI,Roboto,sans-serif}
  body{margin:0;padding:24px;background:#fff;color:#0f172a}
  .wrap{max-width:380px;margin:0 auto;border:3px solid #f59e0b;border-radius:14px;padding:14px;background:#f8fafc}
  h1{font-size:18px;margin:0 0 4px;letter-spacing:.06em;color:#b45309;text-align:center}
  .sub{font-size:11px;color:#475569;text-align:center;margin-bottom:10px}
  .head{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:6px}
  .head>div{font-weight:900;color:#fff;text-align:center;padding:6px 0;border-radius:6px;font-size:18px}
  .head>div:nth-child(1){background:#1e63d6}
  .head>div:nth-child(2){background:#e02424}
  .head>div:nth-child(3){background:#374151}
  .head>div:nth-child(4){background:#16803c}
  .head>div:nth-child(5){background:#ef7c1f}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
  .c{aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #cbd5e1;border-radius:8px;font-weight:800;font-size:22px}
  .c.free{background:radial-gradient(circle at 30% 30%, #fde047, #d97706);color:#fff}
  .meta{margin-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#475569}
  @media print{ body{padding:0} .wrap{box-shadow:none} }
</style></head><body>
<div class="wrap">
  <h1>BINGO CARTELLA #${cartellaId ?? "-"}</h1>
  <div class="sub">Player: <b>${escapeHtml(username)}</b>${typeof bet === "number" ? ` · Bet ${bet} ETB` : ""}${patternLabel ? ` · ${escapeHtml(patternLabel)}` : ""}</div>
  <div class="head"><div>B</div><div>I</div><div>N</div><div>G</div><div>O</div></div>
  <div class="grid">${cellHtml}</div>
  <div class="meta"><span>Issued ${new Date().toLocaleString()}</span><span>Adey Bingo</span></div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},250);};</script>
</body></html>`;
  const w = window.open("", "_blank", "width=420,height=620");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}