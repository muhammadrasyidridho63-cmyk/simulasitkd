/**
 * ============================================================================
 * SimulasiTKD Pro — js/admin.js
 * Panel Kontrol Admin (Unslop Redline Polish: Quiet Chrome, 4px Grid, Tabular Mono)
 * ============================================================================
 */

const AdminPanel = (function () {
  let state = {
    tab: 'overview', // overview | questions | crm | admins | security
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

  function refreshIcons() {
    if (window.lucide) {
      lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    }
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
      { id: 'overview', label: 'Ringkasan analitik', icon: 'bar-chart-3', badge: pendingCount > 0 ? pendingCount : '' },
      { id: 'questions', label: 'Bank soal & paket', icon: 'file-question' },
      { id: 'crm', label: 'Notifikasi WA & CRM', icon: 'message-square-text' },
      { id: 'admins', label: 'Kelola admin', icon: 'user-cog' },
      { id: 'security', label: 'Keamanan & migrasi', icon: 'shield-check' }
    ];

    const navHtml = navItems.map(function (item) {
      const active = state.tab === item.id;
      return `
        <button type="button" onclick="AdminPanel.switchTab('${item.id}')"
          class="admin-nav-link ${active ? 'active font-medium' : 'text-white/75 hover:bg-white/10 hover:text-white'} w-full flex items-center justify-between px-3 text-sm text-left">
          <span class="flex items-center gap-2.5 min-w-0">
            <span class="w-4 h-4 flex items-center justify-center shrink-0"><i data-lucide="${item.icon}" class="w-4 h-4"></i></span>
            <span class="truncate">${item.label}</span>
          </span>
          ${item.badge ? `<span class="font-mono-num text-xs text-white/90 px-1.5 py-0.5 rounded bg-white/15">${item.badge}</span>` : ''}
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="min-h-screen flex bg-[#F6F7F6]">
        <!-- Desktop Sidebar (256px / w-64, 36px rows, 4px gap) -->
        <aside class="hidden lg:flex lg:flex-col w-64 bg-[#0E3B2C] text-white fixed inset-y-0 left-0 z-30 no-print">
          <div class="h-16 px-4 flex items-center gap-2.5 border-b border-white/10">
            <div class="w-7 h-7 rounded-md bg-white text-[#0E3B2C] flex items-center justify-center shrink-0">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="font-heading font-semibold text-sm leading-tight truncate">SimulasiTKD Pro</div>
              <div class="text-xs text-white/65 leading-tight">Panel kontrol admin</div>
            </div>
          </div>
          <nav class="flex-1 p-3 space-y-1">${navHtml}</nav>
          <div class="p-3 border-t border-white/10 space-y-1">
            <button type="button" onclick="App.go('dashboard')" class="admin-nav-link w-full flex items-center gap-2.5 px-3 text-sm text-white/75 hover:bg-white/10 hover:text-white">
              <span class="w-4 h-4 flex items-center justify-center shrink-0"><i data-lucide="eye" class="w-4 h-4"></i></span>
              <span>Portal peserta</span>
            </button>
            <button type="button" onclick="App.logout()" class="admin-nav-link w-full flex items-center gap-2.5 px-3 text-sm text-red-200 hover:bg-red-500/20">
              <span class="w-4 h-4 flex items-center justify-center shrink-0"><i data-lucide="log-out" class="w-4 h-4"></i></span>
              <span>Keluar</span>
            </button>
          </div>
        </aside>

        <!-- Mobile Drawer -->
        ${state.mobileSidebarOpen ? `
          <div class="fixed inset-0 z-50 lg:hidden flex">
            <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick="AdminPanel.toggleSidebar(false)"></div>
            <aside class="relative w-64 max-w-[80vw] bg-[#0E3B2C] text-white flex flex-col z-10">
              <div class="h-16 px-4 flex items-center justify-between border-b border-white/10">
                <span class="font-heading font-semibold text-sm">Panel kontrol admin</span>
                <button type="button" onclick="AdminPanel.toggleSidebar(false)" class="w-8 h-8 rounded-lg hover:bg-white/10 inline-flex items-center justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>
              <nav class="flex-1 p-3 space-y-1">${navHtml}</nav>
              <div class="p-3 border-t border-white/10 space-y-1">
                <button type="button" onclick="App.go('dashboard')" class="admin-nav-link w-full flex items-center gap-2.5 px-3 text-sm text-white/75 hover:bg-white/10 hover:text-white">
                  <i data-lucide="eye" class="w-4 h-4"></i>
                  <span>Portal peserta</span>
                </button>
                <button type="button" onclick="App.logout()" class="admin-nav-link w-full flex items-center gap-2.5 px-3 text-sm text-red-200 hover:bg-red-500/20">
                  <i data-lucide="log-out" class="w-4 h-4"></i>
                  <span>Keluar</span>
                </button>
              </div>
            </aside>
          </div>
        ` : ''}

        <!-- Main Content Area -->
        <div class="flex-1 lg:pl-64 flex flex-col min-w-0">
          <header class="h-16 bg-white border-b border-[#E4E7E6] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-20 no-print">
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.toggleSidebar(true)" class="lg:hidden w-9 h-9 rounded-lg border border-[#E4E7E6] text-[#11181C] inline-flex items-center justify-center">
                <i data-lucide="menu" class="w-4 h-4"></i>
              </button>
              <span class="font-heading font-medium text-sm text-[#11181C]">Administrasi sistem</span>
              ${ApiClient.isDemoMode() ? '<span class="hidden sm:inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-[#FEF3C7] text-[#92400E]">Mode pratinjau lokal</span>' : ''}
            </div>
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.refresh()" class="w-9 h-9 rounded-lg border border-[#E4E7E6] text-[#4B5358] hover:bg-[#EFF1F0] inline-flex items-center justify-center transition-colors duration-150" title="Muat ulang data">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              </button>
              <div class="hidden sm:block text-right">
                <div class="text-xs font-medium text-[#11181C] leading-tight">${esc(savedAdmin.nama_lengkap || 'Administrator')}</div>
                <div class="text-xs text-[#687076] leading-tight">${esc(savedAdmin.email || '')}</div>
              </div>
              <div class="w-8 h-8 rounded-lg bg-[#0E3B2C] text-white flex items-center justify-center text-xs font-medium">${esc(adminInitials)}</div>
            </div>
          </header>

          <main class="p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
            ${state.tab === 'overview' ? renderOverview() : ''}
            ${state.tab === 'questions' ? renderQuestionsAndReports() : ''}
            ${state.tab === 'crm' ? renderCrmWa() : ''}
            ${state.tab === 'admins' ? renderAdminEmails() : ''}
            ${state.tab === 'security' ? renderSecurityMigration() : ''}
          </main>
        </div>
      </div>
    `;
    refreshIcons();
  }

  // --------------------------------------------------------------------------
  // TAB 1: RINGKASAN ANALITIK & ANTREAN PERSETUJUAN PRO
  // --------------------------------------------------------------------------
  function renderOverview() {
    if (!state.overview) {
      return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="skeleton h-28"></div><div class="skeleton h-28"></div><div class="skeleton h-28"></div><div class="skeleton h-28"></div>
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
      const badgeCls = r.status_verifikasi === 'Approved' ? 'bg-[#E8F5EE] text-[#166534]'
        : r.status_verifikasi === 'Rejected' ? 'bg-[#FEE2E2] text-[#991B1B]'
        : 'bg-[#FEF3C7] text-[#92400E]';
      return `
        <tr class="border-b border-[#E4E7E6] last:border-b-0 hover:bg-[#F6F7F6] transition-colors duration-150">
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-md bg-[#EFF1F0] text-[#11181C] font-medium text-xs flex items-center justify-center shrink-0">${esc(initials)}</div>
              <div>
                <div class="font-medium text-sm text-[#11181C]">${esc(r.nama_user)}</div>
                <div class="text-xs text-[#687076] sm:hidden">${esc(r.email_user)}</div>
              </div>
            </div>
          </td>
          <td class="py-3 px-4 text-sm text-[#4B5358] hidden sm:table-cell">${esc(r.email_user)}</td>
          <td class="py-3 px-4 text-xs font-mono-num text-[#687076] hidden md:table-cell">${fmtDate(r.tanggal_request)}</td>
          <td class="py-3 px-4">
            <button type="button" onclick="AdminPanel.previewProof('${esc(r.req_id)}')" class="btn-outline h-8 px-3 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="file-image" class="w-4 h-4 text-[#687076]"></i>
              <span>Bukti</span>
            </button>
          </td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md text-xs font-medium ${badgeCls}">${esc(r.status_verifikasi)}</span></td>
          <td class="py-3 px-4 text-right">
            ${r.status_verifikasi === 'Pending' ? `
              <div class="inline-flex items-center gap-2">
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Approved')" class="btn-primary h-8 px-3 text-xs">Setujui</button>
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Rejected')" class="h-8 px-3 rounded-lg bg-[#FEE2E2] hover:bg-red-200 text-[#991B1B] text-xs font-medium transition-colors duration-150">Tolak</button>
              </div>
            ` : `<span class="text-xs text-[#687076]">${esc(r.catatan_admin || 'Selesai')}</span>`}
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="6" class="py-10 text-center text-sm text-[#687076]">Tidak ada pengajuan upgrade yang sesuai filter</td></tr>`;

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-medium text-[#166E48]">Ringkasan operasional</div>
          <h1 class="text-2xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Analitik &amp; verifikasi akun Pro</h1>
        </div>
        <button type="button" onclick="AdminPanel.switchTab('questions')" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2 self-start sm:self-auto">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Laporan skor</span>
        </button>
      </div>

      <!-- 4 KPI Stat Cards (Numbers Only, Zero Decorative Filler Icons) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card-stitch p-5 space-y-2">
          <div class="text-xs text-[#687076]">Total peserta</div>
          <div class="text-3xl font-mono-num font-medium text-[#11181C]">${k.totalPeserta}</div>
          <div class="text-xs text-[#4B5358]">Akun terdaftar aktif</div>
        </div>
        <div class="card-stitch p-5 space-y-2">
          <div class="text-xs text-[#687076]">Akun Pro aktif</div>
          <div class="text-3xl font-mono-num font-medium text-[#11181C]">${k.totalPro}</div>
          <div class="text-xs text-[#4B5358]"><span class="font-mono-num text-[#166534] font-medium">${k.rasioPro}%</span> konversi dari total peserta</div>
        </div>
        <div class="card-stitch p-5 space-y-2">
          <div class="text-xs text-[#687076]">Antrean verifikasi</div>
          <div class="text-3xl font-mono-num font-medium text-[#11181C]">${k.pendingUpgrade}</div>
          <div class="text-xs text-[#4B5358]">${k.pendingUpgrade > 0 ? 'Menunggu pemeriksaan bukti bayar' : 'Tidak ada antrean tertunda'}</div>
        </div>
        <div class="card-stitch p-5 space-y-2">
          <div class="text-xs text-[#687076]">Tingkat kelulusan</div>
          <div class="text-3xl font-mono-num font-medium text-[#11181C]">${k.passRate}%</div>
          <div class="text-xs text-[#4B5358]">Memenuhi ambang batas BKN</div>
        </div>
      </div>

      <!-- Asymmetric Chart Hierarchy (8 cols Weekly Activity + 4 cols Tier Breakdown) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div class="card-stitch p-6 lg:col-span-8 flex flex-col justify-between space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-heading font-medium text-base text-[#11181C]">Aktivitas ujian &amp; kelulusan mingguan</h3>
              <p class="text-xs text-[#687076]">Jumlah pengerjaan simulasi dan peserta lulus 7 hari terakhir</p>
            </div>
            <div class="flex items-center gap-4 text-xs text-[#687076]">
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#0E3B2C]"></span> Lulus PG</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#D6DBD9]"></span> Total ujian</span>
            </div>
          </div>
          <div class="h-60"><canvas id="chartAdminWeekly"></canvas></div>
        </div>
        <div class="card-stitch p-6 lg:col-span-4 flex flex-col justify-between space-y-4">
          <div>
            <h3 class="font-heading font-medium text-base text-[#11181C]">Komposisi tier akun</h3>
            <p class="text-xs text-[#687076]">Proporsi peserta Pro dan Latihan</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-32 h-32 relative shrink-0"><canvas id="chartAdminTier"></canvas></div>
            <div class="space-y-2 flex-1 text-xs">
              <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] flex items-center justify-between">
                <span class="text-[#11181C] font-medium">Akun Pro</span>
                <span class="font-mono-num font-medium text-sm text-[#11181C]">${k.totalPro}</span>
              </div>
              <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] flex items-center justify-between">
                <span class="text-[#4B5358]">Latihan</span>
                <span class="font-mono-num font-medium text-sm text-[#11181C]">${k.totalLatihan}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Antrean Persetujuan Upgrade Pro -->
      <div class="card-stitch p-6 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 class="font-heading font-medium text-base text-[#11181C]">Antrean persetujuan upgrade Pro</h3>
            <p class="text-xs text-[#687076]">Periksa bukti pembayaran untuk mengaktifkan akses penuh peserta</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input type="text" value="${esc(state.upgradeSearch)}" oninput="AdminPanel.setUpgradeSearch(this.value)" placeholder="Cari nama atau email"
              class="input-control h-9 text-xs w-48" />
            <div class="inline-flex items-center p-1 rounded-lg bg-[#EFF1F0] gap-1">
              ${['Semua', 'Pending', 'Approved', 'Rejected'].map(function (st) {
                const active = state.upgradeFilter === st;
                return `<button type="button" onclick="AdminPanel.setUpgradeFilter('${st}')" class="h-7 px-2.5 rounded-md text-xs font-medium transition-colors duration-150 ${active ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">${st}</button>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                <th class="py-3 px-4 font-medium">Peserta</th>
                <th class="py-3 px-4 font-medium hidden sm:table-cell">Email</th>
                <th class="py-3 px-4 font-medium hidden md:table-cell">Tanggal</th>
                <th class="py-3 px-4 font-medium">Bukti bayar</th>
                <th class="py-3 px-4 font-medium">Status</th>
                <th class="py-3 px-4 text-right font-medium">Aksi</th>
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
    const monoFont = { family: "'IBM Plex Mono', monospace", size: 11 };
    const gridColor = 'rgba(17, 24, 28, 0.06)';
    const tickColor = '#687076';

    const ctx1 = document.getElementById('chartAdminTier');
    if (ctx1) {
      charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Akun Pro', 'Latihan'],
          datasets: [{ data: [k.totalPro || 0, k.totalLatihan || 1], backgroundColor: ['#0E3B2C', '#D6DBD9'], borderWidth: 0 }]
        },
        options: { cutout: '72%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
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
            { label: 'Lulus PG', data: w.map(function (d) { return d.lulus; }), backgroundColor: '#0E3B2C', borderRadius: 4, barPercentage: 0.6 },
            { label: 'Total ujian', data: w.map(function (d) { return d.total; }), backgroundColor: '#D6DBD9', borderRadius: 4, barPercentage: 0.6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: tickColor, font: monoFont } },
            x: { grid: { display: false }, border: { display: false }, ticks: { color: tickColor, font: monoFont } }
          }
        }
      }));
    }
  }

  // --------------------------------------------------------------------------
  // TAB 2: BANK SOAL, EDITOR PAKET & LAPORAN SKOR
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

    const repList = (state.reports.hasil || []).filter(function (h) {
      const mp = !state.repFilterPaket || h.paket_id === state.repFilterPaket;
      const ms = !state.repFilterStatus || h.status_kelulusan === state.repFilterStatus;
      const mq = !state.repSearch || String(h.nama_user).toLowerCase().includes(state.repSearch.toLowerCase());
      return mp && ms && mq;
    });

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-medium text-[#166E48]">Manajemen konten</div>
          <h1 class="text-2xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Bank soal &amp; editor paket</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="AdminPanel.openPackageModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="folder-plus" class="w-4 h-4 text-[#687076]"></i>
            <span>Paket baru</span>
          </button>
          <button type="button" onclick="AdminPanel.openImportModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="upload" class="w-4 h-4 text-[#687076]"></i>
            <span>Impor CSV</span>
          </button>
          <button type="button" onclick="AdminPanel.newQuestion()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Tambah soal</span>
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="flex flex-wrap items-center gap-2">
        <select onchange="AdminPanel.selectPaket(this.value)" class="input-control h-9 text-xs font-medium">
          ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${p.paket_id === state.selectedPaketId ? 'selected' : ''}>${esc(p.nama_paket)} (${esc(p.tier_akses)})</option>`; }).join('')}
        </select>
        <div class="inline-flex items-center p-1 rounded-lg bg-[#EFF1F0] gap-1">
          ${['Semua', 'TWK', 'TIU', 'TKP'].map(function (st) {
            const active = state.qSubtesFilter === st;
            return `<button type="button" onclick="AdminPanel.setQSubtes('${st}')" class="h-7 px-3 rounded-md text-xs font-medium transition-colors duration-150 ${active ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">${st}</button>`;
          }).join('')}
        </div>
        <input type="text" value="${esc(state.qSearch)}" oninput="AdminPanel.setQSearch(this.value)" placeholder="Cari soal"
          class="input-control h-9 text-xs w-56 sm:ml-auto" />
      </div>

      <!-- Split Question List + Editor -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="card-stitch p-4 lg:col-span-4 space-y-2 max-h-[640px] overflow-y-auto">
          <div class="flex items-center justify-between px-1 pb-1">
            <span class="font-heading font-medium text-sm text-[#11181C]">Daftar butir soal</span>
            <span class="text-xs font-mono-num text-[#687076]">${soalFiltered.length} soal</span>
          </div>
          ${soalFiltered.length ? soalFiltered.map(function (s, idx) {
            const active = ed.soal_id === s.soal_id;
            return `
              <div onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" class="p-3 rounded-lg border cursor-pointer transition-colors duration-150 ${active ? 'bg-[#EAF3EE] border-[#166E48]' : 'bg-[#F6F7F6] border-[#E4E7E6] hover:bg-white'}">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="px-2 py-0.5 rounded bg-white text-[#0E3B2C] font-mono-num font-medium">${esc(s.subtes)}</span>
                  <span class="font-mono-num text-[#687076]">#${s.nomor_urut || idx + 1}</span>
                </div>
                <p class="text-xs text-[#11181C] line-clamp-2 leading-relaxed">${esc(s.pertanyaan)}</p>
              </div>`;
          }).join('') : `<div class="py-10 text-center text-xs text-[#687076]">Belum ada soal di paket ini, klik Tambah soal</div>`}
        </div>

        <form onsubmit="AdminPanel.saveQuestion(event)" class="card-stitch p-6 lg:col-span-8 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#E4E7E6]">
            <div>
              <h3 class="font-heading font-medium text-base text-[#11181C]">${ed.soal_id ? 'Edit soal #' + esc(ed.nomor_urut) : 'Buat soal baru'}</h3>
              <p class="text-xs text-[#687076]">Atur materi, kunci jawaban TWK/TIU atau bobot 1–5 TKP, dan pembahasan</p>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="q-nomor" value="${ed.nomor_urut || 1}" min="1" class="input-control h-9 w-16 text-xs font-mono-num font-medium" title="Nomor urut" />
              <select id="q-subtes" onchange="AdminPanel.changeEditorSubtes(this.value)" class="input-control h-9 text-xs font-medium bg-[#EAF3EE] text-[#0E3B2C] border-[#166E48]/30">
                <option value="TWK" ${ed.subtes === 'TWK' ? 'selected' : ''}>Subtes: TWK</option>
                <option value="TIU" ${ed.subtes === 'TIU' ? 'selected' : ''}>Subtes: TIU</option>
                <option value="TKP" ${ed.subtes === 'TKP' ? 'selected' : ''}>Subtes: TKP</option>
              </select>
            </div>
          </div>

          <input type="hidden" id="q-id" value="${esc(ed.soal_id || '')}" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Topik materi</label>
              <input type="text" id="q-topik" value="${esc(ed.topik || '')}" placeholder="Contoh: Pilar negara / Silogisme" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#4B5358]">URL / ID gambar soal (opsional)</label>
              <input type="text" id="q-img" value="${esc(ed.drive_image_id || '')}" placeholder="Tautan gambar Drive" class="input-control mt-1 w-full" />
            </div>
          </div>

          <div>
            <label class="text-xs font-medium text-[#4B5358]">Pertanyaan</label>
            <textarea id="q-pertanyaan" rows="3" required class="mt-1 w-full p-3 rounded-lg border border-[rgba(17,24,28,0.16)] text-sm bg-white">${esc(ed.pertanyaan || '')}</textarea>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-[#4B5358]">Pilihan jawaban (A–E)</label>
              <span class="text-xs text-[#166E48] font-medium">${ed.subtes === 'TKP' ? 'Bobot poin 1–5 tiap opsi' : 'Pilih satu kunci benar (+5)'}</span>
            </div>
            ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
              const val = ed['opsi_' + opt.toLowerCase()] || '';
              return `
                <div class="flex items-center gap-2">
                  <span class="w-8 h-9 rounded-lg bg-[#EFF1F0] text-[#11181C] flex items-center justify-center text-xs font-mono-num font-medium shrink-0">${opt}</span>
                  <input type="text" id="q-opsi-${opt}" value="${esc(val)}" required placeholder="Teks opsi ${opt}" class="input-control h-9 flex-1 text-xs sm:text-sm" />
                  ${ed.subtes === 'TKP' ? `
                    <select id="q-bobot-${opt}" class="input-control h-9 w-20 px-2 text-xs font-mono-num font-medium bg-[#EAF3EE] text-[#0E3B2C]">
                      ${[5, 4, 3, 2, 1].map(function (n) { return `<option value="${n}" ${tkpWeights[opt] === n ? 'selected' : ''}>${n} pt</option>`; }).join('')}
                    </select>
                  ` : `
                    <label class="inline-flex items-center gap-1.5 text-xs font-medium text-[#4B5358] cursor-pointer px-2">
                      <input type="radio" name="q-kunci" value="${opt}" ${String(ed.kunci_atau_bobot).toUpperCase() === opt ? 'checked' : ''} class="accent-[#0E3B2C]" />
                      <span>Benar</span>
                    </label>
                  `}
                </div>`;
            }).join('')}
          </div>

          <div>
            <label class="text-xs font-medium text-[#4B5358]">Pembahasan resmi</label>
            <textarea id="q-pembahasan" rows="2" class="mt-1 w-full p-3 rounded-lg border border-[rgba(17,24,28,0.16)] text-sm bg-white">${esc(ed.pembahasan || '')}</textarea>
          </div>

          <div class="flex items-center justify-between pt-2">
            ${ed.soal_id ? `<button type="button" onclick="AdminPanel.deleteQuestion('${esc(ed.soal_id)}')" class="h-9 px-4 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-xs font-medium hover:bg-red-200 transition-colors duration-150">Hapus soal</button>` : '<div></div>'}
            <button type="submit" class="btn-primary h-10 px-5 text-xs inline-flex items-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>Simpan perubahan</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Laporan Skor & Ekspor Data -->
      <div class="pt-4 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div class="space-y-1">
            <div class="text-xs font-medium text-[#166E48]">Analitik peserta</div>
            <h2 class="text-xl font-heading font-medium text-[#11181C]">Laporan skor &amp; ekspor data</h2>
          </div>
          <div class="flex flex-wrap gap-2 no-print">
            <button type="button" onclick="AdminPanel.exportReportsCSV()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="file-spreadsheet" class="w-4 h-4 text-[#687076]"></i>
              <span>Ekspor CSV</span>
            </button>
            <button type="button" onclick="window.print()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="printer" class="w-4 h-4"></i>
              <span>Cetak PDF</span>
            </button>
          </div>
        </div>

        <div class="card-stitch p-6 space-y-4">
          <div class="flex flex-wrap items-center gap-2 no-print">
            <select onchange="AdminPanel.setRepFilter('paket', this.value)" class="input-control h-9 text-xs">
              <option value="">Semua paket</option>
              ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${state.repFilterPaket === p.paket_id ? 'selected' : ''}>${esc(p.nama_paket)}</option>`; }).join('')}
            </select>
            <select onchange="AdminPanel.setRepFilter('status', this.value)" class="input-control h-9 text-xs">
              <option value="">Semua status</option>
              <option value="Lulus" ${state.repFilterStatus === 'Lulus' ? 'selected' : ''}>Lulus</option>
              <option value="Tidak Lulus" ${state.repFilterStatus === 'Tidak Lulus' ? 'selected' : ''}>Tidak Lulus</option>
            </select>
            <input type="text" value="${esc(state.repSearch)}" oninput="AdminPanel.setRepFilter('search', this.value)" placeholder="Cari peserta" class="input-control h-9 text-xs w-52" />
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-sm">
              <thead>
                <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                  <th class="py-3 px-4 font-medium">Peserta</th>
                  <th class="py-3 px-4 font-medium">Paket</th>
                  <th class="py-3 px-3 text-right font-medium">TWK</th>
                  <th class="py-3 px-3 text-right font-medium">TIU</th>
                  <th class="py-3 px-3 text-right font-medium">TKP</th>
                  <th class="py-3 px-3 text-right font-medium">Total</th>
                  <th class="py-3 px-4 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                ${repList.length ? repList.map(function (h) {
                  const ok = h.status_kelulusan === 'Lulus';
                  return `
                    <tr class="border-b border-[#E4E7E6] last:border-b-0 hover:bg-[#F6F7F6] transition-colors duration-150">
                      <td class="py-3 px-4 font-medium text-[#11181C]">${esc(h.nama_user)}</td>
                      <td class="py-3 px-4 text-xs text-[#4B5358]">${esc(h.nama_paket)}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${h.skor_twk}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${h.skor_tiu}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${h.skor_tkp}</td>
                      <td class="py-3 px-3 text-right font-mono-num font-medium text-[#11181C]">${h.skor_total}</td>
                      <td class="py-3 px-4 text-right">
                        <span class="px-2 py-0.5 rounded-md text-xs font-medium ${ok ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(h.status_kelulusan)}</span>
                      </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" class="py-8 text-center text-xs text-[#687076]">Belum ada riwayat pengerjaan yang sesuai filter</td></tr>`}
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
        <div class="space-y-1">
          <div class="text-xs font-medium text-[#166E48]">Notifikasi &amp; CRM</div>
          <h1 class="text-2xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">WhatsApp gateway, blast, dan kontak</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="AdminPanel.syncCrm()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="refresh-cw" class="w-4 h-4 text-[#687076]"></i>
            <span>Sinkron kontak</span>
          </button>
          <button type="button" onclick="AdminPanel.validateWa()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
            <span>Validasi nomor WA</span>
          </button>
        </div>
      </div>

      <!-- Saklar Kanal & Blast Form -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="card-stitch p-6 lg:col-span-5 space-y-4">
          <h3 class="font-heading font-medium text-base text-[#11181C]">Saklar kanal notifikasi</h3>
          <div class="space-y-3 text-sm">
            <label class="flex items-center justify-between p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] cursor-pointer">
              <div>
                <div class="font-medium text-[#11181C]">Notifikasi WhatsApp (Fonnte)</div>
                <div class="text-xs text-[#687076]">Token: ${cfg.fonnteAda ? '<span class="text-[#166534] font-medium">Terpasang di Script Properties</span>' : '<span class="text-[#991B1B]">Belum diatur di tab Keamanan</span>'}</div>
              </div>
              <input type="checkbox" id="cfg-wa" ${cfg.waAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#0E3B2C]" />
            </label>
            <label class="flex items-center justify-between p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] cursor-pointer">
              <div>
                <div class="font-medium text-[#11181C]">Notifikasi email (MailApp)</div>
                <div class="text-xs text-[#687076]">Antrean non-blocking via pemicu berkala</div>
              </div>
              <input type="checkbox" id="cfg-em" ${cfg.emailAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#0E3B2C]" />
            </label>
          </div>

          <div class="pt-3 border-t border-[#E4E7E6]">
            <div class="text-xs font-medium text-[#4B5358] mb-2">Matriks kejadian otomatis</div>
            <div class="space-y-2 text-xs">
              ${Object.keys(cfg.matriks || {}).map(function (ev) {
                const m = cfg.matriks[ev];
                return `<div class="flex items-center justify-between py-1.5 border-b border-[#E4E7E6] last:border-b-0">
                  <span class="text-[#4B5358]">${esc(m.label || ev)}</span>
                  <span class="flex gap-1.5">
                    <span class="px-2 py-0.5 rounded ${m.wa ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#687076]'}">WA</span>
                    <span class="px-2 py-0.5 rounded ${m.email ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#687076]'}">Email</span>
                  </span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <form onsubmit="AdminPanel.sendBlast(event)" class="card-stitch p-6 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-heading font-medium text-base text-[#11181C]">Blast WhatsApp terjadwal</h3>
            <p class="text-xs text-[#687076]">Melewati kontak bertanda Opt-Out dan mengirim bertahap dengan jeda acak 3–8 detik</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Judul kampanye</label>
              <input type="text" id="bl-judul" required placeholder="Contoh: Pembukaan Tryout SKD #02" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Segmen sasaran</label>
              <select id="bl-sasaran" class="input-control mt-1 w-full">
                <option value="SEMUA">Semua kontak aktif</option>
                <option value="Latihan">Akun Latihan</option>
                <option value="Pro">Akun Pro</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Isi pesan (variabel: <code class="font-mono-num">{nama}</code>, <code class="font-mono-num">{institusi}</code>, <code class="font-mono-num">{link}</code>)</label>
            <textarea id="bl-pesan" rows="3" required placeholder="Halo {nama}, paket Tryout SKD terbaru sudah tersedia di {institusi}" class="mt-1 w-full p-3 rounded-lg border border-[rgba(17,24,28,0.16)] text-sm bg-white"></textarea>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-num text-[#687076]">Batch 20 pesan · Jeda 3–8 detik</span>
            <button type="submit" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="send" class="w-4 h-4"></i>
              <span>Jadwalkan blast</span>
            </button>
          </div>
          ${blasts.length ? `<div class="pt-3 border-t border-[#E4E7E6] text-xs space-y-2">
            <div class="font-medium text-[#4B5358]">Riwayat blast terakhir</div>
            ${blasts.slice(0, 3).map(function (b) {
              return `<div class="flex justify-between p-2.5 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6]"><span><strong class="font-medium text-[#11181C]">${esc(b.Judul)}</strong> (${esc(b.Sasaran)})</span><span class="font-mono-num font-medium text-[#166534]">${b.Terkirim}/${b.Total} · ${esc(b.Status)}</span></div>`;
            }).join('')}
          </div>` : ''}
        </form>
      </div>

      <!-- Tabel CRM Kontak -->
      <div class="card-stitch p-6 space-y-4">
        <h3 class="font-heading font-medium text-base text-[#11181C]">Daftar kontak CRM (${kontak.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                <th class="py-3 px-4 font-medium">Nama &amp; email</th>
                <th class="py-3 px-4 font-medium">Nomor WA</th>
                <th class="py-3 px-4 font-medium">Segmen</th>
                <th class="py-3 px-4 font-medium">Status WA</th>
                <th class="py-3 px-4 text-right font-medium">Status blast</th>
              </tr>
            </thead>
            <tbody>
              ${kontak.map(function (k) {
                const optOut = String(k.OptOut || '').toUpperCase() === 'YA';
                return `
                  <tr class="border-b border-[#E4E7E6] last:border-b-0 hover:bg-[#F6F7F6] transition-colors duration-150">
                    <td class="py-3 px-4"><div class="font-medium text-[#11181C]">${esc(k.Nama)}</div><div class="text-xs text-[#687076]">${esc(k.Email)}</div></td>
                    <td class="py-3 px-4 font-mono-num text-xs text-[#4B5358]">${esc(k.NoWA || '-')}</td>
                    <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md text-xs font-medium ${k.Segmen === 'Pro' ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#4B5358]'}">${esc(k.Segmen)}</span></td>
                    <td class="py-3 px-4 text-xs text-[#4B5358]">${esc(k.StatusWA || 'Belum dicek')}</td>
                    <td class="py-3 px-4 text-right">
                      <button type="button" onclick="AdminPanel.toggleOptOut('${esc(k.KontakID)}', ${!optOut})" class="h-8 px-3 rounded-lg text-xs font-medium transition-colors duration-150 ${optOut ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#EFF1F0] text-[#4B5358] hover:bg-[#E4E7E6]'}">
                        ${optOut ? 'Opt-out aktif' : 'Menerima'}
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
  // TAB 4: KELOLA ADMIN & SINKRONISASI EMAIL
  // --------------------------------------------------------------------------
  function renderAdminEmails() {
    const d = state.adminEmailsData;
    if (!d) return `<div class="space-y-4"><div class="skeleton h-32"></div><div class="skeleton h-52"></div></div>`;
    const admins = d.admins || [];
    const users = d.users || [];

    return `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="space-y-1">
          <div class="text-xs font-medium text-[#166E48]">Otorisasi &amp; akses</div>
          <h1 class="text-2xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Kelola admin &amp; akun terdaftar</h1>
          <p class="text-xs text-[#687076]">Email yang terdaftar pada daftar admin otomatis mendapat hak panel kontrol saat login</p>
        </div>
        <button type="button" onclick="AdminPanel.syncAdminEmails()" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          <span>Sinkronkan email</span>
        </button>
      </div>

      <!-- Info Akun Aktif & Form Tambah Email Admin -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="card-stitch p-6 lg:col-span-5 space-y-3">
          <div class="text-xs font-medium text-[#687076]">Status sesi saat ini</div>
          <div class="p-3 rounded-lg bg-[#EAF3EE] text-[#0E3B2C] space-y-1 text-xs">
            <div>Email login aktif</div>
            <div class="font-mono-num text-sm font-medium break-all">${esc(d.currentEmail || '-')}</div>
          </div>
          <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] space-y-1 text-xs">
            <div class="text-[#687076]">Pemilik Google Apps Script</div>
            <div class="font-mono-num font-medium text-[#11181C] break-all">${esc(d.ownerEmail || 'Terdeteksi otomatis di GAS')}</div>
          </div>
        </div>

        <form onsubmit="AdminPanel.addAdminEmail(event)" class="card-stitch p-6 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-heading font-medium text-base text-[#11181C]">Tambah email administrator</h3>
            <p class="text-xs text-[#687076]">Disinkronkan ke Script Properties dan tabel Users secara otomatis</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Alamat email</label>
              <input type="email" id="adm-new-email" required placeholder="admin@instansi.id" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Nama tampilan (opsional)</label>
              <input type="text" id="adm-new-nama" placeholder="Contoh: Pengelola Tryout" class="input-control mt-1 w-full" />
            </div>
          </div>
          <button type="submit" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            <span>Tambahkan admin</span>
          </button>
        </form>
      </div>

      <!-- Tabel Daftar Email Admin Tersinkron -->
      <div class="card-stitch p-6 space-y-4">
        <h3 class="font-heading font-medium text-base text-[#11181C]">Daftar email admin aktif (${admins.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                <th class="py-3 px-4 font-medium">Email</th>
                <th class="py-3 px-4 font-medium">Nama pengguna</th>
                <th class="py-3 px-4 font-medium">Status sinkron</th>
                <th class="py-3 px-4 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${admins.length ? admins.map(function (a) {
                return `
                  <tr class="border-b border-[#E4E7E6] last:border-b-0">
                    <td class="py-3 px-4 font-medium text-[#11181C]">
                      ${esc(a.email)}
                      ${a.isOwner ? '<span class="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-[#0E3B2C] text-white">Pemilik</span>' : ''}
                    </td>
                    <td class="py-3 px-4 text-xs text-[#4B5358]">${esc(a.nama)}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 rounded-md text-xs font-medium ${a.syncedRole === 'Admin' ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}">
                        ${a.syncedRole === 'Admin' ? 'Tersinkron (Admin)' : esc(a.syncedRole)}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right">
                      ${a.email !== d.currentEmail ? `
                        <button type="button" onclick="AdminPanel.removeAdminEmail('${esc(a.email)}')" class="h-8 px-3 rounded-lg bg-[#FEE2E2] text-[#991B1B] text-xs font-medium hover:bg-red-200 transition-colors duration-150">Cabut akses</button>
                      ` : '<span class="text-xs text-[#687076]">Sesi aktif</span>'}
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="4" class="py-8 text-center text-xs text-[#687076]">Belum ada email admin tersimpan</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tabel Semua Pengguna -->
      <div class="card-stitch p-6 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 class="font-heading font-medium text-base text-[#11181C]">Manajemen akun terdaftar (${users.length})</h3>
            <p class="text-xs text-[#687076]">Tambah pengguna baru, ubah tier akses, atau hapus akun peserta</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input type="text" value="${esc(state.userSearch)}" oninput="AdminPanel.setUserSearch(this.value)" placeholder="Cari nama atau email"
              class="input-control h-9 text-xs w-44" />
            <select onchange="AdminPanel.setUserRoleFilter(this.value)" class="input-control h-9 text-xs font-medium">
              ${['Semua', 'Latihan', 'Pro', 'Admin'].map(function (r) {
                return `<option value="${r}" ${state.userRoleFilter === r ? 'selected' : ''}>${r === 'Semua' ? 'Semua peran' : r}</option>`;
              }).join('')}
            </select>
            <button type="button" onclick="AdminPanel.openCreateUserModal()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="user-plus" class="w-4 h-4"></i>
              <span>Tambah pengguna</span>
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                <th class="py-3 px-4 font-medium">Nama &amp; email</th>
                <th class="py-3 px-4 font-medium hidden sm:table-cell">Nomor WA</th>
                <th class="py-3 px-4 font-medium">Peran</th>
                <th class="py-3 px-4 text-right font-medium">Aksi</th>
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
                if (!filtered.length) return `<tr><td colspan="4" class="py-8 text-center text-xs text-[#687076]">Tidak ada pengguna yang sesuai filter</td></tr>`;
                return filtered.map(function (u) {
                  const badge = u.role === 'Admin' ? 'bg-[#0E3B2C] text-white' : u.role === 'Pro' ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#4B5358]';
                  const isSelf = String(u.email || '').toLowerCase() === String(d.currentEmail || '').toLowerCase();
                  return `
                    <tr class="border-b border-[#E4E7E6] last:border-b-0 hover:bg-[#F6F7F6] transition-colors duration-150">
                      <td class="py-3 px-4">
                        <div class="font-medium text-[#11181C]">${esc(u.nama_lengkap)} ${isSelf ? '<span class="ml-1 text-xs text-[#166E48]">(Anda)</span>' : ''}</div>
                        <div class="text-xs text-[#687076]">${esc(u.email)}</div>
                      </td>
                      <td class="py-3 px-4 text-xs text-[#4B5358] font-mono-num hidden sm:table-cell">${esc(u.no_wa || '-')}</td>
                      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-md text-xs font-medium ${badge}">${esc(u.role)}</span></td>
                      <td class="py-3 px-4 text-right">
                        <div class="inline-flex flex-wrap justify-end gap-1.5">
                          ${u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.quickPromoteAdmin('${esc(u.email)}','${esc(u.nama_lengkap)}')" class="h-8 px-2.5 rounded-md bg-[#0E3B2C] text-white text-xs font-medium">Jadikan admin</button>` : ''}
                          ${u.role !== 'Pro' && u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Pro')" class="h-8 px-2.5 rounded-md bg-[#E8F5EE] text-[#166534] text-xs font-medium">Set Pro</button>` : ''}
                          ${u.role === 'Pro' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Latihan')" class="h-8 px-2.5 rounded-md bg-[#EFF1F0] text-[#4B5358] text-xs font-medium">Set Latihan</button>` : ''}
                          ${!isSelf ? `<button type="button" onclick="AdminPanel.deleteUser('${esc(u.user_id)}','${esc(u.email)}')" class="h-8 px-2.5 rounded-md bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 text-xs font-medium inline-flex items-center gap-1 transition-colors duration-150"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>` : ''}
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
      <div class="space-y-1">
        <div class="text-xs font-medium text-[#166E48]">Keamanan &amp; pemeliharaan</div>
        <h1 class="text-2xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Google OAuth 2.0, Script Properties, dan migrasi</h1>
      </div>

      <!-- Pengaturan Google OAuth 2.0 -->
      <form onsubmit="AdminPanel.saveOAuthSettings(event)" class="card-stitch p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-[#EFF1F0] flex items-center justify-center shrink-0">
              <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-heading font-medium text-base text-[#11181C]">Login Google OAuth 2.0</h3>
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${gClient.ada && oauthAktif ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}">
                  ${gClient.ada && oauthAktif ? 'Aktif' : 'Perlu Client ID'}
                </span>
              </div>
              <p class="text-xs text-[#687076] mt-0.5">Peserta masuk satu klik memakai akun Google dengan verifikasi token di server GAS</p>
            </div>
          </div>
          <button type="button" onclick="AdminPanel.openOAuthGuideModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2 shrink-0">
            <i data-lucide="book-open" class="w-4 h-4 text-[#687076]"></i>
            <span>Panduan Google Cloud</span>
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div class="lg:col-span-5">
            <div class="flex items-center justify-between text-xs mb-1">
              <label class="font-medium text-[#11181C]">Google OAuth 2.0 Client ID</label>
              <span class="font-mono-num ${gClient.ada ? 'text-[#166534] font-medium' : 'text-[#687076]'}">${gClient.ada ? 'Tersimpan: ' + esc(gClient.masked) : 'Belum diisi'}</span>
            </div>
            <input type="text" id="oauth-client-id" placeholder="xxxx.apps.googleusercontent.com"
              class="input-control w-full" />
          </div>

          <div class="lg:col-span-4">
            <label class="text-xs font-medium text-[#11181C] block mb-1">Authorized JavaScript Origin</label>
            <div class="flex items-center gap-2">
              <input type="text" readonly id="oauth-origin-url" value="${esc(curOrigin)}" class="input-control flex-1 bg-[#F6F7F6] text-xs font-mono-num text-[#4B5358]" />
              <button type="button" onclick="AdminPanel.copyOrigin()" class="btn-outline h-10 px-3 text-xs shrink-0">Salin</button>
            </div>
          </div>

          <div class="lg:col-span-3 flex items-center justify-between gap-3 h-10 px-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6]">
            <label for="oauth-aktif" class="text-xs font-medium text-[#11181C] cursor-pointer">Aktifkan tombol Google</label>
            <input type="checkbox" id="oauth-aktif" ${oauthAktif ? 'checked' : ''} class="w-4 h-4 accent-[#0E3B2C]" />
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span class="text-xs text-[#687076]">Ketik <code class="font-mono-num">__HAPUS__</code> pada kolom Client ID untuk menghapus nilai tersimpan</span>
          <button type="submit" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i>
            <span>Simpan pengaturan OAuth</span>
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- Rahasia Script Properties -->
        <form onsubmit="AdminPanel.saveSecrets(event)" class="card-stitch p-6 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-heading font-medium text-base text-[#11181C]">Kredensial Script Properties</h3>
              <p class="text-xs text-[#687076]">Token disimpan di Script Properties server, kosongkan kolom bila tidak diubah</p>
            </div>
            <i data-lucide="lock" class="w-4 h-4 text-[#687076] shrink-0"></i>
          </div>

          <div class="space-y-3">
            ${sec.filter(function (item) { return item.key !== 'GOOGLE_CLIENT_ID'; }).map(function (item) {
              return `
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <label class="font-mono-num font-medium text-[#11181C]">${esc(item.key)}</label>
                    <span class="font-mono-num ${item.ada ? 'text-[#166534] font-medium' : 'text-[#687076]'}">${item.ada ? 'Terpasang: ' + esc(item.masked) : 'Belum diisi'}</span>
                  </div>
                  <input type="password" id="sec-${esc(item.key)}" placeholder="Nilai baru atau __HAPUS__"
                    class="input-control w-full" />
                </div>`;
            }).join('')}
          </div>

          <div class="pt-4 border-t border-[#E4E7E6] space-y-3">
            <div class="text-xs font-medium text-[#4B5358]">Pengaturan pembayaran &amp; kontak admin</div>
            <div>
              <label class="text-xs text-[#4B5358]">Rekening / QRIS aktivasi Pro</label>
              <input type="text" id="set-rekening" value="${esc(set.INFO_REKENING_PRO || '')}" class="input-control mt-1 w-full" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-[#4B5358]">Harga paket Pro</label>
                <input type="text" id="set-harga" value="${esc(set.HARGA_PRO || '')}" class="input-control mt-1 w-full" />
              </div>
              <div>
                <label class="text-xs text-[#4B5358]">WhatsApp admin</label>
                <input type="text" id="set-wa" value="${esc(set.WA_ADMIN || '')}" class="input-control mt-1 w-full" />
              </div>
            </div>
          </div>

          <button type="submit" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
            <span>Simpan kredensial</span>
          </button>
        </form>

        <!-- Migrasi Database Antar-Spreadsheet -->
        <div class="card-stitch p-6 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-heading font-medium text-base text-[#11181C]">Migrasi &amp; sinkronisasi spreadsheet</h3>
              <p class="text-xs text-[#687076]">Salin data dari spreadsheet versi lama secara idempoten berbasis nama kolom</p>
            </div>
            <i data-lucide="database-backup" class="w-4 h-4 text-[#687076] shrink-0"></i>
          </div>

          <div>
            <label class="text-xs font-medium text-[#4B5358]">ID atau URL spreadsheet sumber</label>
            <input type="text" id="mig-source" placeholder="https://docs.google.com/spreadsheets/d/..." class="input-control mt-1 w-full" />
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" onclick="AdminPanel.runMigration(true)" class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="search" class="w-4 h-4 text-[#687076]"></i>
              <span>Pindai (dry-run)</span>
            </button>
            <button type="button" onclick="AdminPanel.runMigration(false)" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="play" class="w-4 h-4"></i>
              <span>Jalankan sinkronisasi</span>
            </button>
          </div>

          ${mig ? `
            <div class="p-4 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] space-y-3">
              <div class="flex items-center justify-between text-xs font-medium">
                <span class="text-[#11181C]">${mig.dryRun ? 'Hasil pindai (dry-run)' : 'Hasil sinkronisasi'}</span>
                <span class="text-[#166E48]">${esc(mig.sourceName)}</span>
              </div>
              <table class="w-full text-xs">
                <thead><tr class="text-[#687076] border-b border-[#E4E7E6]"><th class="py-1.5 text-left font-medium">Sheet</th><th class="text-right font-medium">Tambah</th><th class="text-right font-medium">Perbarui</th><th class="text-right font-medium">Lewati</th></tr></thead>
                <tbody>
                  ${mig.report.map(function (r) {
                    return `<tr class="border-b border-[#E4E7E6] last:border-b-0"><td class="py-1.5 font-medium text-[#11181C]">${esc(r.sheet)}</td><td class="text-right font-mono-num text-[#166534] font-medium">+${r.inserted}</td><td class="text-right font-mono-num text-[#92400E]">${r.updated}</td><td class="text-right font-mono-num text-[#687076]">${r.skipped}</td></tr>`;
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
    setUpgradeSearch: function (q) { state.upgradeSearch = q; paintShell(document.getElementById('app')); mountOverviewCharts(); },
    previewProof: function (reqId) {
      const r = (state.overview && state.overview.upgrades || []).find(function (x) { return x.req_id === reqId; });
      if (!r) return;
      App.openModal('Bukti transfer — ' + r.nama_user, `
        <div class="space-y-3 text-sm">
          <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] text-xs space-y-1">
            <div><span class="text-[#687076]">Email:</span> <strong class="font-medium text-[#11181C]">${esc(r.email_user)}</strong></div>
            <div><span class="text-[#687076]">Catatan:</span> <strong class="font-medium text-[#11181C]">${esc(r.catatan_user || '-')}</strong></div>
          </div>
          ${r.url_bukti_drive ? `<img src="${esc(r.url_bukti_drive)}" alt="Bukti transfer ${esc(r.nama_user)}" class="w-full max-h-80 object-contain rounded-lg border border-[#E4E7E6]" />`
            : `<div class="p-8 text-center rounded-lg bg-[#F6F7F6] text-xs text-[#687076]">Tidak ada lampiran gambar bukti transfer</div>`}
        </div>
      `);
    },
    processUpgrade: async function (reqId, decision) {
      const catatan = decision === 'Rejected' ? (prompt('Alasan penolakan untuk peserta:', 'Bukti transfer kurang terbaca') || '') : 'Terverifikasi admin';
      try {
        await ApiClient.call('admin.processUpgrade', { req_id: reqId, decision: decision, catatan_admin: catatan });
        App.toast(decision === 'Approved' ? 'Akun Pro diaktifkan dan notifikasi dijadwalkan' : 'Pengajuan upgrade ditolak', 'success');
        render(document.getElementById('app'), 'overview');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    selectPaket: function (pid) { state.selectedPaketId = pid; state.editingSoal = null; paintShell(document.getElementById('app')); },
    setQSubtes: function (st) { state.qSubtesFilter = st; paintShell(document.getElementById('app')); },
    setQSearch: function (q) { state.qSearch = q; paintShell(document.getElementById('app')); },
    editSoal: function (sid) {
      const found = (state.qData.soal || []).find(function (s) { return s.soal_id === sid; });
      if (found) { state.editingSoal = Object.assign({}, found); paintShell(document.getElementById('app')); }
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
        App.toast('Butir soal disimpan ke bank soal', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    deleteQuestion: async function (sid) {
      if (!confirm('Hapus butir soal ini secara permanen?')) return;
      try {
        await ApiClient.call('admin.deleteQuestion', { soal_id: sid });
        state.editingSoal = null;
        App.toast('Butir soal dihapus', 'info');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    openImportModal: function () {
      const pakets = state.qData.paket || [];
      const curPkg = pakets.find(function (p) { return p.paket_id === state.selectedPaketId; });
      window._parsedImportItems = [];
      App.openModal('Impor massal bank soal (CSV)', `
        <div class="space-y-4 text-sm">
          <div class="p-4 rounded-xl bg-[#EAF3EE] text-[#0E3B2C] text-xs space-y-2">
            <div class="font-medium">Paket tujuan: ${esc(curPkg ? curPkg.nama_paket : state.selectedPaketId)}</div>
            <div>Unggah berkas .csv untuk menambahkan banyak butir soal sekaligus ke paket aktif</div>
            <button type="button" onclick="AdminPanel.downloadCsvTemplate()" class="btn-outline h-8 px-3 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>Unduh template CSV</span>
            </button>
          </div>

          <div>
            <label class="text-xs font-medium text-[#4B5358]">Berkas CSV soal</label>
            <input type="file" id="csv-soal-file" accept=".csv,text/csv" onchange="AdminPanel.handleCsvFile(this)"
              class="mt-1 w-full text-xs p-3 rounded-lg border border-dashed border-[#D6DBD9] bg-[#F6F7F6]" />
          </div>

          <div id="csv-preview-box" class="hidden p-4 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] space-y-2 text-xs">
            <div id="csv-preview-summary" class="font-medium text-[#166534]"></div>
            <div id="csv-preview-list" class="max-h-40 overflow-y-auto space-y-1 text-[#4B5358]"></div>
          </div>

          <button type="button" id="btn-submit-csv" disabled onclick="AdminPanel.submitBulkImport()"
            class="btn-primary w-full h-10 text-xs disabled:opacity-40 disabled:cursor-not-allowed">
            Simpan soal ke database
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
      App.toast('Template CSV diunduh', 'success');
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
          App.toast('Tidak ada baris soal valid, periksa kolom header CSV', 'warning');
          box.classList.add('hidden');
          btn.disabled = true;
          return;
        }
        const cTwk = items.filter(function (x) { return x.subtes === 'TWK'; }).length;
        const cTiu = items.filter(function (x) { return x.subtes === 'TIU'; }).length;
        const cTkp = items.filter(function (x) { return x.subtes === 'TKP'; }).length;
        sum.textContent = 'Siap diimpor: ' + items.length + ' soal (TWK ' + cTwk + ' · TIU ' + cTiu + ' · TKP ' + cTkp + ')';
        list.innerHTML = items.slice(0, 6).map(function (x, i) {
          return '<div class="truncate"><strong class="font-mono-num font-medium">' + (i + 1) + '. [' + esc(x.subtes) + ']</strong> ' + esc(x.pertanyaan) + '</div>';
        }).join('') + (items.length > 6 ? '<div class="text-[#166E48] font-medium">dan ' + (items.length - 6) + ' soal lainnya</div>' : '');
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
        App.toast(res.imported + ' soal diimpor, total paket: ' + res.totalInPackage + ' soal', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) {
        App.toast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Simpan soal ke database'; }
      }
    },
    openPackageModal: function () {
      App.openModal('Tambah paket simulasi', `
        <form onsubmit="AdminPanel.savePackage(event)" class="space-y-3 text-sm">
          <div><label class="text-xs font-medium text-[#4B5358]">Nama paket</label><input id="pkg-nama" required class="input-control mt-1 w-full" placeholder="Contoh: Tryout Nasional SKD #02" /></div>
          <div><label class="text-xs font-medium text-[#4B5358]">Deskripsi</label><textarea id="pkg-desk" rows="2" class="mt-1 w-full p-3 rounded-lg border border-[rgba(17,24,28,0.16)] text-sm"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-medium text-[#4B5358]">Tier akses</label><select id="pkg-tier" class="input-control mt-1 w-full"><option value="Latihan">Latihan (gratis)</option><option value="Pro">Pro</option></select></div>
            <div><label class="text-xs font-medium text-[#4B5358]">Kategori</label><input id="pkg-kat" value="CPNS SKD" class="input-control mt-1 w-full" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-medium text-[#4B5358]">Durasi (menit)</label><input id="pkg-dur" type="number" value="100" class="input-control mt-1 w-full font-mono-num" /></div>
            <div><label class="text-xs font-medium text-[#4B5358]">Target soal</label><input id="pkg-jml" type="number" value="110" class="input-control mt-1 w-full font-mono-num" /></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="text-xs font-medium text-[#4B5358]">PG TWK</label><input id="pkg-twk" type="number" value="65" class="input-control mt-1 w-full font-mono-num" /></div>
            <div><label class="text-xs font-medium text-[#4B5358]">PG TIU</label><input id="pkg-tiu" type="number" value="80" class="input-control mt-1 w-full font-mono-num" /></div>
            <div><label class="text-xs font-medium text-[#4B5358]">PG TKP</label><input id="pkg-tkp" type="number" value="166" class="input-control mt-1 w-full font-mono-num" /></div>
          </div>
          <button type="submit" class="btn-primary w-full h-10 text-xs">Simpan paket</button>
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
        App.toast('Paket simulasi ditambahkan', 'success');
        render(document.getElementById('app'), 'questions');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setRepFilter: function (k, v) {
      if (k === 'paket') state.repFilterPaket = v;
      if (k === 'status') state.repFilterStatus = v;
      if (k === 'search') state.repSearch = v;
      paintShell(document.getElementById('app'));
    },
    exportReportsCSV: function () {
      const rows = [['Nama Peserta', 'Paket', 'TWK', 'TIU', 'TKP', 'Total', 'Status', 'Waktu Selesai']];
      (state.reports.hasil || []).forEach(function (h) {
        rows.push([h.nama_user, h.nama_paket, h.skor_twk, h.skor_tiu, h.skor_tkp, h.skor_total, h.status_kelulusan, h.waktu_selesai]);
      });
      const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Laporan_Skor_SimulasiTKD_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      App.toast('Laporan CSV diunduh', 'success');
    },
    syncCrm: async function () {
      try {
        const res = await ApiClient.call('admin.crmSync');
        App.toast('Kontak CRM disinkronkan (+' + res.inserted + ' baru)', 'success');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    validateWa: async function () {
      try {
        const res = await ApiClient.call('admin.crmValidateWA');
        App.toast('Validasi WA selesai: ' + res.registered + '/' + res.checked + ' aktif', 'success');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    saveNotifToggle: async function () {
      try {
        await ApiClient.call('admin.saveNotifConfig', {
          waAktif: document.getElementById('cfg-wa').checked,
          emailAktif: document.getElementById('cfg-em').checked
        });
        App.toast('Pengaturan kanal notifikasi disimpan', 'success');
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
        App.toast('Status blast kontak diperbarui', 'info');
        render(document.getElementById('app'), 'crm');
      } catch (e) { App.toast(e.message, 'error'); }
    },
    addAdminEmail: async function (e) {
      e.preventDefault();
      const email = document.getElementById('adm-new-email').value.trim();
      const nama = document.getElementById('adm-new-nama').value.trim();
      try {
        state.adminEmailsData = await ApiClient.call('admin.addAdminEmail', { email: email, nama: nama });
        App.toast('Email ' + email + ' ditambahkan sebagai admin', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    quickPromoteAdmin: async function (email, nama) {
      if (!confirm('Jadikan ' + email + ' sebagai administrator?')) return;
      try {
        state.adminEmailsData = await ApiClient.call('admin.addAdminEmail', { email: email, nama: nama });
        App.toast(email + ' kini berstatus admin', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    removeAdminEmail: async function (email) {
      if (!confirm('Cabut akses admin dari ' + email + '?')) return;
      try {
        state.adminEmailsData = await ApiClient.call('admin.removeAdminEmail', { email: email });
        App.toast('Akses admin ' + email + ' dicabut', 'info');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    syncAdminEmails: async function () {
      try {
        state.adminEmailsData = await ApiClient.call('admin.syncAdminEmails');
        App.toast('Sinkronisasi selesai (' + (state.adminEmailsData.admins || []).length + ' email admin)', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setUserTier: async function (userId, role) {
      try {
        await ApiClient.call('admin.updateUserTier', { user_id: userId, role: role });
        App.toast('Peran akun diubah menjadi ' + role, 'success');
        render(document.getElementById('app'), 'admins');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    setUserSearch: function (q) { state.userSearch = q; paintShell(document.getElementById('app')); },
    setUserRoleFilter: function (r) { state.userRoleFilter = r; paintShell(document.getElementById('app')); },
    openCreateUserModal: function () {
      App.openModal('Tambah pengguna baru', `
        <form onsubmit="AdminPanel.createUser(event)" class="space-y-3 text-sm">
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Nama lengkap</label>
            <input type="text" id="cu-nama" required minlength="3" placeholder="Nama lengkap" class="input-control mt-1 w-full" />
          </div>
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Email</label>
            <input type="email" id="cu-email" required placeholder="nama@email.com" class="input-control mt-1 w-full" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Nomor WhatsApp (opsional)</label>
              <input type="tel" id="cu-wa" placeholder="0812xxxxxxxx" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#4B5358]">Peran akun</label>
              <select id="cu-role" class="input-control mt-1 w-full font-medium">
                <option value="Latihan">Latihan</option>
                <option value="Pro">Pro</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Kata sandi (minimal 6 karakter)</label>
            <input type="password" id="cu-pass" required minlength="6" placeholder="Kata sandi awal" class="input-control mt-1 w-full" />
          </div>
          <button type="submit" class="btn-primary w-full h-10 text-xs">Simpan pengguna</button>
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
        App.toast('Pengguna ' + res.nama_lengkap + ' (' + res.role + ') ditambahkan', 'success');
        render(document.getElementById('app'), 'admins');
      } catch (err) { App.toast(err.message, 'error'); }
    },
    deleteUser: async function (userId, email) {
      if (!confirm('Hapus permanen pengguna ' + email + ' dari database?')) return;
      try {
        await ApiClient.call('admin.deleteUser', { user_id: userId });
        App.toast('Pengguna ' + email + ' dihapus', 'info');
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
        App.toast('Pengaturan Google OAuth 2.0 disimpan', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    copyOrigin: function () {
      const el = document.getElementById('oauth-origin-url');
      if (!el) return;
      navigator.clipboard.writeText(el.value).then(function () {
        App.toast('Origin disalin: ' + el.value, 'success');
      }).catch(function () {
        el.select(); document.execCommand('copy');
        App.toast('Origin disalin', 'success');
      });
    },
    openOAuthGuideModal: function () {
      const origin = (window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin : 'https://USERNAME.github.io';
      App.openModal('Panduan Google OAuth 2.0', `
        <ol class="space-y-3 text-xs text-[#4B5358] list-decimal pl-4 leading-relaxed">
          <li>Buka <strong class="font-medium text-[#11181C]">Google Cloud Console</strong> (<code class="font-mono-num">console.cloud.google.com</code>) dan pilih proyek Anda.</li>
          <li>Buka <strong class="font-medium text-[#11181C]">APIs &amp; Services → OAuth consent screen</strong>, pilih <strong class="font-medium text-[#11181C]">External</strong>, isi nama aplikasi SimulasiTKD Pro dan email kontak.</li>
          <li>Buka <strong class="font-medium text-[#11181C]">Credentials → Create Credentials → OAuth client ID</strong> dengan tipe <strong class="font-medium text-[#11181C]">Web application</strong>.</li>
          <li>Tambahkan domain berikut pada <strong class="font-medium text-[#11181C]">Authorized JavaScript origins</strong>:<br/>
            <code class="inline-block mt-1 px-2 py-1 rounded bg-[#EAF3EE] text-[#0E3B2C] font-mono-num font-medium">${esc(origin)}</code>
          </li>
          <li>Salin nilai <strong class="font-medium text-[#11181C]">Client ID</strong> ke kolom Google OAuth 2.0 Client ID pada halaman ini lalu simpan.</li>
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
        App.toast('Kredensial disimpan di Script Properties', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    },
    runMigration: async function (dryRun) {
      const src = document.getElementById('mig-source').value.trim();
      if (!src) { App.toast('Masukkan ID atau URL spreadsheet sumber terlebih dahulu', 'warning'); return; }
      if (!dryRun && !confirm('Jalankan sinkronisasi data dari spreadsheet sumber ke database aktif?')) return;
      try {
        state.migrationResult = await ApiClient.call('admin.runMigration', { sourceIdOrUrl: src, dryRun: dryRun });
        App.toast(dryRun ? 'Pemindaian dry-run selesai' : 'Sinkronisasi database selesai', 'success');
        paintShell(document.getElementById('app'));
      } catch (err) { App.toast(err.message, 'error'); }
    }
  };
})();
