// ===== TRACKPO — ADMIN JS =====

let adminProfile = null;
let allClients = [];
let logPage = 1;
const LOG_PER_PAGE = 30;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  showLoading();

  const session = await requireAuth();
  if (!session) return;

  adminProfile = await requireRole('admin');
  if (!adminProfile) return;

  document.getElementById('adminName').textContent = adminProfile.nama || 'Admin';
  document.getElementById('adminAvatar').textContent = (adminProfile.nama || 'A')[0].toUpperCase();

  const savedTheme = localStorage.getItem('trackpo_theme') || 'dark';
  const toggle = document.getElementById('adminThemeToggle');
  if (toggle) toggle.checked = savedTheme === 'dark';

  await loadAdminDashboard();
  hideLoading();
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
  showLoading();

  const { data: clients } = await supabase
    .from('clients')
    .select('*, tetapan_client(*)')
    .order('nama_bisnes');

  allClients = clients || [];

  const aktif = allClients.filter(c => c.status === 'Aktif').length;
  document.getElementById('statTotalClient').textContent = aktif;
  document.getElementById('statAlerts').textContent = 0;
  document.getElementById('statStale').textContent = 0;

  const grid = document.getElementById('clientGrid');

  // Kalau takde client — tunjuk empty state terus
  if (allClients.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Tiada client lagi. Klik "+ Tambah Client" untuk mula.</div></div>';
    hideLoading();
    return;
  }

  const clientIds = allClients.map(c => c.id);

  const [recentSaleRes, recentMarketingRes, topupsRes] = await Promise.all([
    supabase.from('data_sale').select('client_id, created_at').in('client_id', clientIds).order('created_at', { ascending: false }),
    supabase.from('data_marketing').select('client_id, created_at, spend_sst').in('client_id', clientIds).order('created_at', { ascending: false }),
    supabase.from('bajet').select('client_id, jumlah').in('client_id', clientIds)
  ]);

  const lastUpdateMap = {};
  (recentSaleRes.data || []).forEach(d => {
    if (!lastUpdateMap[d.client_id]) lastUpdateMap[d.client_id] = d.created_at;
  });

  const topupMap = {};
  (topupsRes.data || []).forEach(t => {
    topupMap[t.client_id] = (topupMap[t.client_id] || 0) + t.jumlah;
  });

  const spendMap = {};
  (recentMarketingRes.data || []).forEach(m => {
    spendMap[m.client_id] = (spendMap[m.client_id] || 0) + (m.spend_sst || 0);
  });

  let alertCount = 0;
  let staleCount = 0;

  grid.innerHTML = allClients.map(client => {
    const lastUpdate = lastUpdateMap[client.id];
    const daysSinceUpdate = lastUpdate ? daysSince(lastUpdate) : null;
    const isStale = daysSinceUpdate === null || daysSinceUpdate > 2;
    if (isStale) staleCount++;

    const balance = (topupMap[client.id] || 0) - (spendMap[client.id] || 0);
    const tetapan = client.tetapan_client?.[0] || {};
    const thresholdAmount = tetapan.budget_threshold_pct
      ? ((tetapan.budget_threshold_pct / 100) * (topupMap[client.id] || 0))
      : 0;

    const hasAlert = balance <= thresholdAmount && balance >= 0 && (topupMap[client.id] || 0) > 0;
    if (hasAlert) alertCount++;

    const healthScore = isStale ? 20 : balance < 0 ? 30 : hasAlert ? 50 : 75;
    const health = getHealthLabel(healthScore);

    const updateText = daysSinceUpdate === null ? 'Tiada data' :
      daysSinceUpdate === 0 ? 'Hari ini' :
      daysSinceUpdate === 1 ? 'Semalam' :
      `${daysSinceUpdate} hari lepas`;

    const updateClass = daysSinceUpdate === null || daysSinceUpdate > 2 ? 'stale' : 'fresh';

    return `
      <div class="client-card" onclick="openClientDashboard('${client.id}')">
        <div class="client-card-header">
          <div>
            <div class="client-name">${client.nama_bisnes}</div>
            <div class="client-pakej">${client.pakej || 'Tiada pakej'}</div>
          </div>
          <div class="health-circle ${health.class}">${healthScore}</div>
        </div>
        <div class="client-card-stats">
          <div class="client-stat-row">
            <span class="client-stat-label">Balance Bajet</span>
            <span class="client-stat-value ${balance < 0 ? 'text-red' : ''}">${formatRM(Math.abs(balance))}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${balance < 0 ? 'fill-red' : hasAlert ? 'fill-yellow' : 'fill-green'}"
              style="width:${Math.min(Math.max((topupMap[client.id]||0) > 0 ? (spendMap[client.id]||0)/(topupMap[client.id]||1)*100 : 0, 0), 100)}%">
            </div>
          </div>
          <div class="client-stat-row" style="margin-top:8px;">
            <span class="client-stat-label">Total Topup</span>
            <span class="client-stat-value">${formatRM(topupMap[client.id] || 0)}</span>
          </div>
        </div>
        <div class="client-card-footer">
          <span class="last-update-badge ${updateClass}">🕐 ${updateText}</span>
          <div style="display:flex;gap:6px;">
            ${hasAlert ? '<span class="badge badge-yellow">⚠️ Alert</span>' : ''}
            <span class="badge ${client.status === 'Aktif' ? 'badge-green' : 'badge-red'}">${client.status || 'Aktif'}</span>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:6px;">
          <button class="btn btn-primary" style="flex:1;font-size:12px;padding:8px;" onclick="event.stopPropagation(); openClientDashboard('${client.id}')">
            Buka Dashboard
          </button>
          <button class="btn btn-secondary" style="font-size:12px;padding:8px 10px;" onclick="event.stopPropagation(); openClientSettingsModal('${client.id}')">⚙️</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('statAlerts').textContent = alertCount;
  document.getElementById('statStale').textContent = staleCount;

  hideLoading();
}

function openClientDashboard(clientId) {
  window.open(`index.html?client=${clientId}`, '_blank');
}

// ===== MANAGE CLIENTS =====
async function loadClientsTable() {
  showLoading();

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('nama_bisnes');

  hideLoading();

  const tbody = document.getElementById('clientsTableBody');
  if (!clients || clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><div class="empty-state-text">Tiada client</div></td></tr>';
    return;
  }

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
        <button class="action-btn" onclick="editClient('${c.id}')">✏️</button>
        <button class="action-btn delete" onclick="deleteClient('${c.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
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
  if (!client) return;

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
  let error;

  if (editId) {
    ({ error } = await supabase.from('clients').update(payload).eq('id', editId));
  } else {
    const { data, error: insertError } = await supabase.from('clients').insert(payload).select().single();
    error = insertError;
    if (data) clientId = data.id;
  }

  if (error) {
    hideLoading();
    showToast('Gagal simpan client: ' + error.message, 'error');
    return;
  }

  // Simpan/update tetapan
  if (clientId) {
    const targetLead = parseInt(document.getElementById('clientTargetLead').value) || 0;
    const targetSale = parseFloat(document.getElementById('clientTargetSale').value) || 0;
    const benchmarkCPL = parseFloat(document.getElementById('clientBenchmarkCPL').value) || 0;

    await supabase.from('tetapan_client').upsert({
      client_id: clientId,
      target_lead: targetLead,
      target_sale: targetSale,
      benchmark_cpl: benchmarkCPL
    }, { onConflict: 'client_id' });
  }

  hideLoading();
  closeClientModal();
  showToast(editId ? 'Client berjaya dikemaskini!' : 'Client berjaya ditambah!', 'success');

  await loadAdminDashboard();
  loadClientsTable();
}

async function deleteClient(id) {
  if (!confirmAction('Padam client ini? SEMUA data akan dipadamkan. Tindakan ini TIDAK BOLEH dibatalkan.')) return;

  showLoading();
  const { error } = await supabase.from('clients').delete().eq('id', id);
  hideLoading();

  if (error) {
    showToast('Gagal padam: ' + error.message, 'error');
    return;
  }

  showToast('Client berjaya dipadamkan', 'success');
  await loadAdminDashboard();
  loadClientsTable();
}

// ===== MANAGE USERS =====
async function loadUsersTable() {
  showLoading();

  const { data: users } = await supabase
    .from('profiles')
    .select('*, clients(nama_bisnes)')
    .order('created_at', { ascending: false });

  hideLoading();

  const tbody = document.getElementById('usersTableBody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state empty-state-text">Tiada user</div></td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.nama || '-'}</td>
      <td>${u.email || '-'}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}">${u.role}</span></td>
      <td>${u.clients?.nama_bisnes || '-'}</td>
      <td>${u.last_login ? formatDate(u.last_login) : 'Belum pernah'}</td>
      <td>
        <button class="action-btn delete" onclick="deleteUser('${u.id}', '${u.email}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openAddUserModal() {
  document.getElementById('userClientId').innerHTML = '<option value="">Pilih Client</option>' +
    allClients.map(c => `<option value="${c.id}">${c.nama_bisnes}</option>`).join('');
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

  const email = `${username}@trackpo.app`;

  // Create auth user via Supabase admin
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    hideLoading();
    showToast('Gagal buat akaun: ' + authError.message, 'error');
    return;
  }

  // Create profile
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    email,
    role: 'client',
    client_id: clientId,
    nama: nama || username
  });

  hideLoading();

  if (profileError) {
    showToast('Akaun dibuat tapi gagal simpan profile: ' + profileError.message, 'warning');
    return;
  }

  closeUserModal();
  showToast(`Login berjaya dibuat! Username: ${username}`, 'success');
  loadUsersTable();
}

async function deleteUser(userId, email) {
  if (!confirmAction(`Padam akaun "${email}"?`)) return;

  showLoading();

  // Delete dari profiles dahulu
  await supabase.from('profiles').delete().eq('id', userId);

  // Delete dari auth (perlu admin key — boleh skip kalau restrict)
  const { error } = await supabase.auth.admin.deleteUser(userId);

  hideLoading();

  if (error) {
    showToast('Gagal padam akaun sepenuhnya. Profile dipadam tapi auth masih ada.', 'warning');
  } else {
    showToast('Akaun berjaya dipadamkan', 'success');
  }

  loadUsersTable();
}

// ===== ACTIVITY LOG =====
async function loadActivityLog() {
  const clientFilter = document.getElementById('logClientFilter')?.value;

  // Populate client filter dropdown
  if (!document.getElementById('logClientFilter')?.options?.length > 1) {
    const select = document.getElementById('logClientFilter');
    if (select) {
      select.innerHTML = '<option value="">Semua Client</option>' +
        allClients.map(c => `<option value="${c.id}">${c.nama_bisnes}</option>`).join('');
    }
  }

  showLoading();

  let query = supabase
    .from('activity_log')
    .select('*, profiles(nama), clients(nama_bisnes)')
    .order('created_at', { ascending: false })
    .range((logPage - 1) * LOG_PER_PAGE, logPage * LOG_PER_PAGE - 1);

  if (clientFilter) {
    query = query.eq('client_id', clientFilter);
  }

  const { data: logs } = await query;
  hideLoading();

  const tbody = document.getElementById('logTableBody');

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state empty-state-text">Tiada log aktiviti</div></td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const masaStr = new Date(l.created_at).toLocaleString('ms-MY', { timeZone: TZ });
    const actionBadge = {
      'ADD_SALE': 'badge-green', 'ADD_MARKETING': 'badge-green',
      'EDIT_SALE': 'badge-yellow', 'EDIT_MARKETING': 'badge-yellow',
      'DELETE_SALE': 'badge-red', 'DELETE_MARKETING': 'badge-red',
      'TOPUP_BAJET': 'badge-blue',
      'LOGIN': 'badge-gold'
    }[l.action_type] || 'badge-blue';

    return `
      <tr>
        <td style="white-space:nowrap;font-size:12px;">${masaStr}</td>
        <td>${l.profiles?.nama || '-'}</td>
        <td>${l.clients?.nama_bisnes || '-'}</td>
        <td><span class="badge ${actionBadge}" style="font-size:10px;">${l.action_type}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:12px;" title="${l.description || ''}">${l.description || '-'}</td>
      </tr>
    `;
  }).join('');
}

// ===== CLIENT SETTINGS MODAL =====
async function openClientSettingsModal(clientId) {
  const { data: tetapan } = await supabase
    .from('tetapan_client')
    .select('*')
    .eq('client_id', clientId)
    .single();

  document.getElementById('csClientId').value = clientId;
  document.getElementById('csTetapanId').value = tetapan?.id || '';
  document.getElementById('csBudgetAlert').checked = tetapan?.budget_alert_aktif ?? true;
  document.getElementById('csBudgetThreshold').value = tetapan?.budget_threshold_pct || 20;
  document.getElementById('csLeadAlert').checked = tetapan?.lead_alert_aktif ?? true;

  document.getElementById('modalClientSettings').classList.add('open');
}

function closeClientSettingsModal() {
  document.getElementById('modalClientSettings').classList.remove('open');
}

async function saveClientSettings() {
  const clientId = document.getElementById('csClientId').value;
  const budgetAlert = document.getElementById('csBudgetAlert').checked;
  const budgetThreshold = parseInt(document.getElementById('csBudgetThreshold').value) || 20;
  const leadAlert = document.getElementById('csLeadAlert').checked;

  showLoading();

  await supabase.from('tetapan_client').upsert({
    client_id: clientId,
    budget_alert_aktif: budgetAlert,
    budget_threshold_pct: budgetThreshold,
    lead_alert_aktif: leadAlert
  }, { onConflict: 'client_id' });

  hideLoading();
  closeClientSettingsModal();
  showToast('Settings berjaya disimpan!', 'success');
}

// ===== OBJEKTIF LIST =====
async function loadObjektifList() {
  const { data: list } = await supabase
    .from('objektif_list')
    .select('*')
    .order('nama');

  const el = document.getElementById('objektifList');
  if (!list || list.length === 0) {
    el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Tiada objektif lagi</div>';
    return;
  }

  el.innerHTML = list.map(o => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <span>${o.nama}</span>
      ${!o.is_default ? `<button class="action-btn delete" onclick="deleteObjektif('${o.id}')">🗑️</button>` : '<span style="font-size:12px;color:var(--text-secondary);">Default</span>'}
    </div>
  `).join('');
}

