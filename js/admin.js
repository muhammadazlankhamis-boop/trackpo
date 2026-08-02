// ===== TRACKPO — ADMIN JS =====

let adminProfile = null;
let allClients = [];
let logPage = 1;
const LOG_PER_PAGE = 30;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  showLoading();

  // PAKSA stop loading selepas 10 saat — no matter what
  const forceStop = setTimeout(() => {
    hideLoading();
    const grid = document.getElementById('clientGrid');
    if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Sambungan lambat. Sila refresh halaman.</div></div>';
  }, 10000);

  try {
    // Step 1: Check session
    const { data: sessionData, error: sessionError } = await sbClient.auth.getSession();

    if (sessionError || !sessionData.session) {
      window.location.href = 'login.html';
      return;
    }

    const userId = sessionData.session.user.id;

    // Step 2: Get profile
    const { data: profile, error: profileError } = await sbClient
      .from('profiles')
      .select('id, role, nama, client_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      window.location.href = 'login.html';
      return;
    }

    if (profile.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }

    adminProfile = profile;

    // Step 3: Update UI
    const nameEl = document.getElementById('adminName');
    const avatarEl = document.getElementById('adminAvatar');
    if (nameEl) nameEl.textContent = profile.nama || 'Admin';
    if (avatarEl) avatarEl.textContent = (profile.nama || 'A')[0].toUpperCase();

    // Update greeting sub in header
    const hour = new Date().getHours();
    const greetWord = hour < 12 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Tengah Hari' : hour < 19 ? 'Selamat Petang' : 'Selamat Malam';
    const greetEmoji = hour < 12 ? '🌤️' : hour < 15 ? '☀️' : hour < 19 ? '🌤️' : '🌙';
    const greetSubEl = document.querySelector('.greeting-sub');
    if (greetSubEl) greetSubEl.textContent = `${greetWord}, ${profile.nama || 'Admin'} ${greetEmoji}`;

    const savedTheme = localStorage.getItem('trackpo_theme') || 'light';
    const toggle = document.getElementById('adminThemeToggle');
    if (toggle) toggle.checked = savedTheme === 'dark';

    // Step 4: Load dashboard
    await loadAdminDashboard();

  } catch (err) {
    console.error('Admin init error:', err);
    const grid = document.getElementById('clientGrid');
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Ralat: ${err.message || 'Unknown error'}</div></div>`;
  } finally {
    clearTimeout(forceStop);
    hideLoading();
  }
});

// ===== SECTION NAVIGATION =====
function showAdminSection(section) {
  const sections = ['dashboard', 'clients', 'users', 'log', 'settings'];
  sections.forEach(s => {
    const el = document.getElementById(`adminSection${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (el) el.classList.toggle('hidden', s !== section);
  });

  document.querySelectorAll('.sidebar-nav li a, .nav-item').forEach(a => a.classList.remove('active'));
  event?.target?.closest('a, .nav-item')?.classList.add('active');

  if (section === 'clients') loadClientsTable();
  if (section === 'users') loadUsersTable();
  if (section === 'log') loadActivityLog();
  if (section === 'settings') { loadObjektifList(); loadPakejList(); }
}

