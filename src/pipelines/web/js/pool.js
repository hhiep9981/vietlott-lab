/* pool.js — mirrors src/models/pool_optimizer.py for the browser.
   Row t of the feature matrix uses only draws < t (row T = next draw); each
   feature is standardised across numbers. score = features · weights,
   pool = K highest scores (ties -> smaller number). */
const POOL_FEATURES = {
  freq_all: ["Tần suất toàn bộ", "Số lần về từ trước đến nay"],
  freq_10: ["Tần suất 10 kỳ", "Số lần về trong 10 kỳ gần nhất"],
  freq_30: ["Tần suất 30 kỳ", "Số lần về trong 30 kỳ gần nhất"],
  freq_100: ["Tần suất 100 kỳ", "Số lần về trong 100 kỳ gần nhất"],
  absence: ["Số kỳ đang vắng", "Bao nhiêu kỳ liên tiếp chưa về"],
  last: ["Về ở kỳ trước", "Có nằm trong kết quả kỳ ngay trước không"],
  pair: ["Đi cặp với kỳ trước", "Số lần từng về cùng các số của kỳ trước"],
  markov1: ["Markov bậc 1", "Số lần từng về ngay 1 kỳ sau các số của kỳ trước"],
  markov2: ["Markov bậc 2", "Số lần từng về 2 kỳ sau các số của kỳ cách đây 2 kỳ"],
};
const POOL_WINDOWS = [10, 30, 100];

/* Float64Array, index (t * N + i) * F + f */
function poolFeatures(m) {
  if (m.poolX) return m.poolX;
  const N = m.pool, T = m.draws.length, F = 1 + POOL_WINDOWS.length + 5;
  const X = new Float64Array((T + 1) * N * F);
  const cum = [new Float64Array(N)];
  const absence = new Float64Array(N), pair = new Float64Array(N), last = new Float64Array(N);
  const co = new Float64Array(N * N);
  // tr[lag][j * N + i]: times i was drawn `lag` draws after j
  const tr = { 1: new Float64Array(N * N), 2: new Float64Array(N * N) };
  const mk = { 1: new Float64Array(N), 2: new Float64Array(N) };
  const raw = Array.from({ length: F }, () => new Float64Array(N));
  for (let t = 0; t <= T; t++) {
    if (t > 0) {
      const prev = m.draws[t - 1].main;
      const c = Float64Array.from(cum[t - 1]);
      prev.forEach((v) => c[v - 1]++);
      cum.push(c);
      const inPrev = new Uint8Array(N);
      prev.forEach((v) => (inPrev[v - 1] = 1));
      for (let i = 0; i < N; i++) {
        absence[i] = inPrev[i] ? 0 : absence[i] + 1;
        last[i] = inPrev[i];
        let s = 0;
        for (const v of prev) s += co[i * N + v - 1];
        pair[i] = s;
      }
      for (const a of prev) for (const b of prev) if (a !== b) co[(a - 1) * N + b - 1]++;
      for (const lag of [1, 2]) {
        if (t - 1 - lag >= 0) for (const a of m.draws[t - 1 - lag].main) for (const b of prev) tr[lag][(a - 1) * N + b - 1]++;
        if (t - lag >= 0) {
          const src = m.draws[t - lag].main;
          for (let i = 0; i < N; i++) { let s = 0; for (const a of src) s += tr[lag][(a - 1) * N + i]; mk[lag][i] = s; }
        }
      }
    }
    raw[0] = cum[t];
    POOL_WINDOWS.forEach((w, j) => {
      const from = cum[Math.max(t - w, 0)];
      for (let i = 0; i < N; i++) raw[1 + j][i] = cum[t][i] - from[i];
    });
    raw[F - 5] = absence; raw[F - 4] = last; raw[F - 3] = pair; raw[F - 2] = mk[1]; raw[F - 1] = mk[2];
    for (let f = 0; f < F; f++) {
      const r = raw[f];
      let mu = 0;
      for (let i = 0; i < N; i++) mu += r[i];
      mu /= N;
      let v = 0;
      for (let i = 0; i < N; i++) v += (r[i] - mu) ** 2;
      const sd = Math.sqrt(v / N);
      for (let i = 0; i < N; i++) X[(t * N + i) * F + f] = sd > 0 ? (r[i] - mu) / sd : 0;
    }
  }
  m.poolX = X;
  m.poolF = F;
  return X;
}

