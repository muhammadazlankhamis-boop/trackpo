// ===== TRACKPO — DASHBOARD JS =====

let currentProfile = null;
let currentClient = null;
let currentFilter = 'bulan-ini';
let currentPlatform = 'semua';
let currentChartTab = 'sale-lead';
let currentGroupBy = 'tarikh';
let currentTableTab = 'sale';
let fabOpen = false;

let saleData = [];
let marketingData = [];
let bajetData = [];
let tetapan = {};

let salePage = 1;
let marketingPage = 1;
const PER_PAGE = 20;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  showLoading();

  const session = await requireAuth();
  if (!session) return;

  currentProfile = await getCurrentProfile();
  if (!currentProfile) { logout(); return; }

  // Kalau admin — dia kena masuk dari admin.html, bukan index.html
  // Tapi allow admin buka dashboard client melalui query param
  const params = new URLSearchParams(window.location.search);
  const clientIdParam = params.get('client');

  if (currentProfile.role === 'admin' && clientIdParam) {
    // Admin buka dashboard client tertentu
    const { data: client } = await sbClient
      .from('clients')
      .select('*')
      .eq('id', clientIdParam)
      .single();
    currentClient = client;

    // Tunjuk button admin
    document.getElementById('fabMarketingItem')?.classList.remove('hidden');
    document.getElementById('fabTopupItem')?.classList.remove('hidden');
    document.getElementById('bajetAdminBtn')?.classList.remove('hidden');
  } else if (currentProfile.role === 'admin' && !clientIdParam) {
    window.location.href = 'admin.html';
    return;
  } else {
    // Client biasa
    const { data: client } = await sbClient
      .from('clients')
      .select('*')
      .eq('id', currentProfile.client_id)
      .single();
    currentClient = client;
  }

  if (!currentClient) {
    showToast('Client tidak dijumpai. Hubungi admin.', 'error');
    hideLoading();
    return;
  }

  applyFokusServisDisplay();

  // Set nama
  const clientNameUpper = (currentClient.nama_bisnes || '-').toUpperCase();
  document.getElementById('clientNameHeader').textContent = clientNameUpper;
  document.getElementById('sidebarName').textContent = currentProfile.nama || '-';
  document.getElementById('sidebarAvatar').textContent = (currentProfile.nama || 'U')[0].toUpperCase();

  // Fix role label
  const roleEl = document.getElementById('sidebarRole');
  if (roleEl) roleEl.textContent = currentProfile.role === 'admin' ? 'Administrator' : 'Client';

  // Greeting kecil bawah nama client
  const hour = nowMY().getHours();
  const greetWord = hour < 12 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Tengah Hari' : hour < 19 ? 'Selamat Petang' : 'Selamat Malam';
  const greetEmoji = hour < 12 ? '🌤️' : hour < 15 ? '☀️' : hour < 19 ? '🌤️' : '🌙';
  const nameDisplay = currentProfile.nama || currentClient.nama_bisnes || '';
  const greetEl = document.getElementById('greetingText');
  if (greetEl) greetEl.textContent = `${greetWord}, ${nameDisplay} ${greetEmoji}`;

  // Load tetapan
  await loadTetapan();

  // Set tarikh default hari ini
  document.getElementById('saleDate').value = toInputDate(nowMY());
  document.getElementById('marketingDate').value = toInputDate(nowMY());

  // Load data
  await loadAllData();
  hideLoading();

  // Theme toggle
  const savedTheme = localStorage.getItem('trackpo_theme') || 'light';
  const themeEl = document.getElementById('themeToggle');
  if (themeEl) themeEl.checked = savedTheme === 'dark';

  // Update last login
  updateLastLogin(currentProfile.id);

  // Load post list untuk datalist
  loadPostList();
});

// ===== LOAD ALL DATA =====
async function loadAllData() {
  const { start, end } = getDateRange(currentFilter,
    document.getElementById('customStart')?.value,
    document.getElementById('customEnd')?.value
  );

  await Promise.all([
    loadSaleData(start, end),
    loadMarketingData(start, end),
    loadBajetData()
  ]);

  updatePeriodLabel();
  updateLastUpdateInfo();
  updateKPICards();
  updateAlerts();
  renderCharts();
  renderBestDay();
  renderTables();
  renderRekodSale();
  renderRekodMarketing();
}

// ===== LOAD TETAPAN =====
async function loadTetapan() {
  const { data } = await sbClient
    .from('tetapan_client')
    .select('*')
    .eq('client_id', currentClient.id)
    .single();

  tetapan = data || {
    benchmark_cpl: 0,
    target_lead: 0,
    target_sale: 0,
    budget_alert_aktif: true,
    budget_threshold_pct: 20,
    lead_alert_aktif: true,
    tema: 'dark'
  };

  // Update settings display
  document.getElementById('settingNama').textContent = currentClient.nama_bisnes || '-';
  document.getElementById('settingPakej').textContent = currentClient.pakej || '-';
  document.getElementById('settingTargetLead').textContent = formatNumber(tetapan.target_lead) + ' lead';
  document.getElementById('settingTargetSale').textContent = formatRM(tetapan.target_sale);
}

// ===== LOAD SALE DATA =====
async function loadSaleData(start, end) {
  let query = sbClient
    .from('data_sale')
    .select('*')
    .eq('client_id', currentClient.id)
    .order('tarikh', { ascending: false });

  if (start) query = query.gte('tarikh', start);
  if (end) query = query.lte('tarikh', end);

  const { data, error } = await query;
  if (error) { console.error(error); return; }
  saleData = data || [];
}

// ===== LOAD MARKETING DATA =====
async function loadMarketingData(start, end) {
  let query = sbClient
    .from('data_marketing')
    .select('*')
    .eq('client_id', currentClient.id)
    .order('tarikh_mula', { ascending: false });

  if (start) query = query.gte('tarikh_mula', start);
  if (end) query = query.lte('tarikh_mula', end);

  // Filter platform
  if (currentPlatform !== 'semua') {
    query = query.eq('platform', currentPlatform);
  }

  const { data, error } = await query;
  if (error) { console.error(error); return; }
  marketingData = data || [];
}

