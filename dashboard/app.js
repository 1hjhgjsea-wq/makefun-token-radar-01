// Token Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, and a model sandbox that recomputes every row
// from the snapshot figures. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  // Sandbox: the reader's own overrides of the two constants the model lets them move. The board
  // recomputes live from the snapshot figures; board.json keeps the shipped radar-2 numbers.
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, movers: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: { base: DATA.model.base_multiple, weight: DATA.model.growth_weight } };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
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
  // The model in one function, radar-2: the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. Sandbox overrides replace only base multiple and growth weight.
  function modelOf() {
    var m = DATA.model;
    return { base_multiple: state.sandbox.base, growth_weight: state.sandbox.weight, growth_floor: m.growth_floor, growth_cap: m.growth_cap, maturity_floor: m.maturity_floor, maturity_range: m.maturity_range, maturity_days: m.maturity_days, unknown_age_days: m.unknown_age_days, chain_step: m.chain_step, chain_max_extra: m.chain_max_extra };
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_extra);
    var chainMult = 1 + model.chain_step * extra;
    return { implied: Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMult)), growthMult: growthMult, maturity: maturity, chainMult: chainMult };
  }
  function shownImplied(row) {
    var sandboxOn = state.sandbox.base !== DATA.model.base_multiple || state.sandbox.weight !== DATA.model.growth_weight;
    return sandboxOn ? impliedOf(row, modelOf()).implied : row.implied_value_usd;
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $8 of gas';
    if (c.indexOf('solana') >= 0) return 'under $1 of gas';
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('monad') >= 0 || c.indexOf('berachain') >= 0) return 'about $1 of gas';
    if (c.indexOf('bitcoin') >= 0) return 'about $5 of gas';
    return 'about $3 of gas';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('leveraged farm') >= 0) return 'Open a leveraged farming position of $' + capital + ' on ' + name + ' on ' + chain + ' and keep the health factor above 1.5.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk curator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the shares.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + chain + " and use " + name + "'s native apps so the activity is on the chain itself.";
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " into " + name + "'s shielded pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote on one proposal.';
    if (c.indexOf('cedefi') >= 0 || c.indexOf('otc') >= 0) return 'Place a $' + capital + ' order through ' + name + ' on ' + chain + ' and keep the fill receipt.';
    if (c.indexOf('btc') >= 0 || c.indexOf('bitcoin') >= 0) return 'Mint $' + capital + ' of the BTC-backed asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('farm') >= 0) return 'Stake $' + capital + " of LP tokens in " + name + "'s farm on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Each week, borrow a small amount against the supply on ' + name + ' and repay it the same day.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Each week, swap a small amount through ' + name + ' on ' + chain + ' and re-add the proceeds to the pool.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Each week, open and close one small position on ' + name + ' instead of leaving the margin idle.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Each week, bridge a small amount through ' + name + ' in both directions so the route stays active.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Each week, restake the rewards ' + name + ' pays out instead of withdrawing them.';
    if (c.indexOf('prediction') >= 0) return 'Each week, place one small market position on ' + name + ' on a market you follow.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk curator') >= 0) return 'Each week, move a small amount between ' + name + ' vaults on ' + chain + ' and keep the receipts.';
    if (c.indexOf('stable') >= 0) return 'Each week, mint and redeem a small amount of the stable asset through ' + name + '.';
    if (c.indexOf('rwa') >= 0) return 'Each week, check ' + name + "'s yield accrual on " + chain + ' and add a small amount to the position.';
    if (c.indexOf('chain') >= 0) return 'Each week, use one native app on ' + chain + ' through ' + name + ' so the chain activity continues.';
    if (c.indexOf('governance') >= 0) return 'Each week, vote on any live proposal on ' + name + ' and keep the vote receipt.';
    if (c.indexOf('basis') >= 0) return 'Each week, check ' + name + "'s funding rate on " + chain + ' and top up the vault when it is positive.';
    return 'Each week, make one qualifying action on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // The age band, the age-band step and the exit step are the same derivation main.ts writes to
  // board.json: the page's farm plan and the board's farm plan are the same nine steps, so the
  // detail view and board.json never disagree about a protocol's plan.
  function ageBand(age) {
    if (age === null || age === undefined) return 'unknown';
    if (age < 365) return 'young';
    if (age < 730) return 'mid';
    return 'mature';
  }
  function ageBandStep(p, age, capital, chain) {
    var band = ageBand(age);
    var c = (p.category || '').toLowerCase();
    var venue = c.indexOf('dex') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0 || c.indexOf('prediction') >= 0;
    var probe = Math.max(10, Math.round(capital / 5));
    if (band === 'young') {
      return venue
        ? { text: 'Start with a $' + probe + ' probe trade on ' + p.name + ' on ' + chain + ' before committing the full position, because the protocol is under a year old.', cost: '$' + probe + ' of capital and ' + gasFor(chain), time: '10 minutes' }
        : { text: 'Start with a $' + probe + ' probe deposit on ' + p.name + ' on ' + chain + ' before committing the full position, because the protocol is under a year old.', cost: '$' + probe + ' of capital and ' + gasFor(chain), time: '10 minutes' };
    }
    if (band === 'mid') {
      return venue
        ? { text: 'After two weeks of activity, scale the position on ' + p.name + ' on ' + chain + ' to the full $' + capital + ' with a second trade.', cost: '$' + (capital - probe) + ' of extra capital and ' + gasFor(chain), time: '10 minutes' }
        : { text: 'After two weeks of activity, scale the deposit on ' + p.name + ' on ' + chain + ' to the full $' + capital + '.', cost: '$' + (capital - probe) + ' of extra capital and ' + gasFor(chain), time: '10 minutes' };
    }
    if (band === 'mature') {
      return venue
        ? { text: 'Open ' + p.name + "'s own points or rewards page on " + chain + ' and confirm the trade volume you already did counts toward it.', cost: 'no fee to check', time: '10 minutes' }
        : { text: 'Open ' + p.name + "'s own points or rewards page on " + chain + ' and confirm the deposit you already made counts toward it.', cost: 'no fee to check', time: '10 minutes' };
    }
    return venue
      ? { text: 'Verify ' + p.name + "'s launch status on its own site before trading more, because the snapshot carries no listed date for it.", cost: 'no fee to check', time: '10 minutes' }
      : { text: 'Verify ' + p.name + "'s launch status on its own site before depositing more, because the snapshot carries no listed date for it.", cost: 'no fee to check', time: '10 minutes' };
  }
  function exitStep(p, age, capital) {
    var band = ageBand(age);
    if (band === 'young') return { text: 'When you exit, withdraw only half of the $' + capital + ' and leave the rest in ' + p.name + ' in case the launch snapshot comes after you.', cost: 'half of the $' + capital + ' stays in the position', time: '10 minutes' };
    if (band === 'mid') return { text: 'When you exit, withdraw the $' + capital + ' from ' + p.name + ' in two stages a week apart so a late snapshot still sees activity.', cost: 'two withdrawals, each under $3 of gas', time: '10 minutes across two weeks' };
    if (band === 'mature') return { text: 'When you exit ' + p.name + ', claim any points or rewards first, then withdraw the full $' + capital + ', because after two years there is no more waiting to do.', cost: 'no fee to claim, and never pay to claim', time: '15 minutes' };
    return { text: 'When you exit ' + p.name + ', claim any points or rewards before withdrawing the $' + capital + ', because the record carries no date to plan the exit around.', cost: 'no fee to claim, and never pay to claim', time: '15 minutes' };
  }

  // CSV export of the board the reader is looking at: the current filter, search and sort, so the
  // file they download is the board they see. One row per protocol, quoted per RFC 4180, and the
  // risk note rides along so the file carries the same warnings the page shows.
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv() {
    var list = sortedRows(rows());
    var head = ['rank', 'protocol', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d_pct', 'age_days', 'implied_value_usd', 'risk_note'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      lines.push([r.rank, r.name, r.slug, r.category || '', (r.chains || []).join(';'), r.tvl_usd, r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d, r.age_days === null || r.age_days === undefined ? '' : r.age_days, shownImplied(r), r.risk_note || ''].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p, capital, chain), cost: gas + ' a week', time: '10 minutes a week' }
    ];
    var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    if (second) steps.push({ text: 'Repeat the same position on ' + second + ' with $' + Math.round(capital / 2) + ' so the activity is not on one chain only.', cost: '$' + Math.round(capital / 2) + ' of capital and ' + gasFor(second), time: '15 minutes' });
    else steps.push({ text: 'Use the protocol on its only chain, ' + chain + ', for a second product, such as its swap, vault or rewards page.', cost: gas, time: '10 minutes' });
    steps.push(ageBandStep(p, p.age_days, capital, chain));
    steps.push(
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      exitStep(p, p.age_days, capital),
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    );
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && r.tvl_usd < DATA.floor_usd) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    // Top movers is its own sort, not the growth column: seven-day growth first, then implied
    // value, so two protocols with the same weekly move still rank by what the model says.
    if (state.sort === 'movers') {
      return list.slice().sort(function (a, b) {
        var ag = a.change_7d === null || a.change_7d === undefined ? -Infinity : a.change_7d;
        var bg = b.change_7d === null || b.change_7d === undefined ? -Infinity : b.change_7d;
        if (ag !== bg) return bg - ag;
        return shownImplied(b) - shownImplied(a);
      });
    }
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    var sorted = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' }),
        el('p', { class: 'sub', text: top ? 'Top of the board: ' + top.name + ' at ' + fmtUsd(top.implied_value_usd) + ' implied value on ' + fmtUsd(top.tvl_usd) + ' of TVL.' : '' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(median) }))
      )
    );
  }

  // Jump to rank: the reader types a rank, the board scrolls to that row and flashes it once,
  // so a rank quoted elsewhere (a post, a chat) is one jump away. A rank outside the board
  // or hidden by the current filter does nothing, rather than jumping somewhere wrong.
  function jumpToRank() {
    var input = document.getElementById('jump-rank');
    if (!input) return;
    var n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1 || n > DATA.rows.length) return;
    var row = document.getElementById('row-' + n);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('jumped');
    setTimeout(function () { row.classList.remove('jumped'); }, 2000);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    // How many rows each category holds, so the filter shows its size before the reader picks it.
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + counts[c] + ')', selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: state.watchlistOnly ? 'Watchlist only: on' : 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    // Top movers re-sorts the board by seven-day growth, strongest first, and marks the rows
    // growing fastest while it is on. Switching it off returns to the implied-value order.
    var moversBtn = el('button', { class: 'button', type: 'button', 'aria-pressed': state.movers ? 'true' : 'false', text: state.movers ? 'Top movers: on' : 'Top movers', onclick: function () { state.movers = !state.movers; if (state.movers) { state.sort = 'movers'; state.dir = -1; } else { state.sort = 'implied'; state.dir = -1; } render(); } });
    // Export downloads the board as the reader sees it: the same filter, search and sort.
    var csvBtn = el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: function () { downloadCsv(); } });
    var jumpInput = el('input', { type: 'number', id: 'jump-rank', min: '1', max: String(DATA.rows.length), placeholder: 'Rank 1-' + DATA.rows.length, 'aria-label': 'Jump to rank' });
    var jumpBtn = el('button', { class: 'button', type: 'button', text: 'Go', onclick: function () { jumpToRank(); } });
    jumpInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); jumpToRank(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('label', { text: 'Sort' }), moversBtn),
      el('div', { class: 'field' }, el('label', { text: 'Download' }), csvBtn),
      el('div', { class: 'field' }, el('label', { for: 'jump-rank', text: 'Jump to rank' }), el('div', { class: 'jump' }, jumpInput, jumpBtn)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0] ? shownImplied(list[0]) : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      // The badge shows only while Top movers is on, so the default board looks as it did.
      var mover = state.movers && r.change_7d !== null && r.change_7d !== undefined && r.change_7d >= 10;
      var tr = el('tr', {
        id: 'row-' + r.rank,
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
          mover ? el('span', { class: 'mover', text: 'top mover +' + r.change_7d.toFixed(1) + '%' }) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var baseInput = el('input', { type: 'range', min: '0.1', max: '0.5', step: '0.05', value: String(state.sandbox.base), 'aria-label': 'Base multiple' });
    // 'change', not 'input': the sandbox recomputes on release, so a drag is never interrupted
    // by the re-render that follows it.
    baseInput.addEventListener('change', function () { state.sandbox.base = parseFloat(baseInput.value); render(); });
    var weightInput = el('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(state.sandbox.weight), 'aria-label': 'Growth weight' });
    weightInput.addEventListener('change', function () { state.sandbox.weight = parseFloat(weightInput.value); render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to radar-2', onclick: function () { state.sandbox.base = DATA.model.base_multiple; state.sandbox.weight = DATA.model.growth_weight; render(); } });
    var sandboxOn = state.sandbox.base !== DATA.model.base_multiple || state.sandbox.weight !== DATA.model.growth_weight;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 5)) )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Maturity stops growing after ' + m.maturity_days + ' days. Each extra chain adds 2% to the value, up to five chains. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      el('div', { class: 'sandbox' },
        el('div', { class: 'field' }, el('label', { text: 'Sandbox: base multiple = ' + state.sandbox.base.toFixed(2) }), baseInput),
        el('div', { class: 'field' }, el('label', { text: 'Sandbox: growth weight = ' + state.sandbox.weight.toFixed(1) }), weightInput),
        reset,
        el('span', { class: 'sub', text: sandboxOn ? 'Sandbox on: the board above recomputes live. board.json keeps the shipped radar-2 numbers.' : 'Move a slider to recompute the board from the same figures.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var calc = impliedOf(row, modelOf());
    var onWatchlist = row.tvl_usd >= DATA.floor_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (onWatchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(calc.growthMult.toFixed(4)) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(calc.maturity.toFixed(4)) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(calc.chainMult.toFixed(4)) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(calc.implied) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(calc.implied) + (calc.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the sandbox is on, or the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risk to watch' }),
      el('p', { class: 'risk-note', text: row.risk_note || 'No risk note for this protocol.' }),
      el('p', { class: 'sub', text: 'The note reads the same record the model scores — TVL, growth, age and chains — and never changes the implied value.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
