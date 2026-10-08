/* app.js — router (#view/game), product tabs, theme. Loaded last. */
const VIEWS = [
  ["analysis", "Phân tích", renderAnalysis],
  ["suggest", "Gợi ý số", renderSuggest],
  ["search", "Tra cứu", renderSearch],
  ["backtest", "Backtest", renderBacktest],
  ["info", "Phương pháp", renderInfo],
];
const state = { view: "analysis", game: "power655" };

function parseHash() {
  const [v, g] = location.hash.replace(/^#/, "").split("/");
  if (VIEWS.some(([k]) => k === v)) state.view = v;
  if (g && DATA.games[g]) state.game = g;
}
function navigate(view = state.view, game = state.game) {
  const h = view === "info" ? "#info" : `#${view}/${game}`;
  if (location.hash !== h) history.replaceState(null, "", h);
  state.view = view; state.game = game;
  store("vl-tab", game);
  render();
}
function render() {
  if (btJob) btJob.stop = true;
  const dlg = document.getElementById("ticket-dlg");
  if (dlg.open) dlg.close();
  disposeAll();
  document.querySelectorAll(".view-btn").forEach((b) => {
    if (b.dataset.v === state.view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === state.game)));
  document.getElementById("game-bar").style.display = state.view === "info" ? "none" : "";
  const [, , fn] = VIEWS.find(([k]) => k === state.view);
  try {
    fn(state.game);
  } catch (e) {
    console.error(e);
    document.getElementById("app").innerHTML = `<p class="err">Lỗi hiển thị: ${esc(e.message)}</p>`;
  }
  document.getElementById("app").insertAdjacentHTML("beforeend", `<footer>Dữ liệu: vietlott-data · cập nhật ${DATA.generated} · Chỉ phục vụ nghiên cứu. Xổ số là trò chơi may rủi có kỳ vọng âm.</footer>`);
}

function initApp() {
  document.getElementById("gen").textContent = "· cập nhật " + DATA.generated;
  document.getElementById("views").innerHTML = VIEWS.map(([k, l]) => `<button class="view-btn" data-v="${k}">${l}</button>`).join("");
  document.querySelectorAll(".view-btn").forEach((b) => b.addEventListener("click", () => { navigate(b.dataset.v); window.scrollTo(0, 0); }));
  document.getElementById("tabs").innerHTML = ORDER.filter((k) => DATA.games[k]).map((k) =>
    `<button class="tab" role="tab" data-k="${k}" aria-selected="false">${DATA.games[k].meta.name}</button>`).join("");
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => navigate(state.view, b.dataset.k)));
  document.getElementById("theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store("vl-theme", root.dataset.theme);
    render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  window.addEventListener("resize", () => charts.forEach((c) => c.resize()));
  window.addEventListener("hashchange", () => { parseHash(); render(); });
  const t = store("vl-theme");
  if (t) document.documentElement.dataset.theme = t;
  const g = store("vl-tab");
  if (g && DATA.games[g]) state.game = g;
  parseHash();
  initPopup();
  navigate();
}
initApp();
