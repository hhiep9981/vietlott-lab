/* backtest.js — interactive walk-forward backtest in the browser.
   For each evaluated draw t: state = draws < t, generate tickets, score
   against draw t. Strategy and Random run side by side on the same draws. */
let btJob = null;
/* yield to the UI between chunks; MessageChannel is not throttled like timers
   in background tabs */
const btChannel = new MessageChannel();
let btNext = null;
btChannel.port1.onmessage = () => { const f = btNext; btNext = null; if (f) f(); };
const yieldThen = (fn) => { btNext = fn; btChannel.port2.postMessage(0); };

function renderBacktest(key) {
  if (!LOTTO.includes(key)) {
    document.getElementById("app").innerHTML = `<h2>Backtest</h2><p class="lede">Công cụ backtest chỉ hỗ trợ Power 6/55, Mega 6/45 và Lotto 5/35. Kết quả backtest Keno có ở mục Phân tích.</p>`;
    return;
  }
  const m = getModel(key);
  const nD = m.draws.length;
  document.getElementById("app").innerHTML = `
  <h2>Backtest chiến lược</h2>
  <p class="lede">Giả lập mua vé theo một chiến lược qua các kỳ đã quay. Mỗi kỳ chỉ dùng dữ liệu <i>trước</i> kỳ đó (walk-forward), rồi so với chọn ngẫu nhiên trên cùng các kỳ. Jackpot tính ở mức tối thiểu, giá vé 10.000đ.</p>
  <div class="card">
    <form class="controls" id="bt-form" style="margin:0">
      <label>Chiến lược <select id="bt-s">${Object.entries(STRATEGIES).filter(([k]) => k !== "random").map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("")}</select></label>
      <label>Vé mỗi kỳ <input type="number" id="bt-n" min="1" max="50" value="10"></label>
      <label>Giai đoạn <select id="bt-p">
        <option value="100">100 kỳ gần nhất</option><option value="300" selected>300 kỳ gần nhất</option>
        <option value="500">500 kỳ gần nhất</option><option value="all">Toàn bộ (${fmt(nD - 100)} kỳ)</option></select></label>
      <label><input type="checkbox" id="bt-f" checked> Bộ lọc tiêu chuẩn</label>
      <label>Seed <input type="text" id="bt-seed" value="1" style="width:80px"></label>
      <button class="primary" type="submit" id="bt-run">Chạy</button>
      <button class="ghost" type="button" id="bt-stop" disabled>Dừng</button>
    </form>
    <div class="progress"><div id="bt-bar"></div></div>
    <p class="sub" id="bt-msg">Chọn tham số rồi bấm Chạy. 100 kỳ đầu luôn dùng để khởi tạo.</p>
  </div>
  <div id="bt-out"></div>`;
  const pre = store("vl-bt-s");
  if (pre && STRATEGIES[pre] && pre !== "random") document.getElementById("bt-s").value = pre;
  document.getElementById("bt-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const s = document.getElementById("bt-s").value;
    store("vl-bt-s", s);
    const n = Math.max(1, Math.min(50, parseInt(document.getElementById("bt-n").value, 10) || 10));
    const p = document.getElementById("bt-p").value;
    const evalN = p === "all" ? nD - 100 : Math.min(Number(p), nD - 100);
    runBacktest(m, s, n, evalN, document.getElementById("bt-f").checked, document.getElementById("bt-seed").value);
  });
  document.getElementById("bt-stop").addEventListener("click", () => { if (btJob) btJob.stop = true; });
}

function newAcc(m) {
  return { cost: 0, gain: 0, matches: 0, tickets: 0, perDraw: [], cum: [], dist: new Array(m.pick + 1).fill(0), tiers: {}, big: [] };
}
function scoreInto(acc, m, d, tickets, label) {
  let sumM = 0, gain = 0;
  for (const t of tickets) {
    const s = scoreTicket(m, d, t);
    sumM += s.matches; gain += s.prize;
    acc.dist[s.matches]++;
    if (s.prize > 0) {
      // only split by special number when it changes the prize (e.g. 6/55 5+bonus)
      const split = m.prize[s.matches][0] !== m.prize[s.matches][1];
      const k = `${s.matches}${split && s.sHit ? "+" : ""}`;
      acc.tiers[k] = (acc.tiers[k] || 0) + 1;
    }
    if (s.matches >= m.pick - 1) acc.big.push({ d, t, s, label });
  }
  acc.cost += tickets.length * 10000; acc.gain += gain; acc.matches += sumM; acc.tickets += tickets.length;
  acc.perDraw.push(sumM / tickets.length);
  acc.cum.push(acc.gain - acc.cost);
}
function liftStats(acc, m) {
  const e = m.pick * m.pick / m.pool;
  const x = acc.perDraw, n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const z = (mean - e) / se;
  return { mean, lift: (mean / e - 1) * 100, lo: ((mean - 1.96 * se) / e - 1) * 100, hi: ((mean + 1.96 * se) / e - 1) * 100, p: 2 * normSf(Math.abs(z)) };
}

