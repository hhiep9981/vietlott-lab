// Run the dashboard's model code under Node and print checks as JSON.
// Usage: node tests/js/check_model.js <data.json> <js dir>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [dataPath, jsDir] = process.argv.slice(2);
const ctx = { DATA: JSON.parse(fs.readFileSync(dataPath, "utf8")), console, performance, Math };
vm.createContext(ctx);
for (const f of ["core.js", "model.js", "popup.js"]) {
  vm.runInContext(fs.readFileSync(path.join(jsDir, f), "utf8"), ctx, { filename: f });
}
const out = vm.runInContext(`(() => {
  const res = {};
  for (const key of Object.keys(DATA.games)) {
    const m = getModel(key);
    const R = m.final.cache.rules;
    const r = { strategies: {}, rules: R };
    for (const s of Object.keys(STRATEGIES)) for (const filters of [true, false]) {
      const a = generate(m.final, s, seededRng("t|" + s), 10, { filters });
      const b = generate(m.final, s, seededRng("t|" + s), 10, { filters });
      r.strategies[s + (filters ? "+F" : "")] = {
        n: a.length,
        deterministic: JSON.stringify(a) === JSON.stringify(b),
        valid: a.every((t) => t.numbers.length === m.pick && new Set(t.numbers).size === m.pick
          && t.numbers.every((v) => v >= 1 && v <= m.pool)
          && t.numbers.every((v, i) => i === 0 || v > t.numbers[i - 1])),
        inHistory: a.filter((t) => m.final.history.has(t.numbers.join("-"))).length,
        passRules: a.filter((t) => passesRules(t.numbers, R)).length,
        special: a.every((t) => m.specialType !== "separate" || (t.special >= 1 && t.special <= 12)),
        labels: a.map((t) => t.label),
      };
    }
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
    res[key] = r;
  }
  return res;
})()`, ctx);
process.stdout.write(JSON.stringify(out));
