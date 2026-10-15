/* suggest.js — "Pool số": the optimised K-number pool for the next draw
   (src/models/pool_optimizer.py), with its held-out validation. Keno keeps
   the best-RTP spot suggestion. */
function renderSuggest(key) {
  const G = DATA.games[key];
  if (!LOTTO.includes(key)) return renderKenoSuggest(G);
  const P = G.pool, F = P.final, C = P.chosen, m = getModel(key);
  const T = C.test, e = poolExpected(m, C.k);
  const nTrain = P.split_index, nTest = P.series.hits.length - nTrain;
  const featKeys = P.features;
  const order = F.scores.map((s, i) => [s, i + 1]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const inPool = new Set(F.pool);
  const Nf = P.nested;
  const kStable = new Set(Nf.folds.map((f) => f.k)).size === 1;
  const anyK = Nf.per_k.filter((r) => r.ci95[0] > 0).map((r) => `K = ${r.k}`).join(", ");
  document.getElementById("app").innerHTML = `
  <div class="notice"><b>Lưu ý:</b> pool là K số được chấm điểm cao nhất theo dữ liệu quá khứ. Mọi số vẫn có cùng xác suất về ở kỳ tới;
  phần <a href="#suggest/${key}" data-jump="pool-check">Kiểm chứng</a> bên dưới cho biết cách chọn này có hơn chọn ngẫu nhiên hay không.</div>
  <h2>Pool số cho kỳ tới</h2>
  <p class="lede">${G.meta.name} · dữ liệu đến ${F.after_date} · cập nhật ${DATA.generated}. Pool giống nhau với mọi người xem trong cùng ngày.</p>
  <div class="card">
    ${ballsHtml(F.pool, null, { small: false, click: false })}
    <p class="sub" style="margin-top:10px">${F.k} số${m.specialType === "bonus" ? " (chỉ tính 6 số chính, không tính số đặc biệt)" : m.specialType === "separate" ? " cho 5 số chính · số đặc biệt 1–12 không tối ưu được, chọn bất kỳ" : ""}.
    Mua đủ mọi tổ hợp ${m.pick} số trong pool: ${fmt(F.combos)} vé = <b>${vnd(F.cost)}</b>.
    Pool ngẫu nhiên ${F.k} số chứa trung bình ${fmt(F.k * m.pick / m.pool, 2)} số trúng mỗi kỳ.
    K = ${F.k} được chọn bằng quy tắc lồng nhau (xem <a href="#suggest/${key}" data-jump="pool-k">Chọn K</a>) áp dụng trên toàn bộ dữ liệu.</p>
  </div>

  <h2 id="pool-check">Kiểm chứng</h2>
  <p class="lede">Trên ${fmt(nTrain)} kỳ đầu: với mỗi kích thước pool (${P.k_grid[0]}–${P.k_grid[P.k_grid.length - 1]} số), dò ${fmt(P.n_weights)} bộ trọng số trên 70% đầu,
  chọn K có kết quả tốt nhất trên 30% còn lại của đoạn đó (K = ${C.k}), dò lại trọng số trên cả ${fmt(nTrain)} kỳ, rồi chấm trên ${fmt(nTest)} kỳ sau (từ ${P.split_date}) — dữ liệu chưa dùng khi chọn. Mọi kỳ chỉ dùng thông tin trước kỳ đó.</p>
  <div class="grid tiles">
    ${tile("Số trúng TB / kỳ (kiểm tra)", fmt(T.mean, 3), `Pool ngẫu nhiên ${C.k} số: ${fmt(T.expected, 3)}`)}
    ${tile("Lift (kiểm tra)", `${sign(T.lift_pct, 1)}%`, `CI 95%: ${sign(T.ci95[0], 1)} … ${sign(T.ci95[1], 1)} · p = ${pval(T.p_value)}`)}
    ${tile("Lift (dò)", `${sign(P.table.find((r) => r.k === C.k).train.lift_pct, 1)}%`, "Trên chính dữ liệu đã dò — luôn đẹp, không đáng tin")}
  </div>
  <p style="margin:12px 0 0">${poolVerdict(T.ci95[0], T.ci95[1])}</p>
  <div class="grid" style="margin-top:16px">
    <div class="card wide"><h3>Số trúng dư so với ngẫu nhiên, cộng dồn</h3>
      <p class="sub">Pool K = ${C.k} với trọng số dò được. Đi lên = trúng nhiều hơn pool ngẫu nhiên. Vùng xám là giai đoạn kiểm tra: nếu cách chọn thật sự hiệu quả, đường phải tiếp tục đi lên ở đây.</p>
      <div id="pool-excess" class="chart"></div></div>
    <div class="card scroll"><h3>Theo kích thước pool</h3>
      <p class="sub">Mỗi dòng: trọng số tốt nhất cho K đó trên giai đoạn dò. Cột "Dò" luôn dương vì đã chọn cái tốt nhất (quá khớp). "z chọn K": điểm dùng để chọn K (trên phần giữ lại trong giai đoạn dò). Chỉ cột "Kiểm tra" phản ánh khả năng thật.</p>
      <table><thead><tr><th class="num">K</th><th class="num">Ngẫu nhiên</th><th class="num">Lift dò</th><th class="num">z chọn K</th><th class="num">Lift kiểm tra</th><th class="num">CI 95%</th><th class="num">p</th></tr></thead><tbody>
      ${P.table.map((r) => `<tr${r.k === C.k ? ' style="font-weight:650"' : ""}><td class="num">${r.k}${r.k === C.k ? " ✓" : ""}</td><td class="num">${fmt(r.test.expected, 2)}</td><td class="num">${sign(r.train.lift_pct, 1)}%</td><td class="num">${sign(r.val_z)}</td>
        <td class="num">${sign(r.test.lift_pct, 1)}%</td><td class="num">${sign(r.test.ci95[0], 1)} … ${sign(r.test.ci95[1], 1)}</td><td class="num">${pval(r.test.p_value)}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="card"><h3>Số trúng mỗi kỳ (kiểm tra)</h3><p class="sub">So với phân phối siêu bội của pool ngẫu nhiên ${C.k} số.</p>
      ${legendInline("Pool", "Kỳ vọng nếu ngẫu nhiên")}<div id="pool-dist" class="chart"></div></div>
  </div>

  <h2 id="pool-k">Chọn K bằng kiểm định chéo nhiều lớp</h2>
  <p class="lede">Chia ${fmt(Nf.folds.reduce((a, f) => a + f.test.n, 0))} kỳ gần nhất (từ ${Nf.start_date}) thành ${Nf.n_folds} khối liên tiếp. Với mỗi khối: chỉ dùng các kỳ <i>trước</i> khối, chọn K và trọng số bằng đúng quy tắc trên (lớp trong: dò 70% / chọn K trên 30%), rồi chấm trên khối. Nếu tồn tại một K tối ưu thật, các khối phải chọn ra cùng một K và K đó phải thắng pool ngẫu nhiên ở mọi khối.</p>
  <div class="grid tiles">
    ${tile("Lift ngoài mẫu (gộp các khối)", `${sign(Nf.pooled.lift_pct, 1)}%`, `CI 95%: ${sign(Nf.pooled.ci95[0], 1)} … ${sign(Nf.pooled.ci95[1], 1)} · p = ${pval(Nf.pooled.p_value)}`)}
    ${tile("K được chọn ở từng khối", Nf.folds.map((f) => f.k).join(" · "), kStable ? "Ổn định giữa các khối" : "Thay đổi giữa các khối — không có K ổn định")}
    ${tile("K cho kỳ tới", String(F.k), "Cùng quy tắc, áp dụng trên toàn bộ dữ liệu")}
  </div>
  <p style="margin:12px 0 0">${anyK ? `<span class="verdict bad">Có K vượt ngẫu nhiên ở mức 95%</span>: ${anyK} — với ${Nf.per_k.length} giá trị K, khoảng 1/20 sẽ "có ý nghĩa" do may rủi; cần thêm dữ liệu để xác nhận.` : `<span class="verdict ok">Không có K nào tốt hơn ngẫu nhiên</span> — lift ngoài mẫu của mọi K đều có khoảng tin cậy 95% chứa 0.`}</p>
  <div class="grid" style="margin-top:16px">
    <div class="card"><h3>Lift ngoài mẫu theo K</h3><p class="sub">Mỗi K dùng trọng số dò trên các kỳ trước từng khối; gộp kết quả ${Nf.n_folds} khối. Thanh dọc: khoảng tin cậy 95%; đường 0 = pool ngẫu nhiên.</p><div id="pool-kcurve" class="chart"></div></div>
    <div class="card scroll"><h3>Từng khối</h3><table><thead><tr><th>Khối</th><th class="num">Số kỳ</th><th class="num">K chọn</th><th class="num">Lift</th><th class="num">CI 95%</th><th class="num">p</th></tr></thead><tbody>
      ${Nf.folds.map((f) => `<tr><td style="white-space:nowrap">${f.from} → ${f.to}</td><td class="num">${fmt(f.test.n)}</td><td class="num">${f.k}</td><td class="num">${sign(f.test.lift_pct, 1)}%</td><td class="num">${sign(f.test.ci95[0], 1)} … ${sign(f.test.ci95[1], 1)}</td><td class="num">${pval(f.test.p_value)}</td></tr>`).join("")}
    </tbody></table></div>
  </div>

  <h2>Pool được chọn dựa vào đâu</h2>
  <p class="lede">Điểm của mỗi số = tổng các yếu tố × trọng số. Mỗi yếu tố được chuẩn hóa (0 = trung bình các số). Trọng số dương: ưu tiên số có giá trị cao; âm: ưu tiên số có giá trị thấp.
  Trọng số dưới đây được dò lại trên toàn bộ ${fmt(P.series.hits.length)} kỳ để tạo pool kỳ tới.</p>
  <div class="grid">
    <div class="card"><h3>Trọng số</h3><p class="sub">${featKeys.map((k) => `<b>${POOL_FEATURES[k][0]}</b>: ${POOL_FEATURES[k][1].toLowerCase()}`).join(" · ")}.</p><div id="pool-w" class="chart"></div></div>
    <div class="card"><h3>Điểm từng số</h3><p class="sub">Xanh: trong pool. Rê chuột để xem từng yếu tố.</p><div id="pool-score" class="chart" style="height:${m.pool * 13 + 20}px"></div></div>
  </div>
  <p class="muted" style="font-size:12.5px;margin-top:12px">Muốn tự chỉnh trọng số và K rồi xem kết quả? Dùng mục <a href="#backtest/${key}">Backtest</a>.</p>`;

  document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (ev) => {
    ev.preventDefault();
    document.getElementById(a.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  excessChart("pool-excess", P.series.dates, P.series.hits, P.series.expected, nTrain);
  const ks = range1(m.pick + 1).map((x) => x - 1);
  obsVsExp("pool-dist", ks, P.dist_test.obs, P.dist_test.exp, { xName: "Số trúng trong pool", obsName: "Pool" });
  weightsChart("pool-w", F.weights);
  liftByKChart("pool-kcurve", Nf.per_k);
  mk("pool-score", {
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    xAxis: axis({ type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => fmt(v, 1) } }),
    yAxis: axis({ type: "category", data: order.map(([, v]) => pad2(v)), inverse: true, splitLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 10, interval: 0 } }),
    tooltip: { formatter: (p) => { const v = order[p[0].dataIndex][1]; const f = F.features[v - 1];
      return `Số <b>${pad2(v)}</b> · điểm ${sign(p[0].value)}${inPool.has(v) ? " · trong pool" : ""}<br>${featKeys.map((k, j) => `${POOL_FEATURES[k][0]}: ${sign(f[j])} × ${sign(F.weights[j])}`).join("<br>")}`; } },
    series: [{ type: "bar", barWidth: "70%", data: order.map(([s, v]) => ({ value: s, itemStyle: { color: css(inPool.has(v) ? "--series-1" : "--ref"), opacity: inPool.has(v) ? 1 : 0.35, borderRadius: s >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })) }],
  });
}

function renderKenoSuggest(G) {
  const S = G.suggest;
  document.getElementById("app").innerHTML = `
  <h2>Gợi ý Keno</h2>
  <p class="lede">Keno trả thưởng cố định, nên chỉ bậc chơi ảnh hưởng tỷ lệ hoàn trả. Bậc ${S.spot} có hoàn trả cao nhất (${pct(S.best.rtp)} sau thuế). Số chọn ngẫu nhiên đều — mọi bộ có giá trị như nhau. Pool số tối ưu chỉ áp dụng cho 6/55, 6/45, 5/35.</p>
  <div class="card">${S.tickets.map((t, i) => `<div class="ticket">${ballsHtml(t, null, { small: false, click: false })}<div class="meta">Vé ${i + 1}</div></div>`).join("")}</div>`;
}

/* out-of-sample lift per K with 95% CI error bars */
function liftByKChart(id, rows) {
  const ink = css("--series-1");
  mk(id, {
    grid: { left: 8, right: 16, top: 16, bottom: 30, containLabel: true },
    xAxis: axis({ type: "category", data: rows.map((r) => r.k), name: "K (số trong pool)", nameLocation: "middle", nameGap: 26, splitLine: { show: false } }),
    yAxis: axis({ type: "value", axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => sign(v, 0) + "%" } }),
    tooltip: { formatter: (p) => { const r = rows[p[0].dataIndex]; return `K = ${r.k}<br>Lift ${sign(r.lift_pct, 1)}% · CI ${sign(r.ci95[0], 1)} … ${sign(r.ci95[1], 1)}<br>p = ${pval(r.p_value)} · ${fmt(r.n)} kỳ`; } },
    series: [
      {
        type: "custom", data: rows.map((r, i) => [i, r.ci95[0], r.ci95[1]]),
        renderItem: (params, api) => {
          const lo = api.coord([api.value(0), api.value(1)]), hi = api.coord([api.value(0), api.value(2)]);
          const w = api.size([1, 0])[0] * 0.25, style = { stroke: ink, lineWidth: 1.5 };
          return { type: "group", children: [
            { type: "line", shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
            { type: "line", shape: { x1: lo[0] - w, y1: lo[1], x2: lo[0] + w, y2: lo[1] }, style },
            { type: "line", shape: { x1: hi[0] - w, y1: hi[1], x2: hi[0] + w, y2: hi[1] }, style },
          ] };
        },
        encode: { x: 0, y: [1, 2] }, z: 1,
      },
      {
        type: "scatter", data: rows.map((r) => r.lift_pct), symbolSize: 9, z: 2,
        itemStyle: { color: ink, borderColor: css("--surface"), borderWidth: 2 },
        markLine: { silent: true, symbol: "none", lineStyle: { color: css("--ref"), width: 1.5 }, label: { formatter: "Ngẫu nhiên", color: css("--ink-2"), fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: 0 }] },
      },
    ],
  });
}