function poolScores(m, t, w) {
  const X = poolFeatures(m), N = m.pool, F = m.poolF;
  return Array.from({ length: N }, (_, i) => {
    let s = 0;
    for (let f = 0; f < F; f++) s += X[(t * N + i) * F + f] * w[f];
    return s;
  });
}
/* 1-based numbers of the K-number pool for draw t (sorted ascending) */
function poolAt(m, t, w, K) {
  const s = poolScores(m, t, w);
  return s.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, K).map((x) => x[1] + 1).sort((a, b) => a - b);
}
/* walk-forward: pool for each draw t in [start, T) and its hits */
function poolBacktest(m, w, K, start) {
  const out = [];
  for (let t = start; t < m.draws.length; t++) {
    const pool = poolAt(m, t, w, K), set = new Set(m.draws[t].main);
    out.push({ t, pool, hits: pool.reduce((a, v) => a + (set.has(v) ? 1 : 0), 0) });
  }
  return out;
}
const poolExpected = (m, K) => K * m.pick / m.pool;
/* lift of mean hits vs a random pool of K; normal-approx CI and p */
function poolLift(hits, e) {
  const n = hits.length, mean = hits.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(hits.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n), L = (v) => (v / e - 1) * 100;
  return { mean, lift: L(mean), lo: L(mean - 1.96 * se), hi: L(mean + 1.96 * se), p: se > 0 ? 2 * normSf(Math.abs(mean - e) / se) : 1, n };
}
function poolVerdict(lo, hi) {
  if (lo > 0) return `<span class="verdict bad">Hơn ngẫu nhiên có ý nghĩa ở mức 95%</span> — hãy thử lại trên giai đoạn khác trước khi tin: thử nhiều cấu hình thì khoảng 1/20 sẽ "có ý nghĩa" do may rủi.`;
  if (hi < 0) return `<span class="verdict bad">Kém hơn ngẫu nhiên có ý nghĩa ở mức 95%</span> — dấu hiệu quá khớp (overfitting) hoặc may rủi.`;
  return `<span class="verdict ok">Không khác ngẫu nhiên</span> — khoảng tin cậy 95% của lift chứa 0.`;
}
/* horizontal diverging bars of feature weights */
function weightsChart(id, w) {
  const names = Object.values(POOL_FEATURES).map((x) => x[0]);
  const lim = Math.max(0.5, ...w.map(Math.abs));
  mk(id, {
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: axis({ type: "value", min: -lim, max: lim, axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v, 1) } }),
    yAxis: axis({ type: "category", data: names, inverse: true, splitLine: { show: false } }),
    tooltip: { formatter: (p) => `${p[0].name}: ${sign(p[0].value)}<br><span style="color:${css("--muted")}">${p[0].value > 0 ? "ưu tiên số có giá trị cao" : p[0].value < 0 ? "ưu tiên số có giá trị thấp" : "không dùng"}</span>` },
    series: [{
      type: "bar", barWidth: "55%",
      data: w.map((v) => ({ value: v, itemStyle: { color: css(v >= 0 ? "--series-1" : "--series-2"), borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      label: { show: true, position: "right", formatter: (p) => sign(p.value), color: css("--ink-2"), fontSize: 11 },
    }],
  });
}
/* cumulative (hits − expected) with an optional split marker */
function excessChart(id, dates, hits, e, splitIdx = null) {
  let c = 0;
  const y = hits.map((h) => +(c += h - e).toFixed(3));
  const s = {
    type: "line", data: y, showSymbol: false, lineStyle: { width: 2, color: css("--series-1") }, itemStyle: { color: css("--series-1") },
    markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ref"), width: 1.5 }, label: { color: css("--ink-2"), fontSize: 11 }, data: [{ yAxis: 0, label: { formatter: "Ngẫu nhiên", position: "insideEndTop" } }] },
  };
  if (splitIdx != null) {
    s.markLine.data.push({ xAxis: splitIdx, label: { formatter: "Bắt đầu kiểm tra", position: "insideEndTop" }, lineStyle: { type: "dashed", color: css("--ref") } });
    s.markArea = { silent: true, itemStyle: { color: css("--grid"), opacity: 0.5 }, data: [[{ xAxis: splitIdx }, { xAxis: dates.length - 1 }]] };
  }
  mk(id, {
    grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
    tooltip: { axisPointer: { type: "line", lineStyle: { color: css("--axis") } }, formatter: (p) => `${p[0].axisValue}<br>Trúng ${hits[p[0].dataIndex]} số · cộng dồn ${sign(p[0].value, 1)} so với ngẫu nhiên` },
    xAxis: axis({ type: "category", data: dates, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true } }),
    yAxis: axis({ type: "value", name: "Số trúng dư", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v) } }),
    series: [s],
  });
}

/* Pool in force before each draw t >= warmup: the published one from the
   pool log when available, else reconstructed with the train-only weights
   (P.chosen). ranks = score rank (1 = best) of each winning number. */
function poolHistory(m, P) {
  if (m.poolHist) return m.poolHist;
  const logged = new Map((P.log || []).map((r) => [r.after_id, r]));
  const split = P.warmup + P.split_index;
  const rows = [];
  for (let t = P.warmup; t < m.draws.length; t++) {
    const L = logged.get(m.draws[t - 1].id);
    const w = L ? L.weights : P.chosen.weights, K = L ? L.k : P.chosen.k;
    const s = poolScores(m, t, w);
    const order = s.map((v, i) => [v, i + 1]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
    const rank = new Map(order.map((v, i) => [v, i + 1]));
    const pool = L ? L.pool : order.slice(0, K).sort((a, b) => a - b);
    const inPool = new Set(pool), main = m.draws[t].main;
    rows.push({
      t, K, pool, source: L ? "log" : t < split ? "train" : "test",
      hits: main.filter((v) => inPool.has(v)).length, ranks: main.map((v) => rank.get(v)),
    });
  }
  m.poolHist = rows;
  return rows;
}
const POOL_SOURCE = {
  log: ["đã công bố", "Pool thật sự hiển thị trên trang trước kỳ quay (nhật ký pool)."],
  test: ["tái dựng", "Tính lại bằng trọng số chỉ dò trên dữ liệu trước giai đoạn kiểm tra."],
  train: ["tái dựng · trong giai đoạn dò", "Kỳ này nằm trong dữ liệu đã dùng để dò trọng số — kết quả bị thổi phồng."],
};
