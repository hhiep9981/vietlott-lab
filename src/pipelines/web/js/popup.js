/* popup.js — click any ball group ([data-ticket]) to analyse that ticket. */
const simCache = {};

function ticketFeatures(m, nums) {
  const g = gapsOf(nums);
  let run = 1, best = 1;
  for (const x of g) { run = x === 1 ? run + 1 : 1; best = Math.max(best, run); }
  const digits = new Set(nums.map((v) => v % 10));
  const decades = new Set(nums.map((v) => Math.floor((v - 1) / 10)));
  let mult = 0;
  for (let q = Math.floor(m.pool / m.pick); q >= 2; q--) if (nums.every((v) => v % q === 0)) { mult = q; break; }
  return {
    sum: nums.reduce((a, b) => a + b, 0),
    odd: nums.filter((v) => v % 2).length,
    low: nums.filter((v) => v <= Math.floor(m.pool / 2)).length,
    adj: g.filter((x) => x === 1).length,
    maxGap: Math.max(...g),
    longestRun: best,
    ap: new Set(g).size === 1,
    sameDigit: digits.size === 1,
    sameDecade: decades.size === 1,
    mult,
    allParity: nums.every((v) => v % 2) || nums.every((v) => v % 2 === 0),
    gaps: g,
  };
}
/* shape distribution of uniformly random tickets (Monte-Carlo, cached) */
function simShapes(m, n = 20000) {
  if (simCache[m.key]) return simCache[m.key];
  const rng = seededRng("sim|" + m.key);
  const all = range1(m.pool);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(ticketFeatures(m, sampleUniform(rng, all, m.pick).sort((a, b) => a - b)));
  simCache[m.key] = rows;
  return rows;
}
const share = (rows, f) => rows.reduce((a, r) => a + (f(r) ? 1 : 0), 0) / rows.length;
// "1 in N" for how often a fair draw leaves a number out this long.
const rarity = (p) => (p >= 0.5 ? "Thường gặp" : p > 0 ? `1/${fmt(Math.round(1 / p))} lần` : "< 1/100.000 lần");
const oneIn = (p) => (p > 0 ? `≈ 1/${fmt(1 / p, p > 0.01 ? 1 : 0)}` : "< 1/20.000");

