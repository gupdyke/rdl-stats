const $ = (id) => document.getElementById(id);
const out = $("out");
let catalog = { rdl: [], personal: [] };
let news = null;          // parsed newsletter currently selected
let sort = { key: null, desc: true };
const NAME = "__name";   // sort key for the Player/Team column (alphabetical)

// ---- column groups -------------------------------------------------------
const wl = (w, l) => (r) => (r[w] == null ? "" : `${r[w]}-${r[l]}`);
const pct = (k) => (r) => (r[k] == null ? "---" : (+r[k]).toFixed(3));   // 0.600, like the newsletter
const num = (k, d = 0) => (r) => (r[k] == null ? "" : (+r[k]).toFixed(d));
const GROUPS = {
  singles:  { title: "Singles", cols: [
    { h: "301", f: wl("s301_w", "s301_l"), k: "s301_w" },
    { h: "Cricket", f: wl("scr_w", "scr_l"), k: "scr_w" },
    { h: "Record", f: wl("s_w", "s_l"), k: "s_w" },
    { h: "Win %", f: pct("s_pct"), k: "s_pct" } ] },
  doubles:  { title: "Doubles", cols: [
    { h: "Cricket", f: wl("dcr_w", "dcr_l"), k: "dcr_w" },
    { h: "501", f: wl("d501_w", "d501_l"), k: "d501_w" },
    { h: "Record", f: wl("d_w", "d_l"), k: "d_w" },
    { h: "Win %", f: pct("d_pct"), k: "d_pct" } ] },
  overall:  { title: "Overall", cols: [
    { h: "Record", f: wl("t_w", "t_l"), k: "t_w" },
    { h: "Win %", f: pct("t_pct"), k: "t_pct" },
    { h: "Matches", f: num("matches"), k: "matches" },
    { h: "Games", f: num("gp"), k: "gp" } ] },
  allstar:  { title: "All-Star", cols: [
    { h: "Points", f: num("asp", 1), k: "asp" },
    { h: "Avg", f: num("asp_avg", 3), k: "asp_avg" } ] },
  tiebreak: { title: "Tiebreakers", cols: [
    { h: "W-L", f: wl("tb_w", "tb_l"), k: "tb_w" } ] },
};

