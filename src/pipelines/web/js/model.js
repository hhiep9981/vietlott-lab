/* model.js — lotto game model shared by Suggest, Backtest and the ticket popup.
   Walk-forward state mirrors src/models/unseen_pool.py (frequency z, rules);
   strategies: hot, cold, random, pattern (learned composition profiles),
   weird (unusual shapes). Only 6/55, 6/45, 5/35. */
const RECENT_WINDOW = 150;
const PROFILE_WARMUP = 30;
const STRATEGIES = {
  hot: { label: "Nóng", desc: "Ưu tiên số về nhiều hơn kỳ vọng (tần suất cao)." },
  cold: { label: "Lạnh", desc: "Ưu tiên số về ít hơn kỳ vọng (tần suất thấp)." },
  random: { label: "Ngẫu nhiên", desc: "Mọi số có cơ hội như nhau — mốc so sánh chuẩn." },
  pattern: { label: "Pattern", desc: "Học từ lịch sử 'công thức' của bộ trúng (số nóng/lạnh/trung bình, số lặp kỳ trước, cặp liền nhau) rồi sinh vé theo công thức, tỷ lệ với tần suất xuất hiện của từng công thức." },
  weird: { label: "Mẫu lạ", desc: "Bộ số có hình dạng bất thường: cấp số cộng, chuỗi liên tiếp, cùng chữ số tận cùng, cùng nhóm, bội số, toàn chẵn/lẻ, tổng cực trị." },
};
const models = {};

function getModel(key) {
  if (models[key]) return models[key];
  const G = DATA.games[key];
  const H = G.history;
  const draws = H.main.map((m, i) => ({ date: H.dates[i], id: H.ids[i], main: m, special: H.special[i] > 0 ? H.special[i] : null }));
  const specialType = key === "power655" ? "bonus" : key === "power535" ? "separate" : null;
  const m = {
    key, name: G.meta.name, pool: G.meta.pool, pick: G.meta.drawn, specialType,
    specialPool: specialType === "separate" ? 12 : 0, draws, tiers: G.value.tiers,
  };
  m.prize = prizeTable(m);
  m.final = new LottoState(m);
  draws.forEach((d) => m.final.update(d));
  models[key] = m;
  return m;
}

/* prize[matches][specialHit ? 1 : 0] from the official tiers */
function prizeTable(m) {
  const t = Array.from({ length: m.pick + 1 }, () => [0, 0]);
  for (let k = 0; k <= m.pick; k++) for (const s of [false, true]) {
    const exact = m.tiers.find((x) => x.matches === k && x.special === s);
    const any = m.tiers.find((x) => x.matches === k && x.special === null);
    t[k][s ? 1 : 0] = (exact || any || { prize: 0 }).prize;
  }
  return t;
}
function scoreTicket(m, draw, ticket) {
  const set = new Set(draw.main);
  const matches = ticket.numbers.reduce((a, v) => a + (set.has(v) ? 1 : 0), 0);
  let sHit = false;
  if (m.specialType === "bonus") sHit = draw.special != null && ticket.numbers.includes(draw.special);
  else if (m.specialType === "separate") sHit = ticket.special === draw.special;
  return { matches, sHit, prize: m.prize[matches][sHit ? 1 : 0] };
}

