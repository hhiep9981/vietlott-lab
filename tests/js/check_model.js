// Run the dashboard's model + pool code under Node and print checks as JSON.
// Usage: node tests/js/check_model.js <data.json> <js dir>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [dataPath, jsDir] = process.argv.slice(2);
const ctx = { DATA: JSON.parse(fs.readFileSync(dataPath, "utf8")), console, performance, Math };
vm.createContext(ctx);
for (const f of ["core.js", "model.js", "popup.js", "pool.js"]) {
  vm.runInContext(fs.readFileSync(path.join(jsDir, f), "utf8"), ctx, { filename: f });
}
const out = vm.runInContext(`(() => {
  const res = {};
  for (const key of Object.keys(DATA.games)) {
    const m = getModel(key), P = DATA.games[key].pool;
    const r = {};
    r.prize = m.prize;
    r.historySize = m.final.history.size;
    r.nDraws = m.draws.length;
    r.profiles = m.final.profiles.size;
    r.hypergeomSum = Array.from({ length: m.pick + 1 }, (_, k) => hypergeom(m.pool, m.pick, m.pick, k)).reduce((a, b) => a + b, 0);
    const last = m.draws[m.draws.length - 1];
    r.scoreSelf = scoreTicket(m, last, { numbers: last.main, special: last.special });
    if (m.specialType === "bonus" && last.special) {
      const five = [...last.main.slice(0, 5), last.special].sort((a, b) => a - b);
      r.scoreJ2 = scoreTicket(m, last, { numbers: five });
    }
    // pool: same features/scores/pool/hits as Python
    r.finalPool = poolAt(m, m.draws.length, P.final.weights, P.final.k);
    r.finalScores = poolScores(m, m.draws.length, P.final.weights);
    r.seriesHits = poolBacktest(m, P.chosen.weights, P.chosen.k, P.warmup).map((x) => x.hits);
    // history: reconstructed rows match the backtest; a logged pool overrides
    const hist = poolHistory(m, P);
    r.histHits = hist.map((x) => x.hits);
    r.histRanksOk = hist.every((x) => x.ranks.length === m.pick && x.ranks.every((k) => k >= 1 && k <= m.pool)
      && x.ranks.filter((k) => k <= x.K).length === x.hits);
    const T = m.draws.length;
    m.poolHist = null;
    const fake = { after_id: m.draws[T - 2].id, k: 7, pool: [1, 2, 3, 4, 5, 6, 7], weights: P.final.weights };
    const lastRow = poolHistory(m, Object.assign({}, P, { log: [fake] })).slice(-1)[0];
    r.loggedLast = { source: lastRow.source, pool: lastRow.pool, hits: lastRow.hits, expectHits: m.draws[T - 1].main.filter((v) => v <= 7).length };
    res[key] = r;
  }
  return res;
})()`, ctx);
process.stdout.write(JSON.stringify(out));