// ===== DASHBOARD =====
async function loadAdminDashboard() {
  const grid = document.getElementById('clientGrid');

  try {
    const { data: clients, error } = await sbClient
      .from('clients')
      .select('*, tetapan_client(*)')
      .order('nama_bisnes');

    if (error) throw error;

    allClients = clients || [];

    const aktif = allClients.filter(c => c.status === 'Aktif').length;
    const statTotal = document.getElementById('statTotalClient');
    const statAlerts = document.getElementById('statAlerts');
    const statStale = document.getElementById('statStale');
    if (statTotal) statTotal.textContent = aktif;
    if (statAlerts) statAlerts.textContent = 0;
    if (statStale) statStale.textContent = 0;

    if (allClients.length === 0) {
      if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Tiada client lagi. Klik "+ Tambah Client" untuk mula.</div></div>';
      return;
    }

    // Render client cards dulu tanpa extra data
    renderClientCards(allClients, {}, {}, {});

    // Load extra data (bajet, last update) — non-blocking
    const clientIds = allClients.map(c => c.id);
    loadClientExtraData(clientIds);

  } catch (err) {
    console.error('loadAdminDashboard error:', err);
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal load client: ${err.message}</div></div>`;
  }
}

async function loadClientExtraData(clientIds) {
  try {
    const [topupsRes, marketingRes, saleRes] = await Promise.all([
      sbClient.from('bajet').select('client_id, jumlah').in('client_id', clientIds),
      sbClient.from('data_marketing').select('client_id, tarikh_mula, tarikh_akhir, is_bulk, spend_sst, created_at').in('client_id', clientIds).order('tarikh_akhir', { ascending: false }),
      sbClient.from('data_sale').select('client_id, tarikh, created_at').in('client_id', clientIds).order('tarikh', { ascending: false })
    ]);

    const topupMap = {};
    (topupsRes.data || []).forEach(t => {
      topupMap[t.client_id] = (topupMap[t.client_id] || 0) + (t.jumlah || 0);
    });

    const spendMap = {};
    (marketingRes.data || []).forEach(m => {
      spendMap[m.client_id] = (spendMap[m.client_id] || 0) + (m.spend_sst || 0);
    });

    // lastUpdateMap = most recent of BOTH sale tarikh AND marketing tarikh_mula
    const _sSaleMap = {};
    (saleRes.data || []).forEach(d => {
      const t = d.tarikh || d.created_at;
      if (!_sSaleMap[d.client_id] || t > _sSaleMap[d.client_id]) _sSaleMap[d.client_id] = t;
    });

    const _sMktMap = {};
    (marketingRes.data || []).forEach(d => {
      // Guna tarikh_akhir untuk bulk, tarikh_mula untuk harian
      const t = (d.is_bulk ? d.tarikh_akhir : d.tarikh_mula) || d.created_at;
      if (!_sMktMap[d.client_id] || t > _sMktMap[d.client_id]) _sMktMap[d.client_id] = t;
    });

    // Take most recent from either
    const lastUpdateMap = {};
    allClients.forEach(client => {
      const s = _sSaleMap[client.id];
      const m = _sMktMap[client.id];
      if (s && m) lastUpdateMap[client.id] = s > m ? s : m;
      else lastUpdateMap[client.id] = s || m || null;
    });

    // Store globally for stale modal
    window._lastSaleMap = _sSaleMap;
    window._lastMktMap = _sMktMap;
    window._lastUpdateMap = lastUpdateMap;

    // Update stats
    let alertCount = 0;
    let staleCount = 0;

    allClients.forEach(client => {
      // Client stale jika MANA-MANA SATU (sale ATAU marketing) >2 hari atau tiada data
      const lastSaleDate = _sSaleMap[client.id];
      const lastMktDate = _sMktMap[client.id];
      const saleDays = lastSaleDate ? daysSince(lastSaleDate) : null;
      const mktDays = lastMktDate ? daysSince(lastMktDate) : null;

      const saleStale = (saleDays === null || saleDays > 2);
      const mktStale = (mktDays === null || mktDays > 2);

      if (saleStale || mktStale) staleCount++;

      const balance = (topupMap[client.id] || 0) - (spendMap[client.id] || 0);
      const tetapan = client.tetapan_client?.[0] || {};
      const thresholdAmount = tetapan.budget_threshold_pct
        ? ((tetapan.budget_threshold_pct / 100) * (topupMap[client.id] || 0)) : 0;
      if (balance <= thresholdAmount && balance >= 0 && (topupMap[client.id] || 0) > 0) alertCount++;
    });

    const statAlerts = document.getElementById('statAlerts');
    const statStale = document.getElementById('statStale');
    if (statAlerts) statAlerts.textContent = alertCount;
    if (statStale) statStale.textContent = staleCount;

    renderClientCards(allClients, topupMap, spendMap, lastUpdateMap);

  } catch (err) {
    console.error('loadClientExtraData error:', err);
  }
}

function renderClientCards(clients, topupMap, spendMap, lastUpdateMap) {
  const grid = document.getElementById('clientGrid');
  if (!grid) return;

  grid.innerHTML = clients.map(client => {
    const lastUpdate = lastUpdateMap[client.id];
    const daysSinceUpdate = lastUpdate ? daysSince(lastUpdate) : null;
    const isStale = daysSinceUpdate === null || daysSinceUpdate > 2;

    const balance = (topupMap[client.id] || 0) - (spendMap[client.id] || 0);
    const tetapan = client.tetapan_client?.[0] || {};
    const thresholdAmount = tetapan.budget_threshold_pct
      ? ((tetapan.budget_threshold_pct / 100) * (topupMap[client.id] || 0)) : 0;
    const hasAlert = balance <= thresholdAmount && balance >= 0 && (topupMap[client.id] || 0) > 0;

    const healthScore = isStale ? 20 : balance < 0 ? 30 : hasAlert ? 50 : 75;
    const health = getHealthLabel(healthScore);

    // Tunjuk tarikh data sebenar + berapa hari lepas
    const lastSaleTarikh = window._lastSaleMap?.[client.id];
    const lastMktTarikh = window._lastMktMap?.[client.id];
    const lastAnyTarikh = lastUpdate;

    let updateText;
    if (!lastAnyTarikh) {
      updateText = 'Belum ada data';
    } else {
      const dayLabel = daysSinceUpdate === 0 ? 'hari ini' :
        daysSinceUpdate === 1 ? 'semalam' :
        `${daysSinceUpdate} hari lepas`;
      updateText = `${formatDate(lastAnyTarikh)} · ${dayLabel}`;
    }

    const totalTopup = topupMap[client.id] || 0;
    const totalSpend = spendMap[client.id] || 0;
    const usedPct = totalTopup > 0 ? Math.min((totalSpend / totalTopup) * 100, 100) : 0;
    const balanceColor = balance < 0 ? 'var(--red)' : hasAlert ? 'var(--orange)' : 'var(--green)';
    const borderColor = isStale ? 'var(--orange)' : hasAlert ? 'var(--red)' : balance < 0 ? 'var(--red)' : 'var(--primary)';

    return `
      <div class="client-card" style="border-left: 4px solid ${borderColor};">
        <div class="client-card-header">
          <div>
            <div class="client-name">${client.nama_bisnes}</div>
            <div class="client-pakej">${client.pakej || 'Tiada pakej'}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <div class="health-circle ${health.class}">${healthScore}</div>
            <span class="badge ${client.status === 'Aktif' ? 'badge-green' : 'badge-red'}" style="font-size:10px;">${client.status || 'Aktif'}</span>
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12px;color:var(--text-secondary);">Balance Bajet</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:15px;font-weight:800;color:${balanceColor};">${balance < 0 ? '-' : ''}${formatRM(Math.abs(balance))}</span>
              <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${balance < 0 ? 'var(--red-light)' : balance < 100 ? 'var(--orange-light)' : 'var(--green-light)'};color:${balance < 0 ? 'var(--red)' : balance < 100 ? 'var(--orange)' : 'var(--green)'};">${balance < 0 ? 'Topup!' : balance < 100 ? 'Perlu Topup' : 'OK'}</span>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);">
          <span class="last-update-badge ${isStale ? 'stale' : 'fresh'}">
            🕐 ${updateText}
            ${hasAlert ? '<span class="badge badge-yellow" style="margin-left:6px;font-size:10px;">⚠️ Alert</span>' : ''}
          </span>
          <div style="display:flex;gap:8px;">
            <button onclick="openClientDashboard('${client.id}')" class="btn-action-primary">
              Buka
            </button>
            <button onclick="openClientSettingsModal('${client.id}')" class="btn-action-ghost">⚙️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


async function openStaleModal() {
  const modal = document.getElementById('modalStaleClients');
  const listEl = document.getElementById('staleClientsList');
  if (!modal || !listEl) return;

  modal.classList.add('open');
  listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">Memuatkan...</div></div>';

  try {
    const clientIds = allClients.map(c => c.id);
    if (clientIds.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Tiada client lagi</div></div>';
      return;
    }

    // Fetch last sale tarikh and marketing tarikh_mula per client
    const [saleRes, mktRes] = await Promise.all([
      sbClient.from('data_sale').select('client_id, tarikh').in('client_id', clientIds).order('tarikh', { ascending: false }),
      sbClient.from('data_marketing').select('client_id, tarikh_mula, tarikh_akhir, is_bulk').in('client_id', clientIds).order('tarikh_akhir', { ascending: false })
    ]);

    // Build last tarikh maps — guna tarikh_akhir untuk bulk
    const lastSaleMap = {};
    (saleRes.data || []).forEach(d => {
      if (!lastSaleMap[d.client_id]) lastSaleMap[d.client_id] = d.tarikh;
    });

    const lastMktMap = {};
    (mktRes.data || []).forEach(d => {
      const t = d.is_bulk ? d.tarikh_akhir : d.tarikh_mula;
      if (!lastMktMap[d.client_id]) lastMktMap[d.client_id] = t;
    });

    // Client stale jika MANA-MANA SATU >2 hari atau tiada data
    const staleClients = allClients.filter(client => {
      const saleDays = lastSaleMap[client.id] ? daysSince(lastSaleMap[client.id]) : null;
      const mktDays = lastMktMap[client.id] ? daysSince(lastMktMap[client.id]) : null;
      return (saleDays === null || saleDays > 2) || (mktDays === null || mktDays > 2);
    });

    if (staleClients.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">Semua client dah update data terkini!</div></div>';
      return;
    }

    listEl.innerHTML = staleClients.map(client => {
      const lastSale = lastSaleMap[client.id];
      const lastMkt = lastMktMap[client.id];
      const saleDays = lastSale ? daysSince(lastSale) : null;
      const mktDays = lastMkt ? daysSince(lastMkt) : null;

      // Stale = >2 hari atau tiada data
      const saleStale = (saleDays === null || saleDays > 2);
      const mktStale = (mktDays === null || mktDays > 2);

      function dayLabel(days) {
        if (days === null) return 'Tiada rekod';
        if (days === 0) return 'hari ini';
        if (days === 1) return 'semalam';
        return `${days} hari lepas`;
      }

      const saleDisplay = lastSale
        ? `${formatDate(lastSale)} · ${dayLabel(saleDays)}`
        : 'Tiada rekod';

      const mktDisplay = lastMkt
        ? `${formatDate(lastMkt)} · ${dayLabel(mktDays)}`
        : 'Tiada rekod';

      // Badge — kritikal jika >7 hari atau tiada data langsung
      const maxDays = Math.max(saleDays ?? 999, mktDays ?? 999);
      const badgeClass = maxDays > 7 ? 'badge-red' : 'badge-yellow';
      const badgeLabel = maxDays > 7 ? 'Kritikal' : 'Perlu Update';

      return `
        <div style="padding:16px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="font-weight:700;font-size:15px;">${client.nama_bisnes}</div>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
              <span style="color:var(--text-secondary);font-weight:600;display:flex;align-items:center;gap:6px;">
                💰 Data Sale
              </span>
              <span style="font-weight:500;color:${saleStale ? 'var(--red)' : 'var(--green)'};">
                ${saleDisplay}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
              <span style="color:var(--text-secondary);font-weight:600;display:flex;align-items:center;gap:6px;">
                📣 Data Marketing
              </span>
              <span style="font-weight:500;color:${mktStale ? 'var(--red)' : 'var(--green)'};">
                ${mktDisplay}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-text">Gagal memuatkan: ${err.message}</div></div>`;
  }
}

function openClientDashboard(clientId) {
  window.open(`index.html?client=${clientId}`, '_blank');
}

// ===== MANAGE CLIENTS =====
async function loadClientsTable() {
  showLoading();
  try {
    const { data: clients, error } = await sbClient.from('clients').select('*').order('nama_bisnes');
    if (error) throw error;

    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    if (!clients || clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state empty-state-text">Tiada client</div></td></tr>';
      return;
    }

    // Desktop: table rows
    // Mobile: cards
    const isMobile = window.innerWidth < 769;

    if (isMobile) {
      // Wrap in card container
      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'mobile-card-list';
      cardWrapper.innerHTML = clients.map(c => `
        <div class="mobile-data-card">
          <div class="mobile-data-card-header">
            <div>
              <div class="mobile-data-card-title">${c.nama_bisnes}</div>
              <div class="mobile-data-card-sub">${c.pakej || 'Tiada pakej'}</div>
            </div>
            <span class="badge ${c.status === 'Aktif' ? 'badge-green' : 'badge-red'}">${c.status || 'Aktif'}</span>
          </div>
          <div class="mobile-data-card-body">
            <div class="mobile-data-row"><span>PIC</span><span>${c.nama_pic || '-'}</span></div>
            <div class="mobile-data-row"><span>Email</span><span>${c.email || '-'}</span></div>
            <div class="mobile-data-row"><span>Telefon</span><span>${c.telefon || '-'}</span></div>
            <div class="mobile-data-row"><span>Tarikh Mula</span><span>${formatDate(c.tarikh_mula)}</span></div>
          </div>
          <div class="mobile-data-card-actions">
            <button onclick="editClient('${c.id}')" class="btn-edit">Edit</button>
            <button onclick="deleteClient('${c.id}')" class="btn-delete">Padam</button>
          </div>
        </div>
      `).join('');
      const wrapper = document.querySelector('#adminSectionClients .table-wrapper');
      if (wrapper) { wrapper.style.display = 'none'; }
      const section = document.getElementById('adminSectionClients');
      const existing = section.querySelector('.mobile-card-list');
      if (existing) existing.remove();
      section.appendChild(cardWrapper);
    } else {
      const wrapper = document.querySelector('#adminSectionClients .table-wrapper');
      if (wrapper) wrapper.style.display = '';
      const existing = document.querySelector('#adminSectionClients .mobile-card-list');
      if (existing) existing.remove();
      tbody.innerHTML = clients.map(c => `
        <tr>
          <td>${c.nama_bisnes}</td>
          <td>${c.nama_pic || '-'}</td>
          <td>${c.email || '-'}</td>
          <td>${c.telefon || '-'}</td>
          <td><span class="badge badge-gold">${c.pakej || '-'}</span></td>
          <td>${formatDate(c.tarikh_mula)}</td>
          <td><span class="badge ${c.status === 'Aktif' ? 'badge-green' : 'badge-red'}">${c.status || 'Aktif'}</span></td>
          <td>
            <button onclick="editClient('${c.id}')" class="btn-edit">Edit</button>
            <button onclick="deleteClient('${c.id}')" class="btn-delete">Padam</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Gagal load clients: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function openAddClientModal() {
  loadPakejDropdown();
  document.getElementById('clientEditId').value = '';
  document.getElementById('modalClientTitle').textContent = 'Tambah Client';
  document.getElementById('clientNamaBisnes').value = '';
  document.getElementById('clientNamaPIC').value = '';
  document.getElementById('clientEmail').value = '';
  document.getElementById('clientTelefon').value = '';
  document.getElementById('clientPakej').value = '';
  document.getElementById('clientTarikhMula').value = toInputDate(nowMY());
  document.getElementById('clientStatus').value = 'Aktif';
  document.getElementById('clientTargetLead').value = '';
  document.getElementById('clientTargetSale').value = '';
  document.getElementById('clientBenchmarkCPL').value = '';
  document.getElementById('modalClient').classList.add('open');
}

function closeClientModal() {
  document.getElementById('modalClient').classList.remove('open');
}

async function editClient(id) {
  const client = allClients.find(c => c.id === id);
  if (!client) {
    const { data } = await sbClient.from('clients').select('*, tetapan_client(*)').eq('id', id).single();
    if (!data) return;
    allClients.push(data);
    editClient(id);
    return;
  }

  await loadPakejDropdown();
  document.getElementById('clientEditId').value = client.id;
  document.getElementById('modalClientTitle').textContent = 'Edit Client';
  document.getElementById('clientNamaBisnes').value = client.nama_bisnes || '';
  document.getElementById('clientNamaPIC').value = client.nama_pic || '';
  document.getElementById('clientEmail').value = client.email || '';
  document.getElementById('clientTelefon').value = client.telefon || '';
  document.getElementById('clientPakej').value = client.pakej || '';
  document.getElementById('clientTarikhMula').value = client.tarikh_mula || '';
  document.getElementById('clientStatus').value = client.status || 'Aktif';

  const tetapan = client.tetapan_client?.[0];
  if (tetapan) {
    document.getElementById('clientTargetLead').value = tetapan.target_lead || '';
    document.getElementById('clientTargetSale').value = tetapan.target_sale || '';
    document.getElementById('clientBenchmarkCPL').value = tetapan.benchmark_cpl || '';
  }

  document.getElementById('modalClient').classList.add('open');
}

async function saveClient() {
  const editId = document.getElementById('clientEditId').value;
  const namaBisnes = document.getElementById('clientNamaBisnes').value.trim();
  if (!namaBisnes) { showToast('Sila isi nama bisnes', 'error'); return; }

  showLoading();
  try {
    const payload = {
      nama_bisnes: namaBisnes,
      nama_pic: document.getElementById('clientNamaPIC').value.trim() || null,
      email: document.getElementById('clientEmail').value.trim() || null,
      telefon: document.getElementById('clientTelefon').value.trim() || null,
      pakej: document.getElementById('clientPakej').value || null,
      tarikh_mula: document.getElementById('clientTarikhMula').value || null,
      status: document.getElementById('clientStatus').value || 'Aktif',
      updated_at: new Date().toISOString()
    };

    let clientId = editId;

    if (editId) {
      const { error } = await sbClient.from('clients').update(payload).eq('id', editId);
      if (error) throw error;
    } else {
      const { data, error } = await sbClient.from('clients').insert(payload).select().single();
      if (error) throw error;
      clientId = data.id;
    }

    if (clientId) {
      await sbClient.from('tetapan_client').upsert({
        client_id: clientId,
        target_lead: parseInt(document.getElementById('clientTargetLead').value) || 0,
        target_sale: parseFloat(document.getElementById('clientTargetSale').value) || 0,
        benchmark_cpl: parseFloat(document.getElementById('clientBenchmarkCPL').value) || 0
      }, { onConflict: 'client_id' });
    }

    closeClientModal();
    showToast(editId ? 'Client berjaya dikemaskini!' : 'Client berjaya ditambah!', 'success');
    await loadAdminDashboard();

  } catch (err) {
    showToast('Gagal simpan: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteClient(id) {
  if (!confirmAction('Padam client ini? SEMUA data akan dipadamkan.')) return;
  showLoading();
  try {
    const { error } = await sbClient.from('clients').delete().eq('id', id);
    if (error) throw error;
    showToast('Client berjaya dipadamkan', 'success');
    await loadAdminDashboard();
  } catch (err) {
    showToast('Gagal padam: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ===== MANAGE USERS =====
async function loadUsersTable() {
  showLoading();
  try {
    const { data: users, error } = await sbClient
      .from('profiles')
      .select('*, clients(nama_bisnes)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state empty-state-text">Tiada user</div></td></tr>';
      return;
    }

    const isMobileU = window.innerWidth < 769;
    if (isMobileU) {
      const wrapper = document.querySelector('#adminSectionUsers .table-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      const section = document.getElementById('adminSectionUsers');
      const existing = section.querySelector('.mobile-card-list');
      if (existing) existing.remove();
      const cardDiv = document.createElement('div');
      cardDiv.className = 'mobile-card-list';
      cardDiv.innerHTML = users.map(u => `
        <div class="mobile-data-card">
          <div class="mobile-data-card-header">
            <div>
              <div class="mobile-data-card-title">${u.nama || '-'}</div>
              <div class="mobile-data-card-sub">${u.email || '-'}</div>
            </div>
            <span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}">${u.role}</span>
          </div>
          <div class="mobile-data-card-body">
            <div class="mobile-data-row"><span>Client</span><span>${u.clients?.nama_bisnes || '-'}</span></div>
            <div class="mobile-data-row"><span>Last Login</span><span>${u.last_login ? formatDate(u.last_login) : 'Belum pernah'}</span></div>
          </div>
          <div class="mobile-data-card-actions">
            <button onclick="deleteUser('${u.id}', '${u.email}')" class="btn-delete">Padam Akaun</button>
          </div>
        </div>
      `).join('');
      section.appendChild(cardDiv);
    } else {
      const wrapper = document.querySelector('#adminSectionUsers .table-wrapper');
      if (wrapper) wrapper.style.display = '';
      const existing = document.querySelector('#adminSectionUsers .mobile-card-list');
      if (existing) existing.remove();
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${u.nama || '-'}</td>
          <td>${u.email || '-'}</td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}">${u.role}</span></td>
          <td>${u.clients?.nama_bisnes || '-'}</td>
          <td>${u.last_login ? formatDate(u.last_login) : 'Belum pernah'}</td>
          <td><button onclick="deleteUser('${u.id}', '${u.email}')" class="btn-delete">Padam</button></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Gagal load users: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

function openAddUserModal() {
  const select = document.getElementById('userClientId');
  if (select) {
    select.innerHTML = '<option value="">Pilih Client</option>' +
      allClients.map(c => `<option value="${c.id}">${c.nama_bisnes}</option>`).join('');
  }
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userNama').value = '';
  document.getElementById('modalUser').classList.add('open');
}

function closeUserModal() {
  document.getElementById('modalUser').classList.remove('open');
}

async function saveUser() {
  const clientId = document.getElementById('userClientId').value;
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const nama = document.getElementById('userNama').value.trim();

  if (!clientId) { showToast('Sila pilih client', 'error'); return; }
  if (!username) { showToast('Sila isi username', 'error'); return; }
  if (!password || password.length < 8) { showToast('Password mesti sekurang-kurangnya 8 aksara', 'error'); return; }

  showLoading();
  try {
    const email = `${username}@trackpo.app`;

    // Guna RPC function — create_client_user (SECURITY DEFINER)
    const { data, error } = await sbClient.rpc('create_client_user', {
      p_email: email,
      p_password: password,
      p_client_id: clientId,
      p_nama: nama || username
    });

    if (error) throw error;
    if (data && !data.success) throw new Error(data.error || 'Gagal buat akaun');

    closeUserModal();
    showToast(`✅ Akaun berjaya dibuat! Username: ${username} | Password: ${password}`, 'success', 6000);
    loadUsersTable();
  } catch (err) {
    showToast('Gagal buat akaun: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteUser(userId, email) {
  if (!confirmAction(`Padam akaun "${email}"?`)) return;
  showLoading();
  try {
    await sbClient.from('profiles').delete().eq('id', userId);
    showToast('Akaun berjaya dipadamkan', 'success');
    loadUsersTable();
  } catch (err) {
    showToast('Gagal padam: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ===== ACTIVITY LOG =====
async function loadActivityLog() {
  showLoading();
  try {
    const clientFilter = document.getElementById('logClientFilter')?.value;

    const select = document.getElementById('logClientFilter');
    if (select && select.options.length <= 1) {
      select.innerHTML = '<option value="">Semua Client</option>' +
        allClients.map(c => `<option value="${c.id}">${c.nama_bisnes}</option>`).join('');
    }

    let query = sbClient
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, LOG_PER_PAGE - 1);

    if (clientFilter) query = query.eq('client_id', clientFilter);

    const { data: logs, error } = await query;
    if (error) throw error;

    // Ambil nama profile dan client secara berasingan
    const userIds = [...new Set((logs || []).map(l => l.user_id).filter(Boolean))];
    const clientIds = [...new Set((logs || []).map(l => l.client_id).filter(Boolean))];

    const profileMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await sbClient.from('profiles').select('id, nama').in('id', userIds);
      (profiles || []).forEach(p => { profileMap[p.id] = p.nama; });
    }

    const clientMap = {};
    if (clientIds.length > 0) {
      const { data: clients } = await sbClient.from('clients').select('id, nama_bisnes').in('id', clientIds);
      (clients || []).forEach(c => { clientMap[c.id] = c.nama_bisnes; });
    }

    const tbody = document.getElementById('logTableBody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state empty-state-text">Tiada log aktiviti</div></td></tr>';
      return;
    }

    const badgeMap = {
      'ADD_SALE': 'badge-green', 'ADD_MARKETING': 'badge-green',
      'EDIT_SALE': 'badge-yellow', 'EDIT_MARKETING': 'badge-yellow',
      'DELETE_SALE': 'badge-red', 'DELETE_MARKETING': 'badge-red',
      'TOPUP_BAJET': 'badge-blue', 'LOGIN': 'badge-gold'
    };

    const isMobileL = window.innerWidth < 769;
    if (isMobileL) {
      const wrapper = document.querySelector('#adminSectionLog .table-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      const section = document.getElementById('adminSectionLog');
      const existing = section.querySelector('.mobile-card-list');
      if (existing) existing.remove();
      const cardDiv = document.createElement('div');
      cardDiv.className = 'mobile-card-list';
      cardDiv.innerHTML = logs.map(l => {
        const masaStr = new Date(l.created_at).toLocaleString('ms-MY', { timeZone: TZ });
        const badgeClass = badgeMap[l.action_type] || 'badge-blue';
        return `
          <div class="mobile-data-card">
            <div class="mobile-data-card-header">
              <div>
                <div class="mobile-data-card-title">${profileMap[l.user_id] || '-'}</div>
                <div class="mobile-data-card-sub">${masaStr}</div>
              </div>
              <span class="badge ${badgeClass}" style="font-size:10px;">${l.action_type?.replace('_', ' ')}</span>
            </div>
            <div class="mobile-data-card-body">
              <div class="mobile-data-row"><span>Client</span><span>${clientMap[l.client_id] || '-'}</span></div>
              <div class="mobile-data-row"><span>Detail</span><span style="text-align:right;max-width:180px;overflow:hidden;text-overflow:ellipsis;">${l.description || '-'}</span></div>
            </div>
          </div>
        `;
      }).join('');
      section.appendChild(cardDiv);
    } else {
      const wrapper = document.querySelector('#adminSectionLog .table-wrapper');
      if (wrapper) wrapper.style.display = '';
      const existing = document.querySelector('#adminSectionLog .mobile-card-list');
      if (existing) existing.remove();
      tbody.innerHTML = logs.map(l => {
        const masaStr = new Date(l.created_at).toLocaleString('ms-MY', { timeZone: TZ });
        const badgeClass = badgeMap[l.action_type] || 'badge-blue';
        return `
          <tr>
            <td style="font-size:12px;white-space:nowrap;">${masaStr}</td>
            <td>${profileMap[l.user_id] || '-'}</td>
            <td>${clientMap[l.client_id] || '-'}</td>
            <td><span class="badge ${badgeClass}" style="font-size:10px;">${l.action_type}</span></td>
            <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${l.description || '-'}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    showToast('Gagal load log: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ===== CLIENT SETTINGS =====
async function openClientSettingsModal(clientId) {
  try {
    const { data: tetapan } = await sbClient.from('tetapan_client').select('*').eq('client_id', clientId).maybeSingle();
    document.getElementById('csClientId').value = clientId;
    document.getElementById('csTetapanId').value = tetapan?.id || '';
    document.getElementById('csBudgetAlert').checked = tetapan?.budget_alert_aktif ?? true;
    document.getElementById('csBudgetThreshold').value = tetapan?.budget_threshold_pct || 20;
    document.getElementById('csLeadAlert').checked = tetapan?.lead_alert_aktif ?? true;
    document.getElementById('modalClientSettings').classList.add('open');
  } catch (err) {
    showToast('Gagal buka settings: ' + err.message, 'error');
  }
}

function closeClientSettingsModal() {
  document.getElementById('modalClientSettings').classList.remove('open');
}

async function saveClientSettings() {
  const clientId = document.getElementById('csClientId').value;
  showLoading();
  try {
    await sbClient.from('tetapan_client').upsert({
      client_id: clientId,
      budget_alert_aktif: document.getElementById('csBudgetAlert').checked,
      budget_threshold_pct: parseInt(document.getElementById('csBudgetThreshold').value) || 20,
      lead_alert_aktif: document.getElementById('csLeadAlert').checked
    }, { onConflict: 'client_id' });

    closeClientSettingsModal();
    showToast('Settings berjaya disimpan!', 'success');
  } catch (err) {
    showToast('Gagal simpan: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ===== OBJEKTIF =====
async function loadObjektifList() {
  try {
    const { data: list } = await sbClient.from('objektif_list').select('*').order('nama');
    const el = document.getElementById('objektifList');
    if (!el) return;

    if (!list || list.length === 0) {
      el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Tiada objektif</div>';
      return;
    }

    el.innerHTML = list.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);">
        <span>${o.nama}</span>
        ${!o.is_default
          ? `<button class="action-btn delete" onclick="deleteObjektif('${o.id}')">🗑️</button>`
          : '<span style="font-size:12px;color:var(--text-secondary);">Default</span>'}
      </div>
    `).join('');
  } catch (err) {
    console.error('loadObjektifList error:', err);
  }
}

async function addObjektif() {
  const nama = document.getElementById('newObjektif').value.trim().toUpperCase();
  if (!nama) { showToast('Sila isi nama objektif', 'error'); return; }
  try {
    await sbClient.from('objektif_list').insert({ nama, is_default: false });
    document.getElementById('newObjektif').value = '';
    showToast('Objektif ditambah!', 'success');
    loadObjektifList();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function deleteObjektif(id) {
  if (!confirmAction('Padam objektif ini?')) return;
  await sbClient.from('objektif_list').delete().eq('id', id);
  showToast('Dipadam', 'success');
  loadObjektifList();
}

// ===== PAKEJ =====
async function loadPakejList() {
  try {
    const { data: list } = await sbClient.from('pakej_list').select('*').order('nama');
    const el = document.getElementById('pakejList');
    if (!el) return;

    if (!list || list.length === 0) {
      el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Tiada pakej</div>';
      return;
    }

    el.innerHTML = list.map(p => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
        <span>${p.nama}</span>
        <button class="action-btn delete" onclick="deletePakej('${p.id}')">🗑️</button>
      </div>
    `).join('');
  } catch (err) {
    console.error('loadPakejList error:', err);
  }
}

async function addPakej() {
  const nama = document.getElementById('newPakej').value.trim();
  if (!nama) { showToast('Sila isi nama pakej', 'error'); return; }
  try {
    await sbClient.from('pakej_list').insert({ nama, is_default: false });
    document.getElementById('newPakej').value = '';
    showToast('Pakej ditambah!', 'success');
    loadPakejList();
    loadPakejDropdown();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function deletePakej(id) {
  if (!confirmAction('Padam pakej ini? Client yang guna pakej ini akan jadi "Tiada Pakej".')) return;
  await sbClient.from('pakej_list').delete().eq('id', id);
  showToast('Pakej dipadam', 'success');
  loadPakejList();
  loadPakejDropdown();
}

async function loadPakejDropdown() {
  const { data: list } = await sbClient.from('pakej_list').select('nama').order('nama');
  const select = document.getElementById('clientPakej');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">Pilih Pakej</option>' +
    (list || []).map(p => `<option value="${p.nama}">${p.nama}</option>`).join('');
  select.value = currentVal;
}

// ===== THEME & PASSWORD =====
function toggleTheme(isDark) { applyTheme(isDark ? 'dark' : 'light'); }

function openChangePassword() {
  document.getElementById('modalPassword').classList.add('open');
}

async function changePassword() {
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;
  if (!newPass || newPass.length < 8) { showToast('Minimum 8 aksara', 'error'); return; }
  if (newPass !== confirmPass) { showToast('Password tidak sepadan', 'error'); return; }

  showLoading();
  try {
    const { error } = await sbClient.auth.updateUser({ password: newPass });
    if (error) throw error;
    document.getElementById('modalPassword').classList.remove('open');
    showToast('Password berjaya ditukar!', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}