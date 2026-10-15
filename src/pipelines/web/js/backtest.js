/* backtest.js — interactive pool backtest: pick K and feature weights, see
   how many winning numbers the pool would have caught, draw by draw
   (walk-forward, see pool.js), versus a random pool of the same size. */
const BT_PRESETS = {
  chosen: "Tối ưu (đã kiểm tra)",
  final: "Pool kỳ tới",
  hot: "Nóng 30 kỳ",
  cold: "Lạnh 30 kỳ",
  absent: "Vắng lâu",
  repeat: "Lặp kỳ trước",
};

function presetWeights(P, name) {
  const w = P.features.map(() => 0), at = (k) => P.features.indexOf(k);
  if (name === "chosen") return { w: P.chosen.weights.slice(), k: P.chosen.k };
  if (name === "final") return { w: P.final.weights.slice(), k: P.final.k };
  if (name === "hot") w[at("freq_30")] = 1;
  if (name === "cold") w[at("freq_30")] = -1;
  if (name === "absent") w[at("absence")] = 1;
  if (name === "repeat") w[at("last")] = 1;
  return { w, k: null };
}

function renderBacktest(key) {
  if (!LOTTO.includes(key)) {
    document.getElementById("app").innerHTML = `<h2>Backtest</h2><p class="lede">Backtest pool chỉ hỗ trợ Power 6/55, Mega 6/45 và Lotto 5/35. Kết quả backtest Keno có ở mục Phân tích.</p>`;
    return;
  }
  const G = DATA.games[key], P = G.pool, m = getModel(key);
  const nD = m.draws.length, maxEval = nD - P.warmup;
  document.getElementById("app").innerHTML = `
  <h2>Backtest pool</h2>
  <p class="lede">Tự chọn kích thước pool và trọng số từng yếu tố, rồi xem pool đó lẽ ra đã chứa bao nhiêu số trúng ở mỗi kỳ. Mỗi kỳ chỉ dùng dữ liệu <i>trước</i> kỳ đó; so với pool chọn ngẫu nhiên cùng kích thước. Kết quả cập nhật ngay khi thay đổi.</p>
  <div class="card">
    <div class="controls" style="margin:0 0 8px">
      <label>Kích thước pool <select id="bt-k">${range1(m.pool - m.pick - 1).map((i) => i + m.pick).map((k) => `<option value="${k}">${k} số</option>`).join("")}</select></label>
      <label>Giai đoạn <select id="bt-p">
        <option value="100">100 kỳ gần nhất</option><option value="300">300 kỳ gần nhất</option>
        <option value="test" selected>Giai đoạn kiểm tra (từ ${P.split_date})</option><option value="all">Toàn bộ (${fmt(maxEval)} kỳ)</option></select></label>
    </div>
    <div class="controls" style="margin:0 0 10px">${Object.entries(BT_PRESETS).map(([k, l]) => `<button class="ghost" type="button" data-preset="${k}">${l}</button>`).join("")}</div>
    <div class="wgrid">${P.features.map((f, j) => `<label title="${esc(POOL_FEATURES[f][1])}"><span>${POOL_FEATURES[f][0]}</span>
      <input type="range" min="-1" max="1" step="0.05" value="0" data-f="${j}"><output data-o="${j}">0</output></label>`).join("")}</div>
    <p class="sub" id="bt-msg" style="margin-top:8px"></p>
  </div>
  <div id="bt-out"></div>`;

  const kSel = document.getElementById("bt-k"), pSel = document.getElementById("bt-p");
  const sliders = [...document.querySelectorAll(".wgrid input")];
  // presets keep their exact weights; sliders (step 0.05) only show them
  let exact = null;
  const setWeights = (w) => { exact = w.slice(); sliders.forEach((s, j) => { s.value = String(w[j]); }); };
  const read = () => exact || sliders.map((s) => Number(s.value));
  let preset = "chosen";
  const run = () => {
    const w = read();
    sliders.forEach((s, j) => (document.querySelector(`[data-o="${j}"]`).textContent = sign(w[j])));
    const K = Number(kSel.value), p = pSel.value;
    const start = p === "all" ? P.warmup : p === "test" ? P.warmup + P.split_index : nD - Number(p);
    const t0 = performance.now();
    const res = poolBacktest(m, w, K, start);
    const zero = w.every((v) => v === 0);
    document.getElementById("bt-msg").innerHTML = `${fmt(res.length)} kỳ (${m.draws[start].date} → ${m.draws[nD - 1].date}) · ${fmt(performance.now() - t0, 0)} ms${zero ? ' · <span class="err">Mọi trọng số bằng 0: pool luôn là các số nhỏ nhất.</span>' : ""}${preset === "final" ? ' · <span class="err">Trọng số này đã được dò trên chính các kỳ đang chấm, nên kết quả bị thổi phồng (quá khớp).</span>' : ""}`;
    renderBacktestResults(m, K, res);
  };
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
  sliders.forEach((s) => s.addEventListener("input", () => { preset = null; exact = null; later(); }));
  kSel.addEventListener("change", run);
  pSel.addEventListener("change", run);
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const { w, k } = presetWeights(P, b.dataset.preset);
    preset = b.dataset.preset;
    setWeights(w);
    if (k) kSel.value = String(k);
    run();
  }));
  const { w, k } = presetWeights(P, "chosen");
  setWeights(w);
  kSel.value = String(k);
  run();
}

