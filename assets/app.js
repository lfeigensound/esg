// Turn-Up Console — behaviour layer. No build step, no framework.

(function motionToggle(){
  var btn = document.getElementById('motion-btn');
  var root = document.documentElement;
  if (!btn) return;
  try {
    if (localStorage.getItem('reduceMotion') === '1') { root.classList.add('reduce-motion'); btn.classList.add('on'); }
  } catch (e) {}
  btn.addEventListener('click', function () {
    var on = root.classList.toggle('reduce-motion');
    btn.classList.toggle('on', on);
    try { localStorage.setItem('reduceMotion', on ? '1' : '0'); } catch (e) {}
  });
})();

(function navScrollSpy(){
  var sections = Array.prototype.slice.call(document.querySelectorAll('.page-section[id]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  if (!sections.length || !links.length) return;

  var linkFor = {};
  links.forEach(function (a) { linkFor[a.getAttribute('href').slice(1)] = a; });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        links.forEach(function (a) { a.classList.remove('active'); });
        var link = linkFor[entry.target.id];
        if (link) link.classList.add('active');
        var title = document.getElementById('page-title');
        if (title && link) title.textContent = link.dataset.label || link.textContent.trim();
      }
    });
  }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

  sections.forEach(function (s) { observer.observe(s); });
})();

(function supplierAccordion(){
  var groups = Array.prototype.slice.call(document.querySelectorAll('.supplier-group'));
  groups.forEach(function (group) {
    var trigger = group.querySelector('.supplier-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var willOpen = !group.classList.contains('open');
      groups.forEach(function (g) { g.classList.remove('open'); });
      if (willOpen) group.classList.add('open');
    });
  });
})();

(function archetypeCalculator(){
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.calc-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.calc-panel'));
  if (!tabs.length) return;
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.hidden = true; });
      tab.classList.add('active');
      var target = document.getElementById(tab.dataset.target);
      if (target) target.hidden = false;
    });
  });
})();

