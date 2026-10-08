/* analysis.js — "Phân tích" view: frequency, gaps, pairs, structure, waiting
   times, heatmap, special number, randomness tests, backtest, expected value. */
function renderAnalysis(key) {
  const G = DATA.games[key];
  const M = G.meta;
  const isKeno = key === "keno";
  const tests = G.tests;
  const nSig = tests.filter((t) => t.p_bonferroni < 0.05).length;
  const bt = G.backtest ? G.backtest.results : [];
  const btSig = bt.filter((r) => r.p_holm < 0.05 && r.lift_pct > 0);
  const best = bt.length ? bt.reduce((a, b) => (b.lift_pct > a.lift_pct ? b : a)) : null;

  let valueTile, valueTile2;
  if (isKeno) {
    const b = G.value.rtp_table.reduce((a, r) => (r.rtp > a.rtp ? r : a));
    valueTile = tile("Bậc có tỷ lệ hoàn trả cao nhất", "Bậc " + b.spot, `Hoàn trả ${pct(b.rtp)} (sau thuế)`);
    const w = G.value.rtp_table.reduce((a, r) => (r.rtp < a.rtp ? r : a));
    valueTile2 = tile("Bậc kém nhất", "Bậc " + w.spot, `Hoàn trả ${pct(w.rtp)}`);
  } else {
    valueTile = tile("Hoàn trả kỳ vọng / vé", pct(G.value.rtp_min_jackpot), "Jackpot ở mức tối thiểu, sau thuế");
    valueTile2 = tile("Jackpot hòa vốn", vnd(G.value.breakeven_jackpot), "Mức để kỳ vọng = giá vé (chưa tính chia giải)");
  }
  const W = G.waiting;
  const S = G.structure;

  const html = `
  <div class="notice"><b>Đọc trước:</b> Mỗi kỳ quay độc lập; không phương pháp chọn số nào làm tăng xác suất trúng.
  Trang này kiểm chứng điều đó trên dữ liệu thật và chỉ ra những gì <i>thật sự</i> tối ưu được:
  chọn bậc/sản phẩm hoàn trả cao hơn, thời điểm Jackpot lớn, và bộ số ít người chọn để không phải chia giải.
  Xem giải thích chi tiết ở mục <a href="#info">Phương pháp</a>.</div>

  <div class="grid tiles">
    ${tile("Số kỳ quay", fmt(M.n_draws), `${M.date_from} → ${M.date_to}`)}
    ${tile("Kiểm định ngẫu nhiên", `<span class="verdict ${nSig ? "bad" : "ok"}">${nSig ? "⚠ " + nSig + " lệch" : "✓ Không lệch"}</span>`, `${tests.length} kiểm định, hiệu chỉnh Bonferroni`)}
    ${tile("Chiến lược thắng Random", `<span class="verdict ${btSig.length ? "bad" : "ok"}">${btSig.length} / ${bt.length}</span>`, best ? `Tốt nhất: ${best.strategy} (${sign(best.lift_pct)}%, p<sub>Holm</sub>=${pval(best.p_holm)})` : "")}
    ${valueTile}
    ${valueTile2}
  </div>

  <h2>Tần suất xuất hiện</h2>
  <p class="lede">Số lần mỗi số được quay. Với dữ liệu ngẫu nhiên, các cột dao động quanh đường kỳ vọng — chênh lệch trong biên độ bình thường không mang thông tin dự đoán.</p>
  <div class="grid">
    <div class="card wide"><div class="card-head"><div><h3>Tần suất theo số</h3><p class="sub" id="freq-sub"></p></div>
      ${seg("freq-seg", [["all", "Toàn bộ"], ["recent", `${fmt(G.frequency.recent_n)} kỳ gần nhất`]], "all")}</div>
      ${legendInline()}<div id="c-freq" class="chart"></div></div>
  </div>

  <h2>Khoảng cách giữa các lần xuất hiện</h2>
  <p class="lede">Số kỳ giữa hai lần một số được quay. Nếu ngẫu nhiên, khoảng cách tuân theo phân phối hình học với trung bình ${fmt(G.gaps.expected_mean, 2)} kỳ. Một số "lâu chưa về" không có khả năng về cao hơn ở kỳ sau.</p>
  <div class="grid">
    ${card("c-gapcur", "Số kỳ chưa về (hiện tại)", "Rê chuột để xem khoảng cách trung bình, lớn nhất và xác suất vắng lâu như vậy.", "wide")}
    <div class="card wide"><h3>Phân phối khoảng cách (tất cả các số)</h3><p class="sub">So với phân phối hình học lý thuyết.</p>${legendInline()}<div id="c-gaphist" class="chart"></div></div>
  </div>

  ${W ? `
  <h2>Bao lâu thì xảy ra?</h2>
  <p class="lede">Số kỳ phải chờ giữa hai lần bộ số trúng có một đặc điểm. Nếu các kỳ độc lập, thời gian chờ theo phân phối hình học: đã chờ lâu không làm kỳ sau "dễ" xảy ra hơn.</p>
  <div class="grid tiles">
    ${["adjacent", "repeat"].map((k) => { const w = W[k]; return tile(w.label, pct(w.p_obs), `Lý thuyết ${pct(w.p_theory)} mỗi kỳ · chờ TB ${fmt(w.mean_wait_obs, 2)} kỳ (lý thuyết ${fmt(w.mean_wait_theory, 2)}) · lâu nhất ${w.max_wait} · hiện đã chờ ${w.current} kỳ`); }).join("")}
  </div>
  <div class="grid" style="margin-top:16px">
    ${card("c-wait-adj", "Thời gian chờ đến kỳ có cặp số liền nhau", "Số kỳ giữa hai lần liên tiếp có ít nhất một cặp như 12–13.")}
    ${card("c-wait-rep", "Thời gian chờ đến kỳ dùng lại số của kỳ trước", "Số kỳ giữa hai lần liên tiếp có ít nhất một số trùng kỳ ngay trước.")}
  </div>` : ""}

  <h2>Cặp số &amp; bộ ba đi cùng nhau</h2>
  <p class="lede">Tỷ lệ số lần hai số cùng xuất hiện trong một kỳ so với kỳ vọng (${fmt(G.pairs.expected, 1)} lần/cặp). Đỏ = nhiều hơn kỳ vọng, xanh = ít hơn.</p>
  <div class="grid">
    ${card("c-pairs", "Ma trận cặp số (quan sát / kỳ vọng)", "", "sq")}
    <div class="card"><h3>Các cặp xuất hiện nhiều nhất</h3><p class="sub">Kỳ vọng ${fmt(G.pairs.expected, 1)} lần/cặp. Cặp đứng đầu luôn tồn tại kể cả khi hoàn toàn ngẫu nhiên.</p>
      <div class="scroll"><table><thead><tr><th>Cặp</th><th class="num">Số lần</th><th class="num">So với kỳ vọng</th></tr></thead><tbody>
      ${G.pairs.top.slice(0, 12).map((r) => `<tr><td>${r.a} – ${r.b}</td><td class="num">${fmt(r.count)}</td><td class="num">${sign(r.count / G.pairs.expected * 100 - 100, 0)}%</td></tr>`).join("")}
      </tbody></table></div>
      ${G.triplets ? `<h3 style="margin-top:16px">Bộ ba xuất hiện nhiều nhất</h3><p class="sub">Kỳ vọng ${fmt(G.triplets.expected, 2)} lần/bộ.</p>
      <div class="scroll"><table><thead><tr><th>Bộ ba</th><th class="num">Số lần</th></tr></thead><tbody>
      ${G.triplets.top.slice(0, 8).map((r) => `<tr><td>${r.combo.join(" – ")}</td><td class="num">${r.count}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
    </div>
  </div>

  <h2>Cấu trúc mỗi kỳ quay</h2>
  <p class="lede">Hình dạng bộ số trúng: tổng, chẵn/lẻ, nhỏ/lớn, số liên tiếp, số lặp lại từ kỳ trước. Đường xám là phân phối kỳ vọng nếu quay ngẫu nhiên.</p>
  ${legendInline()}
  <div class="grid">
    ${card("c-sum", "Tổng các số", `80% kỳ quay ngẫu nhiên có tổng trong khoảng ${fmt(S.sum.p10)}–${fmt(S.sum.p90)}.`)}
    ${card("c-odd", "Số lượng số lẻ", "")}
    ${card("c-low", `Số lượng số nhỏ (≤ ${Math.floor(M.pool / 2)})`, "")}
    ${card("c-consec", "Số cặp số liên tiếp", "Ví dụ 12–13 tính là 1 cặp.")}
    ${card("c-repeat", "Số lặp lại từ kỳ trước", "")}
    ${card("c-bucket", "Theo nhóm số", "", "", S.buckets5 ? seg("bucket-seg", [["5", "Nhóm 5"], ["10", "Nhóm 10"]], "10") : "")}
  </div>

  <h2>Biến động theo thời gian</h2>
  <p class="lede">Chênh lệch tần suất của từng số theo ${isKeno ? "quý" : "năm"}, so với kỳ vọng (bỏ các giai đoạn chưa đủ dữ liệu). Các ô đậm màu rải rác, không lặp lại theo thời gian — dấu hiệu của nhiễu ngẫu nhiên.</p>
  <div class="grid">${card("c-heat", "Chênh lệch tần suất (%) theo số × thời gian", "", "wide tall")}</div>

  ${G.special ? `<h2>${G.special.label}</h2><div class="grid">${card("c-special", G.special.label, "", "wide",
    G.special.counts_recent ? seg("special-seg", [["all", "Toàn bộ"], ["recent", `${G.special.recent_n} kỳ gần nhất`]], "all") : "")}</div>` : ""}
  ${isKeno ? `<h2>Keno: Lớn/Nhỏ &amp; Chẵn/Lẻ</h2><p class="lede">Số lượng số lớn (41–80) và số chẵn trong 20 số mỗi kỳ.</p><div class="grid">${card("c-big", "Số lượng số lớn (41–80)", "")}${card("c-even", "Số lượng số chẵn", "")}</div>` : ""}

  <h2>Kiểm định tính ngẫu nhiên</h2>
  <p class="lede">p-value nhỏ (&lt; 0,05 sau hiệu chỉnh) là bằng chứng có quy luật khai thác được. p-value lớn = không phát hiện quy luật.</p>
  <div class="card scroll"><table><thead><tr><th>Kiểm định</th><th class="num">p-value</th><th class="num">p (Bonferroni)</th><th>Kết luận</th><th>Chi tiết</th></tr></thead><tbody>
  ${tests.map((t) => `<tr><td>${esc(t.test)}</td><td class="num">${pval(t.p_value)}</td><td class="num">${pval(t.p_bonferroni)}</td>
    <td><span class="verdict ${t.p_bonferroni < 0.05 ? "bad" : "ok"}">${t.p_bonferroni < 0.05 ? "⚠ Lệch" : "✓ Ngẫu nhiên"}</span></td><td class="muted">${esc(t.detail)}</td></tr>`).join("")}
  </tbody></table></div>

  ${bt.length ? `
  <h2>Backtest chiến lược (walk-forward)</h2>
  <p class="lede">${esc(G.backtest.game)} · ${fmt(bt[0].n_draws)} kỳ (${bt[0].date_from} → ${bt[0].date_to}) · ${bt[0].n_tickets} vé/kỳ · mỗi kỳ chỉ dùng dữ liệu trước đó.
  "Lift" = số trúng trung bình mỗi vé so với chọn ngẫu nhiên. Một chiến lược chỉ có giá trị nếu khoảng tin cậy 95% nằm hẳn bên phải 0.${isKeno ? "" : ` Tự chạy với tham số khác ở mục <a href="#backtest/${key}">Backtest</a>.`}</p>
  <div class="grid">
    ${card("c-lift", "Lift so với ngẫu nhiên (%), khoảng tin cậy 95%", "Chấm = ước lượng, thanh = khoảng tin cậy 95%.", "wide")}
    <div class="card wide scroll"><h3>Kết quả tài chính</h3><p class="sub">ROI tính theo bảng thưởng chính thức, Jackpot ở mức tối thiểu. Một lần trúng Jackpot sẽ chi phối ROI — xem cột "Jackpot".</p>
    <table><thead><tr><th>Chiến lược</th><th class="num">TB số trúng/vé</th><th class="num">Lift</th><th class="num">p (Holm)</th><th class="num">Chi phí</th><th class="num">Tiền thưởng</th><th class="num">ROI</th><th class="num">ROI sau thuế</th><th class="num">Jackpot</th></tr></thead><tbody>
    ${bt.map((r) => `<tr><td>${esc(r.strategy)}</td><td class="num">${fmt(r.mean_matches, 4)}</td><td class="num">${sign(r.lift_pct)}%</td><td class="num">${pval(r.p_holm)}</td><td class="num">${vnd(r.cost)}</td><td class="num">${vnd(r.gross_gain)}</td><td class="num">${fmt(r.roi_gross_pct, 1)}%</td><td class="num">${fmt(r.roi_taxed_pct, 1)}%</td><td class="num">${r.jackpot_hits}</td></tr>`).join("")}
    </tbody></table></div>
  </div>` : ""}

  <h2>Giá trị kỳ vọng — chơi khi nào, chơi gì</h2>
  ${isKeno ? `<p class="lede">Keno trả thưởng cố định nên tỷ lệ hoàn trả chỉ phụ thuộc vào bậc chơi, không phụ thuộc số chọn. Chọn bậc có hoàn trả cao nhất là cách "tối ưu" duy nhất.</p>
    <div class="grid">${card("c-rtp", "Tỷ lệ hoàn trả theo bậc (sau thuế)", "Tỷ lệ tiền thưởng kỳ vọng trên mỗi 10.000đ.")}
    <div class="card scroll"><h3>Chi tiết theo bậc</h3><table><thead><tr><th>Bậc</th><th class="num">Hoàn trả</th><th class="num">P(trúng bất kỳ)</th><th class="num">Giải cao nhất</th><th class="num">Xác suất giải cao nhất</th></tr></thead><tbody>
    ${G.value.rtp_table.map((r) => `<tr><td>${r.spot}</td><td class="num">${pct(r.rtp)}</td><td class="num">${pct(r.p_any_prize)}</td><td class="num">${vnd(r.top_prize)}</td><td class="num">1/${fmt(1 / r.p_top)}</td></tr>`).join("")}
    </tbody></table></div></div>`
  : `<p class="lede">Tiền thưởng kỳ vọng mỗi vé tăng theo giá trị Jackpot. Vé chỉ "đáng giá" (kỳ vọng ≥ giá vé) khi Jackpot vượt mức hòa vốn — và ngay cả khi đó vẫn có rủi ro phải chia giải.</p>
    <div class="grid">${card("c-ev", "Hoàn trả kỳ vọng theo giá trị Jackpot (sau thuế)", `Hòa vốn khi Jackpot ≈ ${vnd(G.value.breakeven_jackpot)}.`)}
    <div class="card scroll"><h3>Cơ cấu giải &amp; xác suất</h3><table><thead><tr><th>Điều kiện</th><th class="num">Giải thưởng</th><th class="num">Xác suất</th></tr></thead><tbody>
    ${G.value.tiers.map((t) => `<tr><td>${t.matches} số${t.special === true ? " + số ĐB" : ""}${key === "power535" && t.matches < 3 ? " (trùng số ĐB)" : ""}</td><td class="num">${vnd(t.prize)}${t.prize >= 1e9 ? "+" : ""}</td><td class="num">1/${fmt(t.odds)}</td></tr>`).join("")}
    </tbody></table></div></div>`}

  <h2>Kết quả gần nhất</h2>
  ${isKeno ? "" : `<p class="lede">Bấm vào một bộ số để xem phân tích chi tiết.</p>`}
  <div class="card scroll"><table><thead><tr><th>Ngày</th><th>Kỳ</th><th>Bộ số</th></tr></thead><tbody>
  ${G.recent_draws.slice(0, isKeno ? 15 : 20).map((d) => `<tr><td>${d.date}</td><td>#${d.id}</td><td>${ballsHtml(d.main, d.special, { click: !isKeno, ctx: d })}</td></tr>`).join("")}
  </tbody></table></div>`;

  document.getElementById("app").innerHTML = html;
  drawAnalysisCharts(key, G);
}

function drawAnalysisCharts(key, G) {
  const M = G.meta;
  const nums = G.frequency.numbers;
  const isKeno = key === "keno";

  const drawFreq = (mode) => {
    const F = G.frequency;
    const obs = mode === "all" ? F.all : F.recent;
    const exp = mode === "all" ? F.all_expected : F.recent_expected;
    document.getElementById("freq-sub").textContent = mode === "all"
      ? `${fmt(M.n_draws)} kỳ · kỳ vọng ${fmt(exp, 1)} lần/số`
      : `${fmt(F.recent_n)} kỳ gần nhất · kỳ vọng ${fmt(exp, 1)} lần/số`;
    obsVsExp("c-freq", nums, obs, exp, {
      tooltip: { formatter: (p) => `Số <b>${p[0].name}</b><br>${p[0].value} lần · ${sign(p[0].value / exp * 100 - 100, 1)}% so với kỳ vọng${mode === "recent" ? `<br>z = ${fmt(F.recent_z[p[0].dataIndex], 2)}` : ""}` },
    });
  };
  drawFreq("all");
  bindSeg("freq-seg", drawFreq);

  const Gp = G.gaps;
  obsVsExp("c-gapcur", nums, Gp.current, Gp.expected_mean, {
    tooltip: { formatter: (p) => { const i = p[0].dataIndex; return `Số <b>${p[0].name}</b><br>Chưa về: ${Gp.current[i]} kỳ<br>TB khoảng cách: ${fmt(Gp.mean[i], 1)} · lớn nhất: ${Gp.max[i]}<br>P(vắng ≥ ${Gp.current[i]} kỳ) = ${pct(Gp.p_absent[i], 2)}`; } },
  });
  obsVsExp("c-gaphist", Gp.hist_k.map((k, i) => (i === Gp.hist_k.length - 1 ? "≥" + k : String(k))), Gp.hist_obs, Gp.hist_exp, { xName: "Khoảng cách (kỳ)" });

  if (G.waiting) {
    for (const [id, k] of [["c-wait-adj", "adjacent"], ["c-wait-rep", "repeat"]]) {
      const w = G.waiting[k];
      obsVsExp(id, w.hist_k.map((x, i) => (i === w.hist_k.length - 1 ? "≥" + x : String(x))), w.hist_obs, w.hist_exp, {
        xName: "Số kỳ chờ",
        tooltip: { formatter: (p) => `Chờ <b>${p[0].name}</b> kỳ<br>Quan sát: ${fmt(p[0].value)} lần${p[1] ? `<br>Kỳ vọng: ${fmt(p[1].value, 1)}` : ""}` },
      });
    }
  }

  const P = G.pairs.ratio;
  const cells = [];
  for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) if (P[i][j] != null) cells.push([j, i, P[i][j]]);
  const spread = isKeno ? 0.08 : 0.8;
  mk("c-pairs", {
    grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
    tooltip: { trigger: "item", formatter: (p) => `Cặp <b>${nums[p.value[1]]} – ${nums[p.value[0]]}</b><br>${fmt(p.value[2] * G.pairs.expected, 0)} lần (×${fmt(p.value[2], 2)} kỳ vọng)` },
    xAxis: axis({ type: "category", data: nums, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 9, interval: isKeno ? 9 : 4 } }),
    yAxis: axis({ type: "category", data: nums, inverse: true, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 9, interval: isKeno ? 9 : 4 } }),
    visualMap: Object.assign(divergingMap(1 - spread, 1 + spread, 2), { text: [`×${fmt(1 + spread, 2)}`, `×${fmt(1 - spread, 2)}`] }),
    series: [{ type: "heatmap", data: cells, progressive: 0, itemStyle: { borderColor: css("--surface"), borderWidth: isKeno ? 0 : 0.5 } }],
  });

  const S = G.structure;
  const sumCats = S.sum.bins.map((b) => S.sum.width > 1 ? `${b}–${b + S.sum.width - 1}` : String(b));
  obsVsExp("c-sum", sumCats, S.sum.obs, S.sum.exp, {});
  obsVsExp("c-odd", S.odd.k, S.odd.obs, S.odd.exp, {});
  obsVsExp("c-low", S.low.k, S.low.obs, S.low.exp, {});
  obsVsExp("c-consec", S.consec.k, S.consec.obs, S.consec.exp, {});
  obsVsExp("c-repeat", S.repeat.k, S.repeat.obs, S.repeat.exp, {});
  const drawBuckets = (size) => {
    const B = size === "5" && S.buckets5 ? S.buckets5 : S.buckets;
    obsVsExp("c-bucket", B.labels, B.obs, B.exp, {});
  };
  drawBuckets("10");
  bindSeg("bucket-seg", drawBuckets);

  const H = G.heatmap;
  const lim = isKeno ? 6 : 60;
  mk("c-heat", {
    grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
    tooltip: { trigger: "item", formatter: (p) => `Số <b>${nums[p.value[1]]}</b> · ${H.periods[p.value[0]]}<br>${p.value[3]} lần (${sign(p.value[2], 1)}% so với kỳ vọng)<br>${H.draws_per_period[p.value[0]]} kỳ quay` },
    xAxis: axis({ type: "category", data: H.periods, splitLine: { show: false } }),
    yAxis: axis({ type: "category", data: nums, inverse: true, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 9, interval: isKeno ? 4 : 1 } }),
    visualMap: Object.assign(divergingMap(-lim, lim, 2), { text: [`+${lim}%`, `−${lim}%`] }),
    series: [{ type: "heatmap", data: H.cells, progressive: 0, itemStyle: { borderColor: css("--surface"), borderWidth: 1 } }],
  });

  if (G.special) {
    const Sp = G.special;
    const drawSpecial = (mode) => {
      const recent = mode === "recent" && Sp.counts_recent;
      const exp = recent ? Sp.expected_recent : Sp.expected;
      const sub = document.getElementById("c-special-sub");
      if (sub) sub.textContent = recent ? `${Sp.recent_n} kỳ gần nhất · kỳ vọng ${fmt(exp, 1)} lần/số` : `Toàn bộ · kỳ vọng ${fmt(exp, 1)} lần/số`;
      obsVsExp("c-special", Sp.numbers, recent ? Sp.counts_recent : Sp.counts, exp, {});
    };
    document.querySelector("#c-special").insertAdjacentHTML("beforebegin", `<p class="sub" id="c-special-sub"></p>`);
    drawSpecial("all");
    bindSeg("special-seg", drawSpecial);
  }
  if (G.keno_sides) {
    obsVsExp("c-big", G.keno_sides.k, G.keno_sides.big, G.keno_sides.exp, {});
    obsVsExp("c-even", G.keno_sides.k, G.keno_sides.even, G.keno_sides.exp, {});
  }

  if (G.backtest) {
    const R = G.backtest.results;
    mk("c-lift", {
      grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
      tooltip: { trigger: "item", formatter: (p) => { const r = R[p.dataIndex]; return `<b>${esc(r.strategy)}</b><br>Lift ${sign(r.lift_pct)}%<br>CI 95%: [${fmt(r.lift_ci95[0], 2)}, ${fmt(r.lift_ci95[1], 2)}]<br>p = ${pval(r.p_value)} · p<sub>Holm</sub> = ${pval(r.p_holm)}`; } },
      xAxis: axis({ type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => (v > 0 ? "+" : "") + v + "%" } }),
      yAxis: axis({ type: "category", data: R.map((r) => r.strategy), inverse: true, splitLine: { show: false } }),
      series: [
        {
          type: "custom", silent: true,
          renderItem: (params, api) => {
            const a = api.coord([api.value(0), api.value(2)]);
            const b = api.coord([api.value(1), api.value(2)]);
            return { type: "line", shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: css("--series-1"), lineWidth: 2, opacity: 0.55 } };
          },
          data: R.map((r, i) => [r.lift_ci95[0], r.lift_ci95[1], i]),
          encode: { x: [0, 1], y: 2 }, z: 1,
        },
        {
          type: "scatter", data: R.map((r, i) => [r.lift_pct, i]), symbolSize: 10, z: 2,
          itemStyle: { color: css("--series-1"), borderColor: css("--surface"), borderWidth: 2 },
          markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ref"), type: "solid", width: 1.5 }, label: { formatter: "Ngẫu nhiên", color: css("--ink-2"), fontSize: 11, position: "start" }, data: [{ xAxis: 0 }] },
        },
      ],
    });
  }

  if (isKeno) {
    const T = G.value.rtp_table;
    mk("c-rtp", {
      tooltip: { formatter: (p) => `Bậc ${p[0].name}: hoàn trả ${pct(p[0].value)}` },
      xAxis: axis({ type: "category", data: T.map((r) => r.spot), name: "Bậc", nameLocation: "middle", nameGap: 26, splitLine: { show: false } }),
      yAxis: axis({ type: "value", min: 0, max: 0.6, axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v * 100) + "%" } }),
      series: [{ type: "bar", data: T.map((r) => r.rtp), itemStyle: barStyle(), barCategoryGap: "25%" }],
    });
  } else {
    const E = G.value.ev_curve;
    const be = G.value.breakeven_jackpot;
    mk("c-ev", {
      grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "line", lineStyle: { color: css("--axis") } }, formatter: (p) => `Jackpot ${vnd(p[0].value[0])}<br>Hoàn trả ${pct(p[0].value[1])}` },
      xAxis: axis({ type: "value", name: "Jackpot", nameLocation: "middle", nameGap: 26, axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v / 1e9) + " tỷ" } }),
      yAxis: axis({ type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v * 100) + "%" } }),
      series: [{
        type: "line", showSymbol: false, data: E.jackpot.map((j, i) => [j, E.rtp[i]]),
        lineStyle: { color: css("--series-1"), width: 2 }, itemStyle: { color: css("--series-1") },
        markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ref"), type: "solid", width: 1.5 },
          label: { color: css("--ink-2"), fontSize: 11 },
          data: [{ yAxis: 1, label: { formatter: "Hòa vốn (100%)", position: "insideStartTop" } }, ...(be && be <= E.jackpot[E.jackpot.length - 1] ? [{ xAxis: be, label: { formatter: vnd(be), position: "insideEndTop" } }] : [])] },
      }],
    });
  }
}
