/* core.js — shared helpers: formatting, charts, storage, seeded RNG, maths. */
const ORDER = ["power655", "power645", "power535", "keno"];
const LOTTO = ["power655", "power645", "power535"];
const charts = [];

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (x, d = 0) => x == null || Number.isNaN(x) ? "–" : Number(x).toLocaleString("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x, d = 1) => x == null ? "–" : fmt(x * 100, d) + "%";
const sign = (v, d = 2) => (v >= 0 ? "+" : "") + fmt(v, d);
const vnd = (x) => {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e9) return s + fmt(a / 1e9, a % 1e9 ? 1 : 0) + " tỷ";
  if (a >= 1e6) return s + fmt(a / 1e6, a % 1e6 ? 1 : 0) + " triệu";
  return s + fmt(a) + "đ";
};
const pval = (p) => p < 0.001 ? "<0,001" : fmt(p, 3);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");

/* ---------- charts ---------- */
function baseOption() {
  return {
    animation: false,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: css("--ink-2") },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", confine: true,
      backgroundColor: css("--surface"), borderColor: css("--border"),
      textStyle: { color: css("--ink"), fontSize: 12 },
      axisPointer: { type: "shadow", shadowStyle: { color: css("--grid"), opacity: 0.5 } },
    },
  };
}
function axis(extra = {}) {
  return Object.assign({
    axisLine: { lineStyle: { color: css("--axis") } },
    axisTick: { show: false },
    axisLabel: { color: css("--muted"), fontSize: 11 },
    splitLine: { lineStyle: { color: css("--grid"), width: 1 } },
    nameTextStyle: { color: css("--muted"), fontSize: 11 },
  }, extra);
}
function disposeChart(id) {
  const i = charts.findIndex((c) => c.getDom().id === id);
  if (i >= 0) charts.splice(i, 1)[0].dispose();
}
function mk(id, option) {
  const el = document.getElementById(id);
  if (!el) return null;
  disposeChart(id);
  const c = echarts.init(el, null, { renderer: "svg" });
  const base = baseOption();
  c.setOption(Object.assign(base, option, { tooltip: Object.assign(base.tooltip, option.tooltip || {}) }));
  charts.push(c);
  return c;
}
function disposeAll() { charts.splice(0).forEach((c) => c.dispose()); }
const barStyle = (color = "--series-1") => ({ color: css(color), borderRadius: [4, 4, 0, 0] });
const refLine = (value, label) => ({
  silent: true, symbol: "none",
  lineStyle: { color: css("--ref"), type: "solid", width: 1.5 },
  label: { formatter: label, color: css("--ink-2"), fontSize: 11, position: "insideEndTop" },
  data: [{ yAxis: value }],
});

/* bar of observed counts with scalar or per-category expected */
function obsVsExp(id, cats, obs, exp, opts = {}) {
  const series = [{
    name: opts.obsName || "Quan sát", type: "bar", data: obs, barCategoryGap: "20%",
    itemStyle: barStyle(),
  }];
  if (Array.isArray(exp)) {
    series.push({
      name: "Kỳ vọng (ngẫu nhiên)", type: "line", data: exp, symbol: "circle", symbolSize: 8,
      lineStyle: { color: css("--ref"), width: 2 }, itemStyle: { color: css("--ref"), borderColor: css("--surface"), borderWidth: 2 },
    });
  } else if (exp != null) {
    series[0].markLine = refLine(exp, "Kỳ vọng " + fmt(exp, 1));
  }
  return mk(id, {
    xAxis: axis({ type: "category", data: cats, name: opts.xName, nameLocation: "middle", nameGap: 26, splitLine: { show: false } }),
    yAxis: axis({ type: "value", name: opts.yName, min: opts.yMin }),
    series,
    tooltip: opts.tooltip || {},
  });
}
function divergingMap(min, max, dim) {
  return {
    min, max, calculable: false, orient: "horizontal", left: "center", bottom: 0,
    dimension: dim, itemWidth: 12, itemHeight: 160,
    textStyle: { color: css("--muted"), fontSize: 11 },
    inRange: { color: [css("--div-neg-2"), css("--div-neg-1"), css("--div-mid"), css("--div-pos-1"), css("--div-pos-2")] },
  };
}

