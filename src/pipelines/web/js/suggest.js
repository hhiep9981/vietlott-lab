/* suggest.js — "Gợi ý số": per-visitor ticket sets for 5 strategies.
   Seed = device id + VN date + product + strategy + filter flag + counter. */
const SUGGEST_N = 10;

function renderSuggest(key) {
  const G = DATA.games[key];
  if (!LOTTO.includes(key)) return renderKenoSuggest(G);
  const strat = store("vl-strat") && STRATEGIES[store("vl-strat")] ? store("vl-strat") : "hot";
  const bt = (G.backtest ? G.backtest.results : []).find((r) => r.strategy === "Unseen pool");
  document.getElementById("app").innerHTML = `
  <div class="notice"><b>Lưu ý:</b> mọi bộ số có cùng xác suất trúng (Jackpot ${G.meta.name}: 1/${fmt(comb(G.meta.pool, G.meta.drawn) * (key === "power535" ? 12 : 1))}).
  Các chiến lược dưới đây chỉ thay đổi <i>cách chọn</i>, không thay đổi cơ hội. Kiểm chứng từng chiến lược ở mục <a href="#backtest/${key}">Backtest</a>.</div>
  <h2>Bộ số của bạn hôm nay</h2>
  <p class="lede">Mỗi người xem nhận bộ số riêng, sinh ngay trên trình duyệt từ mã ngẫu nhiên của thiết bị và ngày hôm nay — không thu thập IP hay dữ liệu cá nhân. Tải lại trang vẫn giữ nguyên trong ngày. Bấm vào một vé để xem phân tích chi tiết.</p>
  <div class="minitabs" role="tablist" id="strat-tabs">${Object.entries(STRATEGIES).map(([k, s]) => `<button role="tab" data-s="${k}" aria-selected="${k === strat}">${s.label}</button>`).join("")}</div>
  <div class="card">
    <div class="card-head"><div><h3 id="strat-title"></h3><p class="sub" id="strat-desc"></p><p class="sub" id="my-meta"></p></div>
      <div class="controls" style="margin:0">
        <label title="Loại bộ không hợp quy tắc tổng/chẵn lẻ/nhỏ lớn/khoảng cách"><input type="checkbox" id="flt"> Bộ lọc tiêu chuẩn</label>
        <button class="ghost" id="my-new">Tạo bộ khác</button><button class="ghost" id="my-reset">Về bộ đầu tiên</button>
      </div></div>
    <div class="scroll" id="my-tickets"></div>
    <p class="sub" id="flt-desc" style="margin-top:8px"></p>
  </div>
  ${bt ? `<p class="muted" style="font-size:12.5px;margin-top:10px">Tham khảo: phương án "pool chưa xuất hiện" (Nóng/Lạnh/Cân bằng + bộ lọc) trong backtest Python có lift ${sign(bt.lift_pct)}% (CI 95% ${sign(bt.lift_ci95[0])} … ${sign(bt.lift_ci95[1])}) — không khác ngẫu nhiên.</p>` : ""}`;

  const fltBox = document.getElementById("flt");
  fltBox.checked = store("vl-flt") !== "0";
  const draw = () => {
    const s = document.querySelector("#strat-tabs [aria-selected=true]").dataset.s;
    renderTicketSet(key, s, fltBox.checked);
  };
  document.querySelectorAll("#strat-tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#strat-tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    store("vl-strat", b.dataset.s);
    draw();
  }));
  fltBox.addEventListener("change", () => { store("vl-flt", fltBox.checked ? "1" : "0"); draw(); });
  draw();
}