// ===== LOAD BAJET =====
async function loadBajetData() {
  const { data, error } = await sbClient
    .from('bajet')
    .select('*')
    .eq('client_id', currentClient.id)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  bajetData = data || [];
}

// ===== PERIOD LABEL =====
function updatePeriodLabel() {
  const label = getPeriodLabel(
    currentFilter,
    document.getElementById('customStart')?.value,
    document.getElementById('customEnd')?.value
  );
  document.getElementById('periodLabel').textContent = label;
}

// ===== LAST UPDATE INFO =====
// Tunjuk tarikh DATA (bukan tarikh dimasukkan)
// Sale: tarikh terkini dari data_sale.tarikh
// Marketing: tarikh_akhir terkini (ambik tarikh data, bukan masa entry)
async function updateLastUpdateInfo() {
  const { data: lastSale } = await sbClient
    .from('data_sale')
    .select('tarikh')
    .eq('client_id', currentClient.id)
    .order('tarikh', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastMarketing } = await sbClient
    .from('data_marketing')
    .select('tarikh_mula, tarikh_akhir, is_bulk')
    .eq('client_id', currentClient.id)
    .order('tarikh_akhir', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Sale: guna tarikh data
  const saleTarikh = lastSale?.tarikh || null;
  const saleDays = saleTarikh ? daysSince(saleTarikh) : null;

  // Marketing: kalau bulk → tarikh_akhir, kalau harian → tarikh_mula
  const mktTarikh = lastMarketing
    ? (lastMarketing.is_bulk ? lastMarketing.tarikh_akhir : lastMarketing.tarikh_mula)
    : null;
  const marketingDays = mktTarikh ? daysSince(mktTarikh) : null;

  function makeLabel(tarikh, days) {
    if (tarikh === null) return 'Tiada data';
    const dateStr = formatDate(tarikh);
    if (days === 0) return `<span class="fresh">${dateStr} (hari ini)</span>`;
    if (days === 1) return `<span class="fresh">${dateStr} (semalam)</span>`;
    if (days <= 2) return `<span class="fresh">${dateStr}</span>`;
    return `<span class="stale">${dateStr} (${days} hari lepas)</span>`;
  }

  document.getElementById('lastUpdateInfo').innerHTML =
    `Sale: ${makeLabel(saleTarikh, saleDays)} · Marketing: ${makeLabel(mktTarikh, marketingDays)}`;

  // Notif dot
  if ((saleDays !== null && saleDays > 2) || (marketingDays !== null && marketingDays > 2)) {
    document.getElementById('notifDot').classList.remove('hidden');
  }
}

// ===== KPI CALCULATIONS =====
function updateKPICards() {
  // Total Sale
  const totalSale = saleData.reduce((s, d) => s + (d.total_sale || 0), 0);

  // Total Lead
  const totalLeadClose = saleData.reduce((s, d) => s + (d.lead_close || 0), 0);
  const totalLeadMasuk = saleData.reduce((s, d) => s + (d.lead_masuk || 0), 0);

  // Marketing totals
  const totalAdSpend = marketingData.reduce((s, d) => s + (d.ad_spend || 0), 0);
  const totalSpendSST = marketingData.reduce((s, d) => s + (d.spend_sst || 0), 0);
  const totalLeadAds = marketingData.reduce((s, d) => s + (d.message_leads || 0), 0);

  // CPL
  const cplAds = totalLeadAds > 0 ? totalAdSpend / totalLeadAds : 0;
  const cplReal = calculateCPL(marketingData);

  // Closing Rate
  const closingRate = totalLeadMasuk > 0 ? (totalLeadClose / totalLeadMasuk) * 100 : 0;

  // ROAS
  const roas = totalSpendSST > 0 ? totalSale / totalSpendSST : 0;

  // Balance Bajet (all time)
  const totalTopup = bajetData.reduce((s, d) => s + (d.jumlah || 0), 0);
  const { data: allMarketingForBalance } = { data: null }; // Will use all time data
  // Untuk balance — kita guna data semua masa, bukan filtered
  // Ini akan dihandle dalam loadBajetData dengan query berasingan

  // Update UI
  document.getElementById('kpiAdSpend').textContent = formatRM(totalAdSpend);
  document.getElementById('kpiAdSpendSST').textContent = formatRM(totalSpendSST);

  // Lead
  document.getElementById('kpiLead').textContent = formatNumber(totalLeadAds);
  document.getElementById('kpiLeadSub').textContent =
    `Ads ${formatNumber(totalLeadAds)} · Masuk ${formatNumber(totalLeadMasuk)} · Close ${formatNumber(totalLeadClose)}`;
  const leadGapEl = document.getElementById('kpiLeadGap');
  const gapAdsMasuk = totalLeadAds - totalLeadMasuk;
  if (gapAdsMasuk > 0) {
    leadGapEl.textContent = `Gap Ads→Masuk: ${formatNumber(gapAdsMasuk)}`;
    leadGapEl.className = 'kpi-gap negative';
  } else {
    leadGapEl.textContent = '';
  }

  // CPL
  document.getElementById('kpiCPL').textContent = formatRM(cplAds);
  document.getElementById('kpiCPLSub').textContent = `Ads ${formatRM(cplAds)} · Real ${formatRM(cplReal)}`;
  const cplBadge = document.getElementById('kpiCPLBadge');
  if (tetapan.benchmark_cpl > 0) {
    const aboveTarget = cplReal > tetapan.benchmark_cpl;
    cplBadge.innerHTML = `<span class="badge ${aboveTarget ? 'badge-red' : 'badge-green'}">
      ${aboveTarget ? '▲ Atas target' : '▼ Bawah target'} (${formatRM(tetapan.benchmark_cpl)})
    </span>`;
  }

  // Total Sale
  document.getElementById('kpiSale').textContent = formatRM(totalSale);
  if (tetapan.target_sale > 0) {
    const saleProgress = Math.min((totalSale / tetapan.target_sale) * 100, 100);
    document.getElementById('kpiSaleSub').textContent = `${formatRM(totalSale)} / ${formatRM(tetapan.target_sale)}`;
    document.getElementById('kpiSaleProgress').style.width = saleProgress + '%';
    document.getElementById('kpiSaleProgress').className = `progress-fill ${saleProgress >= 100 ? 'fill-green' : saleProgress >= 50 ? 'fill-gold' : 'fill-red'}`;
  }

  // Closing Rate
  document.getElementById('kpiClosing').textContent = formatPercent(closingRate);
  let closingStatus = closingRate >= 30 ? 'Bagus ✓' : closingRate >= 15 ? 'Ada ruang improve' : 'Perlu perhatian';
  document.getElementById('kpiClosingSub').textContent = closingStatus;
  document.getElementById('kpiClosingProgress').style.width = Math.min(closingRate, 100) + '%';

  // ROAS
  document.getElementById('kpiROAS').textContent = roas.toFixed(2) + 'x';
  const roasBadge = getROASBadge(roas);
  document.getElementById('kpiROASBadge').innerHTML = `<span class="badge ${roasBadge.class}">${roasBadge.text}</span>`;

  // Balance (akan update bila loadBajetBalance dipanggil)
  updateBalanceKPI();
}

async function updateBalanceKPI() {
  // Balance = Total Topup (all time) - Total Spend+SST (all time)
  const { data: allMarketing } = await sbClient
    .from('data_marketing')
    .select('spend_sst')
    .eq('client_id', currentClient.id);

  const totalTopup = bajetData.reduce((s, d) => s + (d.jumlah || 0), 0);
  const totalSpendAllTime = (allMarketing || []).reduce((s, d) => s + (d.spend_sst || 0), 0);
  const balance = totalTopup - totalSpendAllTime;

  const balanceEl = document.getElementById('kpiBalance');
    balanceEl.textContent = (balance < 0 ? '-' : '') + formatRM(Math.abs(balance));
    balanceEl.className = `kpi-value ${balance < 0 ? 'text-red' : ''}`;

  const thresholdAmount = tetapan.budget_threshold_pct
    ? (tetapan.budget_threshold_pct / 100) * totalTopup
    : 0;

  const balanceBadge = getBalanceBadge(balance, thresholdAmount);
  document.getElementById('kpiBalanceBadge').innerHTML = `<span class="badge ${balanceBadge.class}">${balanceBadge.text}</span>`;

  // Update bajet section — colour-coded balance
  const bajetBalance = document.getElementById('bajetBalance');
  bajetBalance.textContent = (balance < 0 ? '-' : '') + formatRM(Math.abs(balance));
  bajetBalance.className = `bajet-balance ${balance < 0 ? 'negative' : balance < 100 ? 'warning' : 'positive'}`;

  // Status label
  const bajetStatusEl = document.getElementById('bajetStatus');
  if (bajetStatusEl) {
    if (balance < 0) {
      bajetStatusEl.textContent = 'Topup diperlukan!';
      bajetStatusEl.style.color = 'var(--red)';
      bajetStatusEl.style.background = 'var(--red-light)';
    } else if (balance < 100) {
      bajetStatusEl.textContent = 'Perlu Topup';
      bajetStatusEl.style.color = 'var(--orange)';
      bajetStatusEl.style.background = 'var(--orange-light)';
    } else {
      bajetStatusEl.textContent = 'OK';
      bajetStatusEl.style.color = 'var(--green)';
      bajetStatusEl.style.background = 'var(--green-light)';
    }
  }

  // Progress bar
  if (totalTopup > 0) {
    const usedPct = Math.min((totalSpendAllTime / totalTopup) * 100, 100);
    const prog = document.getElementById('bajetProgress');
    prog.style.width = usedPct + '%';
    prog.className = `progress-fill ${usedPct >= 90 ? 'fill-red' : usedPct >= 70 ? 'fill-yellow' : 'fill-green'}`;
  }

  // Rekod Topup — default 3, expand on click
  const histEl = document.getElementById('topupHistory');
  const isAdmin = currentProfile?.role === 'admin';

  if (bajetData.length === 0) {
    histEl.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;">Rekod Topup</div><div style="color:var(--text-secondary);font-size:13px;">Tiada rekod topup</div>';
    return;
  }

  renderTopupList(false);
}

function renderTopupList(showAll) {
  const histEl = document.getElementById('topupHistory');
  const isAdmin = currentProfile?.role === 'admin';
  const DEFAULT_SHOW = 3;
  const data = showAll ? bajetData : bajetData.slice(0, DEFAULT_SHOW);
  const hasMore = bajetData.length > DEFAULT_SHOW;

  const renderItem = t => `
    <div style="display:flex;flex-direction:column;padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;${isAdmin ? 'margin-bottom:10px;' : ''}">
        <div>
          <div class="topup-amount">+ ${formatRM(t.jumlah)}</div>
          <div class="topup-date" style="margin-top:2px;">${t.nota || '-'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="topup-date">${formatDate(t.tarikh || t.created_at)}</div>
          ${isAdmin ? `
            <button class="btn-edit" onclick="editTopup('${t.id}')" style="padding:5px 12px;min-height:32px;font-size:12px;">Edit</button>
            <button class="btn-delete" onclick="deleteTopup('${t.id}')" style="padding:5px 12px;min-height:32px;font-size:12px;">Padam</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  const toggleBtn = hasMore ? `
    <button
      onclick="renderTopupList(${!showAll})"
      style="width:100%;margin-top:10px;padding:10px;border:1px solid var(--border-strong);border-radius:10px;background:transparent;color:var(--primary);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;"
      onmouseover="this.style.background='var(--primary-light)'"
      onmouseout="this.style.background='transparent'"
    >
      ${showAll ? '↑ Tunjuk Kurang' : `↓ Lihat Semua (${bajetData.length} rekod)`}
    </button>
  ` : '';

  histEl.innerHTML =
    '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:14px;">Rekod Topup</div>' +
    data.map(renderItem).join('') +
    toggleBtn;
}

// ===== ALERTS =====
function updateAlerts() {
  // Check lead semalam
  if (tetapan.lead_alert_aktif) {
    const yesterday = toInputDate(new Date(nowMY().setDate(nowMY().getDate() - 1)));
    const yesterdayMarketing = marketingData.filter(d => d.tarikh_mula === yesterday);
    const yesterdayLeads = yesterdayMarketing.reduce((s, d) => s + (d.message_leads || 0), 0);

    if (yesterdayLeads === 0) {
      document.getElementById('alertLeadKosong').classList.remove('hidden');
      document.getElementById('notifDot').classList.remove('hidden');
    }
  }
}

// ===== BEST DAY =====
function renderBestDay() {
  const byDate = {};
  saleData.forEach(d => {
    if (!byDate[d.tarikh]) byDate[d.tarikh] = 0;
    byDate[d.tarikh] += d.total_sale || 0;
  });

  const sorted = Object.entries(byDate)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const medals = ['🥇', '🥈', '🥉'];
  const el = document.getElementById('bestDayList');

  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Tiada data</div></div>';
    return;
  }

  el.innerHTML = sorted.map((item, i) => `
    <div class="best-day-item">
      <div class="best-day-rank">${medals[i]}</div>
      <div class="best-day-date">${formatDate(item[0])}</div>
      <div class="best-day-value">${formatRM(item[1])}</div>
    </div>
  `).join('');
}