/* ---------- html snippets ---------- */
function tile(label, value, note) {
  return `<div class="card tile"><div class="label">${label}</div><div class="value">${value}</div>${note ? `<div class="note">${note}</div>` : ""}</div>`;
}
function card(id, title, sub, cls = "", controls = "") {
  return `<div class="card ${cls}"><div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub" id="${id}-sub">${sub}</p>` : ""}</div>${controls}</div><div id="${id}" class="chart ${cls.includes("sq") ? "sq" : ""} ${cls.includes("tall") ? "tall" : ""}"></div></div>`;
}
const legendInline = (obsLabel = "Quan sát", expLabel = "Kỳ vọng nếu ngẫu nhiên") =>
  `<div class="legend-inline"><span><span class="sw" style="background:var(--series-1)"></span>${obsLabel}</span><span><span class="sw line" style="background:var(--ref)"></span>${expLabel}</span></div>`;
function seg(id, options, active) {
  return `<div class="seg" id="${id}">${options.map(([v, label]) => `<button data-v="${v}" aria-pressed="${v === active}">${label}</button>`).join("")}</div>`;
}
function bindSeg(id, onChange) {
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onChange(b.dataset.v);
  }));
}
/* clickable ball group: opens the ticket popup */
function ballsHtml(nums, special = null, { hits = null, small = true, click = true, ctx = null } = {}) {
  const cls = small ? "ball sm" : "ball";
  const inner = nums.map((n) => `<span class="${cls}${hits && hits.has(n) ? " hit" : ""}">${pad2(n)}</span>`).join("")
    + (special ? `<span class="${cls} sp" title="Số đặc biệt">${pad2(special)}</span>` : "");
  const attrs = `data-ticket="${nums.join("-")}"${special ? ` data-sp="${special}"` : ""}${ctx ? ` data-date="${ctx.date}" data-id="${ctx.id}"` : ""}`;
  return click
    ? `<div class="balls" ${attrs} title="Bấm để phân tích bộ số" role="button" tabindex="0">${inner}</div>`
    : `<div class="balls">${inner}</div>`;
}

/* ---------- storage (localStorage with in-memory fallback) ---------- */
const memStore = {};
function store(k, v) {
  if (v === undefined) {
    try { const x = localStorage.getItem(k); if (x !== null) return x; } catch (e) {}
    return memStore[k] ?? null;
  }
  memStore[k] = v;
  try { localStorage.setItem(k, v); } catch (e) {}
  return null;
}
function deviceId() {
  let id = store("vl-device");
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint32Array(2)), (x) => x.toString(16).padStart(8, "0")).join("");
    store("vl-device", id);
  }
  return id;
}
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/* ---------- seeded RNG ---------- */
function hash32(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seededRng = (seed) => mulberry32(hash32(String(seed)));
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* k distinct items from `items` (default 1..n) uniformly */
function sampleUniform(rng, items, k) { return shuffle(rng, items).slice(0, k); }
/* k distinct indices 1..w.length, prop. to weights (successive draws) */
function weightedPick(rng, w, k) {
  const ws = w.slice();
  let total = ws.reduce((a, b) => a + b, 0);
  const out = [];
  while (out.length < k) {
    let r = rng() * total, i = 0;
    while (i < ws.length - 1 && r >= ws[i]) { r -= ws[i]; i++; }
    if (ws[i] <= 0) { i = ws.findIndex((v) => v > 0); }
    out.push(i + 1); total -= ws[i]; ws[i] = 0;
  }
  return out.sort((a, b) => a - b);
}

/* ---------- maths ---------- */
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
const hypergeom = (pool, drawn, pick, m) => comb(drawn, m) * comb(pool - drawn, pick - m) / comb(pool, pick);
const normSf = (z) => 0.5 * erfc(z / Math.SQRT2);
function erfc(x) { // Numerical Recipes erfcc
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
