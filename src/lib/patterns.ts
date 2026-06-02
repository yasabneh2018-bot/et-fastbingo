// Bingo patterns on a 5x5 card. '1' = required cell, '0' = not part of pattern.
// Center cell (index 12) is always FREE and considered marked.
// For dynamic categories like "any single line", we expand into multiple masks
// and the player wins if ANY one of them is satisfied.

export type PatternMask = number[]; // length 25, values 0/1

export type PatternDef = {
  id: string;
  label: string;
  category: "lines" | "letters" | "blocks" | "fun";
  // Either a single static mask, or a list of masks (player wins on any one).
  masks: PatternMask[];
  // Optional: require N of the masks to be completed (e.g. double line = 2).
  requiredCount?: number;
};

const G = (s: string): PatternMask =>
  s.replace(/\s+/g, "").split("").map((c) => (c === "1" ? 1 : 0));

// ---- Line helpers ----
const ROW = (r: number) => G(
  [0, 1, 2, 3, 4].map((rr) => "11111".split("").map(() => (rr === r ? "1" : "0")).join("")).join("")
);
const COL = (c: number) => G(
  Array(5).fill(0).map(() => [0, 1, 2, 3, 4].map((cc) => (cc === c ? "1" : "0")).join("")).join("")
);
const DIAG1 = G(
  "10000" +
  "01000" +
  "00100" +
  "00010" +
  "00001"
);
const DIAG2 = G(
  "00001" +
  "00010" +
  "00100" +
  "01000" +
  "10000"
);

const LINES: PatternMask[] = [
  ROW(0), ROW(1), ROW(2), ROW(3), ROW(4),
  COL(0), COL(1), COL(2), COL(3), COL(4),
  DIAG1, DIAG2,
];

// 2x2 postage stamp blocks (16 positions)
const STAMPS: PatternMask[] = (() => {
  const out: PatternMask[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const m = Array(25).fill(0);
      [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]].forEach(([rr, cc]) => {
        m[rr * 5 + cc] = 1;
      });
      out.push(m);
    }
  }
  return out;
})();

// 3x3 small square blocks (9 positions)
const SMALL_SQUARES: PatternMask[] = (() => {
  const out: PatternMask[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const m = Array(25).fill(0);
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) m[(r + dr) * 5 + (c + dc)] = 1;
      out.push(m);
    }
  }
  return out;
})();

const or = (...ms: PatternMask[]): PatternMask =>
  ms.reduce((a, m) => a.map((v, i) => (v || m[i] ? 1 : 0)), Array(25).fill(0) as PatternMask);

// ---- Transform helpers (rotate / flip / translate) ----
const rot90 = (m: PatternMask): PatternMask => {
  const out = Array(25).fill(0) as PatternMask;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[c * 5 + (4 - r)] = m[r * 5 + c];
  return out;
};
const flipH = (m: PatternMask): PatternMask => {
  const out = Array(25).fill(0) as PatternMask;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[r * 5 + (4 - c)] = m[r * 5 + c];
  return out;
};
const flipV = (m: PatternMask): PatternMask => {
  const out = Array(25).fill(0) as PatternMask;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) out[(4 - r) * 5 + c] = m[r * 5 + c];
  return out;
};
const maskKey = (m: PatternMask) => m.join("");
const uniq = (arr: PatternMask[]): PatternMask[] => {
  const seen = new Set<string>();
  const out: PatternMask[] = [];
  for (const m of arr) { const k = maskKey(m); if (!seen.has(k)) { seen.add(k); out.push(m); } }
  return out;
};
// All 8 orientations (4 rotations × optional horizontal flip).
const orientations = (m: PatternMask): PatternMask[] => {
  const r0 = m, r1 = rot90(r0), r2 = rot90(r1), r3 = rot90(r2);
  return uniq([r0, r1, r2, r3, flipH(r0), flipH(r1), flipH(r2), flipH(r3)]);
};
// All translations of a mask that fit inside the 5×5 grid.
const translations = (m: PatternMask): PatternMask[] => {
  // find bounding box
  let minR = 5, maxR = -1, minC = 5, maxC = -1;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (m[r * 5 + c]) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  if (maxR < 0) return [m];
  const out: PatternMask[] = [];
  for (let dr = -minR; dr + maxR <= 4; dr++) {
    for (let dc = -minC; dc + maxC <= 4; dc++) {
      const nm = Array(25).fill(0) as PatternMask;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        if (m[r * 5 + c]) nm[(r + dr) * 5 + (c + dc)] = 1;
      }
      out.push(nm);
    }
  }
  return uniq(out);
};
// All orientations × translations.
const variants = (m: PatternMask): PatternMask[] => {
  const all: PatternMask[] = [];
  for (const o of orientations(m)) all.push(...translations(o));
  return uniq(all);
};