/* ---------- walk-forward state ---------- */
class LottoState {
  constructor(m) {
    this.m = m;
    const N = m.pool;
    this.t = 0;
    this.countsAll = new Float64Array(N);
    this.countsRecent = new Float64Array(N);
    this.recent = [];
    this.last = null;
    this.history = new Set();
    this.maxGapHist = new Array(N + 1).fill(0);
    this.adjHist = new Array(m.pick + 1).fill(0);
    this.spCounts = new Float64Array(Math.max(m.specialPool, 1));
    this.spN = 0;
    this.profiles = new Map();
    this._cache = null;
  }
  update(d) {
    const N = this.m.pool;
    if (this.t >= PROFILE_WARMUP && this.last) {
      const k = profileOf(this, d.main).key;
      this.profiles.set(k, (this.profiles.get(k) || 0) + 1);
    }
    for (const v of d.main) { this.countsAll[v - 1]++; this.countsRecent[v - 1]++; }
    this.recent.push(d.main);
    if (this.recent.length > RECENT_WINDOW) for (const v of this.recent.shift()) this.countsRecent[v - 1]--;
    this.history.add(d.main.join("-"));
    const g = gapsOf(d.main);
    if (g.length) { this.maxGapHist[Math.min(Math.max(...g), N)]++; this.adjHist[Math.min(g.filter((x) => x === 1).length, this.m.pick)]++; }
    if (this.m.specialType === "separate" && d.special) { this.spCounts[d.special - 1]++; this.spN++; }
    this.last = d.main;
    this.t++;
    this._cache = null;
  }
  get cache() {
    if (this._cache) return this._cache;
    const N = this.m.pool, p = this.m.pick / N;
    const z = (counts, n) => Array.from(counts, (c) => (n ? (c - n * p) / Math.sqrt(n * p * (1 - p)) : 0));
    const za = z(this.countsAll, this.t), zr = z(this.countsRecent, this.recent.length);
    const freqZ = za.map((v, i) => 0.5 * (v + zr[i]));
    const order = freqZ.map((v, i) => [v, i + 1]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const third = Math.floor(N / 3);
    const cls = new Int8Array(N + 1);
    order.slice(0, third).forEach((v) => (cls[v] = 1));
    order.slice(N - third).forEach((v) => (cls[v] = -1));
    let spZ = null;
    if (this.m.specialType === "separate") {
      const q = 1 / this.m.specialPool, n = this.spN;
      spZ = Array.from(this.spCounts, (c) => (n ? (c - n * q) / Math.sqrt(n * q * (1 - q)) : 0));
    }
    const profiles = [...this.profiles.entries()].sort((a, b) => b[1] - a[1]);
    const profTotal = profiles.reduce((a, x) => a + x[1], 0);
    this._cache = { freqZ, zAll: za, zRecent: zr, cls, spZ, profiles, profTotal, rules: this.computeRules() };
    return this._cache;
  }
  computeRules() {
    const N = this.m.pool, k = this.m.pick;
    const mean = k * (N + 1) / 2, sd = Math.sqrt(k * (N - k) * (N + 1) / 12), zq = 1.2815516;
    const hg = (good) => Array.from({ length: k + 1 }, (_, i) => comb(good, i) * comb(N - good, k - i) / comb(N, k));
    const pctl = (hist, q, def) => {
      const tot = hist.reduce((a, b) => a + b, 0);
      if (tot < 30) return def;
      let c = 0;
      for (let i = 0; i < hist.length; i++) { c += hist[i]; if (c >= q * tot) return i; }
      return hist.length - 1;
    };
    return {
      sum_lo: mean - zq * sd, sum_hi: mean + zq * sd, sum_mean: mean, sum_sd: sd,
      odd_ok: centralValues(hg(Math.floor((N + 1) / 2))), low_ok: centralValues(hg(Math.floor(N / 2))),
      low_max: Math.floor(N / 2),
      max_gap: pctl(this.maxGapHist, 0.95, N), max_adjacent: pctl(this.adjHist, 0.9, k),
    };
  }
}
function centralValues(probs, mass = 0.8) {
  const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const out = [];
  let c = 0;
  for (const [p, i] of order) { out.push(i); c += p; if (c >= mass) break; }
  return out.sort((a, b) => a - b);
}
const gapsOf = (t) => t.slice(1).map((v, i) => v - t[i]);
const overlapCount = (a, b) => { const s = new Set(a); return b.reduce((x, v) => x + (s.has(v) ? 1 : 0), 0); };
function passesRules(t, R) {
  const sum = t.reduce((a, b) => a + b, 0);
  const odd = t.filter((v) => v % 2).length;
  const low = t.filter((v) => v <= R.low_max).length;
  const g = gapsOf(t);
  return sum >= R.sum_lo && sum <= R.sum_hi && R.odd_ok.includes(odd) && R.low_ok.includes(low)
    && Math.max(...g) <= R.max_gap && g.filter((x) => x === 1).length <= R.max_adjacent;
}
/* composition of a ticket relative to the state BEFORE it is drawn */
function profileOf(st, nums) {
  const { cls } = st.cache;
  let h = 0, c = 0, mid = 0;
  for (const v of nums) { if (cls[v] === 1) h++; else if (cls[v] === -1) c++; else mid++; }
  const r = st.last ? overlapCount(st.last, nums) : 0;
  const a = gapsOf(nums).filter((x) => x === 1).length;
  return { h, c, mid, r, a, key: `${h}|${c}|${mid}|${r}|${a}` };
}
const profileLabel = (p) => `${p.h} nóng · ${p.c} lạnh · ${p.mid} TB · ${p.r} lặp kỳ trước · ${p.a} cặp liền`;
function parseProfile(key) { const [h, c, mid, r, a] = key.split("|").map(Number); return { h, c, mid, r, a, key }; }

function modeWeights(z, mode) {
  return z.map((v) => (mode === "hot" ? Math.exp(v) : mode === "cold" ? Math.exp(-v) : Math.exp(-0.5 * v * v)));
}

/* ---------- candidates per strategy ---------- */
function patternCandidate(st, rng) {
  const C = st.cache;
  if (!C.profTotal) return { cand: sampleUniform(rng, range1(st.m.pool), st.m.pick).sort((a, b) => a - b), label: "Chưa đủ dữ liệu — ngẫu nhiên" };
  let r = rng() * C.profTotal, key = C.profiles[0][0];
  for (const [k, n] of C.profiles) { if (r < n) { key = k; break; } r -= n; }
  const p = parseProfile(key);
  const N = st.m.pool;
  const hot = [], cold = [], mid = [];
  for (let v = 1; v <= N; v++) (C.cls[v] === 1 ? hot : C.cls[v] === -1 ? cold : mid).push(v);
  if (p.h > hot.length || p.c > cold.length || p.mid > mid.length) return null;
  for (let i = 0; i < 300; i++) {
    const cand = [...sampleUniform(rng, hot, p.h), ...sampleUniform(rng, cold, p.c), ...sampleUniform(rng, mid, p.mid)].sort((a, b) => a - b);
    const q = profileOf(st, cand);
    if (q.r === p.r && q.a === p.a) return { cand, label: profileLabel(p) };
  }
  return null;
}
const range1 = (n) => Array.from({ length: n }, (_, i) => i + 1);

const WEIRD_TEMPLATES = [
  function ap(st, rng) {
    const { pool: N, pick: k } = st.m;
    const d = 1 + Math.floor(rng() * Math.floor((N - 1) / (k - 1)));
    const s = 1 + Math.floor(rng() * (N - (k - 1) * d));
    return { cand: range1(k).map((i) => s + (i - 1) * d), label: d === 1 ? `${k} số liên tiếp` : `Cấp số cộng, bước ${d}` };
  },
  function run(st, rng) {
    const { pool: N, pick: k } = st.m;
    const L = 4 + Math.floor(rng() * (k - 3));
    const s = 1 + Math.floor(rng() * (N - L + 1));
    const runNums = range1(L).map((i) => s + i - 1);
    const rest = range1(N).filter((v) => v < s - 1 || v > s + L);
    const extra = sampleUniform(rng, rest, k - L);
    return { cand: [...runNums, ...extra].sort((a, b) => a - b), label: `Chuỗi ${L} số liên tiếp` };
  },
  function digit(st, rng) {
    const { pool: N, pick: k } = st.m;
    const ok = range1(10).map((d) => d % 10).filter((d) => range1(N).filter((v) => v % 10 === d).length >= k);
    if (!ok.length) return null;
    const d = ok[Math.floor(rng() * ok.length)];
    return { cand: sampleUniform(rng, range1(N).filter((v) => v % 10 === d), k).sort((a, b) => a - b), label: `Cùng chữ số tận cùng ${d}` };
  },
  function decade(st, rng) {
    const { pool: N, pick: k } = st.m;
    const ok = [];
    for (let a = 0; a < N; a += 10) if (Math.min(a + 10, N) - a >= k) ok.push(a);
    if (!ok.length) return null;
    const a = ok[Math.floor(rng() * ok.length)];
    const nums = range1(Math.min(a + 10, N) - a).map((i) => a + i);
    return { cand: sampleUniform(rng, nums, k).sort((x, y) => x - y), label: `Cùng nhóm ${a + 1}–${Math.min(a + 10, N)}` };
  },
  function multiples(st, rng) {
    const { pool: N, pick: k } = st.m;
    const ms = [];
    for (let q = 3; q <= Math.floor(N / k); q++) ms.push(q);
    if (!ms.length) return null;
    const q = ms[Math.floor(rng() * ms.length)];
    return { cand: sampleUniform(rng, range1(Math.floor(N / q)).map((i) => i * q), k).sort((a, b) => a - b), label: `Toàn bội số của ${q}` };
  },
  function parity(st, rng) {
    const { pool: N, pick: k } = st.m;
    const odd = rng() < 0.5;
    return { cand: sampleUniform(rng, range1(N).filter((v) => v % 2 === (odd ? 1 : 0)), k).sort((a, b) => a - b), label: odd ? "Toàn số lẻ" : "Toàn số chẵn" };
  },
  function extremeSum(st, rng) {
    const { pool: N, pick: k } = st.m;
    const low = rng() < 0.5, span = 2 * k;
    const nums = low ? range1(span) : range1(span).map((i) => N - span + i);
    const cand = sampleUniform(rng, nums, k).sort((a, b) => a - b);
    return { cand, label: `Tổng cực ${low ? "thấp" : "cao"} (${cand.reduce((a, b) => a + b, 0)})` };
  },
  function repeatLast(st, rng) {
    const { pool: N, pick: k } = st.m;
    if (!st.last) return null;
    const keep = sampleUniform(rng, st.last, k - 1);
    const other = sampleUniform(rng, range1(N).filter((v) => !st.last.includes(v)), 1);
    return { cand: [...keep, ...other].sort((a, b) => a - b), label: `Giữ ${k - 1} số của kỳ trước` };
  },
];

/* n tickets for a strategy from a state; deterministic for a given rng */
function generate(st, strategy, rng, n, { filters = true } = {}) {
  const m = st.m, C = st.cache, R = C.rules;
  const out = [];
  let overlapMax = Math.floor(m.pick / 2);
  const weird = strategy === "weird" ? shuffle(rng, WEIRD_TEMPLATES) : null;
  const useFilters = filters && strategy !== "weird";
  const w = strategy === "hot" || strategy === "cold" ? modeWeights(C.freqZ, strategy) : null;
  for (let i = 0; i < n; i++) {
    let ticket = null;
    for (let tries = 0; !ticket; tries++) {
      if (tries === 3000) overlapMax++;
      if (tries > 20000) throw new Error("Không tìm được vé thỏa điều kiện");
      let res;
      if (strategy === "hot" || strategy === "cold") res = { cand: weightedPick(rng, w, m.pick), label: "" };
      else if (strategy === "random") res = { cand: sampleUniform(rng, range1(m.pool), m.pick).sort((a, b) => a - b), label: "" };
      else if (strategy === "pattern") res = patternCandidate(st, rng);
      else res = weird[(i + tries) % weird.length](st, rng);
      if (!res || !res.cand) continue;
      const cand = res.cand;
      if (st.history.has(cand.join("-"))) continue;
      if (useFilters && !passesRules(cand, R)) continue;
      if (out.some((o) => overlapCount(o.numbers, cand) > overlapMax)) continue;
      ticket = { numbers: cand, label: res.label };
    }
    if (m.specialType === "separate") {
      ticket.special = (strategy === "hot" || strategy === "cold") && C.spZ
        ? weightedPick(rng, modeWeights(C.spZ, strategy), 1)[0]
        : 1 + Math.floor(rng() * m.specialPool);
    }
    out.push(ticket);
  }
  return out;
}
