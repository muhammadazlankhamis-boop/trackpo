// ===== TRACKPO — BAJET JS =====

function openTopupModal() {
  document.getElementById('topupAmount').value = '';
  document.getElementById('topupNota').value = getBulanTahun(nowMY());
  toggleFAB();
  document.getElementById('modalTopup').classList.add('open');
}

function closeTopupModal() {
  document.getElementById('modalTopup').classList.remove('open');
}

async function saveTopup() {
  const amount = parseFloat(document.getElementById('topupAmount').value) || 0;
  const nota = document.getElementById('topupNota').value.trim();

  if (amount <= 0) {
    showToast('Sila masukkan jumlah topup yang sah', 'error');
    return;
  }

  showLoading();

  const { error } = await supabase
    .from('bajet')
    .insert({
      client_id: currentClient.id,
      jumlah: amount,
      nota: nota || null,
      created_by: currentProfile.id
    });

  hideLoading();

  if (error) {
    showToast('Gagal topup: ' + error.message, 'error');
    return;
  }

  await logActivity(
    currentProfile.id,
    currentClient.id,
    'TOPUP_BAJET',
    `Topup bajet: ${formatRM(amount)}`,
    { jumlah: amount, nota }
  );

  closeTopupModal();
  showToast(`Topup ${formatRM(amount)} berjaya!`, 'success');
  await loadBajetData();
  updateBalanceKPI();
}
