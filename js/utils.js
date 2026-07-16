// ===== TRACKPO — UTILITY FUNCTIONS =====

// ===== FORMAT FUNCTIONS =====
function formatRM(value) {
  if (!value && value !== 0) return 'RM 0.00';
  return 'RM ' + Number(value).toLocaleString('ms-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatNumber(value) {
  if (!value && value !== 0) return '0';
  return Number(value).toLocaleString('ms-MY');
}

function formatPercent(value) {
  if (!value && value !== 0) return '0%';
  return Number(value).toFixed(1) + '%';
}

// ===== DATE FUNCTIONS =====
// Ambil tarikh semasa dalam timezone Malaysia
function nowMY() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

// Format tarikh untuk display (DD/MM/YYYY)
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ms-MY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ
  });
}

// Format tarikh untuk display panjang (1 Julai 2026)
function formatDateLong(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ms-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ
  });
}

// Format untuk input[type=date] (YYYY-MM-DD)
function toInputDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Nama bulan dalam BM
const BULAN_MY = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
];

function getBulanTahun(date) {
  const d = date || nowMY();
  return `${BULAN_MY[d.getMonth()]} ${d.getFullYear()}`;
}

// ===== DATE FILTER LOGIC =====
// PENTING: Bulan Ini = 1hb hingga 30/31hb bulan penuh (BUKAN hari ini)
function getDateRange(filter, customStart, customEnd) {
  const now = nowMY();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  let start, end;

  switch (filter) {
    case 'harini':
      start = new Date(year, month, day, 0, 0, 0);
      end = new Date(year, month, day, 23, 59, 59);
      break;

    case 'semalam':
      start = new Date(year, month, day - 1, 0, 0, 0);
      end = new Date(year, month, day - 1, 23, 59, 59);
      break;

    case '7hari':
      start = new Date(year, month, day - 6, 0, 0, 0);
      end = new Date(year, month, day, 23, 59, 59);
      break;

    case 'bulan-ini':
      // BETUL: 1hb hingga last day bulan ini
      start = new Date(year, month, 1, 0, 0, 0);
      end = new Date(year, month + 1, 0, 23, 59, 59); // Last day of month
      break;

    case 'bulan-lepas':
      start = new Date(year, month - 1, 1, 0, 0, 0);
      end = new Date(year, month, 0, 23, 59, 59); // Last day of previous month
      break;

    case 'semua':
      return { start: null, end: null };

    case 'custom':
      if (!customStart || !customEnd) return { start: null, end: null };
      start = new Date(customStart + 'T00:00:00');
      end = new Date(customEnd + 'T23:59:59');
      break;

    default:
      start = new Date(year, month, 1, 0, 0, 0);
      end = new Date(year, month + 1, 0, 23, 59, 59);
  }

  return {
    start: toInputDate(start),
    end: toInputDate(end)
  };
}

// Label tempoh untuk display
function getPeriodLabel(filter, customStart, customEnd) {
  const now = nowMY();

  switch (filter) {
    case 'harini': return 'Hari Ini';
    case 'semalam': return 'Semalam';
    case '7hari': return '7 Hari Lepas';
    case 'bulan-ini': return getBulanTahun(now);
    case 'bulan-lepas':
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return getBulanTahun(prev);
    case 'semua': return 'Semua Masa';
    case 'custom':
      if (customStart && customEnd) {
        return `${formatDate(customStart)} — ${formatDate(customEnd)}`;
      }
      return 'Tempoh Custom';
    default: return getBulanTahun(now);
  }
}

// Kiraan hari antara dua tarikh
function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
}

