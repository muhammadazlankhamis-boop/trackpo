// ===== TRACKPO — MARKETING CRUD =====

let marketingMode = 'harian';

function openMarketingModal(editId) {
  document.getElementById('marketingEditId').value = '';
  document.getElementById('modalMarketingTitle').textContent = 'Tambah Data Marketing';
  setMarketingMode('harian');
  document.getElementById('marketingDate').value = toInputDate(nowMY());
  document.getElementById('marketingDateStart').value = '';
  document.getElementById('marketingDateEnd').value = '';
  document.getElementById('marketingPlatform').value = '';
  document.getElementById('marketingObjektif').value = '';
  document.getElementById('marketingNamaPost').value = '';
  document.getElementById('marketingLinkPost').value = '';
  document.getElementById('marketingAdSpend').value = '';
  document.getElementById('marketingSpendSST').value = '';
  document.getElementById('marketingReach').value = '';
  document.getElementById('marketingCTR').value = '';
  document.getElementById('marketingLeads').value = '';
  document.getElementById('marketingCPL').value = '';
  document.getElementById('marketingImpression').value = '';
  document.getElementById('marketingFrequency').value = '';
  document.getElementById('marketingCPM').value = '';
  document.getElementById('marketingPurchase').value = '';
  document.getElementById('marketingCostPurchase').value = '';
  document.getElementById('marketingNota').value = '';
  setObjektifFields();

  if (editId) {
    const record = marketingData.find(d => d.id === editId);
    if (record) {
      document.getElementById('modalMarketingTitle').textContent = 'Edit Data Marketing';
      document.getElementById('marketingEditId').value = record.id;
      if (record.is_bulk) {
        setMarketingMode('bulk');
        document.getElementById('marketingDateStart').value = record.tarikh_mula;
        document.getElementById('marketingDateEnd').value = record.tarikh_akhir;
      } else {
        setMarketingMode('harian');
        document.getElementById('marketingDate').value = record.tarikh_mula;
      }
      document.getElementById('marketingPlatform').value = record.platform || '';
      document.getElementById('marketingObjektif').value = record.objektif || '';
      document.getElementById('marketingNamaPost').value = record.nama_post || '';
      document.getElementById('marketingLinkPost').value = record.link_post || '';
      document.getElementById('marketingAdSpend').value = record.ad_spend || '';
      document.getElementById('marketingSpendSST').value = record.spend_sst || '';
      document.getElementById('marketingReach').value = record.reach || '';
      document.getElementById('marketingCTR').value = record.ctr || '';
      document.getElementById('marketingLeads').value = record.message_leads || '';
      document.getElementById('marketingCPL').value = record.cpl || '';
      document.getElementById('marketingImpression').value = record.impression || '';
      document.getElementById('marketingFrequency').value = record.frequency || '';
      document.getElementById('marketingCPM').value = record.cpm || '';
      document.getElementById('marketingPurchase').value = record.jumlah_purchase || '';
      document.getElementById('marketingCostPurchase').value = record.cost_per_purchase || '';
      document.getElementById('marketingNota').value = record.nota || '';
      setObjektifFields();
    }
  }

  closeFAB();
  const fabModal = document.getElementById('fabActionModal');
  if (fabModal) document.body.removeChild(fabModal);
  document.getElementById('modalMarketing').classList.add('open');
}

function closeMarketingModal() {
  document.getElementById('modalMarketing').classList.remove('open');
}

function setMarketingMode(mode) {
  marketingMode = mode;
  document.getElementById('btnHarian').classList.toggle('active', mode === 'harian');
  document.getElementById('btnBulk').classList.toggle('active', mode === 'bulk');
  document.getElementById('tarihHarianGroup').classList.toggle('hidden', mode === 'bulk');
  document.getElementById('tarihBulkGroup').classList.toggle('hidden', mode === 'harian');
}

function setObjektifFields() {
  const objektif = document.getElementById('marketingObjektif').value;
  document.getElementById('fieldLead').classList.toggle('hidden', !['', 'LEAD'].includes(objektif));
  document.getElementById('fieldAwareness').classList.toggle('hidden', objektif !== 'AWARENESS');
  document.getElementById('fieldConversion').classList.toggle('hidden', objektif !== 'CONVERSION');
}

