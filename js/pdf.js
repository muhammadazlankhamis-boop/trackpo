// ===== TRACKPO — PDF EXPORT =====
// Menggunakan jsPDF + html2canvas via CDN (kena tambah dalam index.html kalau nak guna)

// Cadangan marketing berdasarkan data
function generateCadangan(kpi) {
  const cadangan = [];

  const { cpl, benchmarkCPL, closingRate, roas, totalLead, totalSale, totalSpend } = kpi;

  if (cpl > 0 && benchmarkCPL > 0 && cpl > benchmarkCPL) {
    cadangan.push(`CPL semasa (${formatRM(cpl)}) melebihi benchmark (${formatRM(benchmarkCPL)}). Cadangan: Optimumkan audience targeting dan cuba A/B test creative baru untuk turunkan kos per lead.`);
  } else if (cpl > 0 && benchmarkCPL > 0 && cpl <= benchmarkCPL) {
    cadangan.push(`CPL dalam julat yang baik (${formatRM(cpl)} vs benchmark ${formatRM(benchmarkCPL)}). Cadangan: Maintain strategi semasa dan cuba scale up bajet secara berperingkat.`);
  }

  if (closingRate < 15) {
    cadangan.push(`Closing rate masih rendah (${formatPercent(closingRate)}). Cadangan: Perkuat follow-up lead, baiki response time, dan sediakan FAQ untuk atasi bantahan pelanggan.`);
  } else if (closingRate >= 30) {
    cadangan.push(`Closing rate sangat baik (${formatPercent(closingRate)}). Cadangan: Tambah bajet iklan untuk jana lebih banyak lead dan tingkatkan jumlah closing.`);
  }

  if (roas < 1) {
    cadangan.push(`ROAS di bawah 1x bermakna kos iklan melebihi pendapatan. Cadangan: Semak semula pricing, kurangkan bajet iklan buat sementara, dan fokus pada improve closing rate.`);
  } else if (roas >= 3) {
    cadangan.push(`ROAS sangat baik (${roas.toFixed(2)}x). Cadangan: Pertimbangkan untuk scale up kempen yang berjaya dan cuba platform iklan baharu.`);
  }

  if (totalLead > 0 && totalSale === 0) {
    cadangan.push('Ada lead tapi tiada sale direkodkan. Cadangan: Pastikan data sale dikemaskini setiap hari untuk analisa yang tepat.');
  }

  if (cadangan.length === 0) {
    cadangan.push('Prestasi kempen berada dalam tahap normal. Teruskan memantau data harian dan kemaskini dashboard secara konsisten untuk analisa yang lebih tepat.');
  }

  return cadangan;
}