// Berapa hari sejak tarikh
function daysSince(dateStr) {
  if (!dateStr) return 999;
  const then = new Date(dateStr);
  const now = nowMY();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ===== CPL CALCULATION =====
// Exclude hari lead = 0, guna Ad Spend sahaja (bukan +SST)
function calculateCPL(marketingData) {
  const days = marketingData.filter(d => d.message_leads > 0);
  if (days.length === 0) return 0;

  const totalSpend = days.reduce((sum, d) => sum + (d.ad_spend || 0), 0);
  const totalLeads = days.reduce((sum, d) => sum + (d.message_leads || 0), 0);

  return totalLeads > 0 ? totalSpend / totalLeads : 0;
}

// ===== HEALTH SCORE =====
function calculateHealthScore(data) {
  const { cplBenchmark, actualCPL, closingRate, inputDays, totalDaysInMonth } = data;
  let score = 0;

  // CPL vs Benchmark (40%)
  if (cplBenchmark > 0 && actualCPL > 0) {
    const cplRatio = cplBenchmark / actualCPL;
    const cplScore = Math.min(cplRatio * 40, 40);
    score += cplScore;
  } else if (cplBenchmark === 0) {
    score += 20; // Neutral if no benchmark set
  }

  // Closing Rate (35%)
  if (closingRate >= 30) score += 35;
  else if (closingRate >= 20) score += 28;
  else if (closingRate >= 10) score += 18;
  else if (closingRate > 0) score += 8;

  // Consistency input (25%)
  if (totalDaysInMonth > 0) {
    const consistency = (inputDays / totalDaysInMonth) * 25;
    score += Math.min(consistency, 25);
  }

  return Math.round(Math.min(score, 100));
}

function getHealthLabel(score) {
  if (score >= 80) return { label: 'Excellent', class: 'health-excellent' };
  if (score >= 60) return { label: 'Good', class: 'health-good' };
  if (score >= 40) return { label: 'Average', class: 'health-average' };
  return { label: 'Needs Attention', class: 'health-poor' };
}

// ===== ROAS BADGE =====
function getROASBadge(roas) {
  if (roas >= 3) return { text: 'Excellent', class: 'badge-green' };
  if (roas >= 2) return { text: 'Good', class: 'badge-gold' };
  if (roas >= 1) return { text: 'Break-even', class: 'badge-yellow' };
  return { text: 'Loss', class: 'badge-red' };
}

// ===== BALANCE BADGE =====
function getBalanceBadge(balance, threshold) {
  if (balance <= 0) return { text: 'Habis', class: 'badge-red' };
  if (threshold && balance <= threshold) return { text: 'Rendah', class: 'badge-yellow' };
  return { text: 'OK', class: 'badge-green' };
}

// ===== % CHANGE =====
function percentChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatChange(pct, lowerIsBetter = false) {
  if (pct === null || pct === undefined) return { text: '→ -', class: 'flat' };
  const abs = Math.abs(pct).toFixed(1);
  if (Math.abs(pct) < 0.1) return { text: '→ Tiada perubahan', class: 'flat' };

  const isUp = pct > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;

  return {
    text: `${isUp ? '↑' : '↓'} ${abs}%`,
    class: isGood ? 'up' : 'down'
  };
}

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== LOADING OVERLAY =====
function showLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.add('show');
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.remove('show');
}

// ===== THEME =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'dark');
  localStorage.setItem('trackpo_theme', theme || 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('trackpo_theme') || 'light';
  applyTheme(saved);
  return saved;
}

// ===== SHARE WHATSAPP =====
function generateWAText(data) {
  const { nama, periodeLabel, spend, lead, cpl, sale, leadChange, cplChange, saleChange } = data;

  const leadChangeText = leadChange !== null ? `${leadChange >= 0 ? '↑' : '↓'} ${Math.abs(leadChange).toFixed(1)}%` : '-';
  const cplChangeText = cplChange !== null ? `${cplChange >= 0 ? '↑' : '↓'} ${Math.abs(cplChange).toFixed(1)}%` : '-';
  const saleChangeText = saleChange !== null ? `${saleChange >= 0 ? '↑' : '↓'} ${Math.abs(saleChange).toFixed(1)}%` : '-';

  return `📊 *RINGKASAN MINGGUAN*
${nama} | ${periodeLabel}

💰 Ad Spend+SST : ${formatRM(spend)}
👥 Lead Real     : ${formatNumber(lead)} lead
📉 CPL Real      : ${formatRM(cpl)}
💵 Total Sale    : ${formatRM(sale)}

📈 vs Minggu Lepas:
• Lead  : ${leadChangeText}
• CPL   : ${cplChangeText}
• Sale  : ${saleChangeText}

_Dijana oleh TRACKPO | Aipromarketing_`;
}

// ===== CONFIRM DIALOG =====
function confirmAction(message) {
  return window.confirm(message);
}

// ===== DEBOUNCE =====
function debounce(fn, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
