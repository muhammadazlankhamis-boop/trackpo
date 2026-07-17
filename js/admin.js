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
  if (section === 'settings') loadObjektifList();
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
      sbClient.from('data_marketing').select('client_id, spend_sst').in('client_id', clientIds),
      sbClient.from('data_sale').select('client_id, created_at').in('client_id', clientIds).order('created_at', { ascending: false })
    ]);

    const topupMap = {};
    (topupsRes.data || []).forEach(t => {
      topupMap[t.client_id] = (topupMap[t.client_id] || 0) + (t.jumlah || 0);
    });

    const spendMap = {};
    (marketingRes.data || []).forEach(m => {
      spendMap[m.client_id] = (spendMap[m.client_id] || 0) + (m.spend_sst || 0);
    });

    const lastUpdateMap = {};
    (saleRes.data || []).forEach(d => {
      if (!lastUpdateMap[d.client_id]) lastUpdateMap[d.client_id] = d.created_at;
    });

    // Store globally for stale modal
    window._lastUpdateMap = lastUpdateMap;

    // Update stats
    let alertCount = 0;
    let staleCount = 0;

    allClients.forEach(client => {
      const daysSinceUpdate = lastUpdateMap[client.id] ? daysSince(lastUpdateMap[client.id]) : null;
      if (daysSinceUpdate === null || daysSinceUpdate > 2) staleCount++;

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

    const updateText = daysSinceUpdate === null ? 'Belum ada data' :
      daysSinceUpdate === 0 ? 'Hari ini' :
      daysSinceUpdate === 1 ? 'Semalam' :
      `${daysSinceUpdate} hari lepas`;

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
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12px;color:var(--text-secondary);">Balance Bajet</span>
            <span style="font-size:14px;font-weight:700;color:${balanceColor};">${formatRM(Math.abs(balance))}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${usedPct}%;background:${usedPct > 90 ? 'var(--red)' : usedPct > 70 ? 'var(--orange)' : 'var(--green)'};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span style="font-size:11px;color:var(--text-secondary);">Total Topup: ${formatRM(totalTopup)}</span>
            <span style="font-size:11px;color:var(--text-secondary);">${usedPct.toFixed(0)}% digunakan</span>
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


function openStaleModal() {
  const modal = document.getElementById('modalStaleClients');
  const listEl = document.getElementById('staleClientsList');
  if (!modal || !listEl) return;

  // Build list from allClients + lastUpdateMap
  const staleClients = [];
  allClients.forEach(client => {
    // We need lastUpdateMap - store it globally
    const lastUpdate = window._lastUpdateMap?.[client.id];
    const daysSinceUpdate = lastUpdate ? daysSince(lastUpdate) : null;
    if (daysSinceUpdate === null || daysSinceUpdate > 2) {
      staleClients.push({
        nama: client.nama_bisnes,
        lastUpdate,
        days: daysSinceUpdate
      });
    }
  });

  if (staleClients.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">Semua client dah update data terkini!</div></div>';
  } else {
    listEl.innerHTML = staleClients.map(c => {
      const updateText = c.days === null ? 'Belum pernah ada data' :
        c.days === 0 ? 'Hari ini' :
        c.days === 1 ? 'Semalam' :
        `${c.days} hari lepas`;
      const isVeryStale = c.days === null || c.days > 7;
      return `
        <div class="topup-item" style="padding:14px 0;">
          <div>
            <div style="font-weight:700;font-size:14px;margin-bottom:3px;">${c.nama}</div>
            <div style="font-size:12px;color:var(--text-secondary);">Last update: ${c.lastUpdate ? formatDate(c.lastUpdate) : 'Tiada rekod'}</div>
          </div>
          <span class="badge ${isVeryStale ? 'badge-red' : 'badge-yellow'}">${updateText}</span>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('open');
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
    const { data: authData, error: authError } = await sbClient.auth.admin.createUser({
      email, password, email_confirm: true
    });

    if (authError) throw authError;

    const { error: profileError } = await sbClient.from('profiles').insert({
      id: authData.user.id,
      email,
      role: 'client',
      client_id: clientId,
      nama: nama || username
    });

    if (profileError) throw profileError;

    closeUserModal();
    showToast(`Login berjaya dibuat! Username: ${username}`, 'success');
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
