// ===== TRACKPO — CSV EXPORT =====

function arrayToCSV(rows, headers) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headerRow = headers.map(h => escapeCell(h.label)).join(',');
  const dataRows = rows.map(row =>
    headers.map(h => escapeCell(row[h.key])).join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportSaleCSV() {
  if (!saleData || saleData.length === 0) {
    showToast('Tiada data sale untuk export', 'warning');
    return;
  }

  const headers = [
    { key: 'tarikh', label: 'Tarikh' },
    { key: 'lead_masuk', label: 'Lead Masuk' },
    { key: 'lead_close', label: 'Lead Close' },
    { key: 'closing_rate', label: 'Closing Rate (%)' },
    { key: 'total_sale', label: 'Total Sale (RM)' },
    { key: 'bilangan_resit', label: 'Bilangan Resit' },
    { key: 'sebab_tak_close', label: 'Sebab Tak Close' },
    { key: 'nota', label: 'Notes' }
  ];

  const rows = saleData.map(d => ({
    ...d,
    sebab_tak_close: Array.isArray(d.sebab_tak_close) ? d.sebab_tak_close.join('; ') : ''
  }));

  const csv = arrayToCSV(rows, headers);
  const filename = `${currentClient.nama_bisnes}_Data_Sale_${toInputDate(nowMY())}.csv`;
  downloadCSV(csv, filename);
  showToast('CSV Data Sale dimuat turun!', 'success');
}

function exportMarketingCSV() {
  if (!marketingData || marketingData.length === 0) {
    showToast('Tiada data marketing untuk export', 'warning');
    return;
  }

  const headers = [
    { key: 'tarikh_mula', label: 'Tarikh Mula' },
    { key: 'tarikh_akhir', label: 'Tarikh Akhir' },
    { key: 'platform', label: 'Platform' },
    { key: 'objektif', label: 'Objektif' },
    { key: 'nama_post', label: 'Nama Post' },
    { key: 'ad_spend', label: 'Ad Spend (RM)' },
    { key: 'spend_sst', label: 'Spend+SST (RM)' },
    { key: 'reach', label: 'Reach' },
    { key: 'ctr', label: 'CTR (%)' },
    { key: 'message_leads', label: 'Message Leads' },
    { key: 'cpl', label: 'CPL (RM)' },
    { key: 'impression', label: 'Impression' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'cpm', label: 'CPM (RM)' },
    { key: 'jumlah_purchase', label: 'Jumlah Purchase' },
    { key: 'cost_per_purchase', label: 'Cost per Purchase (RM)' },
    { key: 'nota', label: 'Notes' }
  ];

  const csv = arrayToCSV(marketingData, headers);
  const filename = `${currentClient.nama_bisnes}_Data_Marketing_${toInputDate(nowMY())}.csv`;
  downloadCSV(csv, filename);
  showToast('CSV Data Marketing dimuat turun!', 'success');
}