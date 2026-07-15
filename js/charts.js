// ===== TRACKPO — CHARTS =====

let mainChartInstance = null;
let sebabChartInstance = null;
let compChartInstance = null;

const CHART_COLORS = {
  gold: '#C9A84C',
  blue: '#58A6FF',
  green: '#3FB950',
  red: '#F85149',
  purple: '#BC8CFF',
  orange: '#F0A500'
};

// Default Chart.js global settings
Chart.defaults.color = '#8A8A8A';
Chart.defaults.borderColor = '#2A2A2A';
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 11;

// ===== MAIN CHART =====
function renderCharts() {
  switch (currentChartTab) {
    case 'sale-lead': renderSaleLeadChart(); break;
    case 'ad-performance': renderAdPerformanceChart(); break;
    case 'closing': renderClosingChart(); break;
    case 'sebab': renderSebabChart(); break;
  }
  renderSebabPieChart();
}

function getGroupedLabels() {
  // Ambil semua tarikh unik dari sale dan marketing
  const dates = new Set();
  saleData.forEach(d => dates.add(d.tarikh));
  marketingData.forEach(d => dates.add(d.tarikh_mula));

  const sorted = Array.from(dates).sort();

  if (currentGroupBy === 'tarikh') {
    return sorted;
  } else if (currentGroupBy === 'minggu') {
    const weeks = new Set();
    sorted.forEach(d => {
      const date = new Date(d);
      const monday = new Date(date);
      monday.setDate(date.getDate() - date.getDay() + 1);
      weeks.add(toInputDate(monday));
    });
    return Array.from(weeks).sort();
  } else if (currentGroupBy === 'bulan') {
    const months = new Set();
    sorted.forEach(d => {
      months.add(d.substring(0, 7)); // YYYY-MM
    });
    return Array.from(months).sort();
  }

  return sorted;
}

function sumForLabel(data, label, field, dateField = 'tarikh') {
  let filtered;
  if (currentGroupBy === 'tarikh') {
    filtered = data.filter(d => (d[dateField] || '').startsWith(label));
  } else if (currentGroupBy === 'minggu') {
    const weekEnd = new Date(label);
    weekEnd.setDate(weekEnd.getDate() + 6);
    filtered = data.filter(d => {
      const dDate = d[dateField];
      return dDate >= label && dDate <= toInputDate(weekEnd);
    });
  } else if (currentGroupBy === 'bulan') {
    filtered = data.filter(d => (d[dateField] || '').startsWith(label));
  } else {
    filtered = data.filter(d => (d[dateField] || '').startsWith(label));
  }
  return filtered.reduce((s, d) => s + (d[field] || 0), 0);
}

function formatLabel(label) {
  if (currentGroupBy === 'bulan') {
    const [year, month] = label.split('-');
    const months = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogs','Sep','Okt','Nov','Dis'];
    return `${months[parseInt(month) - 1]} ${year.substring(2)}`;
  } else if (currentGroupBy === 'minggu') {
    return `${formatDate(label)}`;
  }
  return formatDate(label);
}