const el = (tag, attrs = {}, text) => {
  const e = Object.assign(document.createElement(tag), attrs);
  if (text != null) e.textContent = text;
  return e;
};
function fill(select, items, keepValue) {
  const prev = select.value;
  select.replaceChildren(...items.map(([v, t]) => el("option", { value: v }, t)));
  if (keepValue && items.some(([v]) => v === prev)) select.value = prev;
}
// The public site (GitHub Pages, RDL only) has no server: it reads pre-built
// JSON made by build_public.py instead of the API.
const PUBLIC = window.STATS_PUBLIC === true;
function publicURL(url) {
  const u = new URL(url, location.origin);
  if (u.pathname === "/api/catalog") return "data/catalog.json";
  if (u.pathname === "/api/rdl") return `data/rdl/${u.searchParams.get("file").replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
  throw new Error("Not available on the public site.");
}
async function getJSON(url) {
  const r = await fetch(PUBLIC ? publicURL(url) : url);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function message(text, cls = "empty") { out.replaceChildren(el("p", { className: cls }, text)); }

// ---- table ---------------------------------------------------------------
function statTable(rows, { nameHeader, name, total }) {
  const groups = [...document.querySelectorAll(".groups input:checked")].map((c) => GROUPS[c.value]);
  if (sort.key === NAME) {
    rows = [...rows].sort((a, b) => name(a).localeCompare(name(b)) * (sort.desc ? -1 : 1));
  } else if (sort.key) {
    rows = [...rows].sort((a, b) => ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)) * (sort.desc ? -1 : 1));
  }
  const top = el("tr"), sub = el("tr");
  top.append(el("th", { className: "grp" }, ""));
  const nameArrow = sort.key === NAME ? (sort.desc ? " ▼" : " ▲") : "";
  const nameTh = el("th", { className: "name", title: "Sort A-Z" }, nameHeader + nameArrow);
  nameTh.onclick = () => { sort = { key: NAME, desc: sort.key === NAME ? !sort.desc : false }; render(); };
  sub.append(nameTh);
  for (const g of groups) {
    top.append(el("th", { className: "grp", colSpan: g.cols.length }, g.title));
    for (const c of g.cols) {
      const arrow = sort.key === c.k ? (sort.desc ? " ▼" : " ▲") : "";
      const th = el("th", { title: "Sort" }, c.h + arrow);
      th.onclick = () => { sort = { key: c.k, desc: sort.key === c.k ? !sort.desc : true }; render(); };
      sub.append(th);
    }
  }
  const line = (r, label, cls) => {
    const tr = el("tr", { className: cls || "" });
    tr.append(el("td", { className: "name" }, label));
    for (const g of groups) for (const c of g.cols) tr.append(el("td", {}, c.f(r)));
    return tr;
  };
  const tbody = el("tbody");
  rows.forEach((r) => tbody.append(line(r, name(r))));
  if (total) tbody.append(line(total, "Team total", "total"));
  const table = el("table");
  table.append(el("thead"), tbody);
  table.tHead.append(top, sub);
  const wrap = el("div", { className: "scroll" });
  wrap.append(table);
  return wrap;
}

// ---- RDL mode ------------------------------------------------------------
// Division "" = All divisions (the whole league).
const teamsOf = () => (!news ? [] : $("division").value ? news.divisions[$("division").value] || [] : allTeams());
const playerKey = (t, p) => `${t.code}:${p.number}`;   // numbers repeat across divisions
const playerLabel = (t, p) => `${p.name} (#${p.number}, ${t.code})`;

// Season (from the file name: Sp23, Fa26, ...) then Week. The catalog comes
// in chronological order, so seasons and weeks list oldest first.
const seasonOf = (n) => n.season || "Other";
function fillWeeks() {
  const prevWeek = catalog.rdl.find((n) => n.file === $("newsletter").value)?.week;
  const weeks = catalog.rdl.filter((n) => seasonOf(n) === $("season").value);
  fill($("newsletter"), weeks.map((n) => [n.file,
    n.final ? "End of season" : n.week != null ? `Week ${n.week}` : n.file]));
  const same = weeks.find((n) => n.week != null && n.week === prevWeek);   // keep the week across seasons
  $("newsletter").value = same ? same.file : weeks[weeks.length - 1]?.file || "";
}

async function loadNewsletter() {
  const prevName = selectedPlayer()?.p.name;   // follow the person by name, not team/number
  news = null;
  if (!$("newsletter").value) return message("No RDL newsletters in the data folder yet.");
  message("Loading…");
  try { news = await getJSON(`/api/rdl?file=${encodeURIComponent($("newsletter").value)}`); }
  catch (e) { return message(e.message, "error"); }
  const divs = Object.keys(news.divisions).sort().map((d) => [d, `${d} Division`]);
  const first = !$("division").options.length;
  fill($("division"), [["", "All divisions"], ...divs], true);
  if (first) $("division").value = divs[0]?.[0] || "";
  fill($("cmp-division"), [["", "All divisions"], ...divs], true);
  fillCompare();
  fillTeams();
  if (prevName) followPlayer(prevName);
}

// The Browse player as {t, p}, or null.
function selectedPlayer() {
  if (!news || !$("player").value) return null;
  const [code, num] = $("player").value.split(":");
  const t = allTeams().find((t) => t.code === code);
  const p = t?.players.find((p) => String(p.number) === num);
  return p ? { t, p } : null;
}
// After a season/week change: select the same person wherever they are now.
// Team codes and numbers change between seasons, so match on the name.
function followPlayer(name) {
  const hit = allTeams().flatMap((t) => t.players.map((p) => ({ t, p }))).find(({ p }) => p.name === name);
  if (hit) return showPlayer(hit.t, hit.p);
  $("team").value = "";
  fillPlayers();
  $("player").value = "";
  render();
  out.prepend(el("p", { className: "empty" },
    `${name} isn't in ${$("season").value} ${$("newsletter").selectedOptions[0]?.text || ""}.`));
}
function fillTeams() {
  fill($("team"), [["", "All teams"], ...teamsOf().map((t) => [t.code, `${t.code} ${t.name}`])], true);
  fillPlayers();
}
function fillPlayers() {
  const teams = $("team").value ? teamsOf().filter((t) => t.code === $("team").value) : teamsOf();
  const players = teams.flatMap((t) => t.players.map((p) => [playerKey(t, p), playerLabel(t, p)]))
    .sort((a, b) => a[1].localeCompare(b[1]));
  fill($("player"), [["", "All players"], ...players], true);
  render();
}

function renderRDL() {
  if (!news) return;
  if (rdlView() !== "browse") return renderCompare();
  const teams = teamsOf();
  const team = teams.find((t) => t.code === $("team").value);
  const withLabels = (ts) => ts.flatMap((t) => t.players.map((p) => ({ ...p, label: playerLabel(t, p) })));
  const [code, num] = $("player").value.split(":");
  const owner = num && teams.find((t) => t.code === code);
  const p = owner && owner.players.find((p) => String(p.number) === num);
  if (p) {
    out.replaceChildren(el("h2", {}, `${p.name} — ${owner.code} ${owner.name}`),
      statTable(withLabels([{ ...owner, players: [p] }]), { nameHeader: "Player", name: (r) => r.label }));
  } else if (team) {
    out.replaceChildren(el("h2", {}, `${team.code} ${team.name}`),
      statTable(withLabels([team]), { nameHeader: "Player", name: (r) => r.label, total: team.totals }));
  } else if (!$("division").value) {
    const rows = withLabels(teams);
    out.replaceChildren(el("h2", {}, `All divisions — ${rows.length} players`),
      statTable(rows, { nameHeader: "Player", name: (r) => r.label }));
  } else {
    const rows = teams.map((t) => ({ ...t.totals, label: `${t.code} ${t.name}` }));
    out.replaceChildren(el("h2", {}, `${$("division").value} Division — team totals`),
      statTable(rows, { nameHeader: "Team", name: (r) => r.label }));
  }
}

// ---- RDL compare: any number of teams or players, from any division --------
const picked = { teams: [], players: [] };   // keys, in the order added
const rdlView = () => $("rdl-view").value;
const allTeams = () => Object.keys(news?.divisions || {}).sort().flatMap((d) => news.divisions[d]);

function compareItems() {
  if (rdlView() === "teams") {
    return allTeams().map((t) => ({ key: t.code, label: `${t.code} ${t.name}`, div: t.code[0], row: t.totals }));
  }
  // Players are keyed by name so a comparison carries across seasons and weeks.
  return allTeams().flatMap((t) => t.players.map((p) => ({
    key: p.name, label: `${p.name} (#${p.number}, ${t.code})`, div: t.code[0], row: p,
  }))).sort((a, b) => a.label.localeCompare(b.label));
}

function fillCompare() {
  const items = compareItems(), list = picked[rdlView()] || [];
  const div = $("cmp-division").value;
  $("cmp-add-label").textContent = rdlView() === "teams" ? "Add team" : "Add player";
  const avail = items.filter((i) => (!div || i.div === div) && !list.includes(i.key));
  fill($("cmp-add"), [["", avail.length ? "Choose…" : "None left"], ...avail.map((i) => [i.key, i.label])]);
  const byKey = new Map(items.map((i) => [i.key, i]));
  $("chips").replaceChildren(...list.map((k) => {
    const label = byKey.get(k)?.label || `${k} (not in this week)`;
    const chip = el("span", { className: byKey.has(k) ? "chip" : "chip missing" }, label);
    const x = el("button", { type: "button", title: "Remove" }, "×");
    x.setAttribute("aria-label", `Remove ${label}`);
    x.onclick = () => { list.splice(list.indexOf(k), 1); fillCompare(); };
    chip.append(x);
    return chip;
  }));
  render();
}

function renderCompare() {
  const kind = rdlView() === "teams" ? "team" : "player";
  const byKey = new Map(compareItems().map((i) => [i.key, i]));
  const sel = picked[rdlView()].filter((k) => byKey.has(k)).map((k) => byKey.get(k));
  if (!sel.length) {
    return message(picked[rdlView()].length ? `None of these ${kind}s are in this week.` : `Add ${kind}s above to compare them.`);
  }
  const rows = sel.map((i) => ({ ...i.row, label: i.label }));
  out.replaceChildren(el("h2", {}, `Comparing ${sel.length} ${kind}${sel.length === 1 ? "" : "s"}`),
    statTable(rows, { nameHeader: kind === "team" ? "Team" : "Player", name: (r) => r.label }));
}

// ---- RDL player search: any part of a name, either order, whole league -----
function searchPlayers(q) {
  const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length || !news) return [];
  return allTeams().flatMap((t) => t.players.map((p) => ({ t, p })))
    .filter(({ p }) => words.every((w) => p.name.toLowerCase().includes(w)))
    .sort((a, b) => a.p.name.localeCompare(b.p.name))
    .slice(0, 30);
}
function renderSearch() {
  const q = $("player-search").value, hits = searchPlayers(q), ul = $("search-results");
  ul.replaceChildren(...hits.map(({ t, p }) => {
    const b = el("button", { type: "button" }, playerLabel(t, p));
    b.onmousedown = (e) => { e.preventDefault(); pickPlayer(t, p); };   // before the input's blur
    const li = el("li");
    li.append(b);
    return li;
  }));
  if (!hits.length && q.trim()) ul.append(el("li", { className: "none" }, "No players found"));
  ul.hidden = !ul.children.length;
  return hits;
}
function closeSearch() { $("player-search").value = ""; $("search-results").hidden = true; }
// Browse: jump to the player. Compare players: add them.
function pickPlayer(t, p) {
  closeSearch();
  if (rdlView() === "players") {
    if (!picked.players.includes(p.name)) picked.players.push(p.name);
    return fillCompare();
  }
  showPlayer(t, p);
}
function showPlayer(t, p) {
  $("division").value = t.code[0];
  fillTeams();
  $("team").value = t.code;
  fillPlayers();
  $("player").value = playerKey(t, p);
  render();
}

function switchRdlView() {
  $("search-row").hidden = rdlView() === "teams";
  $("browse-controls").hidden = rdlView() !== "browse";
  $("compare-controls").hidden = rdlView() === "browse";
  sort.key = null;
  rdlView() === "browse" ? render() : fillCompare();
}

// ---- Personal mode: practice sessions --------------------------------------
let sessions = null;
const CATS = ["General", "301", "501", "Cricket"];
const pmode = () => document.querySelector("input[name=pmode]:checked").value;

// Averages come from the raw totals (pts or marks / darts), never by averaging averages.
function sessionValue(m) {
  if (m.agg === "win") return m.wins + m.losses ? m.wins / (m.wins + m.losses) : null;
  if (m.agg === "avg_pts") return m.darts ? (m.pts / m.darts) * 3 : null;
  if (m.agg === "avg_marks") return m.darts ? (m.marks / m.darts) * 3 : null;
  return m.value;
}
function totalValue(ms) {
  const agg = ms[0]?.agg;
  const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
  if (agg === "avg_pts") return sum("darts") ? (sum("pts") / sum("darts")) * 3 : null;
  if (agg === "avg_marks") return sum("darts") ? (sum("marks") / sum("darts")) * 3 : null;
  if (agg === "win") return sum("wins") + sum("losses") ? sum("wins") / (sum("wins") + sum("losses")) : null;
  if (agg === "avg_games") {   // per-game average (ASPs): weight each session by its games
    const w = ms.filter((m) => m.value != null && m.games);
    if (w.length) return w.reduce((a, m) => a + m.value * m.games, 0) / w.reduce((a, m) => a + m.games, 0);
  }
  const vals = ms.map((m) => m.value).filter((v) => v != null);
  if (!vals.length) return null;
  if (agg === "max") return Math.max(...vals);
  const total = vals.reduce((a, b) => a + b, 0);
  return agg === "avg_games" ? total / vals.length : total;
}
// Decimal places: 2 for 3DA/MPR, 3 for per-game averages (ASPs), otherwise as written in the file.
const places = (ms) => {
  const agg = ms[0]?.agg;
  if (agg === "avg_pts" || agg === "avg_marks") return 2;
  if (agg === "avg_games" || agg === "win") return 3;
  return Math.max(0, ...ms.map((m) => m.decimals || 0));
};
const fmtVal = (v, ms) => {
  if (v == null) return "";
  if (ms[0]?.agg !== "win") return v.toFixed(places(ms));
  const w = ms.reduce((a, m) => a + m.wins, 0), l = ms.reduce((a, m) => a + m.losses, 0);
  return `${v.toFixed(3)} (${w}-${l})`;   // win rate with the record behind it
};
const fmtDate = (d) => (d ? new Date(d + "T00:00").toLocaleDateString(undefined,
  { month: "short", day: "numeric", year: "numeric" }) : "?");

async function loadPractice() {
  if (!sessions) {
    message("Loading…");
    try { sessions = (await getJSON("/api/practice")).sessions; }
    catch (e) { return message(e.message, "error"); }
    // Never assume who threw: with several throwers, nothing shows until one is picked.
    // Everyone named in the files is a thrower, opponents included.
    const throwers = [...new Set(sessions.flatMap((s) => [thrower(s), s.opponent].filter(Boolean)))].sort();
    fill($("thrower"), [...(throwers.length > 1 ? [["", "Choose thrower…"]] : []),
      ...throwers.map((t) => [t, t])]);
    fillThrowerFilters();
  }
  renderPractice();
}
const thrower = (s) => s.player || "(no player listed)";
const mine = () => sessions.filter((s) => $("thrower").value && thrower(s) === $("thrower").value);

// Opponents and dates for the chosen thrower's sessions.
function fillThrowerFilters() {
  const list = mine();
  const opps = [...new Set(list.map((s) => s.opponent).filter(Boolean))].sort();
  fill($("opponent"), [["", "All opponents"], ...opps.map((o) => [o, o])], true);
  const dates = [...new Set(list.map((s) => s.date).filter(Boolean))];
  fill($("from"), dates.map((d) => [d, fmtDate(d)]));
  fill($("to"), dates.map((d) => [d, fmtDate(d)]));
  $("to").value = dates[dates.length - 1] || "";
}

function filtered() {
  const opp = $("opponent").value, from = $("from").value, to = $("to").value;
  return mine().filter((s) => (!opp || s.opponent === opp)
    && (!from || !s.date || s.date >= from) && (!to || !s.date || s.date <= to));
}

let metricPicked = false;   // until the user picks a trend metric, default to ASPs

// [label, first metric seen] for the checked categories, in category order,
// then in the order the metrics appear in the files.
function labelsOf(list) {
  const cats = new Set([...document.querySelectorAll(".cats input:checked")].map((c) => c.value));
  const seen = new Map();
  for (const s of list) for (const [label, m] of Object.entries(s.metrics))
    if (cats.has(m.category) && !seen.has(label)) seen.set(label, m);
  // Category order, win % first within each, then file order.
  return [...seen].sort((a, b) => CATS.indexOf(a[1].category) - CATS.indexOf(b[1].category)
    || (b[1].agg === "win") - (a[1].agg === "win"));
}

function renderPractice() {
  if (!sessions) return;
  if (!sessions.length) return message("No practice files in the data folder yet (markdown titled \"# Darts Practice: <date>\").");
  if (!$("thrower").value) {
    $("metric-wrap").hidden = true;
    return message("Choose a thrower to see their practice stats.");
  }
  if (!mine().length) {
    $("metric-wrap").hidden = true;
    const met = sessions.filter((s) => s.opponent === $("thrower").value);
    return message(`No stats recorded for ${$("thrower").value} yet. They're the opponent in `
      + `${met.length} session${met.length === 1 ? "" : "s"} (${met.map((s) => fmtDate(s.date)).join(", ")}); `
      + "their numbers show here once a file has a column for them.");
  }
  const list = filtered();
  const labels = labelsOf(list);
  const trend = $("view").value === "trend";
  $("metric-wrap").hidden = !trend;
  // Trend shows results only (no games-played counts), and starts on ASPs.
  const results = labels.filter(([l]) => !/\bgames\b/i.test(l)).map(([l]) => [l, l]);
  fill($("metric"), results, true);
  const asp = results.find(([l]) => /^asps?\b|all-star/i.test(l));
  if (!metricPicked && asp) $("metric").value = asp[0];
  if (!list.length) return message("No sessions match these filters.");
  if ($("view").value === "h2h") return renderH2H(list);
  if (!labels.length) return message("No metrics in the checked categories.");
  const main = trend ? trendChart(list, $("metric").value) : practiceTable(list, labels);
  out.replaceChildren(...main, ...notesBlock(list));
}

// Head-to-head: the thrower and the chosen opponent, side by side, for the
// sessions where one file has both players' columns.
function renderH2H(list) {
  const me = $("thrower").value, opp = $("opponent").value;
  if (!opp) return message("Choose an opponent for head-to-head.");
  const pairs = list.map((s) => [s, sessions.find((o) => o.file === s.file && o.player === opp)])
    .filter(([, o]) => o);
  if (!pairs.length) {
    return message(`No sessions with stats for both ${me} and ${opp} in this date range. `
      + "Head-to-head needs files with a column for each player.");
  }
  const labels = labelsOf(pairs.flat());
  if (!labels.length) return message("No metrics in the checked categories.");
  const cols = [...pairs.map(([a, b]) => ({ head: fmtDate(a.date), sides: [[a], [b]] }))];
  if (pairs.length > 1) cols.push({ head: "Total", sides: [pairs.map(([a]) => a), pairs.map(([, b]) => b)] });

  // Same look as Sessions + totals: one header row, date over the player's name.
  const head = el("tr");
  head.append(el("th", { className: "name" }, "Metric"));
  for (const c of cols) {
    for (const who of [me, opp]) {
      const th = el("th", {}, c.head);
      th.append(el("small", {}, who));
      head.append(th);
    }
  }
  const tbody = el("tbody");
  let cat = null;
  for (const [label, first] of labels) {
    if (first.category !== cat) {
      cat = first.category;
      const tr = el("tr", { className: "cat" });
      tr.append(el("td", { colSpan: 1 + cols.length * 2 }, cat));
      tbody.append(tr);
    }
    const tr = el("tr");
    tr.append(el("td", { className: "name" }, label));
    for (const c of cols) {
      for (const side of c.sides) {
        const ms = side.map((s) => s.metrics[label]).filter(Boolean);
        const v = side.length === 1 ? (ms[0] ? sessionValue(ms[0]) : null) : totalValue(ms);
        tr.append(el("td", ms.length === 1 && side.length === 1 ? { title: ms[0].raw } : {}, ms.length ? fmtVal(v, ms) : ""));
      }
    }
    tbody.append(tr);
  }
  const table = el("table");
  table.append(el("thead"), tbody);
  table.tHead.append(head);
  const wrap = el("div", { className: "scroll" });
  wrap.append(table);
  out.replaceChildren(el("h2", {}, `${me} vs ${opp}`), wrap, ...notesBlock(pairs.map(([a]) => a)));
}

function practiceTable(list, labels) {
  const showTotal = list.length > 1;
  const ncols = list.length + 1 + (showTotal ? 1 : 0);
  const head = el("tr");
  head.append(el("th", { className: "name" }, "Metric"));
  for (const s of list) {
    const th = el("th", {}, fmtDate(s.date));
    th.append(el("small", {}, s.opponent ? `vs ${s.opponent}` : ""));
    head.append(th);
  }
  if (showTotal) {
    const th = el("th", {}, "Total");
    th.append(el("small", {}, `${list.length} sessions`));
    head.append(th);
  }
  const tbody = el("tbody");
  let cat = null;
  for (const [label, first] of labels) {
    if (first.category !== cat) {
      cat = first.category;
      const tr = el("tr", { className: "cat" });
      tr.append(el("td", { colSpan: ncols }, cat));
      tbody.append(tr);
    }
    const tr = el("tr"), ms = [];
    tr.append(el("td", { className: "name" }, label));
    for (const s of list) {
      const m = s.metrics[label];
      if (m) ms.push(m);
      tr.append(el("td", m ? { title: m.raw } : {}, m ? fmtVal(sessionValue(m), [m]) : ""));
    }
    if (showTotal) tr.append(el("td", {}, fmtVal(totalValue(ms), ms)));
    tbody.append(tr);
  }
  const table = el("table");
  table.append(el("thead"), tbody);
  table.tHead.append(head);
  const wrap = el("div", { className: "scroll" });
  wrap.append(table);
  return [el("h2", {}, `Practice: ${$("thrower").value}`), wrap];
}

function notesBlock(list) {
  const seen = new Set(), items = [];
  for (const s of list) {
    if (seen.has(s.file)) continue;
    seen.add(s.file);
    s.notes.forEach((n) => items.push(`${fmtDate(s.date)}: ${n}`));
  }
  if (!items.length) return [];
  const ul = el("ul", { className: "notes" });
  items.forEach((t) => ul.append(el("li", {}, t)));
  return [el("h2", {}, "Notes"), ul];
}

// ---- trend chart (single series line, crosshair + tooltip) -----------------
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function trendChart(list, label) {
  const pts = list.filter((s) => s.metrics[label] && s.date)
    .map((s) => ({ s, m: s.metrics[label], v: sessionValue(s.metrics[label]) }))
    .filter((p) => p.v != null);
  const title = el("h2", {}, `${label} by session`);
  if (!pts.length) return [title, el("p", { className: "empty" }, "No dated values for this metric.")];

  const W = 720, H = 300, L = 48, R = 20, T = 16, B = 36;
  const ts = pts.map((p) => Date.parse(p.s.date));
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const vmax = Math.max(...pts.map((p) => p.v));
  const step = vmax > 0 ? niceStep(vmax / 4) : 1;
  const ymax = Math.max(step, Math.ceil(vmax / step) * step);
  const y = (v) => T + (1 - v / ymax) * (H - T - B);
  const dec = places(pts.map((p) => p.m));

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label} by session` });
  for (let v = 0; v <= ymax + 1e-9; v += step) {
    root.append(svg("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    const t = svg("text", { class: "axis", x: L - 6, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = pts[0].m.agg === "win" ? v.toFixed(3) : +v.toFixed(2);   // win rates read 0.600
    root.append(t);
  }
  // Date labels, skipping any that would crowd the one before (the last date always shows).
  let lastX = -Infinity;
  const keep = pts.map((p, i) => {
    const ok = x(ts[i]) - lastX >= 56;
    if (ok) lastX = x(ts[i]);
    return ok;
  });
  if (pts.length > 1 && !keep[pts.length - 1]) {
    keep[pts.length - 1] = true;
    for (let i = pts.length - 2; i >= 0 && x(ts[pts.length - 1]) - x(ts[i]) < 56; i--) keep[i] = false;
  }
  pts.forEach((p, i) => {
    if (!keep[i]) return;
    const t = svg("text", { class: "axis", x: x(ts[i]), y: H - B + 18, "text-anchor": "middle" });
    t.textContent = new Date(p.s.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    root.append(t);
  });
  root.append(svg("polyline", { class: "line", points: pts.map((p, i) => `${x(ts[i])},${y(p.v)}`).join(" ") }));
  pts.forEach((p, i) => root.append(svg("circle", { class: "dot", cx: x(ts[i]), cy: y(p.v), r: 5 })));

  const cross = svg("line", { class: "cross", y1: T, y2: H - B, visibility: "hidden" });
  const hit = svg("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" });
  root.append(cross, hit);

  const box = el("div", { className: "chart" });
  const tip = el("div", { className: "tip", hidden: true });
  box.append(root, tip);
  hit.addEventListener("pointermove", (ev) => {
    const r = root.getBoundingClientRect(), scale = W / r.width;
    const px = (ev.clientX - r.left) * scale;
    let i = 0;
    ts.forEach((t, j) => { if (Math.abs(x(t) - px) < Math.abs(x(ts[i]) - px)) i = j; });
    const p = pts[i], cx = x(ts[i]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    cross.setAttribute("visibility", "visible");
    tip.replaceChildren(el("strong", {}, p.v.toFixed(dec)),
      el("span", {}, `${fmtDate(p.s.date)}${p.s.opponent ? " vs " + p.s.opponent : ""}`));
    tip.hidden = false;
    const left = cx / scale + 8, flip = left + tip.offsetWidth > r.width;
    tip.style.left = `${flip ? cx / scale - tip.offsetWidth - 8 : left}px`;
    tip.style.top = `${y(p.v) / scale}px`;
  });
  hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  const extra = pts.length < 2 ? [el("p", { className: "empty" }, "One session so far; add more to see a trend.")] : [];
  return [title, box, ...extra];
}

// ---- Personal mode: other files --------------------------------------------
async function renderFiles() {
  const file = $("pfile").value;
  if (!file) return message("No other personal files in the data folder (csv, xlsx, md, txt).");
  let d;
  try { d = await getJSON(`/api/personal?file=${encodeURIComponent(file)}`); }
  catch (e) { return message(e.message, "error"); }
  if (d.kind === "text") return out.replaceChildren(el("pre", {}, d.text));
  if (d.kind !== "tables") return message("Can't show this file type yet.");
  out.replaceChildren(...d.tables.flatMap((t) => {
    const table = el("table");
    t.rows.forEach((r, i) => {
      const tr = el("tr");
      r.forEach((v) => tr.append(el(i === 0 ? "th" : "td", { className: "name" }, String(v))));
      table.append(tr);
    });
    const wrap = el("div", { className: "scroll" });
    wrap.append(table);
    return [el("h2", {}, t.name), wrap];
  }));
}

// ---- wiring --------------------------------------------------------------
const mode = () => document.querySelector("input[name=mode]:checked").value;
function render() {
  if (mode() === "rdl") return renderRDL();
  return pmode() === "practice" ? renderPractice() : renderFiles();
}

function switchMode() {
  const personal = mode() === "personal";
  $("rdl-controls").hidden = personal;
  $("personal-controls").hidden = !personal;
  $("practice-controls").hidden = pmode() !== "practice";
  $("files-controls").hidden = pmode() !== "files";
  if (!personal) return news ? render() : loadNewsletter();
  return pmode() === "practice" ? loadPractice() : renderFiles();
}

document.querySelectorAll("input[name=mode], input[name=pmode]").forEach((r) => (r.onchange = switchMode));
$("newsletter").onchange = loadNewsletter;
$("season").onchange = () => { fillWeeks(); loadNewsletter(); };
$("division").onchange = () => { sort.key = null; fillTeams(); };
$("team").onchange = fillPlayers;
$("player").onchange = render;
$("rdl-view").onchange = switchRdlView;
$("player-search").oninput = renderSearch;
$("player-search").onkeydown = (e) => {
  if (e.key === "Escape") closeSearch();
  if (e.key === "Enter") { const [hit] = searchPlayers(e.target.value); if (hit) pickPlayer(hit.t, hit.p); }
};
$("player-search").onblur = () => { $("search-results").hidden = true; };
$("player-search").onfocus = renderSearch;
$("cmp-division").onchange = fillCompare;
$("cmp-add").onchange = () => { if ($("cmp-add").value) picked[rdlView()].push($("cmp-add").value); fillCompare(); };
$("cmp-clear").onclick = () => { picked[rdlView()].length = 0; fillCompare(); };
$("pfile").onchange = render;
$("thrower").onchange = () => { fillThrowerFilters(); renderPractice(); };
["opponent", "from", "to", "view"].forEach((id) => ($(id).onchange = renderPractice));
$("metric").onchange = () => { metricPicked = true; renderPractice(); };
document.querySelectorAll(".groups input").forEach((c) => (c.onchange = render));
document.querySelectorAll(".cats input").forEach((c) => (c.onchange = renderPractice));

(async () => {
  if (PUBLIC) document.querySelector(".mode").hidden = true;   // RDL only, no Personal
  try { catalog = await getJSON("/api/catalog"); }
  catch (e) { return message(e.message, "error"); }
  const seasons = [...new Set(catalog.rdl.map(seasonOf))];
  fill($("season"), seasons.map((x) => [x, x]));
  $("season").value = seasons[seasons.length - 1] || "";   // start on the latest season and week
  fillWeeks();
  fill($("pfile"), catalog.personal.map((p) => [p.file, p.file]));
  switchMode();
})();
