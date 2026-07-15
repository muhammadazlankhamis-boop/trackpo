// ===== TRACKPO — SALE CRUD =====

function openSaleModal(editId = null) {
  document.getElementById('saleEditId').value = '';
  document.getElementById('modalSaleTitle').textContent = 'Tambah Data Sale';
  document.getElementById('saleDate').value = toInputDate(nowMY());
  document.getElementById('saleLeadMasuk').value = '';
  document.getElementById('saleLeadClose').value = '';
  document.getElementById('saleClosingRate').value = '';
  document.getElementById('saleTotalSale').value = '';
  document.getElementById('saleBilanganResit').value = '';
  document.getElementById('saleNota').value = '';
  document.querySelectorAll('.sebabCheck').forEach(c => c.checked = false);
  document.getElementById('sebabLainText').classList.add('hidden');
  document.getElementById('sebabLainText').value = '';

  if (editId) {
    const record = saleData.find(d => d.id === editId);
    if (record) populateSaleForm(record);
  }

  toggleFAB();
  document.getElementById('modalSale').classList.add('open');
}

function populateSaleForm(record) {
  document.getElementById('modalSaleTitle').textContent = 'Edit Data Sale';
  document.getElementById('saleEditId').value = record.id;
  document.getElementById('saleDate').value = record.tarikh;
  document.getElementById('saleLeadMasuk').value = record.lead_masuk;
  document.getElementById('saleLeadClose').value = record.lead_close;
  document.getElementById('saleClosingRate').value = formatPercent(record.closing_rate);
  document.getElementById('saleTotalSale').value = record.total_sale;
  document.getElementById('saleBilanganResit').value = record.bilangan_resit || '';
  document.getElementById('saleNota').value = record.nota || '';

  const sebab = record.sebab_tak_close || [];
  document.querySelectorAll('.sebabCheck').forEach(c => {
    c.checked = sebab.includes(c.value);
    if (c.value === 'Lain-lain' && c.checked) {
      document.getElementById('sebabLainText').classList.remove('hidden');
    }
  });

  // Lain-lain free text
  const lainItem = sebab.find(s => !['Customer tak balas','Survey','Tanya harga','Tak boleh buat','Lain-lain'].includes(s));
  if (lainItem) document.getElementById('sebabLainText').value = lainItem;
}

function closeSaleModal() {
  document.getElementById('modalSale').classList.remove('open');
}

function calcClosingRate() {
  const masuk = parseInt(document.getElementById('saleLeadMasuk').value) || 0;
  const close = parseInt(document.getElementById('saleLeadClose').value) || 0;
  if (masuk > 0) {
    document.getElementById('saleClosingRate').value = ((close / masuk) * 100).toFixed(1) + '%';
  } else {
    document.getElementById('saleClosingRate').value = '';
  }
}

function toggleLainLain(checkbox) {
  const textInput = document.getElementById('sebabLainText');
  textInput.classList.toggle('hidden', !checkbox.checked);
  if (!checkbox.checked) textInput.value = '';
}

function getSebabList() {
  const sebab = [];
  document.querySelectorAll('.sebabCheck:checked').forEach(c => {
    if (c.value === 'Lain-lain') {
      const lainText = document.getElementById('sebabLainText').value.trim();
      if (lainText) sebab.push(lainText);
      else sebab.push('Lain-lain');
    } else {
      sebab.push(c.value);
    }
  });
  return sebab;
}

async function saveSale() {
  const date = document.getElementById('saleDate').value;
  const leadMasuk = parseInt(document.getElementById('saleLeadMasuk').value) || 0;
  const leadClose = parseInt(document.getElementById('saleLeadClose').value) || 0;
  const totalSale = parseFloat(document.getElementById('saleTotalSale').value) || 0;
  const bilanganResit = parseInt(document.getElementById('saleBilanganResit').value) || 0;
  const nota = document.getElementById('saleNota').value.trim();
  const sebab = getSebabList();
  const editId = document.getElementById('saleEditId').value;

  if (!date) { showToast('Sila isi tarikh', 'error'); return; }
  if (leadMasuk < 0 || leadClose < 0) { showToast('Lead tidak boleh negatif', 'error'); return; }
  if (leadClose > leadMasuk) { showToast('Lead Close tidak boleh melebihi Lead Masuk', 'error'); return; }

  showLoading();

  const payload = {
    client_id: currentClient.id,
    tarikh: date,
    lead_masuk: leadMasuk,
    lead_close: leadClose,
    total_sale: totalSale,
    bilangan_resit: bilanganResit,
    sebab_tak_close: sebab,
    nota: nota || null,
    created_by: currentProfile.id,
    updated_at: new Date().toISOString()
    // closing_rate dikira AUTO oleh database
  };

  // Buang closing_rate dari payload — generated column
  delete payload.closing_rate;

  let error;
  if (editId) {
    ({ error } = await sbClient.from('data_sale').update(payload).eq('id', editId));
  } else {
    ({ error } = await sbClient.from('data_sale').insert(payload));
  }

  hideLoading();

  if (error) {
    showToast('Gagal simpan data: ' + error.message, 'error');
    return;
  }

  // Log activity
  await logActivity(
    currentProfile.id,
    currentClient.id,
    editId ? 'EDIT_SALE' : 'ADD_SALE',
    `${editId ? 'Edit' : 'Tambah'} data sale: ${date}, Sale: ${formatRM(totalSale)}`,
    { tarikh: date, total_sale: totalSale }
  );

  closeSaleModal();
  showToast(editId ? 'Data sale berjaya dikemaskini!' : 'Data sale berjaya ditambah!', 'success');
  await loadAllData();
}

function editSale(id) {
  openSaleModal(id);
}

async function deleteSale(id) {
  if (!confirmAction('Padam data sale ini? Tindakan tidak boleh dibatalkan.')) return;

  showLoading();
  const { error } = await sbClient.from('data_sale').delete().eq('id', id);
  hideLoading();

  if (error) {
    showToast('Gagal padam data: ' + error.message, 'error');
    return;
  }

  await logActivity(currentProfile.id, currentClient.id, 'DELETE_SALE', 'Padam data sale', { id });
  showToast('Data sale berjaya dipadam', 'success');
  await loadAllData();
}