export const PATTERNS: PatternDef[] = [
  // Lines — any single line wins
  { id: "single_line", label: "Single Line (Any)", category: "lines", masks: LINES },
  // Specific line positions (one mask each — must complete THAT exact line)
  { id: "line_top",     label: "Top Row",         category: "lines", masks: [ROW(0)] },
  { id: "line_upper",   label: "Upper Row",       category: "lines", masks: [ROW(1)] },
  { id: "line_middle",  label: "Middle Row",      category: "lines", masks: [ROW(2)] },
  { id: "line_lower",   label: "Lower Row",       category: "lines", masks: [ROW(3)] },
  { id: "line_bottom",  label: "Bottom Row",      category: "lines", masks: [ROW(4)] },
  { id: "line_left",    label: "Left Column",     category: "lines", masks: [COL(0)] },
  { id: "line_center_v",label: "Center Column",   category: "lines", masks: [COL(2)] },
  { id: "line_right",   label: "Right Column",    category: "lines", masks: [COL(4)] },
  { id: "line_diag_tl", label: "Diagonal ↘",      category: "lines", masks: [DIAG1] },
  { id: "line_diag_tr", label: "Diagonal ↙",      category: "lines", masks: [DIAG2] },

  { id: "double_line", label: "Double Line", category: "lines", masks: LINES, requiredCount: 2 },
  { id: "full_house", label: "Full House (Blackout)", category: "lines",
    masks: [G("11111 11111 11111 11111 11111")] },
  { id: "four_corners", label: "Four Corners", category: "lines",
    masks: [G("10001 00000 00000 00000 10001")] },
  { id: "postage_stamp", label: "Postage Stamp (2×2)", category: "lines", masks: STAMPS },
  { id: "center_cross", label: "Center Cross", category: "lines",
    masks: variants(or(ROW(2), COL(2))) },

  // Letters (all rotations/reflections + translations where they fit)
  { id: "x_pattern", label: "X Pattern", category: "letters",
    masks: [or(DIAG1, DIAG2)] },
  { id: "t_pattern", label: "T Pattern", category: "letters",
    masks: variants(or(ROW(0), COL(2))) },
  { id: "l_pattern", label: "L Pattern", category: "letters",
    masks: variants(or(COL(0), ROW(4))) },
  { id: "h_pattern", label: "H Pattern", category: "letters",
    masks: variants(or(COL(0), COL(4), ROW(2))) },
  { id: "u_pattern", label: "U Pattern", category: "letters",
    masks: variants(or(COL(0), COL(4), ROW(4))) },
  { id: "z_pattern", label: "Z Pattern", category: "letters",
    masks: variants(or(ROW(0), ROW(4), DIAG2)) },

  // Blocks
  { id: "small_square", label: "Small Square (3×3)", category: "blocks", masks: SMALL_SQUARES },
  { id: "large_square", label: "Large Square / Frame", category: "blocks",
    masks: [or(ROW(0), ROW(4), COL(0), COL(4))] },
  { id: "diamond", label: "Diamond", category: "blocks",
    masks: variants(G("00100 01010 10001 01010 00100")) },
  { id: "arrow", label: "Arrow", category: "blocks",
    masks: variants(G("00100 01110 11111 00100 00100")) },
  { id: "checkerboard", label: "Checkerboard", category: "blocks",
    masks: [G("10101 01010 10101 01010 10101"), G("01010 10101 01010 10101 01010")] },

  // Fun / specialty
  { id: "crazy_kite", label: "Crazy Kite", category: "fun",
    masks: variants(G("00100 01110 11111 00100 00100")) },
  { id: "pyramid", label: "Pyramid", category: "fun",
    masks: variants(G("00100 01110 11111 00000 00000")) },
  { id: "heart", label: "Heart", category: "fun",
    masks: orientations(G("01010 11111 11111 01110 00100")) },
  { id: "butterfly", label: "Butterfly", category: "fun",
    masks: orientations(G("10101 11111 00100 11111 10101")) },
  { id: "wine_glass", label: "Wine Glass", category: "fun",
    masks: orientations(G("11111 01110 00100 00100 01110")) },
  { id: "anchor", label: "Anchor", category: "fun",
    masks: orientations(G("00100 01010 00100 10101 01110")) },
  { id: "clock", label: "Clock", category: "fun",
    masks: [or(ROW(0), ROW(4), COL(0), COL(4), G("00000 00000 00100 00000 00000"))] },
  { id: "sputnik", label: "Sputnik", category: "fun",
    masks: [G("10101 01010 10101 01010 10101")] },
];

export function patternById(id: string): PatternDef {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

// Returns true if the daubed cells satisfy the pattern.
// `daubed` is a Set of indices the player has marked (always includes 12 FREE).
export function checkWin(p: PatternDef, daubed: Set<number>): boolean {
  const covers = (mask: PatternMask) =>
    mask.every((v, i) => v === 0 || daubed.has(i));
  const need = p.requiredCount ?? 1;
  let count = 0;
  for (const m of p.masks) {
    if (covers(m)) {
      count++;
      if (count >= need) return true;
    }
  }
  return false;
}

// Pretty preview grid for admin (use the first mask, or OR all if dynamic family).
export function previewMask(p: PatternDef): PatternMask {
  if (p.masks.length === 1) return p.masks[0];
  // For families (lines, stamps, small squares) show first variant.
  return p.masks[0];
}