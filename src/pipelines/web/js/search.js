/* search.js — "Tra cứu": find past draws containing / overlapping a set. */
const SEARCH_LIMIT = 200;

function parseNumbers(text, pool) {
  const raw = (text.match(/\d+/g) || []).map(Number);
  const bad = raw.filter((v) => v < 1 || v > pool);
  const nums = [...new Set(raw.filter((v) => v >= 1 && v <= pool))].sort((a, b) => a - b);
  return { nums, bad, dup: raw.length - bad.length - nums.length };
}

function renderSearch(key) {
  if (!LOTTO.includes(key)) {
    document.getElementById("app").innerHTML = `<h2>Tra cứu</h2><p class="lede">Tra cứu chỉ hỗ trợ Power 6/55, Mega 6/45 và Lotto 5/35.</p>`;
    return;
  }
  const m = getModel(key);
  const last = store(`vl-q-${key}`) || "";
  document.getElementById("app").innerHTML = `
  <h2>Tra cứu bộ số trong lịch sử</h2>
  <p class="lede">Nhập 1–${m.pick} số (cách nhau bởi dấu cách hoặc dấu phẩy) để tìm các kỳ ${m.name} đã có những số đó. Bấm vào một kỳ để xem phân tích.</p>
  <div class="card">
    <form class="controls" id="q-form" style="margin:0">
      <input type="text" id="q" inputmode="numeric" autocomplete="off" placeholder="VD: 5 12 23 34 41 50" value="${esc(last)}" aria-label="Các số cần tìm">
      <label>Điều kiện <select id="q-mode">
        <option value="all">Chứa tất cả các số</option>
        ${range1(m.pick - 1).reverse().map((k) => `<option value="${k}">Trùng ít nhất ${k} số</option>`).join("")}
      </select></label>
      <button class="primary" type="submit">Tìm</button>
      <button class="ghost" type="button" id="q-analyse" disabled>Phân tích bộ này</button>
    </form>
    <p class="sub" id="q-msg" style="margin-top:8px"></p>
  </div>
  <div id="q-out"></div>`;
  const run = () => {
    const { nums, bad } = parseNumbers(document.getElementById("q").value, m.pool);
    store(`vl-q-${key}`, document.getElementById("q").value);
    const msg = document.getElementById("q-msg");
    const btn = document.getElementById("q-analyse");
    btn.disabled = nums.length !== m.pick;
    btn.onclick = () => openTicket(key, nums);
    if (!nums.length) { msg.innerHTML = bad.length ? `<span class="err">Số ngoài khoảng 1–${m.pool}: ${bad.join(", ")}</span>` : ""; document.getElementById("q-out").innerHTML = ""; return; }
    if (nums.length > m.pick) { msg.innerHTML = `<span class="err">Tối đa ${m.pick} số.</span>`; return; }
    msg.innerHTML = `Đang tìm: ${ballsHtml(nums, null, { click: false })}${bad.length ? ` <span class="err">(bỏ qua ${bad.join(", ")})</span>` : ""}`;
    renderSearchResults(m, nums, document.getElementById("q-mode").value);
  };
  document.getElementById("q-form").addEventListener("submit", (e) => { e.preventDefault(); run(); });
  document.getElementById("q-mode").addEventListener("change", run);
  if (last) run();
}

function renderSearchResults(m, nums, mode) {
  const k = nums.length, nD = m.draws.length;
  const need = mode === "all" ? k : Math.min(Number(mode), k);
  const by = new Array(k + 1).fill(0);
  const hits = [];
  for (let i = nD - 1; i >= 0; i--) {
    const o = overlapCount(m.draws[i].main, nums);
    by[o]++;
    if (o >= need) hits.push([i, o]);
  }
  const set = new Set(nums);
  const exp = (j) => nD * hypergeom(m.pool, m.pick, k, j);
  const exact = k === m.pick ? hits.filter(([, o]) => o === k).length : null;
  document.getElementById("q-out").innerHTML = `
  <div class="grid tiles" style="margin-top:16px">
    ${tile("Số kỳ khớp điều kiện", fmt(hits.length), `Kỳ vọng nếu ngẫu nhiên ≈ ${fmt(range1(k).filter((j) => j >= need).reduce((a, j) => a + exp(j), 0), 2)}`)}
    ${exact !== null ? tile("Trùng hoàn toàn", exact ? `<span class="verdict bad">${exact} lần</span>` : `<span class="verdict ok">Chưa từng</span>`, "Bộ này đã từng là kết quả?") : ""}
    ${tile("Lần gần nhất", hits.length ? m.draws[hits[0][0]].date : "–", hits.length ? `Kỳ #${m.draws[hits[0][0]].id}` : "")}
  </div>
  <div class="card scroll" style="margin-top:16px"><h3>Phân bố số trùng với ${fmt(nD)} kỳ</h3>
    <table><thead><tr><th>Trùng</th>${range1(k + 1).map((j) => `<th class="num">${j - 1} số</th>`).join("")}</tr></thead><tbody>
    <tr><td>Quan sát</td>${by.map((c) => `<td class="num">${fmt(c)}</td>`).join("")}</tr>
    <tr><td class="muted">Kỳ vọng</td>${by.map((_, j) => `<td class="num muted">${fmt(exp(j), 1)}</td>`).join("")}</tr></tbody></table></div>
  <div class="card scroll" style="margin-top:16px"><h3>Các kỳ khớp${hits.length > SEARCH_LIMIT ? ` (${SEARCH_LIMIT} kỳ gần nhất)` : ""}</h3>
    ${hits.length ? `<table><thead><tr><th>Ngày</th><th>Kỳ</th><th>Bộ số (tô đậm = trùng)</th><th class="num">Trùng</th></tr></thead><tbody>
    ${hits.slice(0, SEARCH_LIMIT).map(([i, o]) => { const d = m.draws[i]; return `<tr><td>${d.date}</td><td>#${d.id}</td><td>${ballsHtml(d.main, d.special, { hits: set, ctx: d })}</td><td class="num">${o}</td></tr>`; }).join("")}
    </tbody></table>` : `<p class="muted">Không có kỳ nào.</p>`}</div>`;
}