function runBacktest(m, strategy, n, evalN, filters, seed) {
  if (btJob) btJob.stop = true;
  const job = { stop: false };
  btJob = job;
  const nD = m.draws.length, start = nD - evalN;
  const st = new LottoState(m);
  for (let i = 0; i < start; i++) st.update(m.draws[i]);
  const A = newAcc(m), B = newAcc(m);
  const rngA = seededRng(`bt|${m.key}|${strategy}|${filters}|${seed}`), rngB = seededRng(`bt|${m.key}|random|${filters}|${seed}`);
  const bar = document.getElementById("bt-bar"), msg = document.getElementById("bt-msg");
  document.getElementById("bt-run").disabled = true;
  document.getElementById("bt-stop").disabled = false;
  const t0 = performance.now();
  let i = start;
  const step = () => {
    const until = performance.now() + 30;
    try {
      while (i < nD && performance.now() < until && !job.stop) {
        const d = m.draws[i];
        scoreInto(A, m, d, generate(st, strategy, rngA, n, { filters }), strategy);
        scoreInto(B, m, d, generate(st, "random", rngB, n, { filters }), "random");
        st.update(d);
        i++;
      }
    } catch (e) {
      msg.innerHTML = `<span class="err">${esc(e.message)}</span>`;
      job.stop = true;
    }
    bar.style.width = `${((i - start) / evalN) * 100}%`;
    if (i < nD && !job.stop) {
      msg.textContent = `Đang chạy… ${fmt(i - start)} / ${fmt(evalN)} kỳ`;
      yieldThen(step);
      return;
    }
    document.getElementById("bt-run").disabled = false;
    document.getElementById("bt-stop").disabled = true;
    const done = i - start;
    if (done < 2) return;
    msg.textContent = `${job.stop ? "Đã dừng" : "Xong"}: ${fmt(done)} kỳ (${m.draws[start].date} → ${m.draws[i - 1].date}) · ${fmt(n)} vé/kỳ · ${fmt((performance.now() - t0) / 1000, 1)} giây`;
    renderBacktestResults(m, strategy, A, B, start, done);
  };
  yieldThen(step);
}

