/**
 * ============================================================================
 * SimulasiTKD Pro — js/admin.js
 * Panel Kontrol Admin (Sesuai Stitch Screen #5 & #6 + Modul WA/CRM + Rahasia + Migrasi)
 * ============================================================================
 */

const AdminPanel = (function () {
  let state = {
    tab: 'overview', // overview | questions | crm | security
    mobileSidebarOpen: false,
    overview: null,
    upgradeFilter: 'Semua',
    upgradeSearch: '',
    qData: { paket: [], soal: [] },
    selectedPaketId: 'PKT-001',
    qSubtesFilter: 'Semua',
    qSearch: '',
    editingSoal: null,
    reports: { users: [], hasil: [] },
    repFilterPaket: '',
    repFilterStatus: '',
    repSearch: '',
    crm: { kontak: [], blasts: [], antrian: [] },
    notifCfg: null,
    secretsData: null,
    adminEmailsData: null,
    userSearch: '',
    userRoleFilter: 'Semua',
    migrationResult: null
  };

  let charts = [];

  function destroyCharts() {
    charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    charts = [];
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getFilteredReports() {
    return (state.reports.hasil || []).filter(function (h) {
      const mp = !state.repFilterPaket || h.paket_id === state.repFilterPaket;
      const ms = !state.repFilterStatus || h.status_kelulusan === state.repFilterStatus;
      const mq = !state.repSearch || String(h.nama_user).toLowerCase().includes(state.repSearch.toLowerCase());
      return mp && ms && mq;
    });
  }

  function refocusInput(id, cursorPos) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    const pos = typeof cursorPos === 'number' ? cursorPos : el.value.length;
    try { el.setSelectionRange(pos, pos); } catch (e) {}
  }

  /** Parser CSV standar RFC-4180 (otomatis deteksi koma `,` atau titik koma `;` Excel Indonesia) */
  function parseCsvQuestions(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const firstLine = clean.split(/\r?\n/)[0] || '';
    const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    const rows = [];
    let cur = [], field = '', inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      const next = clean[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delim) { cur.push(field.trim()); field = ''; }
        else if (ch === '\n' || (ch === '\r' && next === '\n')) {
          if (ch === '\r') i++;
          cur.push(field.trim());
          if (cur.some(function (x) { return x !== ''; })) rows.push(cur);
          cur = []; field = '';
        } else if (ch !== '\r') { field += ch; }
      }
    }
    cur.push(field.trim());
    if (cur.some(function (x) { return x !== ''; })) rows.push(cur);
    if (rows.length < 2) return [];

    const headers = rows[0].map(function (h) { return h.toLowerCase().trim(); });
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const obj = {};
      headers.forEach(function (h, idx) { obj[h] = rows[r][idx] || ''; });
      if (!obj.pertanyaan) continue;
      out.push({
        subtes: String(obj.subtes || 'TWK').toUpperCase().trim(),
        topik: obj.topik || '',
        pertanyaan: obj.pertanyaan,
        drive_image_id: obj.drive_image_id || '',
        opsi_a: obj.opsi_a || '',
        opsi_b: obj.opsi_b || '',
        opsi_c: obj.opsi_c || '',
        opsi_d: obj.opsi_d || '',
        opsi_e: obj.opsi_e || '',
        kunci_atau_bobot: obj.kunci_atau_bobot || (String(obj.subtes).toUpperCase() === 'TKP' ? 'A:5,B:4,C:3,D:2,E:1' : 'A'),
        pembahasan: obj.pembahasan || ''
      });
    }
    return out;
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(iso).slice(0, 16); }
  }

  async function render(root, tab) {
    if (tab) state.tab = tab;
    destroyCharts();
    paintShell(root);

    try {
      if (state.tab === 'overview') {
        state.overview = await ApiClient.call('admin.overview');
        paintShell(root);
        mountOverviewCharts();
      } else if (state.tab === 'questions') {
        const [qd, rep] = await Promise.all([
          ApiClient.call('admin.getQuestions', { paket_id: '' }),
          ApiClient.call('admin.getReports')
        ]);
        state.qData = qd;
        state.reports = rep;
        if (qd.paket.length && !qd.paket.some(function (p) { return p.paket_id === state.selectedPaketId; })) {
          state.selectedPaketId = qd.paket[0].paket_id;
        }
        const firstSoal = qd.soal.find(function (s) { return s.paket_id === state.selectedPaketId; });
        if (!state.editingSoal && firstSoal) state.editingSoal = Object.assign({}, firstSoal);
        paintShell(root);
      } else if (state.tab === 'crm') {
        const [crm, cfg] = await Promise.all([
          ApiClient.call('admin.crmList'),
          ApiClient.call('admin.notifConfig')
        ]);
        state.crm = crm;
        state.notifCfg = cfg;
        paintShell(root);
      } else if (state.tab === 'security') {
        state.secretsData = await ApiClient.call('admin.getSecrets');
        paintShell(root);
      } else if (state.tab === 'admins') {
        state.adminEmailsData = await ApiClient.call('admin.getAdminEmails');
        paintShell(root);
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function paintShell(root) {
    const pendingCount = (state.overview && state.overview.kpi && state.overview.kpi.pendingUpgrade) || 0;
    const savedAdmin = ApiClient.getSavedUser() || {};
    const adminInitials = String(savedAdmin.nama_lengkap || 'AD').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    const navItems = [
      { id: 'overview', label: 'Ringkasan Analitik', icon: 'bar-chart-3', badge: pendingCount > 0 ? pendingCount : '' },
      { id: 'questions', label: 'Bank Soal & Paket', icon: 'file-question' },
      { id: 'crm', label: 'Notifikasi WA & CRM', icon: 'message-square-text' },
      { id: 'admins', label: 'Kelola Admin (Email)', icon: 'user-cog' },
      { id: 'security', label: 'Keamanan & Migrasi', icon: 'shield-check' }
    ];

    const navHtml = navItems.map(function (item) {
      const active = state.tab === item.id;
      return `
        <button onclick="AdminPanel.switchTab('${item.id}')"
          class="admin-nav-link ${active ? 'active' : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'} w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-left">
          <span class="flex items-center gap-3">
            <i data-lucide="${item.icon}" class="w-4 h-4"></i>
            ${item.label}
          </span>
          ${item.badge ? `<span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#22A06B] text-white">${item.badge}</span>` : ''}
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="min-h-screen flex bg-[#F7FAF8]">
        <!-- Desktop Sidebar (#0E3B2C sesuai Stitch #5 & #6) -->
        <aside class="hidden lg:flex lg:flex-col w-60 bg-[#0E3B2C] text-white fixed inset-y-0 left-0 z-30 no-print">
          <div class="h-16 px-5 flex items-center gap-3 border-b border-white/10">
            <div class="w-9 h-9 rounded-xl bg-white text-[#0E3B2C] flex items-center justify-center font-bold">
              <i data-lucide="shield-check" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="font-heading font-bold text-sm leading-tight">Admin Panel</div>
              <div class="text-[11px] text-emerald-200/80">SimulasiTKD Pro</div>
            </div>
          </div>
          <nav class="flex-1 p-3 space-y-1.5">${navHtml}</nav>
          <div class="p-3 border-t border-white/10 space-y-1">
            <button onclick="App.go('dashboard')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-emerald-100/80 hover:bg-white/10 hover:text-white">
              <i data-lucide="eye" class="w-4 h-4"></i> Lihat Portal Peserta
            </button>
            <button onclick="App.logout()" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-rose-200 hover:bg-rose-500/20">
              <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
            </button>
          </div>
        </aside>

        <!-- Mobile Drawer -->
        ${state.mobileSidebarOpen ? `
          <div class="fixed inset-0 z-50 lg:hidden flex">
            <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick="AdminPanel.toggleSidebar(false)"></div>
            <aside class="relative w-64 max-w-[80vw] bg-[#0E3B2C] text-white flex flex-col z-10">
              <div class="h-16 px-5 flex items-center justify-between border-b border-white/10">
                <span class="font-heading font-bold">Admin Panel</span>
                <button onclick="AdminPanel.toggleSidebar(false)" class="p-1.5 rounded-lg hover:bg-white/10"><i data-lucide="x" class="w-5 h-5"></i></button>
              </div>
              <nav class="flex-1 p-3 space-y-1.5">${navHtml}</nav>
              <div class="p-3 border-t border-white/10">
                <button onclick="App.logout()" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-rose-200 hover:bg-rose-500/20">
                  <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
                </button>
              </div>
            </aside>
          </div>
        ` : ''}

        <!-- Main Content Area -->
        <div class="flex-1 lg:pl-60 flex flex-col min-w-0">
          <header class="h-16 bg-white border-b border-[#E2E8F0] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-20 no-print">
            <div class="flex items-center gap-3">
              <button onclick="AdminPanel.toggleSidebar(true)" class="lg:hidden p-2 rounded-xl border border-[#E2E8F0] text-[#0E3B2C]">
                <i data-lucide="menu" class="w-5 h-5"></i>
              </button>
              <div class="flex items-center gap-2 font-heading font-bold text-[#0E3B2C]">
                <span class="w-7 h-7 rounded-lg bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="graduation-cap" class="w-4 h-4"></i></span>
                SimulasiTKD Pro
              </div>
              ${ApiClient.isDemoMode() ? '<span class="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF9C3] text-[#854D0E]">Mode Demo Lokal</span>' : ''}
            </div>
            <div class="flex items-center gap-3">
              <button onclick="AdminPanel.refresh()" class="p-2 rounded-full border border-[#E2E8F0] text-[#4B5563] hover:bg-[#F7FAF8]" title="Segarkan Data">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              </button>
              <div class="hidden sm:block text-right">
                <div class="text-xs font-bold text-[#111827] leading-tight">${esc(savedAdmin.nama_lengkap || 'Admin')}</div>
                <div class="text-[11px] text-[#64748B] leading-tight">${esc(savedAdmin.email || '')}</div>
              </div>
              <div class="w-9 h-9 rounded-full bg-[#0E3B2C] text-white flex items-center justify-center text-xs font-bold">${esc(adminInitials)}</div>
            </div>
          </header>

          <main class="p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
            ${state.tab === 'overview' ? renderOverview() : ''}
            ${state.tab === 'questions' ? renderQuestionsAndReports() : ''}
            ${state.tab === 'crm' ? renderCrmWa() : ''}
            ${state.tab === 'admins' ? renderAdminEmails() : ''}
            ${state.tab === 'security' ? renderSecurityMigration() : ''}
          </main>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // TAB 1: RINGKASAN ANALITIK & ANTREAN PERSETUJUAN PRO (Stitch Screen #5)
  // --------------------------------------------------------------------------
  function renderOverview() {
    if (!state.overview) {
      return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div>
      </div>`;
    }
    const k = state.overview.kpi;
    const list = (state.overview.upgrades || []).filter(function (r) {
      const matchStatus = state.upgradeFilter === 'Semua' || r.status_verifikasi === state.upgradeFilter;
      const q = state.upgradeSearch.toLowerCase();
      const matchQ = !q || String(r.nama_user).toLowerCase().includes(q) || String(r.email_user).toLowerCase().includes(q);
      return matchStatus && matchQ;
    });

    const rowsHtml = list.length ? list.map(function (r) {
      const initials = String(r.nama_user || 'U').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      const badgeCls = r.status_verifikasi === 'Approved' ? 'bg-[#DCFCE7] text-[#166534]'
        : r.status_verifikasi === 'Rejected' ? 'bg-[#FEE2E2] text-[#991B1B]'
        : 'bg-[#FEF9C3] text-[#854D0E]';
      return `
        <tr class="border-t border-[#E2E8F0] hover:bg-[#F7FAF8]">
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-[#E8F5EE] text-[#0E3B2C] font-bold text-xs flex items-center justify-center shrink-0">${esc(initials)}</div>
              <div>
                <div class="font-semibold text-sm text-[#111827]">${esc(r.nama_user)}</div>
                <div class="text-xs text-[#64748B] sm:hidden">${esc(r.email_user)}</div>
              </div>
            </div>
          </td>
          <td class="py-3.5 px-4 text-sm text-[#4B5563] hidden sm:table-cell">${esc(r.email_user)}</td>
          <td class="py-3.5 px-4 text-xs text-[#4B5563] hidden md:table-cell">${fmtDate(r.tanggal_request)}</td>
          <td class="py-3.5 px-4">
            <button onclick="AdminPanel.previewProof('${esc(r.req_id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#111827] hover:bg-[#F7FAF8]">
              <i data-lucide="file-image" class="w-3.5 h-3.5 text-[#1F8A5B]"></i> Lihat Bukti
            </button>
          </td>
          <td class="py-3.5 px-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badgeCls}">${esc(r.status_verifikasi)}</span></td>
          <td class="py-3.5 px-4 text-right">
            ${r.status_verifikasi === 'Pending' ? `
              <div class="inline-flex items-center gap-2">
                <button onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Approved')" class="px-3.5 py-1.5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold">Setujui Pro</button>
                <button onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Rejected')" class="px-3.5 py-1.5 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold">Tolak</button>
              </div>
            ` : `<span class="text-xs text-[#64748B]">${esc(r.catatan_admin || 'Selesai')}</span>`}
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="6" class="py-10 text-center text-sm text-[#64748B]">Semua pengajuan upgrade sudah diproses atau tidak ada data cocok.</td></tr>`;

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">Panel Kontrol Admin</div>
          <h1 class="text-2xl sm:text-3xl font-heading font-bold text-[#111827] mt-1">Ringkasan Analitik &amp; Antrean Pro</h1>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="AdminPanel.switchTab('questions')" class="btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-2">
            <i data-lucide="download" class="w-4 h-4"></i> Ekspor Laporan
          </button>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-stitch p-5">
          <div class="flex items-center justify-between text-xs font-medium text-[#4B5563]">Total Peserta <span class="w-8 h-8 rounded-lg bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="users" class="w-4 h-4"></i></span></div>
          <div class="text-3xl font-heading font-bold tabular-nums mt-3">${k.totalPeserta}</div>
          <div class="text-xs text-[#166534] mt-2"><span class="px-2 py-0.5 rounded-full bg-[#DCFCE7] font-semibold">Aktif</span> terdaftar di sistem</div>
        </div>
        <div class="card-stitch p-5">
          <div class="flex items-center justify-between text-xs font-medium text-[#4B5563]">Akun Pro Aktif <span class="w-8 h-8 rounded-lg bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="badge-check" class="w-4 h-4"></i></span></div>
          <div class="text-3xl font-heading font-bold tabular-nums mt-3">${k.totalPro}</div>
          <div class="text-xs text-[#4B5563] mt-2"><span class="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] font-semibold">${k.rasioPro}%</span> rasio konversi Pro</div>
        </div>
        <div class="card-stitch p-5">
          <div class="flex items-center justify-between text-xs font-medium text-[#4B5563]">Antrean Upgrade <span class="w-8 h-8 rounded-lg bg-[#FEF9C3] text-[#D97706] flex items-center justify-center"><i data-lucide="hourglass" class="w-4 h-4"></i></span></div>
          <div class="flex items-center gap-2 mt-3">
            <span class="text-3xl font-heading font-bold tabular-nums">${k.pendingUpgrade}</span>
            <span class="px-2 py-0.5 rounded-full bg-[#FEF9C3] text-[#854D0E] text-xs font-semibold">Pending</span>
          </div>
          <div class="text-xs text-[#64748B] mt-2">Menunggu verifikasi admin</div>
        </div>
        <div class="card-stitch p-5">
          <div class="flex items-center justify-between text-xs font-medium text-[#4B5563]">Tingkat Kelulusan <span class="w-8 h-8 rounded-lg bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="award" class="w-4 h-4"></i></span></div>
          <div class="text-3xl font-heading font-bold tabular-nums mt-3">${k.passRate}%</div>
          <div class="text-xs text-[#4B5563] mt-2"><span class="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] font-semibold">Lulus PG</span> standar BKN</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="card-stitch p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <h3 class="font-heading font-bold text-base">Distribusi Tier Akun</h3>
            <p class="text-xs text-[#64748B]">Perbandingan Akun Latihan vs Akun Pro</p>
          </div>
          <div class="flex items-center gap-6 mt-4">
            <div class="w-36 h-36 relative shrink-0"><canvas id="chartAdminTier"></canvas></div>
            <div class="space-y-3 flex-1 text-xs">
              <div class="p-3 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0] flex items-center justify-between">
                <div><div class="font-bold text-[#0E3B2C]">Akun Pro</div><div class="text-[#64748B]">Akses penuh</div></div>
                <div class="text-base font-bold tabular-nums">${k.totalPro}</div>
              </div>
              <div class="p-3 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0] flex items-center justify-between">
                <div><div class="font-bold text-[#1F8A5B]">Akun Latihan</div><div class="text-[#64748B]">Gratis terbatas</div></div>
                <div class="text-base font-bold tabular-nums">${k.totalLatihan}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card-stitch p-5 lg:col-span-7">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="font-heading font-bold text-base">Aktivitas Ujian &amp; Kelulusan Mingguan</h3>
              <p class="text-xs text-[#64748B]">Jumlah peserta ujian CAT dan rasio kelulusan 7 hari terakhir</p>
            </div>
          </div>
          <div class="h-44"><canvas id="chartAdminWeekly"></canvas></div>
        </div>
      </div>

      <!-- Antrean Persetujuan Upgrade Pro -->
      <div class="card-stitch p-5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h3 class="font-heading font-bold text-lg">Antrean Persetujuan Upgrade Pro</h3>
            <p class="text-xs text-[#64748B]">Verifikasi bukti transfer peserta untuk mengaktifkan akses Tryout Pro secara instan.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input id="adm-upg-search" type="text" value="${esc(state.upgradeSearch)}" oninput="AdminPanel.setUpgradeSearch(this.value, this.selectionStart)" placeholder="Cari nama atau email..."
              class="px-3.5 py-2 text-xs rounded-full border border-[#E2E8F0] bg-[#F7FAF8] w-48" />
            ${['Semua', 'Pending', 'Approved', 'Rejected'].map(function (st) {
              const active = state.upgradeFilter === st;
              return `<button onclick="AdminPanel.setUpgradeFilter('${st}')" class="px-3.5 py-1.5 rounded-full text-xs font-semibold ${active ? 'bg-[#0E3B2C] text-white' : 'bg-[#F7FAF8] text-[#4B5563] hover:bg-[#E8F5EE]'}">${st}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                <th class="py-3 px-4 rounded-l-lg">Peserta</th>
                <th class="py-3 px-4 hidden sm:table-cell">Email</th>
                <th class="py-3 px-4 hidden md:table-cell">Tanggal</th>
                <th class="py-3 px-4">Bukti Bayar</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right rounded-r-lg">Aksi</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function mountOverviewCharts() {
    if (!state.overview || !window.Chart) return;
    const k = state.overview.kpi;
    const ctx1 = document.getElementById('chartAdminTier');
    if (ctx1) {
      charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Akun Pro', 'Akun Latihan'],
          datasets: [{ data: [k.totalPro || 0, k.totalLatihan || 1], backgroundColor: ['#0E3B2C', '#A7F3D0'], borderWidth: 0 }]
        },
        options: { cutout: '70%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
      }));
    }
    const ctx2 = document.getElementById('chartAdminWeekly');
    if (ctx2) {
      const w = state.overview.weeklyChart || [];
      charts.push(new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: w.map(function (d) { return d.label; }),
          datasets: [
            { label: 'Total Ujian', data: w.map(function (d) { return d.total; }), backgroundColor: '#0E3B2C', borderRadius: 6, barPercentage: 0.6 },
            { label: 'Lulus PG', data: w.map(function (d) { return d.lulus; }), backgroundColor: '#1F8A5B', borderRadius: 6, barPercentage: 0.6 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { y: { beginAtZero: true, grid: { color: '#F1F5F9' } }, x: { grid: { display: false } } } }
      }));
    }
  }

  // --------------------------------------------------------------------------
  // TAB 2: BANK SOAL, EDITOR PAKET & LAPORAN SKOR (Stitch Screen #6)
  // --------------------------------------------------------------------------
  function renderQuestionsAndReports() {
    const pakets = state.qData.paket || [];
    const soalFiltered = (state.qData.soal || []).filter(function (s) {
      const mp = !state.selectedPaketId || s.paket_id === state.selectedPaketId;
      const ms = state.qSubtesFilter === 'Semua' || s.subtes === state.qSubtesFilter;
      const mq = !state.qSearch || String(s.pertanyaan).toLowerCase().includes(state.qSearch.toLowerCase());
      return mp && ms && mq;
    });

    const ed = state.editingSoal || {
      soal_id: '', paket_id: state.selectedPaketId, nomor_urut: soalFiltered.length + 1,
      subtes: 'TWK', topik: '', pertanyaan: '', drive_image_id: '',
      opsi_a: '', opsi_b: '', opsi_c: '', opsi_d: '', opsi_e: '',
      kunci_atau_bobot: 'A', pembahasan: ''
    };

    const tkpWeights = { A: 5, B: 4, C: 3, D: 2, E: 1 };
    if (ed.subtes === 'TKP' && String(ed.kunci_atau_bobot).includes(':')) {
      String(ed.kunci_atau_bobot).split(',').forEach(function (pair) {
        const kv = pair.split(':');
        if (kv.length === 2) tkpWeights[kv[0].trim().toUpperCase()] = Number(kv[1]) || 1;
      });
    }

    const repList = getFilteredReports();

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">01 / Manajemen Konten</div>
          <h1 class="text-2xl font-heading font-bold text-[#111827] mt-1">Bank Soal &amp; Editor Paket</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="AdminPanel.openPackageModal()" class="btn-outline px-4 py-2 text-xs inline-flex items-center gap-1.5">
            <i data-lucide="folder-plus" class="w-4 h-4"></i> Paket Baru
          </button>
          <button onclick="AdminPanel.openImportModal()" class="btn-accent px-4 py-2 text-xs inline-flex items-center gap-1.5">
            <i data-lucide="upload" class="w-4 h-4"></i> Impor Massal (CSV)
          </button>
          <button onclick="AdminPanel.newQuestion()" class="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5">
            <i data-lucide="plus" class="w-4 h-4"></i> Tambah Soal
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="flex flex-wrap items-center gap-2">
        <select onchange="AdminPanel.selectPaket(this.value)" class="px-4 py-2 rounded-full border border-[#E2E8F0] bg-white text-xs font-semibold text-[#111827]">
          ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${p.paket_id === state.selectedPaketId ? 'selected' : ''}>${esc(p.nama_paket)} (${esc(p.tier_akses)})</option>`; }).join('')}
        </select>
        ${['Semua', 'TWK', 'TIU', 'TKP'].map(function (st) {
          const active = state.qSubtesFilter === st;
          return `<button onclick="AdminPanel.setQSubtes('${st}')" class="px-3.5 py-1.5 rounded-full text-xs font-semibold ${active ? 'bg-[#0E3B2C] text-white' : 'bg-white border border-[#E2E8F0] text-[#4B5563]'}">${st}</button>`;
        }).join('')}
        <input id="adm-q-search" type="text" value="${esc(state.qSearch)}" oninput="AdminPanel.setQSearch(this.value, this.selectionStart)" placeholder="Cari soal atau kata kunci..."
          class="ml-auto px-4 py-2 rounded-full border border-[#E2E8F0] bg-white text-xs w-56" />
      </div>

      <!-- Split Question List + Editor -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="card-stitch p-4 lg:col-span-4 space-y-2.5 max-h-[620px] overflow-y-auto">
          <div class="flex items-center justify-between px-1 mb-1">
            <span class="font-heading font-bold text-sm">Daftar Soal</span>
            <span class="text-xs text-[#64748B]">${soalFiltered.length} soal</span>
          </div>
          ${soalFiltered.length ? soalFiltered.map(function (s, idx) {
            const active = ed.soal_id === s.soal_id;
            return `
              <div onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" class="p-3.5 rounded-2xl border cursor-pointer transition ${active ? 'bg-[#E8F5EE] border-[#1F8A5B]' : 'bg-[#F7FAF8] border-[#E2E8F0] hover:bg-white'}">
                <div class="flex items-center justify-between text-[11px] font-bold mb-1.5">
                  <div class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-full bg-white text-[#0E3B2C]">${esc(s.subtes)}</span>
                    <span class="text-[#64748B]">Soal #${s.nomor_urut || idx + 1}</span>
                  </div>
                  <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                    <button type="button" onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" title="Edit Soal" class="px-2 py-1 rounded-lg bg-white border border-[#E2E8F0] text-[#0E3B2C] hover:bg-[#E8F5EE] inline-flex items-center gap-1">
                      <i data-lucide="pencil" class="w-3 h-3"></i> Edit
                    </button>
                    <button type="button" onclick="AdminPanel.deleteQuestion('${esc(s.soal_id)}')" title="Hapus Soal" class="px-2 py-1 rounded-lg bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 inline-flex items-center gap-1">
                      <i data-lucide="trash-2" class="w-3 h-3"></i> Hapus
                    </button>
                  </div>
                </div>
                <p class="text-xs text-[#111827] line-clamp-2">${esc(s.pertanyaan)}</p>
              </div>`;
          }).join('') : `<div class="py-10 text-center text-xs text-[#64748B]">Belum ada soal di paket ini. Klik <b>+ Tambah Soal</b>.</div>`}
        </div>

        <form id="q-editor-form" onsubmit="AdminPanel.saveQuestion(event)" class="card-stitch p-5 lg:col-span-8 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
            <div>
              <h3 class="font-heading font-bold text-base">${ed.soal_id ? 'Edit Soal #' + esc(ed.nomor_urut) : 'Buat Soal Baru'}</h3>
              <p class="text-xs text-[#64748B]">Ubah materi, kunci jawaban (TWK/TIU) atau bobot 1–5 (TKP), dan pembahasan.</p>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="q-nomor" value="${ed.nomor_urut || 1}" min="1" class="w-16 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-semibold" title="Nomor Urut" />
              <select id="q-subtes" onchange="AdminPanel.changeEditorSubtes(this.value)" class="px-3 py-1.5 rounded-full bg-[#E8F5EE] text-[#0E3B2C] text-xs font-bold">
                <option value="TWK" ${ed.subtes === 'TWK' ? 'selected' : ''}>Subtes: TWK</option>
                <option value="TIU" ${ed.subtes === 'TIU' ? 'selected' : ''}>Subtes: TIU</option>
                <option value="TKP" ${ed.subtes === 'TKP' ? 'selected' : ''}>Subtes: TKP</option>
              </select>
            </div>
          </div>

          <input type="hidden" id="q-id" value="${esc(ed.soal_id || '')}" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Topik / Materi</label>
              <input type="text" id="q-topik" value="${esc(ed.topik || '')}" placeholder="Misal: Pilar Negara / Silogisme" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">URL / ID Gambar Soal (Opsional)</label>
              <input type="text" id="q-img" value="${esc(ed.drive_image_id || '')}" placeholder="Tautan gambar Drive atau kosongkan" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
          </div>

          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Pertanyaan (Stem Soal)</label>
            <textarea id="q-pertanyaan" rows="3" required class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm">${esc(ed.pertanyaan || '')}</textarea>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-[#4B5563]">Pilihan Jawaban (A–E)</label>
              <span class="text-[11px] text-[#1F8A5B] font-semibold">${ed.subtes === 'TKP' ? 'Atur bobot poin 1–5 per opsi' : 'Pilih 1 kunci jawaban benar (+5)'}</span>
            </div>
            ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
              const val = ed['opsi_' + opt.toLowerCase()] || '';
              return `
                <div class="flex items-center gap-2">
                  <span class="w-8 h-9 rounded-lg bg-[#F7FAF8] border border-[#E2E8F0] flex items-center justify-center text-xs font-bold shrink-0">${opt}</span>
                  <input type="text" id="q-opsi-${opt}" value="${esc(val)}" required placeholder="Teks opsi ${opt}" class="flex-1 px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs sm:text-sm" />
                  ${ed.subtes === 'TKP' ? `
                    <select id="q-bobot-${opt}" class="w-16 px-2 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold bg-[#E8F5EE] text-[#0E3B2C]">
                      ${[5, 4, 3, 2, 1].map(function (n) { return `<option value="${n}" ${tkpWeights[opt] === n ? 'selected' : ''}>${n} pt</option>`; }).join('')}
                    </select>
                  ` : `
                    <label class="inline-flex items-center gap-1 text-xs font-medium text-[#4B5563] cursor-pointer px-2">
                      <input type="radio" name="q-kunci" value="${opt}" ${String(ed.kunci_atau_bobot).toUpperCase() === opt ? 'checked' : ''} class="accent-[#0E3B2C]" /> Benar
                    </label>
                  `}
                </div>`;
            }).join('')}
          </div>

          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Pembahasan Resmi</label>
            <textarea id="q-pembahasan" rows="2" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm">${esc(ed.pembahasan || '')}</textarea>
          </div>

          <div class="flex items-center justify-between pt-2">
            ${ed.soal_id ? `<button type="button" onclick="AdminPanel.deleteQuestion('${esc(ed.soal_id)}')" class="px-4 py-2 rounded-full bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold hover:bg-red-200">Hapus Soal</button>` : '<div></div>'}
            <button type="submit" class="btn-primary px-6 py-2.5 text-xs inline-flex items-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i> Simpan Perubahan
            </button>
          </div>
        </form>
      </div>

      <!-- 02 / Laporan Skor & Manajemen Peserta -->
      <div class="pt-4 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">02 / Analitik Peserta</div>
            <h2 class="text-xl font-heading font-bold text-[#111827] mt-0.5">Laporan Skor &amp; Ekspor Data</h2>
          </div>
          <div class="flex flex-wrap gap-2 no-print">
            <button onclick="AdminPanel.exportReportsCSV()" class="btn-outline px-4 py-2 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="file-spreadsheet" class="w-4 h-4 text-[#1F8A5B]"></i> Ekspor CSV / Excel
            </button>
            <button onclick="window.print()" class="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="printer" class="w-4 h-4"></i> Cetak Laporan PDF
            </button>
          </div>
        </div>

        <div class="card-stitch p-5 space-y-4">
          <div class="flex flex-wrap items-center gap-2 no-print">
            <select onchange="AdminPanel.setRepFilter('paket', this.value)" class="px-3.5 py-2 rounded-full border border-[#E2E8F0] text-xs bg-[#F7FAF8]">
              <option value="">Semua Paket</option>
              ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${state.repFilterPaket === p.paket_id ? 'selected' : ''}>${esc(p.nama_paket)}</option>`; }).join('')}
            </select>
            <select onchange="AdminPanel.setRepFilter('status', this.value)" class="px-3.5 py-2 rounded-full border border-[#E2E8F0] text-xs bg-[#F7FAF8]">
              <option value="">Semua Status</option>
              <option value="Lulus" ${state.repFilterStatus === 'Lulus' ? 'selected' : ''}>Lulus</option>
              <option value="Tidak Lulus" ${state.repFilterStatus === 'Tidak Lulus' ? 'selected' : ''}>Tidak Lulus</option>
            </select>
            <input id="adm-rep-search" type="text" value="${esc(state.repSearch)}" oninput="AdminPanel.setRepFilter('search', this.value, this.selectionStart)" placeholder="Cari nama peserta..." class="px-3.5 py-2 rounded-full border border-[#E2E8F0] text-xs bg-[#F7FAF8] w-52" />
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                  <th class="py-3 px-4 rounded-l-lg">Peserta</th>
                  <th class="py-3 px-4">Paket</th>
                  <th class="py-3 px-3 text-center">TWK</th>
                  <th class="py-3 px-3 text-center">TIU</th>
                  <th class="py-3 px-3 text-center">TKP</th>
                  <th class="py-3 px-3 text-center">Total</th>
                  <th class="py-3 px-4 text-right rounded-r-lg">Status</th>
                </tr>
              </thead>
              <tbody>
                ${repList.length ? repList.map(function (h) {
                  const ok = h.status_kelulusan === 'Lulus';
                  return `
                    <tr class="border-t border-[#E2E8F0] hover:bg-[#F7FAF8] text-sm">
                      <td class="py-3 px-4 font-semibold text-[#111827]">${esc(h.nama_user)}</td>
                      <td class="py-3 px-4 text-xs text-[#4B5563]">${esc(h.nama_paket)}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${h.skor_twk}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${h.skor_tiu}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${h.skor_tkp}</td>
                      <td class="py-3 px-3 text-center font-bold tabular-nums">${h.skor_total}</td>
                      <td class="py-3 px-4 text-right">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(h.status_kelulusan)}</span>
                      </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" class="py-8 text-center text-xs text-[#64748B]">Belum ada riwayat pengerjaan yang cocok.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // TAB 3: NOTIFIKASI WA (FONNTE) + EMAIL + BLAST + CRM KONTAK
  // --------------------------------------------------------------------------
  function renderCrmWa() {
    const cfg = state.notifCfg || { waAktif: true, emailAktif: true, fonnteAda: false, matriks: {} };
    const kontak = state.crm.kontak || [];
    const blasts = state.crm.blasts || [];

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">Modul Notifikasi &amp; CRM</div>
          <h1 class="text-2xl font-heading font-bold text-[#111827] mt-1">WhatsApp Gateway (Fonnte), Blast &amp; CRM Kontak</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="AdminPanel.syncCrm()" class="btn-outline px-4 py-2 text-xs inline-flex items-center gap-1.5">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sinkron Kontak Users
          </button>
          <button onclick="AdminPanel.validateWa()" class="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Cek Validasi WA Fonnte
          </button>
        </div>
      </div>

      <!-- Saklar 2 Lapis & Blast Form -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="card-stitch p-5 lg:col-span-5 space-y-4">
          <h3 class="font-heading font-bold text-base">Saklar Kanal Notifikasi</h3>
          <div class="space-y-3 text-sm">
            <label class="flex items-center justify-between p-3 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0] cursor-pointer">
              <div>
                <div class="font-semibold">Notifikasi WhatsApp (Fonnte)</div>
                <div class="text-xs text-[#64748B]">Token: ${cfg.fonnteAda ? '<span class="text-[#166534] font-semibold">Terpasang di Script Properties</span>' : '<span class="text-[#991B1B]">Belum diatur (atur di tab Keamanan)</span>'}</div>
              </div>
              <input type="checkbox" id="cfg-wa" ${cfg.waAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-5 h-5 accent-[#0E3B2C]" />
            </label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0] cursor-pointer">
              <div>
                <div class="font-semibold">Notifikasi Email (MailApp)</div>
                <div class="text-xs text-[#64748B]">Antrean non-blocking via trigger 1 menit</div>
              </div>
              <input type="checkbox" id="cfg-em" ${cfg.emailAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-5 h-5 accent-[#0E3B2C]" />
            </label>
          </div>

          <div class="pt-2 border-t border-[#E2E8F0]">
            <div class="text-xs font-bold text-[#4B5563] mb-2">Matriks Kejadian Otomatis</div>
            <div class="space-y-2 text-xs">
              ${Object.keys(cfg.matriks || {}).map(function (ev) {
                const m = cfg.matriks[ev];
                return `<div class="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                  <span>${esc(m.label || ev)}</span>
                  <span class="flex gap-2">
                    <span class="px-2 py-0.5 rounded-full ${m.wa ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#64748B]'}">WA</span>
                    <span class="px-2 py-0.5 rounded-full ${m.email ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#64748B]'}">Email</span>
                  </span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <form onsubmit="AdminPanel.sendBlast(event)" class="card-stitch p-5 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-heading font-bold text-base">Blast WhatsApp Massal Ber-Batch (Anti-Banned)</h3>
            <p class="text-xs text-[#64748B]">Otomatis melewati kontak bertanda <b>Opt-Out = YA</b> dan mengirim bertahap dengan jeda acak 3–8 detik.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Judul Kampanye</label>
              <input type="text" id="bl-judul" required placeholder="Misal: Promo Upgrade Pro SKD 2026" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Segmen Sasaran</label>
              <select id="bl-sasaran" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm bg-white">
                <option value="SEMUA">Semua Kontak Aktif</option>
                <option value="Latihan">Khusus Akun Latihan (Konversi Pro)</option>
                <option value="Pro">Khusus Member Pro</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Isi Pesan (Gunakan <code>{nama}</code>, <code>{institusi}</code>, <code>{link}</code>)</label>
            <textarea id="bl-pesan" rows="3" required placeholder="Halo {nama}, paket Tryout Akbar SKD terbaru sudah dibuka di {institusi}!" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm"></textarea>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-[#64748B]">Batch 20 pesan • Jeda 3–8 detik</span>
            <button type="submit" class="btn-accent px-5 py-2.5 text-xs inline-flex items-center gap-2">
              <i data-lucide="send" class="w-4 h-4"></i> Jadwalkan Blast WA
            </button>
          </div>
          ${blasts.length ? `<div class="pt-3 border-t border-[#E2E8F0] text-xs space-y-1.5">
            <div class="font-bold text-[#4B5563]">Riwayat Blast Terakhir:</div>
            ${blasts.slice(0, 3).map(function (b) {
              return `<div class="flex justify-between p-2 rounded-lg bg-[#F7FAF8]"><span><b>${esc(b.Judul)}</b> (${esc(b.Sasaran)})</span><span class="font-semibold text-[#166534]">${b.Terkirim}/${b.Total} • ${esc(b.Status)}</span></div>`;
            }).join('')}
          </div>` : ''}
        </form>
      </div>

      <!-- Tabel CRM Kontak -->
      <div class="card-stitch p-5">
        <h3 class="font-heading font-bold text-base mb-3">Database CRM Kontak (${kontak.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                <th class="py-3 px-4 rounded-l-lg">Nama &amp; Email</th>
                <th class="py-3 px-4">No. WA</th>
                <th class="py-3 px-4">Segmen</th>
                <th class="py-3 px-4">Status WA</th>
                <th class="py-3 px-4 text-right rounded-r-lg">Opt-Out Blast</th>
              </tr>
            </thead>
            <tbody>
              ${kontak.map(function (k) {
                const optOut = String(k.OptOut || '').toUpperCase() === 'YA';
                return `
                  <tr class="border-t border-[#E2E8F0]">
                    <td class="py-3 px-4"><div class="font-semibold">${esc(k.Nama)}</div><div class="text-xs text-[#64748B]">${esc(k.Email)}</div></td>
                    <td class="py-3 px-4 tabular-nums text-xs">${esc(k.NoWA || '-')}</td>
                    <td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${k.Segmen === 'Pro' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]'}">${esc(k.Segmen)}</span></td>
                    <td class="py-3 px-4 text-xs">${esc(k.StatusWA || 'Belum Dicek')}</td>
                    <td class="py-3 px-4 text-right">
                      <button onclick="AdminPanel.toggleOptOut('${esc(k.KontakID)}', ${!optOut})" class="px-3 py-1 rounded-full text-xs font-semibold ${optOut ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#F1F5F9] text-[#475569]'}">
                        ${optOut ? 'Opt-Out (YA)' : 'Aktif'}
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // TAB 4: KELOLA ADMIN & SINKRONISASI EMAIL (GOOGLE OAUTH <-> USERS)
  // --------------------------------------------------------------------------
  function renderAdminEmails() {
    const d = state.adminEmailsData;
    if (!d) return `<div class="space-y-4"><div class="skeleton h-32"></div><div class="skeleton h-52"></div></div>`;
    const admins = d.admins || [];
    const users = d.users || [];

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">Otorisasi &amp; Sinkronisasi Email</div>
          <h1 class="text-2xl font-heading font-bold text-[#111827] mt-1">Kelola Admin Tersinkron Email Google</h1>
          <p class="text-xs text-[#64748B] mt-1">Setiap email yang terdaftar di sini otomatis memperoleh akses <b>Panel Kontrol Admin</b> saat masuk via Google OAuth 2.0 maupun login email biasa.</p>
        </div>
        <button onclick="AdminPanel.syncAdminEmails()" class="btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-2 shrink-0">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sinkronkan Email Sekarang
        </button>
      </div>

      <!-- Info Akun Aktif & Form Tambah Email Admin -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="card-stitch p-5 lg:col-span-5 space-y-3">
          <div class="text-xs font-bold uppercase tracking-wider text-[#64748B]">Status Sinkronisasi Sesi</div>
          <div class="p-3.5 rounded-2xl bg-[#E8F5EE] text-[#0E3B2C] space-y-1 text-xs">
            <div class="font-bold">Email Login Saat Ini:</div>
            <div class="font-mono text-sm font-bold break-all">${esc(d.currentEmail || '-')}</div>
          </div>
          <div class="p-3.5 rounded-2xl bg-[#F7FAF8] border border-[#E2E8F0] space-y-1 text-xs">
            <div class="font-semibold text-[#4B5563]">Pemilik Google Apps Script (Otomatis Admin):</div>
            <div class="font-mono font-bold text-[#111827] break-all">${esc(d.ownerEmail || 'Terdeteksi otomatis di GAS')}</div>
          </div>
        </div>

        <form onsubmit="AdminPanel.addAdminEmail(event)" class="card-stitch p-5 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-heading font-bold text-base">Tambah Email Admin Baru</h3>
            <p class="text-xs text-[#64748B]">Masukkan alamat Gmail/Google yang ingin diberi akses Panel Admin. Sistem otomatis menyinkronkan ke <code>Script Properties</code> &amp; Sheet <code>Users</code>.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Alamat Email Google</label>
              <input type="email" id="adm-new-email" required placeholder="adminbaru@gmail.com" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Nama Admin (Opsional)</label>
              <input type="text" id="adm-new-nama" placeholder="Misal: Pengelola Tryout" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
          </div>
          <button type="submit" class="btn-accent px-5 py-2.5 text-xs inline-flex items-center gap-2">
            <i data-lucide="user-plus" class="w-4 h-4"></i> Tambahkan &amp; Sinkronkan Email Admin
          </button>
        </form>
      </div>

      <!-- Tabel Daftar Email Admin Tersinkron -->
      <div class="card-stitch p-5 space-y-3">
        <h3 class="font-heading font-bold text-base">Daftar Email Admin Aktif (${admins.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                <th class="py-3 px-4 rounded-l-lg">Email Google</th>
                <th class="py-3 px-4">Nama di Users</th>
                <th class="py-3 px-4">Status Sinkron</th>
                <th class="py-3 px-4 text-right rounded-r-lg">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${admins.length ? admins.map(function (a) {
                return `
                  <tr class="border-t border-[#E2E8F0]">
                    <td class="py-3 px-4 font-semibold text-[#111827]">
                      ${esc(a.email)}
                      ${a.isOwner ? '<span class="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0E3B2C] text-white">Pemilik</span>' : ''}
                    </td>
                    <td class="py-3 px-4 text-xs text-[#4B5563]">${esc(a.nama)}</td>
                    <td class="py-3 px-4">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${a.syncedRole === 'Admin' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]'}">
                        ${a.syncedRole === 'Admin' ? '✓ Tersinkron (Admin)' : esc(a.syncedRole)}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${a.email !== d.currentEmail ? `
                        <button onclick="AdminPanel.removeAdminEmail('${esc(a.email)}')" class="px-3 py-1 rounded-full bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold hover:bg-red-200">Cabut Admin</button>
                      ` : '<span class="text-xs text-[#64748B]">Sesi aktif Anda</span>'}
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="4" class="py-8 text-center text-xs text-[#64748B]">Belum ada email admin tersimpan. Klik <b>Sinkronkan Email Sekarang</b>.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tabel Semua Pengguna (Tambah User, Ubah Role, & Hapus User) -->
      <div class="card-stitch p-5 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 class="font-heading font-bold text-base">Manajemen Akun &amp; User Terdaftar (${users.length})</h3>
            <p class="text-xs text-[#64748B]">Tambah user baru (Latihan / Pro / Admin), ubah tier secara instan, atau hapus akun peserta.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input id="adm-user-search" type="text" value="${esc(state.userSearch)}" oninput="AdminPanel.setUserSearch(this.value, this.selectionStart)" placeholder="Cari nama atau email..."
              class="px-3.5 py-2 rounded-full border border-[#E2E8F0] bg-[#F7FAF8] text-xs w-44" />
            <select onchange="AdminPanel.setUserRoleFilter(this.value)" class="px-3 py-2 rounded-full border border-[#E2E8F0] bg-[#F7FAF8] text-xs font-semibold">
              ${['Semua', 'Latihan', 'Pro', 'Admin'].map(function (r) {
                return `<option value="${r}" ${state.userRoleFilter === r ? 'selected' : ''}>${r === 'Semua' ? 'Semua Role' : r}</option>`;
              }).join('')}
            </select>
            <button onclick="AdminPanel.openCreateUserModal()" class="btn-primary px-4 py-2 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="user-plus" class="w-4 h-4"></i> Tambah User
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                <th class="py-3 px-4 rounded-l-lg">Nama &amp; Email</th>
                <th class="py-3 px-4 hidden sm:table-cell">No. WA</th>
                <th class="py-3 px-4">Role Saat Ini</th>
                <th class="py-3 px-4 text-right rounded-r-lg">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${(function () {
                const q = state.userSearch.toLowerCase();
                const filtered = users.filter(function (u) {
                  const mr = state.userRoleFilter === 'Semua' || u.role === state.userRoleFilter;
                  const mq = !q || String(u.nama_lengkap).toLowerCase().includes(q) || String(u.email).toLowerCase().includes(q);
                  return mr && mq;
                });
                if (!filtered.length) return `<tr><td colspan="4" class="py-8 text-center text-xs text-[#64748B]">Tidak ada user yang cocok dengan filter.</td></tr>`;
                return filtered.map(function (u) {
                  const badge = u.role === 'Admin' ? 'bg-[#0E3B2C] text-white' : u.role === 'Pro' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]';
                  const isSelf = String(u.email || '').toLowerCase() === String(d.currentEmail || '').toLowerCase();
                  return `
                    <tr class="border-t border-[#E2E8F0] hover:bg-[#F7FAF8]">
                      <td class="py-3 px-4">
                        <div class="font-semibold text-[#111827]">${esc(u.nama_lengkap)} ${isSelf ? '<span class="ml-1 text-[10px] font-bold text-[#1F8A5B]">(Anda)</span>' : ''}</div>
                        <div class="text-xs text-[#64748B]">${esc(u.email)}</div>
                      </td>
                      <td class="py-3 px-4 text-xs text-[#4B5563] tabular-nums hidden sm:table-cell">${esc(u.no_wa || '-')}</td>
                      <td class="py-3 px-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badge}">${esc(u.role)}</span></td>
                      <td class="py-3 px-4 text-right">
                        <div class="inline-flex flex-wrap justify-end gap-1.5">
                          ${u.role !== 'Admin' ? `<button onclick="AdminPanel.quickPromoteAdmin('${esc(u.email)}','${esc(u.nama_lengkap)}')" class="px-3 py-1 rounded-full bg-[#0E3B2C] text-white text-xs font-semibold">Jadikan Admin</button>` : ''}
                          ${u.role !== 'Pro' && u.role !== 'Admin' ? `<button onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Pro')" class="px-3 py-1 rounded-full bg-[#DCFCE7] text-[#166534] text-xs font-semibold">Set Pro</button>` : ''}
                          ${u.role === 'Pro' ? `<button onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Latihan')" class="px-3 py-1 rounded-full bg-[#F1F5F9] text-[#475569] text-xs font-semibold">Set Latihan</button>` : ''}
                          ${!isSelf ? `<button onclick="AdminPanel.deleteUser('${esc(u.user_id)}','${esc(u.email)}')" class="px-3 py-1 rounded-full bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 text-xs font-semibold inline-flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i> Hapus</button>` : ''}
                        </div>
                      </td>
                    </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // TAB 5: KEAMANAN SCRIPT PROPERTIES & MIGRASI DATABASE SPREADSHEET
  // --------------------------------------------------------------------------
  function renderSecurityMigration() {
    const sec = (state.secretsData && state.secretsData.secrets) || [];
    const set = (state.secretsData && state.secretsData.settings) || {};
    const mig = state.migrationResult;
    const gClient = sec.find(function (s) { return s.key === 'GOOGLE_CLIENT_ID'; }) || { ada: false, masked: '' };
    const oauthAktif = (set.OAUTH_GOOGLE_AKTIF || 'YA') === 'YA';
    const curOrigin = (window.location && window.location.origin && window.location.origin !== 'null')
      ? window.location.origin
      : 'https://USERNAME.github.io';

    return `
      <div>
        <div class="text-xs font-bold tracking-wider uppercase text-[#1F8A5B]">Keamanan &amp; Upgrade Sistem</div>
        <h1 class="text-2xl font-heading font-bold text-[#111827] mt-1">Google OAuth 2.0, Brankas Script Properties &amp; Migrasi</h1>
      </div>

      <!-- Kartu Khusus Pengaturan Google OAuth 2.0 -->
      <form onsubmit="AdminPanel.saveOAuthSettings(event)" class="card-stitch p-5 sm:p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-2xl bg-[#E8F5EE] flex items-center justify-center shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-heading font-bold text-base">Pengaturan Login Google OAuth 2.0</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${gClient.ada && oauthAktif ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]'}">
                  ${gClient.ada && oauthAktif ? 'Aktif & Terverifikasi Server' : 'Perlu Konfigurasi Client ID'}
                </span>
              </div>
              <p class="text-xs text-[#64748B] mt-0.5">Peserta bisa masuk/daftar 1-klik memakai akun Google. ID Token diverifikasi ketat di server GAS (Aturan R7).</p>
            </div>
          </div>
          <button type="button" onclick="AdminPanel.openOAuthGuideModal()" class="btn-outline px-3.5 py-2 text-xs inline-flex items-center gap-1.5 shrink-0">
            <i data-lucide="book-open" class="w-3.5 h-3.5 text-[#1F8A5B]"></i> Panduan Google Cloud
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div class="lg:col-span-5">
            <div class="flex items-center justify-between text-xs mb-1">
              <label class="font-bold text-[#111827]">Google OAuth 2.0 Client ID</label>
              <span class="${gClient.ada ? 'text-[#166534] font-semibold' : 'text-[#64748B]'}">${gClient.ada ? 'Tersimpan: ' + esc(gClient.masked) : 'Belum diisi'}</span>
            </div>
            <input type="text" id="oauth-client-id" placeholder="xxxx-xxxx.apps.googleusercontent.com (kosongkan jika tidak ubah)"
              class="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm" />
          </div>

          <div class="lg:col-span-4">
            <label class="text-xs font-bold text-[#111827] block mb-1">Authorized JavaScript Origin (Tempel di Google Cloud)</label>
            <div class="flex items-center gap-1.5">
              <input type="text" readonly id="oauth-origin-url" value="${esc(curOrigin)}" class="flex-1 px-3 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-xs font-mono text-[#4B5563]" />
              <button type="button" onclick="AdminPanel.copyOrigin()" class="px-3 py-2.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#E8F5EE] text-xs font-semibold text-[#0E3B2C] shrink-0">Salin</button>
            </div>
          </div>

          <div class="lg:col-span-3 flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0]">
            <label for="oauth-aktif" class="text-xs font-semibold text-[#111827] cursor-pointer">Aktifkan Tombol Google</label>
            <input type="checkbox" id="oauth-aktif" ${oauthAktif ? 'checked' : ''} class="w-5 h-5 accent-[#0E3B2C]" />
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span class="text-[11px] text-[#64748B]">Ketik <code>__HAPUS__</code> pada kolom Client ID jika ingin menghapusnya dari Script Properties.</span>
          <button type="submit" class="btn-primary px-5 py-2.5 text-xs inline-flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i> Simpan Pengaturan OAuth 2.0
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Rahasia Script Properties -->
        <form onsubmit="AdminPanel.saveSecrets(event)" class="card-stitch p-5 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-heading font-bold text-base">Kredensial Rahasia Lainnya (Script Properties)</h3>
              <p class="text-xs text-[#64748B]">Token disimpan eksklusif di Script Properties (tidak pernah di Sheet/Git). Kosongkan input bila tidak ingin mengubah.</p>
            </div>
            <i data-lucide="lock" class="w-5 h-5 text-[#1F8A5B] shrink-0"></i>
          </div>

          <div class="space-y-3">
            ${sec.filter(function (item) { return item.key !== 'GOOGLE_CLIENT_ID'; }).map(function (item) {
              return `
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <label class="font-bold text-[#111827]">${esc(item.key)}</label>
                    <span class="${item.ada ? 'text-[#166534] font-semibold' : 'text-[#64748B]'}">${item.ada ? 'Terpasang: ' + esc(item.masked) : 'Belum diisi'}</span>
                  </div>
                  <input type="password" id="sec-${esc(item.key)}" placeholder="Masukkan nilai baru (atau ketik __HAPUS__ untuk menghapus)"
                    class="w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
                </div>`;
            }).join('')}
          </div>

          <div class="pt-3 border-t border-[#E2E8F0] space-y-3">
            <div class="text-xs font-bold text-[#4B5563]">Pengaturan Pembayaran &amp; Platform</div>
            <div>
              <label class="text-xs text-[#4B5563]">Info Rekening / QRIS Upgrade Pro</label>
              <input type="text" id="set-rekening" value="${esc(set.INFO_REKENING_PRO || '')}" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-[#4B5563]">Harga Paket Pro</label>
                <input type="text" id="set-harga" value="${esc(set.HARGA_PRO || '')}" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>
              <div>
                <label class="text-xs text-[#4B5563]">WhatsApp Admin</label>
                <input type="text" id="set-wa" value="${esc(set.WA_ADMIN || '')}" class="mt-1 w-full px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-sm" />
              </div>
            </div>
          </div>

          <button type="submit" class="btn-primary px-5 py-2.5 text-xs inline-flex items-center gap-2">
            <i data-lucide="shield-check" class="w-4 h-4"></i> Simpan ke Script Properties
          </button>
        </form>

        <!-- Migrasi Database Antar-Spreadsheet -->
        <div class="card-stitch p-5 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-heading font-bold text-base">Migrasi &amp; Delta-Sync Spreadsheet</h3>
              <p class="text-xs text-[#64748B]">Impor data dari spreadsheet versi lama secara read-only, berbasis header, idempoten (anti duplikat), dan aman diulang.</p>
            </div>
            <i data-lucide="database-backup" class="w-5 h-5 text-[#1F8A5B] shrink-0"></i>
          </div>

          <div>
            <label class="text-xs font-semibold text-[#4B5563]">ID atau URL Spreadsheet Sumber (Versi Lama)</label>
            <input type="text" id="mig-source" placeholder="https://docs.google.com/spreadsheets/d/..." class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm" />
          </div>

          <div class="flex flex-wrap gap-2">
            <button onclick="AdminPanel.runMigration(true)" class="btn-outline px-4 py-2.5 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="search" class="w-4 h-4 text-[#1F8A5B]"></i> 1. Pindai Dulu (Dry-Run)
            </button>
            <button onclick="AdminPanel.runMigration(false)" class="btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="play" class="w-4 h-4"></i> 2. Eksekusi Delta-Sync
            </button>
          </div>

          ${mig ? `
            <div class="p-4 rounded-2xl bg-[#F7FAF8] border border-[#E2E8F0] space-y-2">
              <div class="flex items-center justify-between text-xs font-bold">
                <span>${mig.dryRun ? '🔍 Hasil Pindai (Dry-Run)' : '✅ Hasil Sinkronisasi Nyata'}</span>
                <span class="text-[#1F8A5B]">${esc(mig.sourceName)}</span>
              </div>
              <table class="w-full text-xs">
                <thead><tr class="text-[#64748B] border-b border-[#E2E8F0]"><th class="py-1.5 text-left">Sheet</th><th class="text-center">Tambah</th><th class="text-center">Update</th><th class="text-center">Lewati</th></tr></thead>
                <tbody>
                  ${mig.report.map(function (r) {
                    return `<tr class="border-b border-[#F1F5F9]"><td class="py-1.5 font-semibold">${esc(r.sheet)}</td><td class="text-center text-[#166534] font-bold">+${r.inserted}</td><td class="text-center text-[#D97706]">${r.updated}</td><td class="text-center text-[#64748B]">${r.skipped}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------------------------
  return {
    render: render,
    switchTab: function (t) { state.mobileSidebarOpen = false; render(document.getElementById('app'), t); },
    toggleSidebar: function (open) { state.mobileSidebarOpen = !!open; paintShell(document.getElementById('app')); },
    refresh: function () { ApiClient.invalidateCache(); render(document.getElementById('app'), state.tab); },
    setUpgradeFilter: function (f) { state.upgradeFilter = f; paintShell(document.getElementById('app')); mountOverviewCharts(); },
    setUpgradeSearch: function (q, pos) { state.upgradeSearch = q; paintShell(document.getElementById('app')); mountOverviewCharts(); refocusInput('adm-upg-search', pos); },
    previewProof: function (reqId) {
      const r = (state.overview && state.overview.upgrades || []).find(function (x) { return x.req_id === reqId; });
      if (!r) return;
      App.openModal('Bukti Transfer — ' + r.nama_user, `
        <div class="space-y-3 text-sm">
          <div class="p-3 rounded-xl bg-[#F7FAF8] text-xs space-y-1">
            <div><b>Email:</b> ${esc(r.email_user)}</div>
            <div><b>Catatan Peserta:</b> ${esc(r.catatan_user || '-')}</div>
          </div>
          ${r.url_bukti_drive ? `<img src="${esc(r.url_bukti_drive)}" alt="Bukti Transfer" class="w-full max-h-80 object-contain rounded-xl border border-[#E2E8F0]" />`
            : `<div class="p-8 text-center rounded-xl bg-[#F7FAF8] text-xs text-[#64748B]">Tidak ada lampiran gambar bukti transfer.</div>`}
        </div>
      `);
    },
    processUpgrade: async function (reqId, decision) {
      const catatan = decision === 'Rejected' ? (prompt('Alasan penolakan (akan dikirim ke peserta):', 'Bukti transfer kurang jelas') || '') : 'Terverifikasi Admin';
      try {
        await ApiClient.call('admin.processUpgrade', { req_id: reqId, decision: decision, catatan_admin: catatan });
        App.toast(decision === 'Approved' ? 'Akun Pro berhasil diaktifkan & notifikasi masuk antrean!' : 'Pengajuan upgrade ditolak.', 'success');
        render(document.getElementById('app'), 'overview');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    selectPaket: function (pid) { state.selectedPaketId = pid; state.editingSoal = null; paintShell(document.getElementById('app')); },
    setQSubtes: function (st) { state.qSubtesFilter = st; paintShell(document.getElementById('app')); },
    setQSearch: function (q, pos) { state.qSearch = q; paintShell(document.getElementById('app')); refocusInput('adm-q-search', pos); },
    editSoal: function (sid) {
      const found = (state.qData.soal || []).find(function (s) { return s.soal_id === sid; });
      if (found) {
        state.editingSoal = Object.assign({}, found);
        paintShell(document.getElementById('app'));
        if (window.innerWidth < 1024) {
          const form = document.getElementById('q-editor-form');
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    newQuestion: function () {
      const count = (state.qData.soal || []).filter(function (s) { return s.paket_id === state.selectedPaketId; }).length;
      state.editingSoal = { soal_id: '', paket_id: state.selectedPaketId, nomor_urut: count + 1, subtes: 'TWK', topik: '', pertanyaan: '', drive_image_id: '', opsi_a: '', opsi_b: '', opsi_c: '', opsi_d: '', opsi_e: '', kunci_atau_bobot: 'A', pembahasan: '' };
      paintShell(document.getElementById('app'));
    },
    changeEditorSubtes: function (st) {
      if (!state.editingSoal) state.editingSoal = { paket_id: state.selectedPaketId };
      state.editingSoal.subtes = st;
      state.editingSoal.kunci_atau_bobot = st === 'TKP' ? 'A:5,B:4,C:3,D:2,E:1' : 'A';
      paintShell(document.getElementById('app'));
    },
    saveQuestion: async function (e) {
      e.preventDefault();
      const subtes = document.getElementById('q-subtes').value;
      let kunci = 'A';
      if (subtes === 'TKP') {
        kunci = ['A', 'B', 'C', 'D', 'E'].map(function (o) { return o + ':' + document.getElementById('q-bobot-' + o).value; }).join(',');
      } else {
        const checked = document.querySelector('input[name="q-kunci"]:checked');
        kunci = checked ? checked.value : 'A';
      }
      const payload = {
        soal_id: document.getElementById('q-id').value,
        paket_id: state.selectedPaketId,
        nomor_urut: Number(document.getElementById('q-nomor').value || 1),
        subtes: subtes,
        topik: document.getElementById('q-topik').value,
        pertanyaan: document.getElementById('q-pertanyaan').value,
        drive_image_id: document.getElementById('q-img').value,
        opsi_a: document.getElementById('q-opsi-A').value,
        opsi_b: document.getElementById('q-opsi-B').value,
        opsi_c: document.getElementById('q-opsi-C').value,
        opsi_d: document.getElementById('q-opsi-D').value,
        opsi_e: document.getElementById('q-opsi-E').value,
        kunci_atau_bobot: kunci,
        pembahasan: document.getElementById('q-pembahasan').value
      };
      try {
        const saved = await ApiClient.call('admin.saveQuestion', payload);
        state.editingSoal = saved;
        App.toast('Soal berhasil disimpan ke Bank Soal!', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    deleteQuestion: async function (sid) {
      if (!confirm('Hapus butir soal ini secara permanen?')) return;
      try {
        await ApiClient.call('admin.deleteQuestion', { soal_id: sid });
        state.editingSoal = null;
        App.toast('Soal dihapus.', 'info');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    openImportModal: function () {
      const pakets = state.qData.paket || [];
      const curPkg = pakets.find(function (p) { return p.paket_id === state.selectedPaketId; });
      window._parsedImportItems = [];
      App.openModal('Impor Massal Bank Soal (CSV / Excel)', `
        <div class="space-y-4 text-sm">
          <div class="p-3.5 rounded-2xl bg-[#E8F5EE] text-[#0E3B2C] text-xs space-y-1.5">
            <div class="font-bold">Paket Tujuan: ${esc(curPkg ? curPkg.nama_paket : state.selectedPaketId)}</div>
            <div>Unggah file <b>.csv</b> berisi puluhan hingga ratusan soal sekaligus. 1x simpan langsung masuk ke Google Sheets tanpa lag!</div>
            <button type="button" onclick="AdminPanel.downloadCsvTemplate()" class="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[#0E3B2C] font-bold border border-[#CBEAD9] hover:bg-[#F7FAF8]">
              <i data-lucide="download" class="w-3.5 h-3.5"></i> Unduh Template CSV
            </button>
          </div>

          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Pilih File CSV Soal (.csv)</label>
            <input type="file" id="csv-soal-file" accept=".csv,text/csv" onchange="AdminPanel.handleCsvFile(this)"
              class="mt-1 w-full text-xs p-3 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F7FAF8]" />
          </div>

          <div id="csv-preview-box" class="hidden p-3.5 rounded-2xl bg-[#F7FAF8] border border-[#E2E8F0] space-y-2 text-xs">
            <div id="csv-preview-summary" class="font-bold text-[#166534]"></div>
            <div id="csv-preview-list" class="max-h-40 overflow-y-auto space-y-1 text-[#4B5563]"></div>
          </div>

          <button type="button" id="btn-submit-csv" disabled onclick="AdminPanel.submitBulkImport()"
            class="btn-primary w-full py-3 text-xs disabled:opacity-40 disabled:cursor-not-allowed">
            Simpan Soal Massal ke Database
          </button>
        </div>
      `);
    },
    downloadCsvTemplate: function () {
      const lines = [
        'subtes,topik,pertanyaan,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,kunci_atau_bobot,pembahasan',
        'TWK,Pilar Negara,"Contoh soal TWK: Lambang negara Indonesia adalah...",Garuda Pancasila,Bendera Merah Putih,Bahasa Indonesia,Lagu Indonesia Raya,Pohon Beringin,A,"Garuda Pancasila dengan semboyan Bhinneka Tunggal Ika adalah lambang negara RI."',
        'TIU,Deret Angka,"Contoh soal TIU: Lanjutan dari deret 2, 4, 8, 16, ... adalah...",24,28,30,32,36,D,"Pola dikali 2 setiap suku: 16 x 2 = 32."',
        'TKP,Pelayanan Publik,"Contoh soal TKP: Saat warga mengeluh antrean lama, sikap Anda...",Meminta sabar dengan ramah dan menjelaskan estimasi waktu,Mengabaikannya,Menyuruh pulang,Memarahi balik,Menutup loket,"A:5,B:1,C:1,D:1,E:1","Sikap ramah dan informatif mencerminkan pelayanan publik prima (Opsi A = 5)."'
      ];
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Template_Bank_Soal_SimulasiTKD.csv';
      a.click();
      App.toast('Template CSV berhasil diunduh!', 'success');
    },
    handleCsvFile: function (input) {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        const items = parseCsvQuestions(String(reader.result || ''));
        window._parsedImportItems = items;
        const box = document.getElementById('csv-preview-box');
        const sum = document.getElementById('csv-preview-summary');
        const list = document.getElementById('csv-preview-list');
        const btn = document.getElementById('btn-submit-csv');
        if (!items.length) {
          App.toast('Tidak ada baris soal valid terbaca. Pastikan header sesuai template CSV.', 'warning');
          box.classList.add('hidden');
          btn.disabled = true;
          return;
        }
        const cTwk = items.filter(function (x) { return x.subtes === 'TWK'; }).length;
        const cTiu = items.filter(function (x) { return x.subtes === 'TIU'; }).length;
        const cTkp = items.filter(function (x) { return x.subtes === 'TKP'; }).length;
        sum.textContent = '✓ Siap diimpor: ' + items.length + ' soal (TWK: ' + cTwk + ' • TIU: ' + cTiu + ' • TKP: ' + cTkp + ')';
        list.innerHTML = items.slice(0, 6).map(function (x, i) {
          return '<div class="truncate"><b>' + (i + 1) + '. [' + esc(x.subtes) + ']</b> ' + esc(x.pertanyaan) + '</div>';
        }).join('') + (items.length > 6 ? '<div class="text-[#1F8A5B] font-semibold">...dan ' + (items.length - 6) + ' soal lainnya</div>' : '');
        box.classList.remove('hidden');
        btn.disabled = false;
      };
      reader.readAsText(f, 'UTF-8');
    },
    submitBulkImport: async function () {
      const items = window._parsedImportItems || [];
      if (!items.length) return;
      const btn = document.getElementById('btn-submit-csv');
      if (btn) { btn.disabled = true; btn.textContent = 'Mengimpor ' + items.length + ' soal...'; }
      try {
        const res = await ApiClient.call('admin.importQuestions', {
          paket_id: state.selectedPaketId,
          items: items
        });
        App.closeModal();
        App.toast('Berhasil mengimpor ' + res.imported + ' soal! Total di paket ini: ' + res.totalInPackage + ' soal.', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) {
        App.toast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Simpan Soal Massal ke Database'; }
      }
    },
    openPackageModal: function () {
      App.openModal('Tambah Paket Tryout Baru', `
        <form onsubmit="AdminPanel.savePackage(event)" class="space-y-3 text-sm">
          <div><label class="text-xs font-semibold">Nama Paket</label><input id="pkg-nama" required class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" placeholder="Misal: Tryout Akbar SKD #02" /></div>
          <div><label class="text-xs font-semibold">Deskripsi</label><textarea id="pkg-desk" rows="2" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold">Tier Akses</label><select id="pkg-tier" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]"><option value="Latihan">Latihan (Gratis)</option><option value="Pro">Pro (Premium)</option></select></div>
            <div><label class="text-xs font-semibold">Kategori</label><input id="pkg-kat" value="CPNS SKD" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold">Durasi (Menit)</label><input id="pkg-dur" type="number" value="100" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
            <div><label class="text-xs font-semibold">Target Jumlah Soal</label><input id="pkg-jml" type="number" value="110" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="text-xs font-semibold">PG TWK</label><input id="pkg-twk" type="number" value="65" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
            <div><label class="text-xs font-semibold">PG TIU</label><input id="pkg-tiu" type="number" value="80" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
            <div><label class="text-xs font-semibold">PG TKP</label><input id="pkg-tkp" type="number" value="166" class="mt-1 w-full px-3 py-2 rounded-xl border border-[#E2E8F0]" /></div>
          </div>
          <button type="submit" class="btn-primary w-full py-2.5 text-sm">Simpan Paket</button>
        </form>
      `);
    },
    savePackage: async function (e) {
      e.preventDefault();
      try {
        await ApiClient.call('admin.savePackage', {
          nama_paket: document.getElementById('pkg-nama').value,
          deskripsi: document.getElementById('pkg-desk').value,
          tier_akses: document.getElementById('pkg-tier').value,
          kategori_label: document.getElementById('pkg-kat').value,
          durasi_menit: Number(document.getElementById('pkg-dur').value),
          jumlah_soal: Number(document.getElementById('pkg-jml').value),
          pg_twk: Number(document.getElementById('pkg-twk').value),
          pg_tiu: Number(document.getElementById('pkg-tiu').value),
          pg_tkp: Number(document.getElementById('pkg-tkp').value)
        });
        App.closeModal();
        App.toast('Paket tryout baru berhasil ditambahkan!', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setRepFilter: function (k, v, pos) {
      if (k === 'paket') state.repFilterPaket = v;
      if (k === 'status') state.repFilterStatus = v;
      if (k === 'search') state.repSearch = v;
      paintShell(document.getElementById('app'));
      if (k === 'search') refocusInput('adm-rep-search', pos);
    },
    exportReportsCSV: function () {
      const rows = [['Nama Peserta', 'Paket', 'TWK', 'TIU', 'TKP', 'Total', 'Status', 'Waktu Selesai']];
      getFilteredReports().forEach(function (h) {
        rows.push([h.nama_user, h.nama_paket, h.skor_twk, h.skor_tiu, h.skor_tkp, h.skor_total, h.status_kelulusan, h.waktu_selesai]);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Laporan_Skor_SimulasiTKD_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      App.toast('Laporan CSV berhasil diunduh!', 'success');
    },
    syncCrm: async function () {
      try {
        const res = await ApiClient.call('admin.crmSync');
        App.toast('CRM tersinkron! +' + res.inserted + ' kontak baru.', 'success');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    validateWa: async function () {
      try {
        const res = await ApiClient.call('admin.crmValidateWA');
        App.toast('Validasi WA selesai: ' + res.registered + '/' + res.checked + ' nomor terdaftar.', 'success');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    saveNotifToggle: async function () {
      try {
        await ApiClient.call('admin.saveNotifConfig', {
          waAktif: document.getElementById('cfg-wa').checked,
          emailAktif: document.getElementById('cfg-em').checked
        });
        App.toast('Pengaturan kanal notifikasi disimpan.', 'success');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    sendBlast: async function (e) {
      e.preventDefault();
      try {
        const res = await ApiClient.call('admin.createBlast', {
          judul: document.getElementById('bl-judul').value,
          sasaran: document.getElementById('bl-sasaran').value,
          pesan: document.getElementById('bl-pesan').value
        });
        App.toast(res.message, 'success');
        render(document.getElementById('app'), 'crm');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    toggleOptOut: async function (kid, val) {
      try {
        await ApiClient.call('admin.crmUpdate', { kontakId: kid, optOut: val });
        App.toast('Status Opt-Out kontak diperbarui.', 'info');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    addAdminEmail: async function (e) {
      e.preventDefault();
      const email = document.getElementById('adm-new-email').value.trim();
      const nama = document.getElementById('adm-new-nama').value.trim();
      try {
        state.adminEmailsData = await ApiClient.call('admin.addAdminEmail', { email: email, nama: nama });
        App.toast('Email ' + email + ' berhasil dijadikan Admin & disinkronkan!', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    quickPromoteAdmin: async function (email, nama) {
      if (!confirm('Jadikan ' + email + ' sebagai Administrator?')) return;
      try {
        state.adminEmailsData = await ApiClient.call('admin.addAdminEmail', { email: email, nama: nama });
        App.toast(email + ' kini berstatus Admin & tersinkron!', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    removeAdminEmail: async function (email) {
      if (!confirm('Cabut akses Admin dari ' + email + '? Sesi aktif akun tersebut akan otomatis logout.')) return;
      try {
        state.adminEmailsData = await ApiClient.call('admin.removeAdminEmail', { email: email });
        App.toast('Akses Admin ' + email + ' berhasil dicabut.', 'info');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    syncAdminEmails: async function () {
      try {
        state.adminEmailsData = await ApiClient.call('admin.syncAdminEmails');
        App.toast('Sinkronisasi Email Admin selesai! (' + (state.adminEmailsData.admins || []).length + ' email tersinkron)', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setUserTier: async function (userId, role) {
      try {
        await ApiClient.call('admin.updateUserTier', { user_id: userId, role: role });
        App.toast('Tier akun diperbarui menjadi ' + role + '.', 'success');
        render(document.getElementById('app'), 'admins');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setUserSearch: function (q, pos) { state.userSearch = q; paintShell(document.getElementById('app')); refocusInput('adm-user-search', pos); },
    setUserRoleFilter: function (r) { state.userRoleFilter = r; paintShell(document.getElementById('app')); },
    openCreateUserModal: function () {
      App.openModal('Tambah User Baru', `
        <form onsubmit="AdminPanel.createUser(event)" class="space-y-3.5 text-sm">
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Nama Lengkap</label>
            <input type="text" id="cu-nama" required minlength="3" placeholder="Nama lengkap peserta / admin" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0]" />
          </div>
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Email</label>
            <input type="email" id="cu-email" required placeholder="nama@gmail.com" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0]" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">No. WhatsApp (Opsional)</label>
              <input type="tel" id="cu-wa" placeholder="0812xxxxxxxx" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0]" />
            </div>
            <div>
              <label class="text-xs font-semibold text-[#4B5563]">Role / Tier Akun</label>
              <select id="cu-role" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] bg-white font-semibold">
                <option value="Latihan">Latihan (Gratis)</option>
                <option value="Pro">Pro (Premium)</option>
                <option value="Admin">Admin (Panel Kontrol)</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Kata Sandi (Min. 6 Karakter)</label>
            <input type="password" id="cu-pass" required minlength="6" placeholder="Buat kata sandi awal" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0]" />
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-xs">Simpan User Baru</button>
        </form>
      `);
    },
    createUser: async function (e) {
      e.preventDefault();
      try {
        const res = await ApiClient.call('admin.createUser', {
          nama_lengkap: document.getElementById('cu-nama').value,
          email: document.getElementById('cu-email').value,
          no_wa: document.getElementById('cu-wa').value,
          role: document.getElementById('cu-role').value,
          password: document.getElementById('cu-pass').value
        });
        App.closeModal();
        App.toast('User ' + res.nama_lengkap + ' (' + res.role + ') berhasil ditambahkan!', 'success');
        render(document.getElementById('app'), 'admins');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    deleteUser: async function (userId, email) {
      if (!confirm('Hapus permanen user ' + email + ' dari database? Sesi login user tersebut akan langsung dicabut.')) return;
      try {
        await ApiClient.call('admin.deleteUser', { user_id: userId });
        App.toast('User ' + email + ' berhasil dihapus.', 'info');
        render(document.getElementById('app'), 'admins');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    saveOAuthSettings: async function (e) {
      e.preventDefault();
      const cid = document.getElementById('oauth-client-id').value.trim();
      const aktif = document.getElementById('oauth-aktif').checked ? 'YA' : 'TIDAK';
      const secrets = {};
      if (cid) secrets.GOOGLE_CLIENT_ID = cid;
      try {
        state.secretsData = await ApiClient.call('admin.saveSecret', {
          secrets: secrets,
          settings: { OAUTH_GOOGLE_AKTIF: aktif }
        });
        App.toast('Pengaturan Google OAuth 2.0 berhasil disimpan!', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    copyOrigin: function () {
      const el = document.getElementById('oauth-origin-url');
      if (!el) return;
      navigator.clipboard.writeText(el.value).then(function () {
        App.toast('Origin berhasil disalin: ' + el.value, 'success');
      }).catch(function () {
        el.select(); document.execCommand('copy');
        App.toast('Origin disalin!', 'success');
      });
    },
    openOAuthGuideModal: function () {
      const origin = (window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin : 'https://USERNAME.github.io';
      App.openModal('Panduan Setup Google OAuth 2.0', `
        <ol class="space-y-3 text-xs text-[#4B5563] list-decimal pl-4 leading-relaxed">
          <li>Buka <b>Google Cloud Console</b> (<code>console.cloud.google.com</code>) dan buat / pilih proyek Anda.</li>
          <li>Masuk ke menu <b>APIs &amp; Services → OAuth consent screen</b> → pilih <b>External</b> → isi nama aplikasi <b>SimulasiTKD Pro</b> &amp; email kontak → simpan.</li>
          <li>Masuk ke menu <b>APIs &amp; Services → Credentials</b> → klik <b>+ CREATE CREDENTIALS → OAuth client ID</b>.</li>
          <li>Pilih Application type: <b>Web application</b>.</li>
          <li>Pada bagian <b>Authorized JavaScript origins</b>, klik <b>+ ADD URI</b> lalu tempelkan domain Anda:<br/>
            <code class="inline-block mt-1 px-2 py-1 rounded bg-[#E8F5EE] text-[#0E3B2C] font-bold">${esc(origin)}</code>
          </li>
          <li>Klik <b>Create</b>, lalu salin <b>Client ID</b> (berakhiran <code>.apps.googleusercontent.com</code>).</li>
          <li>Tempelkan Client ID tersebut ke kolom <b>Google OAuth 2.0 Client ID</b> di Panel Admin ini dan klik <b>Simpan</b>. Selesai!</li>
        </ol>
      `);
    },
    saveSecrets: async function (e) {
      e.preventDefault();
      const secrets = {};
      ['FONNTE_TOKEN', 'WEBHOOK_SECRET'].forEach(function (k) {
        const el = document.getElementById('sec-' + k);
        if (el && el.value.trim()) secrets[k] = el.value.trim();
      });
      const settings = {
        INFO_REKENING_PRO: document.getElementById('set-rekening').value.trim(),
        HARGA_PRO: document.getElementById('set-harga').value.trim(),
        WA_ADMIN: document.getElementById('set-wa').value.trim()
      };
      try {
        state.secretsData = await ApiClient.call('admin.saveSecret', { secrets: secrets, settings: settings });
        App.toast('Rahasia & pengaturan tersimpan aman di Script Properties!', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    runMigration: async function (dryRun) {
      const src = document.getElementById('mig-source').value.trim();
      if (!src) { App.toast('Masukkan ID atau URL Spreadsheet lama terlebih dahulu.', 'warning'); return; }
      if (!dryRun && !confirm('Jalankan sinkronisasi nyata (Delta-Sync) dari spreadsheet lama ke database baru?')) return;
      try {
        state.migrationResult = await ApiClient.call('admin.runMigration', { sourceIdOrUrl: src, dryRun: dryRun });
        App.toast(dryRun ? 'Pindai Dry-Run selesai!' : 'Migrasi Delta-Sync berhasil dijalankan!', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    }
  };
})();