function renderTicketSet(key, strategy, filters) {
  const m = getModel(key), R = m.final.cache.rules;
  const weird = strategy === "weird";
  const day = todayVN(), dev = deviceId();
  const ckey = `vl-gen-${key}-${day}-${strategy}`;
  const counter = parseInt(store(ckey) || "0", 10) || 0;
  const t0 = performance.now();
  const tickets = generate(m.final, strategy, seededRng(`${dev}|${key}|${day}|${strategy}|${filters && !weird ? 1 : 0}|${counter}`), SUGGEST_N, { filters });
  const ms = performance.now() - t0;
  document.getElementById("strat-title").textContent = `Chiến lược ${STRATEGIES[strategy].label}`;
  document.getElementById("strat-desc").textContent = STRATEGIES[strategy].desc;
  document.getElementById("my-meta").textContent = `Ngày ${day} · mã thiết bị ${dev.slice(0, 6)} · lần tạo #${counter + 1} · ${fmt(ms, 0)} ms`;
  const flt = document.getElementById("flt");
  flt.disabled = weird;
  document.getElementById("flt-desc").innerHTML = weird
    ? "Mẫu lạ cố ý phá vỡ quy tắc tổng/khoảng cách nên bộ lọc tiêu chuẩn không áp dụng. Lưu ý: nhiều người chơi chọn các mẫu này (dãy liên tiếp, cấp số cộng…), nên nếu trúng Jackpot thì khả năng phải chia giải cao hơn."
    : `Luôn loại ${fmt(m.final.history.size)} bộ đã từng quay.${filters ? ` Bộ lọc: tổng ${fmt(R.sum_lo)}–${fmt(R.sum_hi)}, số lẻ ${R.odd_ok.join("/")}, số nhỏ (≤ ${R.low_max}) ${R.low_ok.join("/")}, khoảng cách ≤ ${R.max_gap}, cặp liền ≤ ${R.max_adjacent}.` : " Bộ lọc tiêu chuẩn đang tắt."}`;
  const z = m.final.cache.freqZ;
  document.getElementById("my-tickets").innerHTML = `<table><thead><tr><th>#</th><th>Bộ số</th><th class="num">Tổng</th><th class="num">Lẻ / Nhỏ</th><th>Khoảng cách</th><th class="num">Tần suất TB (z)</th>${strategy === "pattern" || weird ? "<th>Công thức / mẫu</th>" : ""}</tr></thead><tbody>
    ${tickets.map((t, i) => {
      const f = ticketFeatures(m, t.numbers);
      const mz = t.numbers.reduce((a, v) => a + z[v - 1], 0) / t.numbers.length;
      return `<tr><td class="muted">${i + 1}</td><td>${ballsHtml(t.numbers, t.special)}</td><td class="num">${f.sum}</td><td class="num">${f.odd} / ${f.low}</td>
        <td style="font-variant-numeric:tabular-nums">${f.gaps.join(" · ")}</td><td class="num">${sign(mz)}</td>${strategy === "pattern" || weird ? `<td class="muted">${esc(t.label)}</td>` : ""}</tr>`;
    }).join("")}
  </tbody></table>`;
  document.getElementById("my-new").onclick = () => { store(ckey, String(counter + 1)); renderTicketSet(key, strategy, filters); };
  document.getElementById("my-reset").onclick = () => { store(ckey, "0"); renderTicketSet(key, strategy, filters); };
  window.__vlTickets = tickets;
}

function renderKenoSuggest(G) {
  const S = G.suggest;
  document.getElementById("app").innerHTML = `
  <h2>Gợi ý Keno</h2>
  <p class="lede">Keno trả thưởng cố định, nên chỉ bậc chơi ảnh hưởng tỷ lệ hoàn trả. Bậc ${S.spot} có hoàn trả cao nhất (${pct(S.best.rtp)} sau thuế). Số chọn ngẫu nhiên đều — mọi bộ có giá trị như nhau. Các chiến lược Nóng/Lạnh/Pattern chỉ áp dụng cho 6/55, 6/45, 5/35.</p>
  <div class="card">${S.tickets.map((t, i) => `<div class="ticket">${ballsHtml(t, null, { small: false, click: false })}<div class="meta">Vé ${i + 1}</div></div>`).join("")}</div>`;
}