function openTicket(key, nums, special = null, ctx = null) {
  if (!LOTTO.includes(key)) return;
  const m = getModel(key), G = DATA.games[key], st = m.final, C = st.cache, R = C.rules;
  nums = [...nums].sort((a, b) => a - b);
  const f = ticketFeatures(m, nums);
  const sim = simShapes(m);
  const sumZ = (f.sum - R.sum_mean) / R.sum_sd;
  const F = G.frequency, Gp = G.gaps;
  const last = new Set(st.last || []);
  const clsLabel = (v) => (C.cls[v] === 1 ? "Nóng" : C.cls[v] === -1 ? "Lạnh" : "Trung bình");

  // history overlaps
  const byOverlap = new Array(m.pick + 1).fill(0);
  const close = [];
  m.draws.forEach((d, i) => {
    const k = overlapCount(d.main, nums);
    byOverlap[k]++;
    if (k >= m.pick - 2) close.push([i, k]);
  });
  close.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const nD = m.draws.length;

  const patterns = [];
  if (f.ap) patterns.push(["Cấp số cộng", share(sim, (r) => r.ap)]);
  if (f.longestRun >= 3) patterns.push([`Chuỗi ${f.longestRun} số liên tiếp`, share(sim, (r) => r.longestRun >= f.longestRun)]);
  if (f.sameDigit) patterns.push(["Cùng chữ số tận cùng", share(sim, (r) => r.sameDigit)]);
  if (f.sameDecade) patterns.push(["Cùng một nhóm 10 số", share(sim, (r) => r.sameDecade)]);
  if (f.mult) patterns.push([`Toàn bội số của ${f.mult}`, share(sim, (r) => r.mult >= 2)]);
  if (f.allParity) patterns.push([f.odd === m.pick ? "Toàn số lẻ" : "Toàn số chẵn", share(sim, (r) => r.allParity)]);
  const prof = st.last ? profileOf(st, nums) : null;
  const profN = prof ? st.profiles.get(prof.key) || 0 : 0;

  const pJack = 1 / comb(m.pool, m.pick) / (m.specialType === "separate" ? m.specialPool : 1);
  const shapeRows = [
    ["Tổng", `${f.sum} (z ${sign(sumZ)})`, share(sim, (r) => Math.abs((r.sum - R.sum_mean) / R.sum_sd) >= Math.abs(sumZ) - 1e-9), "lệch khỏi trung bình ít nhất như vậy"],
    ["Số lẻ / chẵn", `${f.odd} / ${m.pick - f.odd}`, share(sim, (r) => r.odd === f.odd), "đúng số lẻ này"],
    [`Số nhỏ (≤ ${R.low_max}) / lớn`, `${f.low} / ${m.pick - f.low}`, share(sim, (r) => r.low === f.low), "đúng số nhỏ này"],
    ["Cặp số liền nhau", `${f.adj}`, share(sim, (r) => r.adj === f.adj), "đúng số cặp này"],
    ["Khoảng cách lớn nhất", `${f.maxGap}`, Math.min(share(sim, (r) => r.maxGap >= f.maxGap), share(sim, (r) => r.maxGap <= f.maxGap)), "khoảng cách lớn nhất cực đoan ít nhất như vậy (phía hiếm hơn)"],
    ["Số lặp từ kỳ gần nhất", `${nums.filter((v) => last.has(v)).length}`, hypergeom(m.pool, m.pick, m.pick, nums.filter((v) => last.has(v)).length), "đúng số lặp này (siêu bội)"],
  ];

  const dlg = document.getElementById("ticket-dlg");
  dlg.innerHTML = `
  <div class="dlg-head"><div>${ballsHtml(nums, special, { small: false, click: false })}
    <div class="muted" style="font-size:12.5px;margin-top:6px">${m.name}${ctx ? ` · kết quả kỳ #${ctx.id} (${ctx.date})` : ""} · phân tích theo dữ liệu đến ${m.draws[nD - 1].date}</div></div>
    <button class="ghost" id="dlg-close" aria-label="Đóng">Đóng ✕</button></div>
  <div class="dlg-body">
    <h3>Từng số</h3>
    <div class="scroll"><table><thead><tr><th>Số</th><th>Chẵn/Lẻ</th><th>Nhỏ/Lớn</th><th>Kỳ gần nhất?</th><th class="num">Số lần (toàn bộ)</th><th class="num">z toàn bộ</th><th class="num">z ${fmt(F.recent_n)} kỳ</th><th>Phân loại</th><th class="num">Chưa về</th><th class="num">KC TB</th><th class="num">Độ hiếm</th></tr></thead><tbody>
    ${nums.map((v) => `<tr><td><span class="ball sm">${pad2(v)}</span></td><td>${v % 2 ? "Lẻ" : "Chẵn"}</td><td>${v <= R.low_max ? "Nhỏ" : "Lớn"}</td>
      <td>${last.has(v) ? "<b>Có</b>" : "–"}</td><td class="num">${fmt(F.all[v - 1])}</td><td class="num">${sign(C.zAll[v - 1])}</td><td class="num">${sign(C.zRecent[v - 1])}</td>
      <td>${clsLabel(v)}</td><td class="num">${Gp.current[v - 1]} kỳ</td><td class="num">${fmt(Gp.mean[v - 1], 1)}</td><td class="num">${rarity(Gp.p_absent[v - 1])}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="font-size:12.5px">z: độ lệch tần suất so với kỳ vọng (±2 mới đáng chú ý). Nóng/Lạnh: nhóm 1/3 số có tần suất cao/thấp nhất. KC TB: khoảng cách trung bình giữa hai lần về (kỳ vọng ${fmt(Gp.expected_mean, 1)}). Độ hiếm: nếu quay ngẫu nhiên, cứ bao nhiêu lần mới có một số vắng lâu được như vậy (ví dụ 1/10 lần = khá hiếm). Vắng lâu <b>không</b> làm số đó dễ về hơn ở kỳ sau.</p>

    <h3>Cả bộ</h3>
    <ul class="facts">
      <li>Khoảng cách giữa các số: ${f.gaps.join(" · ")}</li>
      <li>Công thức (so với trạng thái hiện tại): <b>${prof ? profileLabel(prof) : "–"}</b>${prof ? ` — đã xuất hiện ${profN} lần trong ${fmt(st.t - PROFILE_WARMUP)} kỳ` : ""}</li>
      <li>Bộ lọc tiêu chuẩn: ${passesRules(nums, R) ? "<span class='verdict ok'>✓ đạt</span>" : "<span class='verdict bad'>✗ không đạt</span>"} (tổng ${fmt(R.sum_lo)}–${fmt(R.sum_hi)}, lẻ ${R.odd_ok.join("/")}, nhỏ ${R.low_ok.join("/")}, KC ≤ ${R.max_gap}, cặp liền ≤ ${R.max_adjacent})</li>
      ${patterns.length ? `<li>Mẫu hình đặc biệt: ${patterns.map(([l, p]) => `<b>${l}</b> (bộ ngẫu nhiên có mẫu này: ${oneIn(p)})`).join("; ")}</li>` : "<li>Không có mẫu hình đặc biệt.</li>"}
    </ul>

    <h3>Xác suất</h3>
    <div class="grid">
      <div><table><thead><tr><th>Hình dạng</th><th class="num">Giá trị</th><th class="num">Bộ ngẫu nhiên có cùng đặc điểm</th></tr></thead><tbody>
      ${shapeRows.map(([a, b, p, note]) => `<tr><td>${a}</td><td class="num">${b}</td><td class="num" title="${note}">${pct(p, 1)}</td></tr>`).join("")}
      </tbody></table><p class="muted" style="font-size:12.5px">So với 20.000 bộ chọn ngẫu nhiên. Hình dạng chỉ cho biết bộ số "điển hình" hay "lạ" — không thay đổi xác suất trúng.</p></div>
      <div><table><thead><tr><th>Giải</th><th class="num">Thưởng</th><th class="num">Xác suất</th></tr></thead><tbody>
      ${G.value.tiers.map((t) => `<tr><td>${t.matches} số${t.special === true ? " + ĐB" : ""}${key === "power535" && t.matches < 3 ? " (trùng ĐB)" : ""}</td><td class="num">${vnd(t.prize)}${t.prize >= 1e9 ? "+" : ""}</td><td class="num">1/${fmt(t.odds)}</td></tr>`).join("")}
      </tbody></table><p class="muted" style="font-size:12.5px">Mọi bộ số có cùng xác suất trúng: Jackpot = 1/${fmt(1 / pJack)}.</p></div>
    </div>

    <h3>So với lịch sử (${fmt(nD)} kỳ)</h3>
    <div class="scroll"><table><thead><tr><th>Trùng</th>${range1(m.pick).reverse().slice(0, 4).map((k) => `<th class="num">${k} số</th>`).join("")}</tr></thead><tbody>
      <tr><td>Số kỳ quan sát</td>${range1(m.pick).reverse().slice(0, 4).map((k) => `<td class="num">${fmt(byOverlap[k])}</td>`).join("")}</tr>
      <tr><td class="muted">Kỳ vọng</td>${range1(m.pick).reverse().slice(0, 4).map((k) => `<td class="num muted">${fmt(nD * hypergeom(m.pool, m.pick, m.pick, k), 2)}</td>`).join("")}</tr>
    </tbody></table></div>
    ${close.length ? `<table style="margin-top:8px"><thead><tr><th>Ngày</th><th>Kỳ</th><th>Bộ số (tô đậm = trùng)</th><th class="num">Trùng</th></tr></thead><tbody>
      ${close.slice(0, 20).map(([i, k]) => { const d = m.draws[i]; return `<tr><td>${d.date}</td><td>#${d.id}</td><td>${ballsHtml(d.main, d.special, { hits: new Set(nums), click: false })}</td><td class="num">${k}</td></tr>`; }).join("")}
    </tbody></table>${close.length > 20 ? `<p class="muted">… và ${close.length - 20} kỳ khác.</p>` : ""}` : `<p class="muted">Chưa kỳ nào trùng từ ${m.pick - 2} số trở lên.</p>`}
  </div>`;
  dlg.querySelector("#dlg-close").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

function initPopup() {
  const dlg = document.getElementById("ticket-dlg");
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  const handler = (e) => {
    const el = e.target.closest("[data-ticket]");
    if (!el || (e.type === "keydown" && e.key !== "Enter")) return;
    const nums = el.dataset.ticket.split("-").map(Number);
    const ctx = el.dataset.date ? { date: el.dataset.date, id: el.dataset.id } : null;
    openTicket(state.game, nums, el.dataset.sp ? Number(el.dataset.sp) : null, ctx);
  };
  document.addEventListener("click", handler);
  document.addEventListener("keydown", handler);
}