async function exportPDF() {
  showToast('Menyediakan PDF...', 'info');
  showLoading();

  try {
    const now = nowMY();
    const periodeLabel = getPeriodLabel(currentFilter);

    // Calculate KPIs
    const totalSale = saleData.reduce((s, d) => s + (d.total_sale || 0), 0);
    const totalLeadClose = saleData.reduce((s, d) => s + (d.lead_close || 0), 0);
    const totalLeadMasuk = saleData.reduce((s, d) => s + (d.lead_masuk || 0), 0);
    const totalAdSpend = marketingData.reduce((s, d) => s + (d.ad_spend || 0), 0);
    const totalSpendSST = marketingData.reduce((s, d) => s + (d.spend_sst || 0), 0);
    const totalLeadAds = marketingData.reduce((s, d) => s + (d.message_leads || 0), 0);
    const cpl = calculateCPL(marketingData);
    const closingRate = totalLeadMasuk > 0 ? (totalLeadClose / totalLeadMasuk) * 100 : 0;
    const roas = totalSpendSST > 0 ? totalSale / totalSpendSST : 0;

    const cadangan = generateCadangan({
      cpl,
      benchmarkCPL: tetapan?.benchmark_cpl || 0,
      closingRate,
      roas,
      totalLead: totalLeadClose,
      totalSale,
      totalSpend: totalSpendSST
    });

    // Build HTML untuk PDF
    const pdfContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 32px; }
          h1 { font-size: 24px; color: #C9A84C; letter-spacing: 3px; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 11px; margin-bottom: 24px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
          .client-info { }
          .client-name { font-size: 18px; font-weight: bold; }
          .period-tag { background: #C9A84C; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; margin-top: 4px; display: inline-block; }
          .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; color: #666; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #C9A84C; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .kpi-box-label { font-size: 10px; color: #666; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
          .kpi-box-value { font-size: 18px; font-weight: bold; }
          .kpi-box-sub { font-size: 10px; color: #666; margin-top: 2px; }
          .cadangan-list { list-style: none; }
          .cadangan-item { padding: 12px; background: #f9f9f9; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #C9A84C; font-size: 12px; line-height: 1.6; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #999; font-size: 10px; display: flex; justify-content: space-between; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          .table th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #666; border-bottom: 1px solid #e5e7eb; }
          .table td { padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>TRACKPO</h1>
            <div class="subtitle">Laporan Prestasi Pemasaran Digital</div>
          </div>
          <div class="client-info" style="text-align:right;">
            <div class="client-name">${currentClient?.nama_bisnes || '-'}</div>
            <div class="period-tag">${periodeLabel}</div>
            <div style="font-size:10px;color:#666;margin-top:6px;">Dijana: ${now.toLocaleDateString('ms-MY', { timeZone: TZ })}</div>
          </div>
        </div>

        <div class="section-title">Ringkasan Prestasi</div>
        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-box-label">Total Sale</div>
            <div class="kpi-box-value">${formatRM(totalSale)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">Ad Spend+SST</div>
            <div class="kpi-box-value">${formatRM(totalSpendSST)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">Lead Real</div>
            <div class="kpi-box-value">${formatNumber(totalLeadClose)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">CPL Real</div>
            <div class="kpi-box-value">${formatRM(cpl)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">ROAS</div>
            <div class="kpi-box-value">${roas.toFixed(2)}x</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">Closing Rate</div>
            <div class="kpi-box-value">${formatPercent(closingRate)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">Lead Ads</div>
            <div class="kpi-box-value">${formatNumber(totalLeadAds)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-box-label">Ad Spend</div>
            <div class="kpi-box-value">${formatRM(totalAdSpend)}</div>
          </div>
        </div>

        <div class="section-title" style="margin-top:20px;">Cadangan Marketing Ke Depan</div>
        <ul class="cadangan-list">
          ${cadangan.map(c => `<li class="cadangan-item">• ${c}</li>`).join('')}
        </ul>

        <div style="margin-top:20px;" class="section-title">Data Sale (Terkini 10 Rekod)</div>
        <table class="table">
          <thead>
            <tr>
              <th>Tarikh</th>
              <th>Lead Masuk</th>
              <th>Lead Close</th>
              <th>Closing Rate</th>
              <th>Total Sale</th>
            </tr>
          </thead>
          <tbody>
            ${saleData.slice(0, 10).map(d => `
              <tr>
                <td>${formatDate(d.tarikh)}</td>
                <td>${d.lead_masuk || 0}</td>
                <td>${d.lead_close || 0}</td>
                <td>${formatPercent(d.closing_rate)}</td>
                <td>${formatRM(d.total_sale)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <span>TRACKPO v2 | Aipromarketing</span>
          <span>Laporan ini dijana secara automatik. Semua data adalah sulit.</span>
        </div>
      </body>
      </html>
    `;

    // Open in new window untuk print/save as PDF
    const win = window.open('', '_blank');
    win.document.write(pdfContent);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);

    hideLoading();
    showToast('PDF dibuka. Gunakan "Save as PDF" dalam dialog print.', 'info', 5000);

  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('Gagal jana PDF: ' + err.message, 'error');
  }
}