function renderBacktestResults(m, K, res) {
  const e = poolExpected(m, K), hits = res.map((r) => r.hits), L = poolLift(hits, e);
  const dist = new Array(m.pick + 1).fill(0);
  hits.forEach((h) => dist[h]++);
  const expDist = range1(m.pick + 1).map((x) => x - 1).map((h) => res.length * comb(m.pick, h) * comb(m.pool - m.pick, K - h) / comb(m.pool, K));
  const full = hits.filter((h) => h === m.pick).length;
  const recent = res.slice(-12).reverse();
  document.getElementById("bt-out").innerHTML = `
  <div class="grid tiles" style="margin-top:16px">
    ${tile("Số trúng TB / kỳ", fmt(L.mean, 3), `Pool ngẫu nhiên ${K} số: ${fmt(e, 3)}`)}
    ${tile("Lift", `${sign(L.lift, 1)}%`, `CI 95%: ${sign(L.lo, 1)} … ${sign(L.hi, 1)} · p = ${pval(L.p)}`)}
    ${tile(`Kỳ pool chứa đủ ${m.pick} số`, fmt(full), `Kỳ vọng ngẫu nhiên: ${fmt(expDist[m.pick], 1)}`)}
    ${tile("Chi phí bao / kỳ", vnd(comb(K, m.pick) * 10000), `${fmt(comb(K, m.pick))} vé ${m.pick} số`)}
  </div>
  <p style="margin:12px 0 0">${poolVerdict(L.lo, L.hi)}</p>
  <div class="grid" style="margin-top:16px">
    <div class="card wide"><h3>Số trúng dư so với ngẫu nhiên, cộng dồn</h3><p class="sub">Đi lên = pool chứa nhiều số trúng hơn pool ngẫu nhiên. Dao động lên xuống quanh 0 là bình thường với dữ liệu ngẫu nhiên.</p>
      <div id="bt-cum" class="chart"></div></div>
    <div class="card"><h3>Số trúng mỗi kỳ</h3><p class="sub">So với phân phối siêu bội.</p>${legendInline("Pool", "Kỳ vọng nếu ngẫu nhiên")}<div id="bt-dist" class="chart"></div></div>
    <div class="card scroll"><h3>12 kỳ gần nhất</h3><p class="sub">Pool tại thời điểm trước kỳ quay; số tô xanh là số trúng.</p>
      <table><tbody>${recent.map((r) => `<tr><td class="muted">${m.draws[r.t].date}</td><td>${ballsHtml(r.pool, null, { hits: new Set(m.draws[r.t].main), click: false })}</td><td class="num">${r.hits}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
  excessChart("bt-cum", res.map((r) => m.draws[r.t].date), hits, e);
  obsVsExp("bt-dist", range1(m.pick + 1).map((x) => x - 1), dist, expDist, { xName: "Số trúng trong pool", obsName: "Pool" });
}