// ===== TABLES =====
function renderTables() {
  renderSaleTable();
  renderMarketingTable();
}

function renderSaleTable() {
  const start = (salePage - 1) * PER_PAGE;
  const paged = saleData.slice(start, start + PER_PAGE);
  const container = document.getElementById('tableSaleBody');

  if (paged.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Tiada data sale untuk tempoh ini</div></div>';
    document.getElementById('paginationSale').innerHTML = '';
    return;
  }

  container.innerHTML = paged.map(d => {
    const sebab = Array.isArray(d.sebab_tak_close) ? d.sebab_tak_close.join(', ') : '-';
    return `
      <div class="topup-item" style="flex-direction:column;align-items:stretch;gap:8px;padding:14px 0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--accent-gold);">${formatRM(d.total_sale)}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${formatDate(d.tarikh)}</div>
          </div>

        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;">
          <div><span style="color:var(--text-secondary);">Lead Masuk:</span> <strong>${formatNumber(d.lead_masuk)}</strong></div>
          <div><span style="color:var(--text-secondary);">Lead Close:</span> <strong>${formatNumber(d.lead_close)}</strong></div>
          <div><span style="color:var(--text-secondary);">Rate:</span> <strong>${formatPercent(d.closing_rate)}</strong></div>
          <div><span style="color:var(--text-secondary);">Resit:</span> <strong>${d.bilangan_resit || 0}</strong></div>
          ${sebab && sebab !== '-' ? `<div><span style="color:var(--text-secondary);">Sebab:</span> ${sebab}</div>` : ''}
          ${d.nota ? `<div><span style="color:var(--text-secondary);">Notes:</span> ${d.nota}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const totalPages = Math.ceil(saleData.length / PER_PAGE);
  renderPagination('paginationSale', salePage, totalPages, (p) => {
    salePage = p;
    renderSaleTable();
  });
}

function renderMarketingTable() {
  const start = (marketingPage - 1) * PER_PAGE;
  const paged = marketingData.slice(start, start + PER_PAGE);
  const container = document.getElementById('tableMarketingBody');
  const showActions = currentProfile?.role === 'admin';

  if (paged.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Tiada data marketing untuk tempoh ini</div></div>';
    document.getElementById('paginationMarketing').innerHTML = '';
    return;
  }

  container.innerHTML = paged.map(d => {
    const tarikh = d.is_bulk
      ? `${formatDate(d.tarikh_mula)} → ${formatDate(d.tarikh_akhir)}`
      : formatDate(d.tarikh_mula);
    return `
      <div class="topup-item" style="flex-direction:column;align-items:stretch;gap:8px;padding:14px 0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--accent-gold);">${formatRM(d.ad_spend)} <span style="font-size:12px;color:var(--text-secondary);">(+SST: ${formatRM(d.spend_sst)})</span></div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${tarikh}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
            <span class="badge badge-blue">${d.platform || '-'}</span>
            <span class="badge badge-gold">${d.objektif || '-'}</span>

          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;">
          <div><span style="color:var(--text-secondary);">Reach:</span> <strong>${formatNumber(d.reach)}</strong></div>
          <div><span style="color:var(--text-secondary);">CTR:</span> <strong>${d.ctr ? d.ctr + '%' : '-'}</strong></div>
          <div><span style="color:var(--text-secondary);">Leads:</span> <strong>${formatNumber(d.message_leads)}</strong></div>
          <div><span style="color:var(--text-secondary);">CPL:</span> <strong>${formatRM(d.cpl)}</strong></div>
          ${d.nama_post ? `<div><span style="color:var(--text-secondary);">Post:</span> ${d.nama_post}</div>` : ''}
          ${d.nota ? `<div><span style="color:var(--text-secondary);">Notes:</span> ${d.nota}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const totalPages = Math.ceil(marketingData.length / PER_PAGE);
  renderPagination('paginationMarketing', marketingPage, totalPages, (p) => {
    marketingPage = p;
    renderMarketingTable();
  });
}


function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const el = document.getElementById(containerId);
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1) {
    html += `<button class="page-btn" onclick="(${onPageChange.toString()})(${currentPage - 1})">‹</button>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      html += `<button class="page-btn active">${i}</button>`;
    } else if (Math.abs(i - currentPage) <= 2) {
      html += `<button class="page-btn" onclick="(${onPageChange.toString()})(${i})">${i}</button>`;
    }
  }

  if (currentPage < totalPages) {
    html += `<button class="page-btn" onclick="(${onPageChange.toString()})(${currentPage + 1})">›</button>`;
  }

  html += `<span class="page-info">${currentPage} / ${totalPages}</span>`;
  el.innerHTML = html;
}

// ===== FILTER FUNCTIONS =====
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');

  const customRow = document.getElementById('customDateRow');
  if (filter === 'custom') {
    customRow.classList.add('show');
  } else {
    customRow.classList.remove('show');
    salePage = 1;
    marketingPage = 1;
    loadAllData();
  }
}

// ===== FILTER DROPDOWN =====
function toggleFilterDropdown() {
  const btn = document.getElementById('filterDropdownBtn');
  const menu = document.getElementById('filterDropdownMenu');
  const isOpen = menu.classList.contains('open');

  if (!isOpen) {
    // Kira posisi butang, letak menu tepat di bawahnya
    const rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.left = rect.left + 'px';

    setTimeout(() => {
      document.addEventListener('click', closeFilterDropdownOutside, { once: true });
    }, 100);
  }

  btn.classList.toggle('open', !isOpen);
  menu.classList.toggle('open', !isOpen);
}

function closeFilterDropdownOutside(e) {
  const wrap = document.getElementById('filterDropdownWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('filterDropdownBtn')?.classList.remove('open');
    document.getElementById('filterDropdownMenu')?.classList.remove('open');
  }
}

function setFilterDrop(filter, label) {
  // Update label
  document.getElementById('filterDropdownLabel').textContent = label;

  // Update selected state
  document.querySelectorAll('.filter-dropdown-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.filter === filter);
  });

  // Close dropdown
  document.getElementById('filterDropdownBtn')?.classList.remove('open');
  document.getElementById('filterDropdownMenu')?.classList.remove('open');

  // Apply filter
  setFilter(filter);
}

function setPlatformLogo(btn, platform) {
  document.querySelectorAll('.platform-logo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentPlatform = platform;
  salePage = 1; marketingPage = 1;
  loadAllData();
}

function applyCustomFilter() {
  const start = document.getElementById('customStart').value;
  const end = document.getElementById('customEnd').value;
  if (start && end) {
    salePage = 1;
    marketingPage = 1;
    loadAllData();
  }
}

function clearCustomFilter() {
  document.getElementById('customStart').value = '';
  document.getElementById('customEnd').value = '';
  currentFilter = 'bulan-ini';
  document.getElementById('customDateRow').classList.remove('show');
  loadAllData();
}

function setPlatform(platform) {
  currentPlatform = platform;
  document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  loadAllData();
}

// ===== SECTION NAVIGATION =====
function showSection(section) {
  const sections = ['dashboard', 'ringkasan', 'comparison', 'rekod', 'settings'];
  sections.forEach(s => {
    const el = document.getElementById(`section${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (el) el.classList.toggle('hidden', s !== section);
  });

  document.querySelectorAll('.sidebar-nav li a, .nav-item').forEach(a => a.classList.remove('active'));
  event?.target?.closest('a, .nav-item')?.classList.add('active');

  if (section === 'ringkasan') loadWeeklyDefault();
  if (section === 'settings') loadSettingsDisplay();
  if (section === 'rekod') { renderRekodSale(); renderRekodMarketing(); }
}

// ===== REKOD DATA TAB =====
function setRekodTab(tab) {
  document.querySelectorAll('.table-tab').forEach(t => t.classList.remove('active'));
  event?.target?.classList.add('active');
  document.getElementById('rekodSaleSection').classList.toggle('hidden', tab !== 'sale');
  document.getElementById('rekodMarketingSection').classList.toggle('hidden', tab !== 'marketing');
}

function renderRekodSale() {
  const tbody = document.getElementById('rekodSaleBody');
  if (!tbody) return;

  if (saleData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state empty-state-text">Tiada data sale</div></td></tr>';
    return;
  }

  tbody.innerHTML = saleData.map(d => {
    const sebab = Array.isArray(d.sebab_tak_close) ? d.sebab_tak_close.join(', ') : '-';
    return `
      <tr>
        <td>${formatDate(d.tarikh)}</td>
        <td>${formatNumber(d.lead_masuk)}</td>
        <td>${formatNumber(d.lead_close)}</td>
        <td>${formatPercent(d.closing_rate)}</td>
        <td class="text-gold fw-700">${formatRM(d.total_sale)}</td>
        <td>${d.bilangan_resit || 0}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;" title="${sebab}">${sebab || '-'}</td>
        <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;" title="${d.nota || ''}">${d.nota || '-'}</td>
        <td>
          <button onclick="editSale('${d.id}')" class="btn-edit">Edit</button>
          <button onclick="deleteSale('${d.id}')" class="btn-delete">Padam</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRekodMarketing() {
  const tbody = document.getElementById('rekodMarketingBody');
  if (!tbody) return;
  const showActions = currentProfile?.role === 'admin';

  if (marketingData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state empty-state-text">Tiada data marketing</div></td></tr>';
    return;
  }

  tbody.innerHTML = marketingData.map(d => {
    const tarikh = d.is_bulk ? `${formatDate(d.tarikh_mula)}→${formatDate(d.tarikh_akhir)}` : formatDate(d.tarikh_mula);
    return `
      <tr>
        <td style="white-space:nowrap;">${tarikh}</td>
        <td><span class="badge badge-blue">${d.platform || '-'}</span></td>
        <td><span class="badge badge-gold">${d.objektif || '-'}</span></td>
        <td>${d.nama_post || '-'}</td>
        <td>${formatRM(d.ad_spend)}</td>
        <td>${formatRM(d.spend_sst)}</td>
        <td>${formatNumber(d.reach)}</td>
        <td>${d.ctr ? d.ctr + '%' : '-'}</td>
        <td>${formatNumber(d.message_leads)}</td>
        <td>${formatRM(d.cpl)}</td>
        <td>${d.nota || '-'}</td>
        <td>
          ${showActions ? `
            <button onclick="editMarketing('${d.id}')" class="btn-edit">Edit</button>
            <button onclick="deleteMarketing('${d.id}')" class="btn-delete">Padam</button>
          ` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

// ===== CHART TAB =====
function setChartTab(tab) {
  currentChartTab = tab;
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  renderCharts();
}

function setGroupBy(group) {
  currentGroupBy = group;
  document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  renderCharts();
}

// ===== TABLE TAB =====
function setTableTab(tab) {
  currentTableTab = tab;
  document.querySelectorAll('.table-tab').forEach(t => t.classList.remove('active'));
  event?.target?.classList.add('active');
  document.getElementById('tableSaleSection').classList.toggle('hidden', tab !== 'sale');
  document.getElementById('tableMarketingSection').classList.toggle('hidden', tab !== 'marketing');
}

// ===== FAB =====
function toggleFAB() {
  fabOpen = !fabOpen;
  document.getElementById('fabMenu')?.classList.toggle('open', fabOpen);
  document.getElementById('fabMain')?.classList.toggle('open', fabOpen);
}

function closeFAB() {
  fabOpen = false;
  document.getElementById('fabMenu')?.classList.remove('open');
  document.getElementById('fabMain')?.classList.remove('open');
}

// Mobile FAB — floating centered modal (sama style dengan modal lain)
function openFabMenu() {
  const isAdmin = currentProfile?.role === 'admin';
  const options = [
    { label: '💰 Tambah Data Sale', sub: 'Rekod jualan harian', fn: 'openSaleModal()' },
    ...(isAdmin ? [{ label: '📣 Tambah Data Marketing', sub: 'Rekod data iklan', fn: 'openMarketingModal()' }] : []),
    ...(isAdmin ? [{ label: '💳 Topup Bajet Iklan', sub: 'Tambah bajet baru', fn: 'openTopupModal()' }] : []),
  ];

  // Remove existing if any
  const existing = document.getElementById('fabActionModal');
  if (existing) document.body.removeChild(existing);

  const overlay = document.createElement('div');
  overlay.id = 'fabActionModal';
  overlay.className = 'modal-overlay open';
  overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.style.maxWidth = '420px';
  sheet.onclick = (e) => e.stopPropagation();

  sheet.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">Tambah Data</span>
      <button class="modal-close" onclick="document.body.removeChild(document.getElementById('fabActionModal'))">×</button>
    </div>
    <div style="padding:0 24px 32px;display:flex;flex-direction:column;gap:10px;">
      ${options.map(opt => `
        <button
          onclick="document.body.removeChild(document.getElementById('fabActionModal')); ${opt.fn}"
          style="width:100%;padding:16px 18px;border:1px solid var(--border-strong);background:var(--bg);border-radius:14px;color:var(--text-primary);font-family:inherit;cursor:pointer;text-align:left;transition:all 0.15s;display:flex;align-items:center;gap:14px;"
          onmouseover="this.style.borderColor='var(--primary)';this.style.background='var(--primary-light)'"
          onmouseout="this.style.borderColor='var(--border-strong)';this.style.background='var(--bg)'"
        >
          <div style="font-size:24px;flex-shrink:0;">${opt.label.split(' ')[0]}</div>
          <div>
            <div style="font-size:15px;font-weight:700;margin-bottom:2px;">${opt.label.substring(opt.label.indexOf(' ')+1)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${opt.sub}</div>
          </div>
        </button>
      `).join('')}
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

// ===== SETTINGS =====
function loadSettingsDisplay() {
  document.getElementById('settingNama').textContent = currentClient?.nama_bisnes || '-';
  document.getElementById('settingPakej').textContent = currentClient?.pakej || '-';
  document.getElementById('settingTargetLead').textContent = formatNumber(tetapan?.target_lead || 0) + ' lead';
  document.getElementById('settingTargetSale').textContent = formatRM(tetapan?.target_sale || 0);

  const savedTheme = localStorage.getItem('trackpo_theme') || 'dark';
  document.getElementById('themeToggle').checked = savedTheme === 'dark';
}

function toggleTheme(isDark) {
  applyTheme(isDark ? 'dark' : 'light');
}

// ===== CHANGE PASSWORD =====
function openChangePassword() {
  document.getElementById('modalPassword').classList.add('open');
}

async function changePassword() {
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;

  if (!newPass || newPass.length < 8) {
    showToast('Password mesti sekurang-kurangnya 8 aksara', 'error');
    return;
  }

  if (newPass !== confirmPass) {
    showToast('Password tidak sepadan', 'error');
    return;
  }

  showLoading();
  const { error } = await sbClient.auth.updateUser({ password: newPass });
  hideLoading();

  if (error) {
    showToast('Gagal tukar password: ' + error.message, 'error');
    return;
  }

  document.getElementById('modalPassword').classList.remove('open');
  showToast('Password berjaya ditukar!', 'success');
}

// ===== NOTIF =====
function toggleNotif() {
  // Simple - akan expand kalau ada notification system
  showToast('Tiada notifikasi baru', 'info');
}

// ===== RINGKASAN MINGGUAN =====
function loadWeeklyDefault() {
  const now = nowMY();
  // Minggu semasa: Isnin hingga hari ini
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  document.getElementById('weekStart').value = toInputDate(monday);
  document.getElementById('weekEnd').value = toInputDate(now);
  loadWeekly();
}

async function loadWeekly() {
  const start = document.getElementById('weekStart').value;
  const end = document.getElementById('weekEnd').value;
  if (!start || !end) return;

  showLoading();

  // Current week data
  const { data: currSale } = await sbClient
    .from('data_sale')
    .select('*')
    .eq('client_id', currentClient.id)
    .gte('tarikh', start)
    .lte('tarikh', end);

  const { data: currMarketing } = await sbClient
    .from('data_marketing')
    .select('*')
    .eq('client_id', currentClient.id)
    .gte('tarikh_mula', start)
    .lte('tarikh_mula', end);

  // Previous week (same duration)
  const startDate = new Date(start);
  const endDate = new Date(end);
  const duration = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  const prevStart = toInputDate(new Date(startDate.setDate(startDate.getDate() - duration)));
  const prevEnd = toInputDate(new Date(endDate.setDate(endDate.getDate() - duration)));

  const { data: prevSale } = await sbClient
    .from('data_sale')
    .select('*')
    .eq('client_id', currentClient.id)
    .gte('tarikh', prevStart)
    .lte('tarikh', prevEnd);

  const { data: prevMarketing } = await sbClient
    .from('data_marketing')
    .select('*')
    .eq('client_id', currentClient.id)
    .gte('tarikh_mula', prevStart)
    .lte('tarikh_mula', prevEnd);

  hideLoading();

  // Calculate
  const curr = {
    lead: (currSale || []).reduce((s, d) => s + (d.lead_close || 0), 0),
    spend: (currMarketing || []).reduce((s, d) => s + (d.spend_sst || 0), 0),
    sale: (currSale || []).reduce((s, d) => s + (d.total_sale || 0), 0)
  };
  curr.cpl = calculateCPL(currMarketing || []);

  const prev = {
    lead: (prevSale || []).reduce((s, d) => s + (d.lead_close || 0), 0),
    spend: (prevMarketing || []).reduce((s, d) => s + (d.spend_sst || 0), 0),
    sale: (prevSale || []).reduce((s, d) => s + (d.total_sale || 0), 0)
  };
  prev.cpl = calculateCPL(prevMarketing || []);

  // Update UI
  document.getElementById('wLead').textContent = formatNumber(curr.lead);
  document.getElementById('wSpend').textContent = formatRM(curr.spend);
  document.getElementById('wCPL').textContent = formatRM(curr.cpl);
  document.getElementById('wSale').textContent = formatRM(curr.sale);

  const leadChg = formatChange(percentChange(curr.lead, prev.lead));
  const spendChg = formatChange(percentChange(curr.spend, prev.spend), true);
  const cplChg = formatChange(percentChange(curr.cpl, prev.cpl), true);
  const saleChg = formatChange(percentChange(curr.sale, prev.sale));

  document.getElementById('wLeadChange').innerHTML = `<span class="${leadChg.class}">${leadChg.text} vs minggu lepas</span>`;
  document.getElementById('wSpendChange').innerHTML = `<span class="${spendChg.class}">${spendChg.text} vs minggu lepas</span>`;
  document.getElementById('wCPLChange').innerHTML = `<span class="${cplChg.class}">${cplChg.text} vs minggu lepas</span>`;
  document.getElementById('wSaleChange').innerHTML = `<span class="${saleChg.class}">${saleChg.text} vs minggu lepas</span>`;

  // Store for WA share
  window._weeklyData = {
    nama: currentClient.nama_bisnes,
    periodeLabel: `${formatDate(start)} – ${formatDate(end)}`,
    spend: curr.spend, lead: curr.lead, cpl: curr.cpl, sale: curr.sale,
    leadChange: percentChange(curr.lead, prev.lead),
    cplChange: percentChange(curr.cpl, prev.cpl),
    saleChange: percentChange(curr.sale, prev.sale)
  };
}

function resetWeekly() {
  loadWeeklyDefault();
}

function shareWA() {
  if (!window._weeklyData) { showToast('Muat data dahulu', 'warning'); return; }
  const text = generateWAText(window._weeklyData);
  navigator.clipboard.writeText(text).then(() => {
    showToast('Teks disalin! Tampal ke WhatsApp.', 'success');
  }).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Teks disalin! Tampal ke WhatsApp.', 'success');
  });
}

// ===== COMPARISON =====
function setCompShortcut(type) {
  const now = nowMY();
  if (type === 'bulan-ini') {
    const { start: aStart, end: aEnd } = getDateRange('bulan-ini');
    const { start: bStart, end: bEnd } = getDateRange('bulan-lepas');
    document.getElementById('compAStart').value = aStart;
    document.getElementById('compAEnd').value = aEnd;
    document.getElementById('compBStart').value = bStart;
    document.getElementById('compBEnd').value = bEnd;
  } else if (type === '7hari') {
    const end = toInputDate(now);
    const start = toInputDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    const prevEnd = toInputDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    const prevStart = toInputDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13));
    document.getElementById('compAStart').value = start;
    document.getElementById('compAEnd').value = end;
    document.getElementById('compBStart').value = prevStart;
    document.getElementById('compBEnd').value = prevEnd;
  }
}

async function loadComparison() {
  const aStart = document.getElementById('compAStart').value;
  const aEnd = document.getElementById('compAEnd').value;
  const bStart = document.getElementById('compBStart').value;
  const bEnd = document.getElementById('compBEnd').value;

  if (!aStart || !aEnd || !bStart || !bEnd) {
    showToast('Sila isi semua tarikh', 'warning');
    return;
  }

  showLoading();

  const [aSale, aMarketing, bSale, bMarketing] = await Promise.all([
    sbClient.from('data_sale').select('*').eq('client_id', currentClient.id).gte('tarikh', aStart).lte('tarikh', aEnd),
    sbClient.from('data_marketing').select('*').eq('client_id', currentClient.id).gte('tarikh_mula', aStart).lte('tarikh_mula', aEnd),
    sbClient.from('data_sale').select('*').eq('client_id', currentClient.id).gte('tarikh', bStart).lte('tarikh', bEnd),
    sbClient.from('data_marketing').select('*').eq('client_id', currentClient.id).gte('tarikh_mula', bStart).lte('tarikh_mula', bEnd)
  ]);

  hideLoading();

  const calcPeriod = (sale, mkt) => {
    const s = sale.data || [];
    const m = mkt.data || [];
    const totalSale = s.reduce((sum, d) => sum + (d.total_sale || 0), 0);
    const totalLead = s.reduce((sum, d) => sum + (d.lead_close || 0), 0);
    const totalLeadMasuk = s.reduce((sum, d) => sum + (d.lead_masuk || 0), 0);
    const totalSpend = m.reduce((sum, d) => sum + (d.spend_sst || 0), 0);
    const cpl = calculateCPL(m);
    const closing = totalLeadMasuk > 0 ? (totalLead / totalLeadMasuk) * 100 : 0;
    const roas = totalSpend > 0 ? totalSale / totalSpend : 0;
    return { totalSale, totalLead, totalSpend, cpl, closing, roas };
  };

  const a = calcPeriod(aSale, aMarketing);
  const b = calcPeriod(bSale, bMarketing);

  const kpis = [
    { label: 'Total Sale', aVal: formatRM(a.totalSale), bVal: formatRM(b.totalSale), pct: percentChange(a.totalSale, b.totalSale) },
    { label: 'Lead Real', aVal: formatNumber(a.totalLead), bVal: formatNumber(b.totalLead), pct: percentChange(a.totalLead, b.totalLead) },
    { label: 'Spend+SST', aVal: formatRM(a.totalSpend), bVal: formatRM(b.totalSpend), pct: percentChange(a.totalSpend, b.totalSpend), lowerBetter: true },
    { label: 'CPL Real', aVal: formatRM(a.cpl), bVal: formatRM(b.cpl), pct: percentChange(a.cpl, b.cpl), lowerBetter: true },
    { label: 'Closing Rate', aVal: formatPercent(a.closing), bVal: formatPercent(b.closing), pct: percentChange(a.closing, b.closing) },
    { label: 'ROAS', aVal: a.roas.toFixed(2) + 'x', bVal: b.roas.toFixed(2) + 'x', pct: percentChange(a.roas, b.roas) }
  ];

  const grid = document.getElementById('comparisonGrid');
  grid.innerHTML = kpis.map(k => {
    const chg = formatChange(k.pct, k.lowerBetter);
    return `
      <div class="comparison-kpi">
        <div class="comparison-label">${k.label}</div>
        <div class="comparison-values">
          <div class="comparison-a">${k.aVal}</div>
          <div class="comparison-b">vs ${k.bVal}</div>
        </div>
        <div class="comparison-change ${chg.class}">${chg.text}</div>
      </div>
    `;
  }).join('');

  document.getElementById('comparisonResult').classList.remove('hidden');
}

// ===== POST LIST — Custom Dropdown =====
let postListData = []; // { nama_post, link_post, count }

async function loadPostList() {
  // Fetch post_list dengan link_post
  const { data: posts } = await sbClient
    .from('post_list')
    .select('nama_post, link_post')
    .eq('client_id', currentClient.id)
    .order('nama_post');

  // Fetch usage count dari data_marketing
  const { data: mktData } = await sbClient
    .from('data_marketing')
    .select('nama_post')
    .eq('client_id', currentClient.id)
    .not('nama_post', 'is', null);

  // Build count map
  const countMap = {};
  (mktData || []).forEach(d => {
    if (d.nama_post) countMap[d.nama_post] = (countMap[d.nama_post] || 0) + 1;
  });

  // Merge
  postListData = (posts || []).map(p => ({
    nama_post: p.nama_post,
    link_post: p.link_post || '',
    count: countMap[p.nama_post] || 0
  })).sort((a, b) => b.count - a.count); // sort by most used
}

function showPostDropdown() {
  renderPostDropdown(document.getElementById('marketingNamaPost').value);
}

function hidePostDropdown() {
  const dd = document.getElementById('postDropdown');
  if (dd) dd.classList.add('hidden');
}

function filterPostDropdown(val) {
  renderPostDropdown(val);
}

function renderPostDropdown(filterVal) {
  const dd = document.getElementById('postDropdown');
  if (!dd) return;

  const filtered = postListData.filter(p =>
    !filterVal || p.nama_post.toLowerCase().includes(filterVal.toLowerCase())
  );

  if (filtered.length === 0) {
    dd.classList.add('hidden');
    return;
  }

  dd.innerHTML = filtered.map(p => `
    <div class="post-dropdown-item" onmousedown="selectPost('${p.nama_post.replace(/'/g, "\'")}', '${(p.link_post || '').replace(/'/g, "\'")}')">
      <span class="post-dropdown-name">${p.nama_post}</span>
      ${p.count > 0 ? `<span class="post-dropdown-count">×${p.count}</span>` : ''}
    </div>
  `).join('');

  dd.classList.remove('hidden');
}

function selectPost(namaPost, linkPost) {
  const namaEl = document.getElementById('marketingNamaPost');
  const linkEl = document.getElementById('marketingLinkPost');
  if (namaEl) namaEl.value = namaPost;
  if (linkEl && linkPost) linkEl.value = linkPost;
  hidePostDropdown();
}

function applyFokusServisDisplay() {
  const fokus = currentClient?.fokus_servis || 'lead_generation';
  const isLeadFocus = fokus === 'lead_generation';

  ['kpiCardSale', 'kpiCardClosing', 'kpiCardROAS'].forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    card.style.opacity = isLeadFocus ? '0.55' : '1';
    card.style.order = isLeadFocus ? '99' : '0';
  });
}