// ===== TRACKPO — BAJET JS =====

function openTopupModal() {
  document.getElementById('topupTarikh').value = toInputDate(nowMY());
  document.getElementById('topupAmount').value = '';
  document.getElementById('topupNota').value = getBulanTahun(nowMY());
  toggleFAB();
  document.getElementById('modalTopup').classList.add('open');
}

function closeTopupModal() {
  document.getElementById('modalTopup').classList.remove('open');
}

async function saveTopup() {
  const tarikh = document.getElementById('topupTarikh').value;
  const amount = parseFloat(document.getElementById('topupAmount').value) || 0;
  const nota = document.getElementById('topupNota').value.trim();

  if (!tarikh) {
    showToast('Sila isi tarikh topup', 'error');
    return;
  }

  if (amount <= 0) {
    showToast('Sila masukkan jumlah topup yang sah', 'error');
    return;
  }

  showLoading();

  const { error } = await sbClient
    .from('bajet')
    .insert({
      client_id: currentClient.id,
      jumlah: amount,
      nota: nota || null,
      tarikh: tarikh,
      created_by: currentProfile.id
    });

  hideLoading();

  if (error) {
    // Kalau column tarikh tak wujud lagi dalam table
    if (error.message.includes('tarikh')) {
      // Cuba tanpa tarikh
      const { error: error2 } = await sbClient
        .from('bajet')
        .insert({
          client_id: currentClient.id,
          jumlah: amount,
          nota: nota || null,
          created_by: currentProfile.id
        });

      if (error2) {
        showToast('Gagal topup: ' + error2.message, 'error');
        return;
      }
    } else {
      showToast('Gagal topup: ' + error.message, 'error');
      return;
    }
  }

  await logActivity(
    currentProfile.id,
    currentClient.id,
    'TOPUP_BAJET',
    `Topup bajet: ${formatRM(amount)} (${tarikh})`,
    { jumlah: amount, nota, tarikh }
  );

  closeTopupModal();
  showToast(`Topup ${formatRM(amount)} berjaya!`, 'success');
  await loadBajetData();
  updateBalanceKPI();
}
