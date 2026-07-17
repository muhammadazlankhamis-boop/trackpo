// ===== TRACKPO — SALE CRUD =====

function openSaleModal(editId) {
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
    if (record) {
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
      const lainItem = sebab.find(s => !['Customer tak balas','Survey','Tanya harga','Tak boleh buat','Lain-lain'].includes(s));
      if (lainItem) document.getElementById('sebabLainText').value = lainItem;
    }
  }

  closeFAB();
  const fabModal = document.getElementById('fabActionModal');
  if (fabModal) document.body.removeChild(fabModal);
  document.getElementById('modalSale').classList.add('open');
}

function closeSaleModal() {
  document.getElementById('modalSale').classList.remove('open');
}

function calcClosingRate() {
  const masuk = parseInt(document.getElementById('saleLeadMasuk').value) || 0;
  const close = parseInt(document.getElementById('saleLeadClose').value) || 0;
  document.getElementById('saleClosingRate').value = masuk > 0 ? ((close / masuk) * 100).toFixed(1) + '%' : '';
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
      sebab.push(lainText || 'Lain-lain');
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
  };

  let error;
  if (editId) {
    ({ error } = await sbClient.from('data_sale').update(payload).eq('id', editId));
  } else {
    ({ error } = await sbClient.from('data_sale').insert(payload));
  }

  hideLoading();

  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  await logActivity(currentProfile.id, currentClient.id,
    editId ? 'EDIT_SALE' : 'ADD_SALE',
    `${editId ? 'Edit' : 'Tambah'} data sale: ${date}`,
    { tarikh: date, total_sale: totalSale }
  );

  closeSaleModal();
  showToast(editId ? 'Data sale dikemaskini!' : 'Data sale ditambah!', 'success');
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
  if (error) { showToast('Gagal padam: ' + error.message, 'error'); return; }
  await logActivity(currentProfile.id, currentClient.id, 'DELETE_SALE', 'Padam data sale', { id });
  showToast('Data sale dipadam', 'success');
  await loadAllData();
}