// ---------- Settlement Feed (Elexon Insights API — DISEBSP) ----------
// One call, one row: yesterday's settlement periods, walk backwards for the
// latest period that has actually been published. Falls back to the static
// verified sample already in the hero gauge markup if the call fails for
// any reason (network, CORS, empty payload).
//
// The hero gauge's arc represents the price's position within the report's
// documented wholesale range (Table 0: -£70 to +£250/MWh), the same range
// used by the static "Wholesale Clearing Band" card below it.
(function settlementFeed(){
  var root = document.getElementById('hero-gauge');
  if (!root) return;

  var RANGE_MIN = -70, RANGE_MAX = 250, ARC_LEN = 283;

  function fmtDate(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function periodToTime(period) {
    var mins = (period - 1) * 30;
    var h = String(Math.floor(mins / 60)).padStart(2, '0');
    var m = String(mins % 60).padStart(2, '0');
    var endMins = mins + 30;
    var eh = String(Math.floor(endMins / 60) % 24).padStart(2, '0');
    var em = String(endMins % 60).padStart(2, '0');
    return h + ':' + m + '–' + eh + ':' + em + ' UTC';
  }

  var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var dateStr = fmtDate(yesterday);
  var url = 'https://data.elexon.co.uk/bmrs/api/v1/balancing/settlement/system-prices/' + dateStr + '?format=json';

  fetch(url, { headers: { accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (json) {
      var rows = (json && json.data) || [];
      var latest = null;
      for (var i = rows.length - 1; i >= 0; i--) {
        if (rows[i] && typeof rows[i].systemSellPrice === 'number') { latest = rows[i]; break; }
      }
      if (!latest) throw new Error('No published settlement periods for ' + dateStr);
      renderLive(latest);
    })
    .catch(function (err) {
      console.warn('[settlement-feed] live fetch unavailable, showing reference sample:', err.message);
      renderFallback();
    });

  function renderLive(row) {
    var chip = root.querySelector('#hero-feed-status');
    chip.className = 'status-chip live';
    chip.innerHTML = '<span class="dot"></span>Live · SP ' + row.settlementPeriod;

    setText('#hero-price', '£' + row.systemSellPrice.toFixed(2) + '<small>/MWh</small>');
    setText('#hero-buy', '£' + row.systemBuyPrice.toFixed(2) + '<small style="font-size:11px;color:var(--ink-dim);font-weight:400">/MWh</small>');
    setText('#hero-buy-sub', row.systemSellPrice === row.systemBuyPrice ? 'Equals sell price this period' : 'DISEBSP · Elexon');

    var niv = root.querySelector('#hero-niv');
    niv.innerHTML = (row.netImbalanceVolume >= 0 ? '+' : '−') + Math.abs(row.netImbalanceVolume).toFixed(2) + ' MWh';
    niv.classList.toggle('neg', row.netImbalanceVolume < 0);
    setText('#hero-niv-sub', row.netImbalanceVolume < 0 ? 'Negative = system long' : 'Positive = system short');

    setText('#hero-period', 'SP ' + String(row.settlementPeriod).padStart(2, '0'));
    setText('#hero-period-sub', periodToTime(row.settlementPeriod));
    setText('#hero-date', row.settlementDate);
    setText('#hero-date-sub', 'Published ' + row.createdDateTime.slice(0, 10));

    var fraction = (row.systemSellPrice - RANGE_MIN) / (RANGE_MAX - RANGE_MIN);
    fraction = Math.max(0, Math.min(1, fraction));
    var fill = root.querySelector('#hero-gauge-fill');
    if (fill) fill.setAttribute('stroke-dashoffset', String(ARC_LEN * (1 - fraction)));
  }

  function renderFallback() {
    var chip = root.querySelector('#hero-feed-status');
    chip.className = 'status-chip fallback';
    chip.innerHTML = '<span class="dot"></span>Reference sample — live feed unreachable';
  }

  function setText(sel, html) {
    var el = root.querySelector(sel);
    if (el) el.innerHTML = html;
  }
})();

// ---------- Forecast cards (Elexon Insights API — OCNMFD / OCNMFD2) ----------
// Both datasets are a flat 13-day-ahead array with the same shape:
// [{ forecastDate, publishTime, <valueField> }, ...]. No date params needed —
// the endpoint returns its full published forecast horizon as-is.
(function forecastCards(){
  function loadCard(cardId, url, valueField, unitLabel) {
    var card = document.getElementById(cardId);
    if (!card) return;
    var valueEl = card.querySelector('.stat-value');
    var sparkEl = card.querySelector('.spark-live');
    var statusEl = card.querySelector('.status-chip');

    fetch(url, { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var rows = (json && json.data) || [];
        if (!rows.length) throw new Error('empty forecast series');
        render(rows);
      })
      .catch(function (err) {
        console.warn('[forecast:' + cardId + '] unavailable:', err.message);
        statusEl.className = 'status-chip fallback';
        statusEl.innerHTML = '<span class="dot"></span>Live feed unreachable';
        valueEl.innerHTML = '—<small> no data</small>';
      });

    function render(rows) {
      var first = rows[0];
      valueEl.innerHTML = Number(first[valueField]).toLocaleString('en-GB') + '<small>' + unitLabel + '</small>';

      statusEl.className = 'status-chip live';
      statusEl.innerHTML = '<span class="dot"></span>Live · forecast for ' + first.forecastDate;

      var values = rows.map(function (r) { return r[valueField]; });
      var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
      var span = (max - min) || 1;
      var n = values.length;
      var points = values.map(function (v, i) {
        var x = 3 + (i / (n - 1)) * 294;
        var y = 30 - ((v - min) / span) * 26;
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      var strokeColor = cardId === 'surplus-card' ? 'var(--good)' : 'var(--blue)';
      sparkEl.innerHTML =
        '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + strokeColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="3" cy="' + (30 - ((values[0] - min) / span) * 26).toFixed(1) + '" r="3" fill="' + strokeColor + '"/>';
    }
  }

  loadCard('surplus-card', 'https://data.elexon.co.uk/bmrs/api/v1/forecast/surplus/daily?format=json', 'surplus', '');
  loadCard('margin-card', 'https://data.elexon.co.uk/bmrs/api/v1/forecast/margin/daily?format=json', 'margin', '');
})();

// ---------- Formula typesetting (KaTeX) ----------
// Renders the Financial Settlement section's equations as real mathematical
// notation, matching the variable names the source report itself defines
// (customer i, settlement period t, reference-day set D).
(function renderFormulas(){
  if (typeof katex === 'undefined') return;

  var equations = {
    'eq-baseline':    { tex: 'B_{i,t} = \\dfrac{1}{|D|}\\sum_{d \\,\\in\\, D} c_{i,t,d}', display: true },
    'eq-incremental': { tex: '\\Delta V_{i,t} = C_{i,t} - B_{i,t}', display: true },
    'eq-credit':      { tex: 'R_{i,t} = \\Delta V_{i,t} \\times r_i', display: true },
    'eq-margin':      { tex: 'M = \\sum_{t\\, \\in\\, T} \\sum_{i\\, \\in\\, I} \\Big[\\, F_{i,t} - \\big(R_{i,t} + N_{i,t}\\big) \\Big]', display: true },
    'sym-b':  { tex: 'B_{i,t}', display: false },
    'sym-d':  { tex: 'D', display: false },
    'sym-r':  { tex: 'r_i', display: false },
    'sym-f':  { tex: 'F_{i,t}', display: false },
    'sym-nl': { tex: 'N_{i,t}', display: false }
  };

  Object.keys(equations).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      katex.render(equations[id].tex, el, { displayMode: equations[id].display, throwOnError: false });
    } catch (e) {
      console.warn('[katex] failed to render #' + id, e.message);
    }
  });
})();
