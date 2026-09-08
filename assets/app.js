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
// verified sample already in the markup if the call fails for any reason
// (network, CORS, empty payload).
(function settlementFeed(){
  var root = document.getElementById('settlement-feed');
  if (!root) return;

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
    var chip = root.querySelector('#feed-status');
    chip.className = 'status-chip live';
    chip.innerHTML = '<span class="dot"></span>Live · SP ' + row.settlementPeriod;

    setText('#feed-price', '£' + row.systemSellPrice.toFixed(2));
    setText('#feed-price-sub', row.systemSellPrice === row.systemBuyPrice ? '= System Buy Price this period' : 'Buy: £' + row.systemBuyPrice.toFixed(2));

    var niv = root.querySelector('#feed-niv');
    niv.textContent = (row.netImbalanceVolume >= 0 ? '+' : '−') + Math.abs(row.netImbalanceVolume).toFixed(2);
    niv.classList.toggle('neg', row.netImbalanceVolume < 0);
    setText('#feed-niv-sub', row.netImbalanceVolume < 0 ? 'Negative = system long (oversupplied)' : 'Positive = system short (undersupplied)');

    setText('#feed-period', 'SP ' + String(row.settlementPeriod).padStart(2, '0'));
    setText('#feed-period-sub', periodToTime(row.settlementPeriod));
    setText('#feed-date', row.settlementDate);
    setText('#feed-date-sub', 'Published ' + row.createdDateTime.replace('T', ' ').replace('Z', ' UTC'));
  }

  function renderFallback() {
    var chip = root.querySelector('#feed-status');
    chip.className = 'status-chip fallback';
    chip.innerHTML = '<span class="dot"></span>Reference sample — live feed unreachable';
  }

  function setText(sel, text) {
    var el = root.querySelector(sel);
    if (el) el.textContent = text;
  }
})();