function calcMarketingAuto() {
  const spend = parseFloat(document.getElementById('marketingAdSpend').value) || 0;
  const leads = parseInt(document.getElementById('marketingLeads').value) || 0;
  const impression = parseInt(document.getElementById('marketingImpression').value) || 0;
  const purchase = parseInt(document.getElementById('marketingPurchase').value) || 0;

  document.getElementById('marketingSpendSST').value = spend > 0 ? (spend * 1.1).toFixed(2) : '';
  document.getElementById('marketingCPL').value = (spend > 0 && leads > 0) ? (spend / leads).toFixed(2) : '';
  document.getElementById('marketingCPM').value = (spend > 0 && impression > 0) ? ((spend / impression) * 1000).toFixed(2) : '';
  document.getElementById('marketingCostPurchase').value = (spend > 0 && purchase > 0) ? (spend / purchase).toFixed(2) : '';
}

async function saveMarketing() {
  const editId = document.getElementById('marketingEditId').value;
  const platform = document.getElementById('marketingPlatform').value;
  const objektif = document.getElementById('marketingObjektif').value;
  const adSpend = parseFloat(document.getElementById('marketingAdSpend').value) || 0;
  const isBulk = marketingMode === 'bulk';

  let tarikhMula, tarikhAkhir;
  if (isBulk) {
    tarikhMula = document.getElementById('marketingDateStart').value;
    tarikhAkhir = document.getElementById('marketingDateEnd').value;
    if (!tarikhMula || !tarikhAkhir) { showToast('Sila isi tarikh mula dan akhir', 'error'); return; }
  } else {
    tarikhMula = document.getElementById('marketingDate').value;
    tarikhAkhir = tarikhMula;
    if (!tarikhMula) { showToast('Sila isi tarikh', 'error'); return; }
  }

  if (!platform) { showToast('Sila pilih platform', 'error'); return; }
  if (!objektif) { showToast('Sila pilih objektif', 'error'); return; }
  if (adSpend <= 0) { showToast('Sila isi Ad Spend', 'error'); return; }

  showLoading();

  const namaPost = document.getElementById('marketingNamaPost').value.trim();
  if (namaPost) {
    await sbClient.from('post_list').upsert({
      client_id: currentClient.id, nama_post: namaPost
    }, { onConflict: 'client_id,nama_post', ignoreDuplicates: true });
  }

  const payload = {
    client_id: currentClient.id,
    platform, objektif,
    tarikh_mula: tarikhMula,
    tarikh_akhir: tarikhAkhir,
    is_bulk: isBulk,
    nama_post: namaPost || null,
    link_post: document.getElementById('marketingLinkPost').value.trim() || null,
    ad_spend: adSpend,
    reach: parseInt(document.getElementById('marketingReach').value) || null,
    ctr: parseFloat(document.getElementById('marketingCTR').value) || null,
    message_leads: parseInt(document.getElementById('marketingLeads').value) || null,
    impression: parseInt(document.getElementById('marketingImpression').value) || null,
    frequency: parseFloat(document.getElementById('marketingFrequency').value) || null,
    jumlah_purchase: parseInt(document.getElementById('marketingPurchase').value) || null,
    nota: document.getElementById('marketingNota').value.trim() || null,
    created_by: currentProfile.id,
    updated_at: new Date().toISOString()
    // spend_sst, cpl, cpm, cost_per_purchase — generated columns, dikira auto oleh DB
  };

  let error;
  if (editId) {
    ({ error } = await sbClient.from('data_marketing').update(payload).eq('id', editId));
  } else {
    ({ error } = await sbClient.from('data_marketing').insert(payload));
  }

  hideLoading();

  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  await logActivity(currentProfile.id, currentClient.id,
    editId ? 'EDIT_MARKETING' : 'ADD_MARKETING',
    `${editId ? 'Edit' : 'Tambah'} data marketing: ${tarikhMula}`,
    { tarikh: tarikhMula, ad_spend: adSpend, platform, objektif }
  );

  closeMarketingModal();
  showToast(editId ? 'Data marketing dikemaskini!' : 'Data marketing ditambah!', 'success');
  loadPostList();
  await loadAllData();
}

function editMarketing(id) {
  openMarketingModal(id);
}

async function deleteMarketing(id) {
  if (!confirmAction('Padam data marketing ini?')) return;
  showLoading();
  const { error } = await sbClient.from('data_marketing').delete().eq('id', id);
  hideLoading();
  if (error) { showToast('Gagal padam: ' + error.message, 'error'); return; }
  await logActivity(currentProfile.id, currentClient.id, 'DELETE_MARKETING', 'Padam data marketing', { id });
  showToast('Data marketing dipadam', 'success');
  await loadAllData();
}
