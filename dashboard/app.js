// Token Radar, Calibrated Edition. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, filters, a per-protocol
// detail drawer with the model's own inputs, its calibrated range and the
// protocol's farm plan, plus the model's own evidence: the fitted table, the
// token odds, the held-out validation, the per-term held-out table and the five
// build-time checks. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', call: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlist: false, growthW: 0.6, multScale: 1 };
  // The watchlist slugs, as the snapshot named them: the page marks them from the
  // data, never from a pasted list.
  var WATCHLIST = new Set(DATA.watchlist || []);

  // Filters from the address bar, so a screenshot link opens the view it names.
  (function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'category' && v) state.category = v;
      if (k === 'call' && v) state.call = v;
      if (k === 'q' && v) state.q = v;
      if (k === 'tab' && v) state.tab = v;
    });
  })();

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRange(row) {
    return fmtUsd(row.range_lo_usd) + '–' + fmtUsd(row.range_hi_usd);
  }
  function tierClass(tier) {
    if (!tier) return 'tier-c';
    if (tier.charAt(0) === 'S') return 'tier-s';
    if (tier.charAt(0) === 'A') return 'tier-a';
    if (tier.charAt(0) === 'B') return 'tier-b';
    return 'tier-c';
  }
  function callClass(call) {
    if (call === 'Farm now') return 'farm';
    if (call === 'Wait') return 'wait';
    return 'dont';
  }

  // impliedValue(), mirrored from lib/model.ts: the page recomputes a row from the
  // snapshot figures and checks the number board.json carries, so the page's code
  // and the board's data are visibly the same arithmetic. The multiple is not
  // hand-set here either: it comes from the fit table the program wrote, the
  // median market-cap / TVL of that bucket's live-token protocols.
  function categoryBucket(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateralized') >= 0) return 'Lending';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis trading') >= 0) return 'Derivatives';
    if (c.indexOf('dex') >= 0) return 'Dexes';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Curators';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stablecoin') >= 0 || c.indexOf('dual-token') >= 0) return 'RWA';
    if (c.indexOf('prediction') >= 0) return 'Prediction';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Yield';
    if (c.indexOf('chain') >= 0) return 'Chains';
    if (c.indexOf('bridge') >= 0) return 'Bridges';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Staking';
    if (c.indexOf('insurance') >= 0) return 'Insurance';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Payments';
    return 'Other';
  }
  function fittedMultiple(category) {
    var fit = DATA.fitted;
    var bucket = categoryBucket(category);
    for (var i = 0; i < fit.multiples.length; i++) {
      if (fit.multiples[i].bucket === bucket) return fit.multiples[i].multiple;
    }
    return fit.globalMultiple;
  }
  function impliedOf(row, model) {
    var m = model || DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * (growth >= 0 ? state.growthW : m.growth_weight_down);
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = 1 + m.breadth_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * fittedMultiple(row.category) * state.multScale * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function farmStepsFor(row) {
    // The farm plan is generated in the page from the row's own record, the same
    // derivation main.ts runs: category, chains, TVL, age. The steps board.json
    // carries are the same seven; the page builds them here so the detail view
    // needs no second file.
    var steps = [];
    var chain = (row.chains && row.chains[0]) || 'its main chain';
    var gas = gasFor(chain);
    var gasText = gas >= 1 ? '$' + gas : '$' + gas.toFixed(2);
    var capital = row.tvl_usd >= 1e9 ? 250 : row.tvl_usd >= 250e6 ? 150 : row.tvl_usd >= 50e6 ? 100 : 50;
    var hold = row.age_days === null ? 45 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var c = (row.category || '').toLowerCase();
    var action = 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) action = 'Supply $' + capital + ' of USDC to ' + row.name + ' on ' + chain + ' and keep the position open, so the loan book counts your address.';
    else if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0 || c.indexOf('liquidity manager') >= 0) action = 'Deposit $' + capital + ' of USDC into a ' + row.name + ' vault on ' + chain + ' and keep the vault shares.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) action = 'Provide $' + capital + ' of liquidity to ' + row.name + "'s main pool on " + chain + ' and keep the position open.';
    else if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) action = 'Deposit $' + capital + ' of USDC as margin on ' + row.name + ' and open one small hedged position.';
    else if (c.indexOf('rwa') >= 0 || c.indexOf('stablecoin') >= 0) action = 'Mint $' + capital + ' of the yield-bearing asset through ' + row.name + ' on ' + chain + ' and hold it.';
    else if (c.indexOf('prediction') >= 0) action = 'Fund $' + capital + ' and place one market position on ' + row.name + ', then leave the position to settle.';
    else if (c.indexOf('chain') >= 0) action = 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + row.name + "'s own bridge and use it in one app on that chain.";
    else if (c.indexOf('insurance') >= 0) action = 'Buy $' + capital + ' of cover from ' + row.name + ' on ' + chain + ' and keep the policy active.';
    else if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) action = 'Load $' + capital + ' onto ' + row.name + ' on ' + chain + ' and spend a small amount through it.';
    var second = secondActionFor(row, capital, chain);
    var ageNote = row.age_days !== null && row.age_days >= 730
      ? ' This protocol has run ' + Math.floor(row.age_days / 365) + '+ years with no token on record, so staying in through one more quarterly snapshot matters.'
      : row.age_days !== null && row.age_days >= 365
        ? ' This protocol has run over a year with no token on record, so a longer hold counts for more.'
        : '';
    steps.push({ text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about ' + gasText + ' of gas to fund it on ' + chain, time: '5 minutes' });
    steps.push({ text: action, cost: '$' + capital + ' of capital and about ' + gasText + ' of gas', time: '15 minutes to set up' });
    steps.push({ text: 'One week later, make a second, different on-chain action: ' + second + '.', cost: 'about ' + gasText + ' of gas', time: '10 minutes' });
    steps.push({ text: 'Repeat one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never leave the position untouched for a full month.', cost: 'about ' + gasText + ' of gas a week', time: '10 minutes a week' });
    steps.push({ text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.' + ageNote, cost: 'the $' + capital + ' stays in the position', time: hold + ' days' });
    steps.push({ text: "Open the protocol's own points or rewards page from its official site and check your position is counted; claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' });
    steps.push({ text: 'Write the wallet, the dates and every transaction hash in a farm log; when you unwind, withdraw in two steps a day apart so no snapshot catches an empty wallet.', cost: 'about ' + gasText + ' of gas to exit', time: '10 minutes to log, 2 days to exit' });
    return steps;
  }
  function secondActionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'borrow $' + Math.round(capital / 5) + ' against your supply on ' + name + ' and repay it the same week';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'swap $' + Math.round(capital / 5) + ' through ' + name + "'s main pool on " + chain;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('yield aggregator') >= 0) return 'deposit $' + Math.round(capital / 5) + ' into a second ' + name + ' vault on ' + chain;
    if (c.indexOf('rwa') >= 0 || c.indexOf('stablecoin') >= 0) return 'mint a second $' + Math.round(capital / 5) + ' tranche through ' + name + ' on ' + chain;
    if (c.indexOf('prediction') >= 0) return 'place a second, smaller market position on ' + name;
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'close the hedge on ' + name + ' and open a fresh one half its size';
    return 'make a small swap inside ' + name + ' on ' + chain;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 8;
    if (c.indexOf('solana') >= 0) return 0.05;
    if (c.indexOf('bitcoin') >= 0) return 4;
    if (c.indexOf('tron') >= 0) return 2;
    if (c.indexOf('hyperliquid') >= 0) return 0.1;
    if (c.indexOf('polygon') >= 0) return 0.05;
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('avalanche') >= 0) return 0.5;
    if (c.indexOf('binance') >= 0 || c.indexOf('bnb') >= 0) return 0.3;
    return 2;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchlist && !WATCHLIST.has(r.slug)) return false;
      if (state.category !== 'all' && categoryBucket(r.category) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.call !== 'all' && r.call !== state.call) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'width') { av = a.range_width_x; bv = b.range_width_x; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'perdollar') { av = a.implied_per_farm_dollar; bv = b.implied_per_farm_dollar; }
      else if (key === 'growth') { av = a.change_7d === null ? 0 : a.change_7d; bv = b.change_7d === null ? 0 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 0 : a.age_days; bv = b.age_days === null ? 0 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      if (av === bv) return a.rank - b.rank;
      return (av < bv ? -1 : 1) * dir;
    });
    return rows;
  }
  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { seen[categoryBucket(r.category)] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function renderHeader() {
    var head = el('header', { class: 'mast' },
      el('div', { class: 'kicker', text: 'Token Radar · Calibrated Edition · model ' + DATA.model_version }),
      el('h1', { text: 'Token Radar' }),
      el('p', { class: 'lede', text: 'Every protocol with no token yet, ranked by what its launch would be worth — each with the range the value could be, and the call: farm it now, wait, or don\u2019t farm it.' }),
      el('div', { class: 'meta' },
        el('span', { html: '<b>' + DATA.board_size + '</b> protocols ranked' }),
        el('span', { html: 'total implied <b>' + fmtUsd(DATA.total_implied_usd) + '</b>' }),
        el('span', { html: 'median <b>' + fmtUsd(DATA.median_implied_usd) + '</b>' }),
        el('span', { html: 'watchlist <b>' + DATA.watchlist_size + '</b> at $' + (DATA.floor_usd / 1e6) + 'M' }),
        el('span', { html: 'snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { html: 'source <b>DefiLlama</b>' })));
    return head;
  }

  function renderCover() {
    var sec = el('section', { class: 'cover' },
      el('h2', { text: 'Five checks this build passed' }),
      el('p', { class: 'sub', text: 'The program refuses to write a board that fails any of them. Each check is a fact about this build, measured where the page says — not a slogan.' }));
    var grid = el('div', { class: 'checks' });
    (DATA.checks || []).forEach(function (c) {
      grid.appendChild(el('div', { class: 'check' },
        el('span', { class: 'badge' + (c.status === 'pass' ? '' : ' fail'), text: c.status === 'pass' ? '✓ PASS' : '✗ FAIL' }),
        el('h3', { text: c.id + ' · ' + c.name }),
        el('p', { text: c.detail })));
    });
    sec.appendChild(grid);
    var r = DATA.ranges;
    sec.appendChild(el('p', { class: 'sub', text: 'Ranges: P10–P90 of market-cap / TVL across all ' + r.peers + ' live-token protocols (' + r.loRatio.toFixed(4) + '–' + r.hiRatio.toFixed(4) + ' as ratios), widened ×' + r.widenK + '. Held-out coverage ' + (r.coverage[0] * 100).toFixed(1) + '% and ' + (r.coverage[1] * 100).toFixed(1) + '% (mean ' + (r.meanCoverage * 100).toFixed(1) + '%, target ' + (r.target * 100).toFixed(0) + '%).' }));
    return sec;
  }

  function renderCalls() {
    var cc = DATA.call_counts;
    var wrap = el('div', {});
    var grid = el('div', { class: 'calls' });
    grid.appendChild(el('div', { class: 'call-card farm' },
      el('div', { class: 'n num', text: String(cc.farm) }),
      el('div', { class: 'label', text: 'Farm now' }),
      el('p', { text: 'Top third of the board by value per farm dollar, with token odds worth farming.' })));
    grid.appendChild(el('div', { class: 'call-card wait' },
      el('div', { class: 'n num', text: String(cc.wait) }),
      el('div', { class: 'label', text: 'Wait' }),
      el('p', { text: 'Worth watching: the value or the odds are not there yet.' })));
    grid.appendChild(el('div', { class: 'call-card dont' },
      el('div', { class: 'n num', text: String(cc.dont) }),
      el('div', { class: 'label', text: 'Don\u2019t farm' }),
      el('p', { text: 'Bottom third by value per farm dollar, or token odds below 3%.' })));
    wrap.appendChild(grid);
    wrap.appendChild(el('p', { class: 'rule', text: DATA.call_rule }));
    return wrap;
  }

  function renderControls(onChange) {
    var box = el('div', { class: 'controls' });
    var q = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    q.addEventListener('input', function () { state.q = q.value; state.selected = null; onChange(); });
    box.appendChild(q);
    var cat = el('select', { 'aria-label': 'Category' });
    cat.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories().forEach(function (c) { cat.appendChild(el('option', { value: c, text: c })); });
    cat.value = state.category;
    cat.addEventListener('change', function () { state.category = cat.value; state.selected = null; onChange(); });
    box.appendChild(cat);
    var ch = el('select', { 'aria-label': 'Chain' });
    ch.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains().forEach(function (c) { ch.appendChild(el('option', { value: c, text: c })); });
    ch.value = state.chain;
    ch.addEventListener('change', function () { state.chain = ch.value; state.selected = null; onChange(); });
    box.appendChild(ch);
    var cl = el('select', { 'aria-label': 'Farm call' });
    ['all', 'Farm now', 'Wait', "Don't farm"].forEach(function (c) { cl.appendChild(el('option', { value: c, text: c === 'all' ? 'All calls' : c })); });
    cl.value = state.call;
    cl.addEventListener('change', function () { state.call = cl.value; state.selected = null; onChange(); });
    box.appendChild(cl);
    var wl = el('label', {},
      el('input', { type: 'checkbox', checked: state.watchlist ? true : null }),
      document.createTextNode(' Watchlist only'));
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlist = e.target.checked; state.selected = null; onChange(); });
    box.appendChild(wl);
    return box;
  }

  function renderTabs(onChange) {
    var tabs = el('div', { class: 'tabs', role: 'tablist' });
    [['pre-token', 'Pre-token board'], ['live', 'Live token'], ['set-aside', 'Set aside'], ['model', 'Model & evidence']].forEach(function (t) {
      var b = el('button', { role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1] });
      b.addEventListener('click', function () { state.tab = t[0]; state.selected = null; onChange(); });
      tabs.appendChild(b);
    });
    return tabs;
  }

  function rangeBar(row) {
    var lo = Math.log(Math.max(1, row.range_lo_usd));
    var hi = Math.log(Math.max(1, row.range_hi_usd));
    var pt = Math.log(Math.max(1, row.implied_value_usd));
    var pct = hi > lo ? ((pt - lo) / (hi - lo)) * 100 : 50;
    var bar = el('div', { class: 'rangebar', title: 'P10–P90 range ' + fmtRange(row) });
    bar.appendChild(el('em', {}));
    bar.firstChild.style.left = '0%';
    bar.firstChild.style.width = '100%';
    bar.appendChild(el('i', {}));
    bar.lastChild.style.left = 'calc(' + pct.toFixed(1) + '% - 1px)';
    return bar;
  }

  function renderBoard(onChange) {
    var rows = filteredRows();
    var wrap = el('div', {});
    var cap = el('p', { class: 'muted', text: 'Showing ' + rows.length + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its detail, range and farm plan. Click a column heading to sort.' });
    wrap.appendChild(cap);
    if (state.selected) wrap.appendChild(renderDetail(rowBySlug(state.selected), onChange));
    var table = el('table', { class: 'board' });
    var thead = el('thead', {});
    var hr = el('tr', {});
    [['rank', 'Rank'], ['name', 'Protocol'], ['tvl', 'TVL'], ['growth', '7d'], ['age', 'Age'], ['implied', 'Implied'], ['width', 'Range (P10–P90)'], ['odds', 'Odds'], ['call', 'Call']].forEach(function (col) {
      var th = el('th', { text: col[1] + (state.sort === col[0] ? (state.dir === -1 ? ' ↓' : ' ↑') : ''), class: (col[0] === 'implied' || col[0] === 'tvl' || col[0] === 'growth' || col[0] === 'odds' ? 'r' : '') + (state.sort === col[0] ? ' sorted' : '') });
      th.addEventListener('click', function () {
        if (state.sort === col[0]) state.dir = -state.dir;
        else { state.sort = col[0]; state.dir = col[0] === 'rank' ? 1 : -1; }
        onChange();
      });
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody', {});
    if (rows.length === 0) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: 9, class: 'empty', text: 'No protocols match these filters.' })));
    }
    rows.forEach(function (r) {
      var tr = el('tr', { 'aria-selected': state.selected === r.slug ? 'true' : 'false' });
      tr.addEventListener('click', function () { state.selected = state.selected === r.slug ? null : r.slug; onChange(); });
      var nameCell = el('td', { class: 'name' });
      nameCell.appendChild(el('b', { text: r.name }));
      nameCell.appendChild(el('span', { class: 'tier ' + tierClass(r.tier), text: r.tier }));
      if (WATCHLIST.has(r.slug)) nameCell.appendChild(el('span', { class: 'star', text: ' ★' }));
      nameCell.appendChild(el('span', { class: 'sub', text: (r.category || 'uncategorised') + ' · ' + (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }));
      var rangeCell = el('td', {});
      rangeCell.appendChild(document.createTextNode(fmtRange(r) + ' · ' + r.range_width_x.toFixed(1) + 'x'));
      rangeCell.appendChild(rangeBar(r));
      tr.appendChild(el('td', { class: 'rank num', text: String(r.rank) }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'r num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'r num', text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'r num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'r num', text: fmtUsd(r.implied_value_usd) }));
      tr.appendChild(rangeCell);
      tr.appendChild(el('td', { class: 'r odds', text: Math.round(r.token_odds * 100) + '%' }));
      tr.appendChild(el('td', {}, el('span', { class: 'call ' + callClass(r.call), text: r.call })));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function kvRows(pairs) {
    var t = el('table', { class: 'kv' });
    pairs.forEach(function (p) {
      var tr = el('tr', {});
      tr.appendChild(el('td', { text: p[0] }));
      tr.appendChild(el('td', { text: p[1] }));
      t.appendChild(tr);
    });
    return t;
  }

  function renderDetail(row, onChange) {
    if (!row) return el('div', {});
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var d = el('div', { class: 'drawer' });
    var close = el('button', { class: 'close', text: 'Close ✕' });
    close.addEventListener('click', function () { state.selected = null; onChange(); });
    d.appendChild(close);
    var h = el('h2', { text: '#' + row.rank + ' ' + row.name + ' ' });
    h.appendChild(el('span', { class: 'tier ' + tierClass(row.tier), text: row.tier }));
    d.appendChild(h);
    d.appendChild(el('p', { class: 'why', text: row.why }));
    var cols = el('div', { class: 'cols' });
    var left = el('div', {});
    left.appendChild(el('h3', { text: 'Value, with its range' }));
    left.appendChild(kvRows([
      ['Implied value (point)', fmtUsd(row.implied_value_usd)],
      ['P10–P90 range', fmtRange(row) + ' (' + row.range_width_x.toFixed(1) + 'x wide)'],
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Fitted multiple (' + categoryBucket(row.category) + ')', row.fitted_multiple.toFixed(2) + 'x'],
      ['7-day growth', fmtPct(row.change_7d) + ' → ×' + row.growth_multiplier.toFixed(2)],
      ['Tokenless age', fmtAge(row.age_days) + ' → ×' + row.maturity_multiplier.toFixed(2)],
      ['Chain breadth (' + (row.chains || []).length + ((row.chains || []).length === 1 ? ' chain' : ' chains') + ')', '×' + row.breadth_multiplier.toFixed(2)],
      ['Token odds', Math.round(row.token_odds * 100) + '% of its bucket already trades'],
      ['Implied per farm dollar', fmtUsd(row.implied_per_farm_dollar)],
      ['Farm call', row.call],
      ['Page recomputes', fmtUsd(recomputed) + (match ? ' — matches the board' : ' — differs from the board')],
    ]));
    var lo = Math.log(Math.max(1, row.range_lo_usd));
    var hi = Math.log(Math.max(1, row.range_hi_usd));
    var pt = Math.log(Math.max(1, row.implied_value_usd));
    var pct = hi > lo ? ((pt - lo) / (hi - lo)) * 100 : 50;
    var viz = el('div', { class: 'rangeviz' });
    var bar = el('div', { class: 'bar' });
    bar.appendChild(el('em', {}));
    bar.firstChild.style.left = '0%';
    bar.firstChild.style.width = '100%';
    bar.appendChild(el('i', {}));
    bar.lastChild.style.left = 'calc(' + pct.toFixed(1) + '% - 1px)';
    viz.appendChild(bar);
    viz.appendChild(el('div', { class: 'ends' },
      el('span', { text: 'P10 ' + fmtUsd(row.range_lo_usd) }),
      el('span', { text: 'point ' + fmtUsd(row.implied_value_usd) }),
      el('span', { text: 'P90 ' + fmtUsd(row.range_hi_usd) })));
    left.appendChild(viz);
    left.appendChild(el('p', { class: 'muted', text: 'The range is the market\u2019s own dispersion: P10–P90 of market-cap / TVL across all ' + DATA.ranges.peers + ' live-token protocols, widened ×' + DATA.ranges.widenK + ', times this protocol\u2019s own adjustments. Held-out coverage ' + (DATA.ranges.coverage[0] * 100).toFixed(1) + '% / ' + (DATA.ranges.coverage[1] * 100).toFixed(1) + '% (target 80%).' }));
    cols.appendChild(left);
    var right = el('div', {});
    right.appendChild(el('h3', { text: 'Farm plan — ' + row.farm.difficulty + ', about $' + row.farm.est_total_usd + ' all in' }));
    right.appendChild(kvRows([
      ['Capital', '$' + row.farm.capital_usd],
      ['Gas per transaction', '$' + row.farm.gas_usd],
      ['Hold', row.farm.hold_days + ' days'],
      ['Difficulty', row.farm.difficulty],
      ['Estimated total', '$' + row.farm.est_total_usd],
    ]));
    var ol = el('ol', { class: 'steps' });
    farmStepsFor(row).forEach(function (s) {
      var li = el('li', {});
      li.appendChild(document.createTextNode(s.text + ' '));
      li.appendChild(el('span', { class: 'cost', text: 'Cost: ' + s.cost + '. Time: ' + s.time + '.' }));
      ol.appendChild(li);
    });
    right.appendChild(ol);
    cols.appendChild(right);
    d.appendChild(cols);
    return d;
  }

  function renderModel() {
    var sec = el('section', { class: 'model' });
    sec.appendChild(el('h2', { text: 'Model & evidence' }));
    sec.appendChild(el('p', { class: 'sub', text: 'Implied value = TVL × fitted multiple × growth × maturity × breadth. The multiple is the median market-cap / TVL of the bucket\u2019s live-token protocols (global median when a bucket has fewer than 3 peers), clamped to [0.02, 2.5]. No protocol name is special-cased; the same function scores every row.' }));
    var grid = el('div', { class: 'model-grid' });
    var a = el('div', {});
    a.appendChild(el('h3', { text: 'Fitted multiples, from ' + DATA.fitted.globalPeers + ' live peers (global ' + DATA.fitted.globalMultiple + ')' }));
    var t1 = el('table', { class: 'plain' });
    t1.appendChild(el('tr', {}, el('th', { text: 'Bucket' }), el('th', { class: 'r', text: 'Multiple' }), el('th', { class: 'r', text: 'Peers' }), el('th', { text: 'Source' })));
    DATA.fitted.multiples.forEach(function (m) {
      t1.appendChild(el('tr', {}, el('td', { text: m.bucket }), el('td', { class: 'r', text: m.multiple.toFixed(2) + 'x' }), el('td', { class: 'r', text: String(m.peers) }), el('td', { text: m.source })));
    });
    a.appendChild(t1);
    a.appendChild(el('p', { class: 'muted', text: 'Bridges pay 0.68x their TVL, curators 0.04x: a hand-set table gets this backwards; the fit does not.' }));
    grid.appendChild(a);
    var b = el('div', {});
    b.appendChild(el('h3', { text: 'Token odds by bucket' }));
    var t2 = el('table', { class: 'plain' });
    t2.appendChild(el('tr', {}, el('th', { text: 'Bucket' }), el('th', { class: 'r', text: 'Odds' }), el('th', { class: 'r', text: 'Live / total' })));
    DATA.odds.forEach(function (o) {
      t2.appendChild(el('tr', {}, el('td', { text: o.bucket }), el('td', { class: 'r', text: (o.odds * 100).toFixed(0) + '%' }), el('td', { class: 'r', text: o.live + ' / ' + o.total })));
    });
    b.appendChild(t2);
    b.appendChild(el('p', { class: 'muted', text: 'Overall odds ' + (DATA.overall_odds * 100).toFixed(1) + '% of the snapshot\u2019s protocols already trade.' }));
    grid.appendChild(b);
    var c = el('div', {});
    c.appendChild(el('h3', { text: 'Held-out validation (fit one half, test the other)' }));
    var t3 = el('table', { class: 'plain' });
    t3.appendChild(el('tr', {}, el('th', { text: 'Split' }), el('th', { class: 'r', text: 'Spearman' }), el('th', { class: 'r', text: 'MAPE' }), el('th', { class: 'r', text: 'Range hit' })));
    DATA.validation.forEach(function (v) {
      t3.appendChild(el('tr', {}, el('td', { text: v.split }), el('td', { class: 'r', text: v.spearman.toFixed(2) }), el('td', { class: 'r', text: (v.mape * 100).toFixed(1) + '%' }), el('td', { class: 'r', text: (v.rangeCoverage * 100).toFixed(1) + '%' })));
    });
    c.appendChild(t3);
    c.appendChild(el('p', { class: 'muted', text: 'Market-cap / TVL spans 240x, so the dollar error is wide by nature; the ranking agreement (Spearman) is the number that matters for a ranked board.' }));
    grid.appendChild(c);
    var d = el('div', {});
    d.appendChild(el('h3', { text: 'Every value term, tested held-out' }));
    var t4 = el('table', { class: 'plain' });
    t4.appendChild(el('tr', {}, el('th', { text: 'Term' }), el('th', { class: 'r', text: 'With, half 1' }), el('th', { class: 'r', text: 'Without, half 1' }), el('th', { class: 'r', text: 'With, half 2' }), el('th', { class: 'r', text: 'Without, half 2' }), el('th', { class: 'r', text: 'Mean Δ' })));
    DATA.term_tests.terms.forEach(function (t) {
      var cls = t.meanDelta >= 0 ? 'pos' : 'neg';
      t4.appendChild(el('tr', {}, el('td', { text: t.term }), el('td', { class: 'r', text: t.withTerm[0].toFixed(3) }), el('td', { class: 'r', text: t.withoutTerm[0].toFixed(3) }), el('td', { class: 'r', text: t.withTerm[1].toFixed(3) }), el('td', { class: 'r', text: t.withoutTerm[1].toFixed(3) }), el('td', { class: 'r ' + cls, text: (t.meanDelta >= 0 ? '+' : '') + t.meanDelta.toFixed(3) })));
    });
    d.appendChild(t4);
    d.appendChild(el('p', { class: 'muted', text: 'Baselines: full model Spearman ' + DATA.term_tests.fullModel.map(function (s) { return s.toFixed(3); }).join(' / ') + '; TVL alone ' + DATA.term_tests.tvlOnly.map(function (s) { return s.toFixed(3); }).join(' / ') + '. A term that adds nothing shows it here — including where the category multiple helps one half and hurts the other, which is within noise at ~60 protocols a half.' }));
    grid.appendChild(d);
    sec.appendChild(grid);
    sec.appendChild(el('div', { class: 'note', html: '<b>How to read a range.</b> The point estimate is the best single number; the range is the honest one. A $100M point with a $2M–$900M range is a guess with a wide error bar, and the board says so instead of hiding it. Farm calls use the point and the odds; the range tells you how much to trust either.' }));
    return sec;
  }

  function renderLive() {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'muted', text: 'Protocols whose token already trades, by market cap — a fact, not a model. They are never mixed into the pre-token ranking.' }));
    var t = el('table', { class: 'plain' });
    t.appendChild(el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'r', text: 'TVL' }), el('th', { class: 'r', text: 'Market cap' }), el('th', { class: 'r', text: 'mcap / TVL' }), el('th', { class: 'r', text: '7d' })));
    DATA.live.forEach(function (p) {
      t.appendChild(el('tr', {}, el('td', { text: p.name }), el('td', { text: p.category || '—' }), el('td', { class: 'r', text: fmtUsd(p.tvl_usd) }), el('td', { class: 'r', text: fmtUsd(p.mcap_usd) }), el('td', { class: 'r', text: p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : 'n/a' }), el('td', { class: 'r', text: fmtPct(p.change_7d) })));
    });
    wrap.appendChild(t);
    return wrap;
  }

  function renderSetAside() {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'muted', text: DATA.set_aside.length + ' pre-token protocols are set aside, not ranked: a wrapped, staked or bridged product of a token that already trades has no launch of its own.' }));
    var t = el('table', { class: 'plain' });
    t.appendChild(el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'r', text: 'TVL' }), el('th', { text: 'Why set aside' })));
    DATA.set_aside.forEach(function (p) {
      t.appendChild(el('tr', {}, el('td', { text: p.name }), el('td', { text: p.category || '—' }), el('td', { class: 'r', text: fmtUsd(p.tvl_usd) }), el('td', { text: p.reason })));
    });
    wrap.appendChild(t);
    return wrap;
  }

  function renderSandbox(onChange) {
    var box = el('div', { class: 'sandbox' });
    box.appendChild(el('h3', { text: 'Try the model yourself' }));
    box.appendChild(el('p', { text: 'Move a slider and the page recomputes every implied value from the snapshot figures, the same arithmetic as lib/model.ts. At the defaults the recomputed numbers match the board exactly — the page\u2019s code and the board\u2019s data are the same formula.' }));
    var row = el('div', { class: 'row' });
    var gLabel = el('label', {}, document.createTextNode('Growth weight (up) '));
    var g = el('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(state.growthW) });
    var gOut = el('output', { text: state.growthW.toFixed(1) });
    g.addEventListener('input', function () { state.growthW = parseFloat(g.value); gOut.textContent = state.growthW.toFixed(1); showTop(); });
    gLabel.appendChild(g);
    gLabel.appendChild(gOut);
    row.appendChild(gLabel);
    var mLabel = el('label', {}, document.createTextNode('Multiple scale '));
    var m = el('input', { type: 'range', min: '0.5', max: '1.5', step: '0.1', value: String(state.multScale) });
    var mOut = el('output', { text: state.multScale.toFixed(1) + 'x' });
    m.addEventListener('input', function () { state.multScale = parseFloat(m.value); mOut.textContent = state.multScale.toFixed(1) + 'x'; showTop(); });
    mLabel.appendChild(m);
    mLabel.appendChild(mOut);
    row.appendChild(mLabel);
    var top = el('span', { class: 'num' });
    row.appendChild(top);
    function showTop() {
      var scored = DATA.rows.slice(0, 5).map(function (r) { return r.name + ' ' + fmtUsd(impliedOf(r)); });
      top.textContent = 'Top 5 recomputed: ' + scored.join(' · ');
    }
    showTop();
    box.appendChild(row);
    return box;
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var onChange = function () { render(); };
    app.appendChild(renderHeader());
    app.appendChild(renderCover());
    app.appendChild(renderCalls());
    if (state.tab === 'pre-token') app.appendChild(renderControls(onChange));
    app.appendChild(renderTabs(onChange));
    if (state.tab === 'pre-token') app.appendChild(renderBoard(onChange));
    else if (state.tab === 'live') app.appendChild(renderLive());
    else if (state.tab === 'set-aside') app.appendChild(renderSetAside());
    else app.appendChild(renderModel());
    if (state.tab === 'pre-token' || state.tab === 'model') app.appendChild(renderSandbox(onChange));
    app.appendChild(el('footer', { text: 'Token Radar, Calibrated Edition (model ' + DATA.model_version + '). Snapshot: ' + DATA.source + ', as of ' + DATA.as_of + '. Implied value is an estimate, not a price, and never a promise of a launch. DefiLlama\u2019s record is not proof: this board says a protocol records no token — never that it has none.' }));
    var sel = state.selected ? document.querySelector('.drawer') : null;
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(); }
  });

  render();
})();