function renderBacktestResults(m, strategy, A, B, start, done) {
  const la = liftStats(A, m), lb = liftStats(B, m);
  const name = STRATEGIES[strategy].label;
  const roi = (acc) => (acc.gain / acc.cost - 1) * 100;
  const tierKeys = [...new Set([...Object.keys(A.tiers), ...Object.keys(B.tiers)])].sort((a, b) => parseInt(b, 10) - parseInt(a, 10) || b.length - a.length);
  const tierLabel = (k) => `${parseInt(k, 10)} số${k.endsWith("+") ? " + ĐB" : ""}`;
  const luck = "Khi thử nhiều chiến lược/seed/giai đoạn, khoảng 1 trong 20 lần sẽ \"có ý nghĩa\" chỉ do may rủi — hãy chạy lại với seed và giai đoạn khác trước khi tin.";
  const verdict = la.lo > 0
    ? `<span class="verdict bad">Tốt hơn ngẫu nhiên có ý nghĩa ở mức 95%</span> (CI ${sign(la.lo)} … ${sign(la.hi)}). ${luck}`
    : la.hi < 0
      ? `<span class="verdict bad">Kém hơn ngẫu nhiên có ý nghĩa ở mức 95%</span> (CI ${sign(la.lo)} … ${sign(la.hi)}). ${luck}`
      : `<span class="verdict ok">Không khác biệt có ý nghĩa so với ngẫu nhiên</span> — khoảng tin cậy 95% của lift chứa 0.`;
  document.getElementById("bt-out").innerHTML = `
  <div class="grid tiles" style="margin-top:16px">
    ${tile(`ROI · ${name}`, `${fmt(roi(A), 1)}%`, `Chi ${vnd(A.cost)} · thưởng ${vnd(A.gain)}`)}
    ${tile("ROI · Ngẫu nhiên", `${fmt(roi(B), 1)}%`, `Chi ${vnd(B.cost)} · thưởng ${vnd(B.gain)}`)}
    ${tile(`Lift · ${name}`, `${sign(la.lift)}%`, `CI 95%: ${sign(la.lo)} … ${sign(la.hi)} · p = ${pval(la.p)}`)}
    ${tile("Lift · Ngẫu nhiên", `${sign(lb.lift)}%`, `CI 95%: ${sign(lb.lo)} … ${sign(lb.hi)} · p = ${pval(lb.p)}`)}
  </div>
  <p style="margin:12px 0 0">${verdict}</p>
  <div class="grid" style="margin-top:16px">
    <div class="card wide"><h3>Lãi/lỗ cộng dồn (VND)</h3><p class="sub">Cùng số vé, cùng các kỳ. Đường dốc xuống đều là chi phí; các bước nhảy lên là kỳ trúng thưởng.</p>
      <div class="legend-inline"><span><span class="sw line" style="background:var(--series-1)"></span>${name}</span><span><span class="sw line" style="background:var(--series-2)"></span>Ngẫu nhiên</span></div>
      <div id="bt-cum" class="chart"></div></div>
    <div class="card"><h3>Phân bố số trúng mỗi vé</h3><p class="sub">Đường xám: kỳ vọng nếu ngẫu nhiên.</p>
      <div class="legend-inline"><span><span class="sw" style="background:var(--series-1)"></span>${name}</span><span><span class="sw" style="background:var(--series-2)"></span>Ngẫu nhiên</span><span><span class="sw line" style="background:var(--ref)"></span>Kỳ vọng</span></div>
      <div id="bt-dist" class="chart"></div></div>
    <div class="card scroll"><h3>Số vé trúng thưởng theo giải</h3>
      <table><thead><tr><th>Giải</th><th class="num">${name}</th><th class="num">Ngẫu nhiên</th><th class="num">Thưởng/vé</th></tr></thead><tbody>
      ${tierKeys.length ? tierKeys.map((k) => `<tr><td>${tierLabel(k)}</td><td class="num">${fmt(A.tiers[k] || 0)}</td><td class="num">${fmt(B.tiers[k] || 0)}</td><td class="num">${vnd(m.prize[parseInt(k, 10)][k.endsWith("+") ? 1 : 0])}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Không có vé trúng thưởng.</td></tr>`}
      </tbody></table>
      ${A.big.length ? `<h3 style="margin-top:14px">Vé trúng ≥ ${m.pick - 1} số (${name})</h3><table><tbody>
      ${A.big.slice(0, 10).map((b) => `<tr><td>${b.d.date}</td><td>${ballsHtml(b.t.numbers, b.t.special, { hits: new Set(b.d.main) })}</td><td class="num">${b.s.matches}${b.s.sHit ? " + ĐB" : ""}</td></tr>`).join("")}</tbody></table>` : ""}
    </div>
  </div>`;
  const dates = m.draws.slice(start, start + done).map((d) => d.date);
  mk("bt-cum", {
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "line", lineStyle: { color: css("--axis") } }, formatter: (p) => `${p[0].axisValue}<br>${p.map((x) => `${x.seriesName}: ${vnd(x.value)}`).join("<br>")}` },
    xAxis: axis({ type: "category", data: dates, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true } }),
    yAxis: axis({ type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => vnd(v) } }),
    series: [
      { name, type: "line", data: A.cum, showSymbol: false, lineStyle: { width: 2, color: css("--series-1") }, itemStyle: { color: css("--series-1") } },
      { name: "Ngẫu nhiên", type: "line", data: B.cum, showSymbol: false, lineStyle: { width: 2, color: css("--series-2") }, itemStyle: { color: css("--series-2") } },
    ],
  });
  const ks = range1(m.pick + 1).map((x) => x - 1);
  mk("bt-dist", {
    xAxis: axis({ type: "category", data: ks, name: "Số trúng", nameLocation: "middle", nameGap: 26, splitLine: { show: false } }),
    yAxis: axis({ type: "value" }),
    tooltip: { formatter: (p) => `${p[0].axisValue} số trúng<br>${p.map((x) => `${x.seriesName}: ${fmt(x.value, x.seriesName === "Kỳ vọng" ? 1 : 0)}`).join("<br>")}` },
    series: [
      { name, type: "bar", data: A.dist, itemStyle: barStyle("--series-1"), barGap: "10%" },
      { name: "Ngẫu nhiên", type: "bar", data: B.dist, itemStyle: barStyle("--series-2") },
      { name: "Kỳ vọng", type: "line", data: ks.map((k) => A.tickets * hypergeom(m.pool, m.pick, m.pick, k)), symbol: "circle", symbolSize: 8, lineStyle: { color: css("--ref"), width: 2 }, itemStyle: { color: css("--ref"), borderColor: css("--surface"), borderWidth: 2 } },
    ],
  });
}