function renderSaleLeadChart() {
  const labels = getGroupedLabels();
  const saleValues = labels.map(l => sumForLabel(saleData, l, 'total_sale', 'tarikh'));
  const leadValues = labels.map(l => sumForLabel(saleData, l, 'lead_close', 'tarikh'));

  destroyChart('mainChart');

  const ctx = document.getElementById('mainChart')?.getContext('2d');
  if (!ctx) return;

  mainChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(formatLabel),
      datasets: [
        {
          label: 'Total Sale (RM)',
          data: saleValues,
          backgroundColor: 'rgba(201,168,76,0.3)',
          borderColor: CHART_COLORS.gold,
          borderWidth: 1.5,
          yAxisID: 'y',
          order: 2
        },
        {
          label: 'Lead Close',
          data: leadValues,
          type: 'line',
          borderColor: CHART_COLORS.blue,
          backgroundColor: 'rgba(88,166,255,0.1)',
          pointBackgroundColor: CHART_COLORS.blue,
          fill: false,
          tension: 0.4,
          yAxisID: 'y1',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label.includes('Sale')) {
                return ` Sale: ${formatRM(ctx.raw)}`;
              }
              return ` Lead: ${ctx.raw}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          position: 'left',
          ticks: {
            callback: v => 'RM' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { callback: v => v + ' lead' }
        }
      }
    }
  });
}

function renderAdPerformanceChart() {
  const labels = getGroupedLabels();
  const spendValues = labels.map(l => sumForLabel(marketingData, l, 'ad_spend', 'tarikh_mula'));
  const sstValues = labels.map(l => sumForLabel(marketingData, l, 'spend_sst', 'tarikh_mula'));

  destroyChart('mainChart');
  const ctx = document.getElementById('mainChart')?.getContext('2d');
  if (!ctx) return;

  mainChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(formatLabel),
      datasets: [
        {
          label: 'Ad Spend (RM)',
          data: spendValues,
          backgroundColor: 'rgba(201,168,76,0.3)',
          borderColor: CHART_COLORS.gold,
          borderWidth: 1.5
        },
        {
          label: 'Spend+SST (RM)',
          data: sstValues,
          backgroundColor: 'rgba(240,165,0,0.2)',
          borderColor: CHART_COLORS.orange,
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
            callback: v => 'RM' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)
          }
        }
      }
    }
  });
}

function renderClosingChart() {
  const labels = getGroupedLabels();
  const closingValues = labels.map(l => {
    const dayData = saleData.filter(d => (d.tarikh || '').startsWith(l));
    const totalMasuk = dayData.reduce((s, d) => s + (d.lead_masuk || 0), 0);
    const totalClose = dayData.reduce((s, d) => s + (d.lead_close || 0), 0);
    return totalMasuk > 0 ? +((totalClose / totalMasuk) * 100).toFixed(1) : 0;
  });

  destroyChart('mainChart');
  const ctx = document.getElementById('mainChart')?.getContext('2d');
  if (!ctx) return;

  mainChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(formatLabel),
      datasets: [{
        label: 'Closing Rate (%)',
        data: closingValues,
        borderColor: CHART_COLORS.green,
        backgroundColor: 'rgba(63,185,80,0.1)',
        pointBackgroundColor: CHART_COLORS.green,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` Closing: ${ctx.raw}%`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: 0, max: 100,
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
}

function renderSebabChart() {
  // Bar chart sebab tak close
  const sebabCount = {};
  saleData.forEach(d => {
    const sebab = d.sebab_tak_close || [];
    sebab.forEach(s => {
      sebabCount[s] = (sebabCount[s] || 0) + 1;
    });
  });

  const sorted = Object.entries(sebabCount).sort((a, b) => b[1] - a[1]);

  destroyChart('mainChart');
  const ctx = document.getElementById('mainChart')?.getContext('2d');
  if (!ctx) return;

  mainChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{
        label: 'Kekerapan',
        data: sorted.map(([, v]) => v),
        backgroundColor: [
          'rgba(248,81,73,0.4)', 'rgba(240,165,0,0.4)',
          'rgba(88,166,255,0.4)', 'rgba(201,168,76,0.4)', 'rgba(63,185,80,0.4)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { ticks: { stepSize: 1 } },
        y: { grid: { display: false } }
      }
    }
  });
}

// Pie chart kecil untuk sebab tak close dalam best day section
function renderSebabPieChart() {
  const sebabCount = {};
  saleData.forEach(d => {
    const sebab = d.sebab_tak_close || [];
    sebab.forEach(s => { sebabCount[s] = (sebabCount[s] || 0) + 1; });
  });

  const labels = Object.keys(sebabCount);
  const values = Object.values(sebabCount);

  if (labels.length === 0) return;

  const ctx = document.getElementById('sebabChart')?.getContext('2d');
  if (!ctx) return;

  if (sebabChartInstance) sebabChartInstance.destroy();

  sebabChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          'rgba(248,81,73,0.7)', 'rgba(240,165,0,0.7)',
          'rgba(88,166,255,0.7)', 'rgba(201,168,76,0.7)', 'rgba(63,185,80,0.7)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { padding: 10, font: { size: 10 } } }
      }
    }
  });
}

function destroyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}
