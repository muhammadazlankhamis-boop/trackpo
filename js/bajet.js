// ===== TRACKPO — BAJET JS =====

function openTopupModal(editId = null) {
  document.getElementById('topupEditId').value = '';
  document.getElementById('topupModalTitle').textContent = 'Topup Bajet Iklan';
  document.getElementById('topupTarikh').value = toInputDate(nowMY());
  document.getElementById('topupAmount').value = '';
  document.getElementById('topupNota').value = getBulanTahun(nowMY());

  if (editId) {
    const record = bajetData.find(b => b.id === editId);
    if (record) {
      document.getElementById('topupEditId').value = record.id;
      document.getElementById('topupModalTitle').textContent = 'Edit Topup';
      document.getElementById('topupTarikh').value = record.tarikh || toInputDate(new Date(record.created_at));
      document.getElementById('topupAmount').value = record.jumlah || '';
      document.getElementById('topupNota').value = record.nota || '';
    }
  }

  closeFAB();
  document.getElementById('modalTopup').classList.add('open');
}

function closeTopupModal() {
  document.getElementById('modalTopup').classList.remove('open');
}

function editTopup(id) {
  openTopupModal(id);
}

async function deleteTopup(id) {
  if (!confirmAction('Padam rekod topup ini? Tindakan tidak boleh dibatalkan.')) return;

  showLoading();
  const { error } = await sbClient.from('bajet').delete().eq('id', id);
  hideLoading();

  if (error) {
    showToast('Gagal padam: ' + error.message, 'error');
    return;
  }

  showToast('Rekod topup dipadam', 'success');
  await loadBajetData();
  updateBalanceKPI();
}

async function saveTopup() {
  const editId = document.getElementById('topupEditId').value;
  const tarikh = document.getElementById('topupTarikh').value;
  const amount = parseFloat(document.getElementById('topupAmount').value) || 0;
  const nota = document.getElementById('topupNota').value.trim();

  if (!tarikh) { showToast('Sila isi tarikh topup', 'error'); return; }
  if (amount <= 0) { showToast('Sila masukkan jumlah yang sah', 'error'); return; }

  showLoading();

  const payload = {
    client_id: currentClient.id,
    jumlah: amount,
    nota: nota || null,
    tarikh: tarikh,
    created_by: currentProfile.id
  };

  let error;
  if (editId) {
    ({ error } = await sbClient.from('bajet').update({
      jumlah: amount,
      nota: nota || null,
      tarikh: tarikh
    }).eq('id', editId));
  } else {
    ({ error } = await sbClient.from('bajet').insert(payload));
  }

  hideLoading();

  if (error) {
    showToast('Gagal simpan: ' + error.message, 'error');
    return;
  }

  await logActivity(
    currentProfile.id,
    currentClient.id,
    editId ? 'EDIT_TOPUP' : 'TOPUP_BAJET',
    `${editId ? 'Edit' : 'Topup'} bajet: ${formatRM(amount)} (${tarikh})`,
    { jumlah: amount, nota, tarikh }
  );

  closeTopupModal();
  showToast(`${editId ? 'Topup dikemaskini' : 'Topup ' + formatRM(amount) + ' berjaya'}!`, 'success');
  await loadBajetData();
  updateBalanceKPI();
}