async function addObjektif() {
  const nama = document.getElementById('newObjektif').value.trim().toUpperCase();
  if (!nama) { showToast('Sila isi nama objektif', 'error'); return; }

  const { error } = await supabase.from('objektif_list').insert({ nama, is_default: false });

  if (error) {
    showToast('Gagal tambah objektif: ' + error.message, 'error');
    return;
  }

  document.getElementById('newObjektif').value = '';
  showToast('Objektif berjaya ditambah!', 'success');
  loadObjektifList();
}

async function deleteObjektif(id) {
  if (!confirmAction('Padam objektif ini?')) return;
  await supabase.from('objektif_list').delete().eq('id', id);
  showToast('Objektif dipadam', 'success');
  loadObjektifList();
}

// ===== THEME & MISC =====
function toggleTheme(isDark) {
  applyTheme(isDark ? 'dark' : 'light');
}

function openChangePassword() {
  document.getElementById('modalPassword').classList.add('open');
}

async function changePassword() {
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;

  if (!newPass || newPass.length < 8) { showToast('Password mesti sekurang-kurangnya 8 aksara', 'error'); return; }
  if (newPass !== confirmPass) { showToast('Password tidak sepadan', 'error'); return; }

  showLoading();
  const { error } = await supabase.auth.updateUser({ password: newPass });
  hideLoading();

  if (error) { showToast('Gagal tukar password', 'error'); return; }

  document.getElementById('modalPassword').classList.remove('open');
  showToast('Password berjaya ditukar!', 'success');
}
