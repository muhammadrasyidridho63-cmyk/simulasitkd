/**
 * ============================================================================
 * SimulasiTKD Pro — js/admin.js
 * Panel Kontrol Admin — Swiss International Typographic System (Anchor: Swiss)
 * Surface: #FFFFFF / #F7F7F8 | Ink: #111111 | Accent: International Orange #FF4F00
 * Structure: Exposed 1px hairline grid, left-aligned asymmetric typography, condensed folio numerals
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

  function pad2(n) {
    return String(n).padStart(2, '0');
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
      { id: 'overview', folio: '01', label: 'Analitik & verifikasi Pro', badge: pendingCount > 0 ? pendingCount : '' },
      { id: 'questions', folio: '02', label: 'Bank soal & paket' },
      { id: 'crm', folio: '03', label: 'Notifikasi WA & CRM' },
      { id: 'admins', folio: '04', label: 'Kelola admin' },
      { id: 'security', folio: '05', label: 'Keamanan & migrasi' }
    ];

    const navHtml = navItems.map(function (item) {
      const active = state.tab === item.id;
      return `
        <button type="button" onclick="AdminPanel.switchTab('${item.id}')"
          class="admin-nav-link ${active ? 'active font-semibold' : 'text-[#52525B] hover:bg-[#F7F7F8] hover:text-[#111111]'} w-full flex items-center justify-between px-4 text-xs text-left">
          <span class="flex items-center gap-3 min-w-0">
            <span class="swiss-folio text-sm font-semibold ${active ? 'text-[#FF4F00]' : 'text-[#71717A]'}">${item.folio}</span>
            <span class="truncate">${item.label}</span>
          </span>
          ${item.badge ? `<span class="tabular-nums text-xs text-[#FFFFFF] px-1.5 py-0.5 bg-[#FF4F00] font-semibold">${item.badge}</span>` : ''}
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="min-h-screen flex bg-[#FFFFFF]">
        <!-- Desktop Swiss Index Sidebar (256px / w-64, Exposed 1px Rules) -->
        <aside class="hidden lg:flex lg:flex-col w-64 bg-[#FFFFFF] text-[#111111] border-r border-[#111111] fixed inset-y-0 left-0 z-30 no-print">
          <div class="h-14 px-4 flex items-center gap-3 border-b border-[#111111]">
            <span class="w-2.5 h-2.5 bg-[#FF4F00] shrink-0"></span>
            <div class="min-w-0">
              <div class="font-semibold text-sm leading-tight truncate tracking-[-0.02em]">SimulasiTKD Pro</div>
            </div>
          </div>
          <nav class="flex-1">${navHtml}</nav>
          <div class="border-t border-[#111111]">
            <button type="button" onclick="App.go('dashboard')" class="admin-nav-link w-full flex items-center justify-between px-4 text-xs text-[#111111] hover:bg-[#F7F7F8]">
              <span>Portal peserta</span>
              <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" onclick="App.logout()" class="w-full h-10 flex items-center justify-between px-4 text-xs font-semibold text-[#FF4F00] hover:bg-[#F7F7F8]">
              <span>Keluar</span>
              <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </aside>

        <!-- Mobile Drawer -->
        ${state.mobileSidebarOpen ? `
          <div class="fixed inset-0 z-50 lg:hidden flex">
            <div class="fixed inset-0 bg-[#111111]/55" onclick="AdminPanel.toggleSidebar(false)"></div>
            <aside class="relative w-64 max-w-[80vw] bg-[#FFFFFF] text-[#111111] border-r border-[#111111] flex flex-col z-10">
              <div class="h-14 px-4 flex items-center justify-between border-b border-[#111111]">
                <span class="font-semibold text-sm">SimulasiTKD Pro</span>
                <button type="button" onclick="AdminPanel.toggleSidebar(false)" class="w-8 h-8 border border-[#DCDCE0] inline-flex items-center justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
              </div>
              <nav class="flex-1">${navHtml}</nav>
              <div class="border-t border-[#111111]">
                <button type="button" onclick="App.go('dashboard')" class="admin-nav-link w-full flex items-center justify-between px-4 text-xs text-[#111111] hover:bg-[#F7F7F8]">
                  <span>Portal peserta</span>
                  <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                </button>
                <button type="button" onclick="App.logout()" class="w-full h-10 flex items-center justify-between px-4 text-xs font-semibold text-[#FF4F00] hover:bg-[#F7F7F8]">
                  <span>Keluar</span>
                  <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </aside>
          </div>
        ` : ''}

        <!-- Main Content Area -->
        <div class="flex-1 lg:pl-64 flex flex-col min-w-0">
          <header class="h-14 bg-[#FFFFFF] border-b border-[#111111] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-20 no-print">
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.toggleSidebar(true)" class="lg:hidden w-8 h-8 border border-[#111111] text-[#111111] inline-flex items-center justify-center">
                <i data-lucide="menu" class="w-4 h-4"></i>
              </button>
              <span class="font-semibold text-xs uppercase tracking-[0.04em] text-[#111111]">Panel kontrol administrator</span>
              ${ApiClient.isDemoMode() ? '<span class="hidden sm:inline-flex px-2 py-0.5 text-xs font-semibold bg-[#F7F7F8] border border-[#111111] text-[#111111]">PRATINJAU LOKAL</span>' : ''}
            </div>
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.refresh()" class="w-8 h-8 border border-[#DCDCE0] hover:border-[#111111] text-[#52525B] hover:text-[#111111] inline-flex items-center justify-center transition-colors" title="Muat ulang data">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
              </button>
              <div class="hidden sm:block">
                <div class="text-xs font-semibold text-[#111111] leading-tight">${esc(savedAdmin.nama_lengkap || 'Administrator')}</div>
                <div class="text-xs text-[#71717A] leading-tight">${esc(savedAdmin.email || '')}</div>
              </div>
              <div class="w-7 h-7 bg-[#111111] text-[#FFFFFF] flex items-center justify-center text-xs font-semibold">${esc(adminInitials)}</div>
            </div>
          </header>

          <main class="max-w-[1440px] w-full mx-auto border-b border-[#111111]">
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
      return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-x divide-[#DCDCE0] p-6">
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
      const badgeCls = r.status_verifikasi === 'Approved' ? 'bg-[#111111] text-[#FFFFFF]'
        : r.status_verifikasi === 'Rejected' ? 'bg-[#FF4F00] text-[#FFFFFF]'
        : 'bg-[#F7F7F8] border border-[#111111] text-[#111111]';
      return `
        <tr class="border-b border-[#DCDCE0] last:border-b-0 hover:bg-[#F7F7F8] transition-colors">
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 bg-[#F7F7F8] border border-[#DCDCE0] text-[#111111] font-semibold text-xs flex items-center justify-center shrink-0">${esc(initials)}</div>
              <div>
                <div class="font-medium text-sm text-[#111111]">${esc(r.nama_user)}</div>
                <div class="text-xs text-[#71717A] sm:hidden">${esc(r.email_user)}</div>
              </div>
            </div>
          </td>
          <td class="py-3 px-4 text-sm text-[#52525B] hidden sm:table-cell">${esc(r.email_user)}</td>
          <td class="py-3 px-4 text-xs tabular-nums text-[#71717A] hidden md:table-cell">${fmtDate(r.tanggal_request)}</td>
          <td class="py-3 px-4">
            <button type="button" onclick="AdminPanel.previewProof('${esc(r.req_id)}')" class="btn-outline h-8 px-3 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="file-image" class="w-3.5 h-3.5"></i>
              <span>Bukti</span>
            </button>
          </td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 text-xs font-semibold ${badgeCls}">${esc(r.status_verifikasi).toUpperCase()}</span></td>
          <td class="py-3 px-4">
            ${r.status_verifikasi === 'Pending' ? `
              <div class="inline-flex items-center gap-2">
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Approved')" class="btn-primary h-8 px-3 text-xs">Setujui</button>
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Rejected')" class="btn-accent h-8 px-3 text-xs">Tolak</button>
              </div>
            ` : `<span class="text-xs text-[#71717A]">${esc(r.catatan_admin || 'Selesai')}</span>`}
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="6" class="py-8 px-4 text-sm text-[#71717A]">Tidak ada pengajuan upgrade yang sesuai filter.</td></tr>`;

    return `
      <!-- Header -->
      <div class="p-6 lg:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="swiss-folio text-4xl font-semibold text-[#FF4F00]">01</span>
          <h1 class="text-2xl font-semibold text-[#111111] tracking-[-0.02em]">Analitik &amp; verifikasi akun Pro</h1>
        </div>
        <button type="button" onclick="AdminPanel.switchTab('questions')" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2 self-start sm:self-auto">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Laporan skor</span>
        </button>
      </div>

      <!-- 4 KPI Swiss Folio Cells -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCDCE0] border-b border-[#111111]">
        <div class="p-6 space-y-2 bg-[#FFFFFF]">
          <div class="flex items-center justify-between text-xs text-[#71717A]">
            <span>Total peserta</span>
            <span class="tabular-nums font-semibold">01.1</span>
          </div>
          <div class="swiss-folio text-4xl font-semibold text-[#111111]">${k.totalPeserta}</div>
          <div class="text-xs text-[#52525B]">Akun terdaftar aktif</div>
        </div>
        <div class="p-6 space-y-2 bg-[#FFFFFF]">
          <div class="flex items-center justify-between text-xs text-[#71717A]">
            <span>Akun Pro aktif</span>
            <span class="tabular-nums font-semibold">01.2</span>
          </div>
          <div class="swiss-folio text-4xl font-semibold text-[#111111]">${k.totalPro}</div>
          <div class="text-xs text-[#52525B]"><span class="tabular-nums text-[#111111] font-semibold">${k.rasioPro}%</span> konversi dari total peserta</div>
        </div>
        <div class="p-6 space-y-2 bg-[#F7F7F8]">
          <div class="flex items-center justify-between text-xs text-[#71717A]">
            <span>Antrean verifikasi</span>
            <span class="tabular-nums font-semibold">01.3</span>
          </div>
          <div class="swiss-folio text-4xl font-semibold ${k.pendingUpgrade > 0 ? 'text-[#FF4F00]' : 'text-[#111111]'}">${k.pendingUpgrade}</div>
          <div class="text-xs text-[#52525B]">${k.pendingUpgrade > 0 ? 'Menunggu pemeriksaan bukti bayar' : 'Tidak ada antrean tertunda'}</div>
        </div>
        <div class="p-6 space-y-2 bg-[#FFFFFF]">
          <div class="flex items-center justify-between text-xs text-[#71717A]">
            <span>Tingkat kelulusan</span>
            <span class="tabular-nums font-semibold">01.4</span>
          </div>
          <div class="swiss-folio text-4xl font-semibold text-[#111111]">${k.passRate}%</div>
          <div class="text-xs text-[#52525B]">Memenuhi ambang batas BKN</div>
        </div>
      </div>

      <!-- Asymmetric Chart Hierarchy (8 cols Weekly Activity + 4 cols Tier Breakdown) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#DCDCE0] border-b border-[#111111]">
        <div class="p-6 lg:p-8 lg:col-span-8 flex flex-col justify-between space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCDCE0] pb-3">
            <div>
              <h3 class="font-semibold text-base text-[#111111]">Aktivitas ujian &amp; kelulusan mingguan</h3>
              <p class="text-xs text-[#52525B]">Jumlah pengerjaan simulasi dan peserta lulus 7 hari terakhir</p>
            </div>
            <div class="flex items-center gap-4 text-xs text-[#52525B]">
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-[#111111]"></span> Lulus PG</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-[#FF4F00]"></span> Total ujian</span>
            </div>
          </div>
          <div class="h-60"><canvas id="chartAdminWeekly"></canvas></div>
        </div>
        <div class="p-6 lg:p-8 lg:col-span-4 flex flex-col justify-between space-y-4">
          <div class="border-b border-[#DCDCE0] pb-3">
            <h3 class="font-semibold text-base text-[#111111]">Komposisi tier akun</h3>
            <p class="text-xs text-[#52525B]">Proporsi peserta Pro dan Latihan</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-32 h-32 relative shrink-0"><canvas id="chartAdminTier"></canvas></div>
            <div class="space-y-2 flex-1 text-xs">
              <div class="p-3 bg-[#F7F7F8] border border-[#DCDCE0] flex items-center justify-between">
                <span class="text-[#111111] font-semibold">Akun Pro</span>
                <span class="swiss-folio text-xl font-semibold text-[#111111]">${k.totalPro}</span>
              </div>
              <div class="p-3 bg-[#F7F7F8] border border-[#DCDCE0] flex items-center justify-between">
                <span class="text-[#52525B]">Latihan</span>
                <span class="swiss-folio text-xl font-semibold text-[#111111]">${k.totalLatihan}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Antrean Persetujuan Upgrade Pro -->
      <div class="p-6 lg:p-8 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#111111] pb-4">
          <div>
            <h3 class="font-semibold text-base text-[#111111]">Antrean persetujuan upgrade Pro</h3>
            <p class="text-xs text-[#52525B]">Periksa bukti pembayaran untuk mengaktifkan akses penuh peserta</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input type="text" value="${esc(state.upgradeSearch)}" oninput="AdminPanel.setUpgradeSearch(this.value)" placeholder="Cari nama atau email"
              class="input-control h-9 text-xs w-48" />
            <div class="inline-flex items-center border border-[#111111]">
              ${['Semua', 'Pending', 'Approved', 'Rejected'].map(function (st, i) {
                const active = state.upgradeFilter === st;
                return `<button type="button" onclick="AdminPanel.setUpgradeFilter('${st}')" class="h-9 px-3 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-[#111111]' : ''} ${active ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#52525B] hover:text-[#111111]'}">${st}</button>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="border border-[#DCDCE0] overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                <th class="py-3 px-4 font-semibold">Peserta</th>
                <th class="py-3 px-4 font-semibold hidden sm:table-cell">Email</th>
                <th class="py-3 px-4 font-semibold hidden md:table-cell">Tanggal</th>
                <th class="py-3 px-4 font-semibold">Bukti bayar</th>
                <th class="py-3 px-4 font-semibold">Status</th>
                <th class="py-3 px-4 font-semibold">Aksi</th>
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
    const swissFont = { family: "'Helvetica Neue', 'Akzidenz-Grotesk', 'Söhne', Helvetica, Arial, sans-serif", size: 11 };
    const gridColor = '#DCDCE0';
    const tickColor = '#52525B';

    const ctx1 = document.getElementById('chartAdminTier');
    if (ctx1) {
      charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Akun Pro', 'Latihan'],
          datasets: [{ data: [k.totalPro || 0, k.totalLatihan || 1], backgroundColor: ['#111111', '#FF4F00'], borderWidth: 0 }]
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
            { label: 'Lulus PG', data: w.map(function (d) { return d.lulus; }), backgroundColor: '#111111', borderRadius: 0, barPercentage: 0.6 },
            { label: 'Total ujian', data: w.map(function (d) { return d.total; }), backgroundColor: '#FF4F00', borderRadius: 0, barPercentage: 0.6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { color: tickColor, font: swissFont } },
            x: { grid: { display: false }, border: { display: false }, ticks: { color: tickColor, font: swissFont } }
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
      <!-- Header -->
      <div class="p-6 lg:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="swiss-folio text-4xl font-semibold text-[#FF4F00]">02</span>
          <h1 class="text-2xl font-semibold text-[#111111] tracking-[-0.02em]">Bank soal &amp; editor paket</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="AdminPanel.openPackageModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="folder-plus" class="w-4 h-4"></i>
            <span>Paket baru</span>
          </button>
          <button type="button" onclick="AdminPanel.openImportModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="upload" class="w-4 h-4"></i>
            <span>Impor CSV</span>
          </button>
          <button type="button" onclick="AdminPanel.newQuestion()" class="btn-accent h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Tambah soal</span>
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="px-6 lg:px-8 py-4 border-b border-[#DCDCE0] bg-[#F7F7F8] flex flex-wrap items-center gap-2">
        <select onchange="AdminPanel.selectPaket(this.value)" class="input-control h-9 text-xs font-medium">
          ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${p.paket_id === state.selectedPaketId ? 'selected' : ''}>${esc(p.nama_paket)} (${esc(p.tier_akses)})</option>`; }).join('')}
        </select>
        <div class="inline-flex items-center border border-[#111111]">
          ${['Semua', 'TWK', 'TIU', 'TKP'].map(function (st, i) {
            const active = state.qSubtesFilter === st;
            return `<button type="button" onclick="AdminPanel.setQSubtes('${st}')" class="h-9 px-3 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-[#111111]' : ''} ${active ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#52525B] hover:text-[#111111]'}">${st}</button>`;
          }).join('')}
        </div>
        <input type="text" value="${esc(state.qSearch)}" oninput="AdminPanel.setQSearch(this.value)" placeholder="Cari soal"
          class="input-control h-9 text-xs w-56 sm:ml-auto" />
      </div>

      <!-- Split Question List + Editor -->
      <div class="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#111111] border-b border-[#111111]">
        <div class="lg:col-span-4 max-h-[640px] overflow-y-auto divide-y divide-[#DCDCE0]">
          <div class="px-6 py-4 bg-[#F7F7F8] flex items-center justify-between">
            <span class="font-semibold text-xs uppercase tracking-[0.04em] text-[#111111]">Daftar butir soal</span>
            <span class="text-xs tabular-nums font-semibold text-[#111111]">${soalFiltered.length} soal</span>
          </div>
          ${soalFiltered.length ? soalFiltered.map(function (s, idx) {
            const active = ed.soal_id === s.soal_id;
            return `
              <div onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" class="p-4 cursor-pointer transition-colors ${active ? 'bg-[#F7F7F8] shadow-[inset_3px_0_0_#FF4F00]' : 'bg-[#FFFFFF] hover:bg-[#F7F7F8]'}">
                <div class="flex items-center justify-between text-xs mb-1.5">
                  <span class="px-2 py-0.5 bg-[#111111] text-[#FFFFFF] tabular-nums font-semibold">${esc(s.subtes)}</span>
                  <span class="swiss-folio text-lg font-semibold text-[#111111]">${pad2(s.nomor_urut || idx + 1)}</span>
                </div>
                <p class="text-xs text-[#111111] line-clamp-2 leading-relaxed">${esc(s.pertanyaan)}</p>
              </div>`;
          }).join('') : `<div class="p-6 text-xs text-[#71717A]">Belum ada soal di paket ini, klik Tambah soal.</div>`}
        </div>

        <form onsubmit="AdminPanel.saveQuestion(event)" class="p-6 lg:p-8 lg:col-span-8 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#111111]">
            <div>
              <h3 class="font-semibold text-base text-[#111111]">${ed.soal_id ? 'Edit soal #' + esc(ed.nomor_urut) : 'Buat soal baru'}</h3>
              <p class="text-xs text-[#52525B]">Atur materi, kunci jawaban TWK/TIU atau bobot 1–5 TKP, dan pembahasan</p>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="q-nomor" value="${ed.nomor_urut || 1}" min="1" class="input-control h-9 w-16 text-xs tabular-nums font-semibold" title="Nomor urut" />
              <select id="q-subtes" onchange="AdminPanel.changeEditorSubtes(this.value)" class="input-control h-9 text-xs font-semibold bg-[#F7F7F8] text-[#111111]">
                <option value="TWK" ${ed.subtes === 'TWK' ? 'selected' : ''}>Subtes: TWK</option>
                <option value="TIU" ${ed.subtes === 'TIU' ? 'selected' : ''}>Subtes: TIU</option>
                <option value="TKP" ${ed.subtes === 'TKP' ? 'selected' : ''}>Subtes: TKP</option>
              </select>
            </div>
          </div>

          <input type="hidden" id="q-id" value="${esc(ed.soal_id || '')}" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#52525B]">Topik materi</label>
              <input type="text" id="q-topik" value="${esc(ed.topik || '')}" placeholder="Contoh: Pilar negara / Silogisme" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#52525B]">URL / ID gambar soal (opsional)</label>
              <input type="text" id="q-img" value="${esc(ed.drive_image_id || '')}" placeholder="Tautan gambar Drive" class="input-control mt-1 w-full" />
            </div>
          </div>

          <div>
            <label class="text-xs font-medium text-[#52525B]">Pertanyaan</label>
            <textarea id="q-pertanyaan" rows="3" required class="mt-1 w-full p-3 border border-[#111111] text-sm bg-[#FFFFFF]">${esc(ed.pertanyaan || '')}</textarea>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-[#52525B]">Pilihan jawaban (A–E)</label>
              <span class="text-xs text-[#FF4F00] font-semibold">${ed.subtes === 'TKP' ? 'Bobot poin 1–5 tiap opsi' : 'Pilih satu kunci benar (+5)'}</span>
            </div>
            ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
              const val = ed['opsi_' + opt.toLowerCase()] || '';
              return `
                <div class="flex items-center gap-2">
                  <span class="w-9 h-9 border border-[#111111] bg-[#F7F7F8] text-[#111111] flex items-center justify-center text-xs tabular-nums font-semibold shrink-0">${opt}</span>
                  <input type="text" id="q-opsi-${opt}" value="${esc(val)}" required placeholder="Teks opsi ${opt}" class="input-control h-9 flex-1 text-xs sm:text-sm" />
                  ${ed.subtes === 'TKP' ? `
                    <select id="q-bobot-${opt}" class="input-control h-9 w-20 px-2 text-xs tabular-nums font-semibold bg-[#F7F7F8] text-[#111111]">
                      ${[5, 4, 3, 2, 1].map(function (n) { return `<option value="${n}" ${tkpWeights[opt] === n ? 'selected' : ''}>${n} pt</option>`; }).join('')}
                    </select>
                  ` : `
                    <label class="inline-flex items-center gap-1.5 text-xs font-medium text-[#52525B] cursor-pointer px-2">
                      <input type="radio" name="q-kunci" value="${opt}" ${String(ed.kunci_atau_bobot).toUpperCase() === opt ? 'checked' : ''} class="accent-[#FF4F00]" />
                      <span>Benar</span>
                    </label>
                  `}
                </div>`;
            }).join('')}
          </div>

          <div>
            <label class="text-xs font-medium text-[#52525B]">Pembahasan resmi</label>
            <textarea id="q-pembahasan" rows="2" class="mt-1 w-full p-3 border border-[#111111] text-sm bg-[#FFFFFF]">${esc(ed.pembahasan || '')}</textarea>
          </div>

          <div class="flex items-center justify-between pt-2">
            ${ed.soal_id ? `<button type="button" onclick="AdminPanel.deleteQuestion('${esc(ed.soal_id)}')" class="btn-accent h-9 px-4 text-xs">Hapus soal</button>` : '<div></div>'}
            <button type="submit" class="btn-primary h-10 px-5 text-xs inline-flex items-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>Simpan perubahan</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Laporan Skor & Ekspor Data -->
      <div class="p-6 lg:p-8 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#111111] pb-4">
          <div class="flex items-baseline gap-3">
            <span class="swiss-folio text-2xl font-semibold text-[#FF4F00]">02.1</span>
            <h2 class="text-xl font-semibold text-[#111111]">Laporan skor &amp; ekspor data (${repList.length})</h2>
          </div>
          <div class="flex flex-wrap gap-2 no-print">
            <button type="button" onclick="AdminPanel.exportReportsCSV()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
              <span>Ekspor CSV</span>
            </button>
            <button type="button" onclick="window.print()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="printer" class="w-4 h-4"></i>
              <span>Cetak PDF</span>
            </button>
          </div>
        </div>

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

        <div class="border border-[#DCDCE0] overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                <th class="py-3 px-4 font-semibold">Peserta</th>
                <th class="py-3 px-4 font-semibold">Paket</th>
                <th class="py-3 px-3 font-semibold">TWK</th>
                <th class="py-3 px-3 font-semibold">TIU</th>
                <th class="py-3 px-3 font-semibold">TKP</th>
                <th class="py-3 px-3 font-semibold">Total</th>
                <th class="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              ${repList.length ? repList.map(function (h) {
                const ok = h.status_kelulusan === 'Lulus';
                return `
                  <tr class="border-b border-[#DCDCE0] last:border-b-0 hover:bg-[#F7F7F8] transition-colors">
                    <td class="py-3 px-4 font-medium text-[#111111]">${esc(h.nama_user)}</td>
                    <td class="py-3 px-4 text-xs text-[#52525B]">${esc(h.nama_paket)}</td>
                    <td class="py-3 px-3 tabular-nums text-[#52525B]">${h.skor_twk}</td>
                    <td class="py-3 px-3 tabular-nums text-[#52525B]">${h.skor_tiu}</td>
                    <td class="py-3 px-3 tabular-nums text-[#52525B]">${h.skor_tkp}</td>
                    <td class="py-3 px-3 tabular-nums font-semibold text-[#111111]">${h.skor_total}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">${esc(h.status_kelulusan).toUpperCase()}</span>
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="7" class="py-8 px-4 text-xs text-[#71717A]">Belum ada riwayat pengerjaan yang sesuai filter.</td></tr>`}
            </tbody>
          </table>
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
      <div class="p-6 lg:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="swiss-folio text-4xl font-semibold text-[#FF4F00]">03</span>
          <h1 class="text-2xl font-semibold text-[#111111] tracking-[-0.02em]">WhatsApp gateway, blast, dan kontak</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="AdminPanel.syncCrm()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i>
            <span>Sinkron kontak</span>
          </button>
          <button type="button" onclick="AdminPanel.validateWa()" class="btn-primary h-9 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
            <span>Validasi nomor WA</span>
          </button>
        </div>
      </div>

      <!-- Saklar Kanal & Blast Form -->
      <div class="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#111111] border-b border-[#111111]">
        <div class="p-6 lg:p-8 lg:col-span-5 space-y-4">
          <h3 class="font-semibold text-base text-[#111111]">Saklar kanal notifikasi</h3>
          <div class="space-y-3 text-sm">
            <label class="flex items-center justify-between p-3 bg-[#F7F7F8] border border-[#DCDCE0] cursor-pointer">
              <div>
                <div class="font-medium text-[#111111]">Notifikasi WhatsApp (Fonnte)</div>
                <div class="text-xs text-[#52525B]">Token: ${cfg.fonnteAda ? '<span class="text-[#111111] font-semibold">Terpasang di Script Properties</span>' : '<span class="text-[#FF4F00] font-semibold">Belum diatur di tab Keamanan</span>'}</div>
              </div>
              <input type="checkbox" id="cfg-wa" ${cfg.waAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#FF4F00]" />
            </label>
            <label class="flex items-center justify-between p-3 bg-[#F7F7F8] border border-[#DCDCE0] cursor-pointer">
              <div>
                <div class="font-medium text-[#111111]">Notifikasi email (MailApp)</div>
                <div class="text-xs text-[#52525B]">Antrean non-blocking via pemicu berkala</div>
              </div>
              <input type="checkbox" id="cfg-em" ${cfg.emailAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#FF4F00]" />
            </label>
          </div>

          <div class="pt-3 border-t border-[#DCDCE0]">
            <div class="text-xs font-semibold text-[#111111] mb-2">Matriks kejadian otomatis</div>
            <div class="space-y-2 text-xs">
              ${Object.keys(cfg.matriks || {}).map(function (ev) {
                const m = cfg.matriks[ev];
                return `<div class="flex items-center justify-between py-1.5 border-b border-[#DCDCE0] last:border-b-0">
                  <span class="text-[#52525B]">${esc(m.label || ev)}</span>
                  <span class="flex gap-1.5">
                    <span class="px-2 py-0.5 font-semibold ${m.wa ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#71717A]'}">WA</span>
                    <span class="px-2 py-0.5 font-semibold ${m.email ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#71717A]'}">EMAIL</span>
                  </span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <form onsubmit="AdminPanel.sendBlast(event)" class="p-6 lg:p-8 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-semibold text-base text-[#111111]">Blast WhatsApp terjadwal</h3>
            <p class="text-xs text-[#52525B]">Melewati kontak bertanda Opt-Out dan mengirim bertahap dengan jeda acak 3–8 detik</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#52525B]">Judul kampanye</label>
              <input type="text" id="bl-judul" required placeholder="Contoh: Pembukaan Tryout SKD #02" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#52525B]">Segmen sasaran</label>
              <select id="bl-sasaran" class="input-control mt-1 w-full">
                <option value="SEMUA">Semua kontak aktif</option>
                <option value="Latihan">Akun Latihan</option>
                <option value="Pro">Akun Pro</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#52525B]">Isi pesan (variabel: <code class="tabular-nums font-semibold">{nama}</code>, <code class="tabular-nums font-semibold">{institusi}</code>, <code class="tabular-nums font-semibold">{link}</code>)</label>
            <textarea id="bl-pesan" rows="3" required placeholder="Halo {nama}, paket Tryout SKD terbaru sudah tersedia di {institusi}" class="mt-1 w-full p-3 border border-[#111111] text-sm bg-[#FFFFFF]"></textarea>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs tabular-nums text-[#71717A]">Batch 20 pesan · Jeda 3–8 detik</span>
            <button type="submit" class="btn-accent h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="send" class="w-4 h-4"></i>
              <span>Jadwalkan blast</span>
            </button>
          </div>
          ${blasts.length ? `<div class="pt-3 border-t border-[#DCDCE0] text-xs space-y-2">
            <div class="font-semibold text-[#111111]">Riwayat blast terakhir</div>
            ${blasts.slice(0, 3).map(function (b) {
              return `<div class="flex justify-between p-2.5 bg-[#F7F7F8] border border-[#DCDCE0]"><span><strong class="font-semibold text-[#111111]">${esc(b.Judul)}</strong> (${esc(b.Sasaran)})</span><span class="tabular-nums font-semibold text-[#111111]">${b.Terkirim}/${b.Total} · ${esc(b.Status)}</span></div>`;
            }).join('')}
          </div>` : ''}
        </form>
      </div>

      <!-- Tabel CRM Kontak -->
      <div class="p-6 lg:p-8 space-y-4">
        <h3 class="font-semibold text-base text-[#111111]">Daftar kontak CRM (${kontak.length})</h3>
        <div class="border border-[#DCDCE0] overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                <th class="py-3 px-4 font-semibold">Nama &amp; email</th>
                <th class="py-3 px-4 font-semibold">Nomor WA</th>
                <th class="py-3 px-4 font-semibold">Segmen</th>
                <th class="py-3 px-4 font-semibold">Status WA</th>
                <th class="py-3 px-4 font-semibold">Status blast</th>
              </tr>
            </thead>
            <tbody>
              ${kontak.map(function (k) {
                const optOut = String(k.OptOut || '').toUpperCase() === 'YA';
                return `
                  <tr class="border-b border-[#DCDCE0] last:border-b-0 hover:bg-[#F7F7F8] transition-colors">
                    <td class="py-3 px-4"><div class="font-medium text-[#111111]">${esc(k.Nama)}</div><div class="text-xs text-[#71717A]">${esc(k.Email)}</div></td>
                    <td class="py-3 px-4 tabular-nums text-xs text-[#52525B]">${esc(k.NoWA || '-')}</td>
                    <td class="py-3 px-4"><span class="px-2 py-0.5 text-xs font-semibold ${k.Segmen === 'Pro' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#111111]'}">${esc(k.Segmen).toUpperCase()}</span></td>
                    <td class="py-3 px-4 text-xs text-[#52525B]">${esc(k.StatusWA || 'Belum dicek')}</td>
                    <td class="py-3 px-4">
                      <button type="button" onclick="AdminPanel.toggleOptOut('${esc(k.KontakID)}', ${!optOut})" class="h-8 px-3 border text-xs font-semibold transition-colors ${optOut ? 'bg-[#FF4F00] border-[#FF4F00] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#111111] text-[#111111] hover:bg-[#F7F7F8]'}">
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
    if (!d) return `<div class="p-8 space-y-4"><div class="skeleton h-32"></div><div class="skeleton h-52"></div></div>`;
    const admins = d.admins || [];
    const users = d.users || [];

    return `
      <div class="p-6 lg:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="swiss-folio text-4xl font-semibold text-[#FF4F00]">04</span>
          <div>
            <h1 class="text-2xl font-semibold text-[#111111] tracking-[-0.02em]">Kelola admin &amp; akun terdaftar</h1>
            <p class="text-xs text-[#52525B] mt-1">Email yang terdaftar pada daftar admin otomatis mendapat hak panel kontrol saat login</p>
          </div>
        </div>
        <button type="button" onclick="AdminPanel.syncAdminEmails()" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
          <span>Sinkronkan email</span>
        </button>
      </div>

      <!-- Info Akun Aktif & Form Tambah Email Admin -->
      <div class="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#111111] border-b border-[#111111]">
        <div class="p-6 lg:p-8 lg:col-span-5 space-y-3 bg-[#F7F7F8]">
          <div class="text-xs font-semibold text-[#111111]">Status sesi saat ini</div>
          <div class="p-3 bg-[#FFFFFF] border-l-2 border-[#FF4F00] text-[#111111] space-y-1 text-xs">
            <div class="text-[#52525B]">Email login aktif</div>
            <div class="tabular-nums text-sm font-semibold break-all">${esc(d.currentEmail || '-')}</div>
          </div>
          <div class="p-3 bg-[#FFFFFF] border border-[#DCDCE0] space-y-1 text-xs">
            <div class="text-[#52525B]">Pemilik Google Apps Script</div>
            <div class="tabular-nums font-semibold text-[#111111] break-all">${esc(d.ownerEmail || 'Terdeteksi otomatis di GAS')}</div>
          </div>
        </div>

        <form onsubmit="AdminPanel.addAdminEmail(event)" class="p-6 lg:p-8 lg:col-span-7 space-y-4">
          <div>
            <h3 class="font-semibold text-base text-[#111111]">Tambah email administrator</h3>
            <p class="text-xs text-[#52525B]">Disinkronkan ke Script Properties dan tabel Users secara otomatis</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#52525B]">Alamat email</label>
              <input type="email" id="adm-new-email" required placeholder="admin@instansi.id" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#52525B]">Nama tampilan (opsional)</label>
              <input type="text" id="adm-new-nama" placeholder="Contoh: Pengelola Tryout" class="input-control mt-1 w-full" />
            </div>
          </div>
          <button type="submit" class="btn-accent h-10 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            <span>Tambahkan admin</span>
          </button>
        </form>
      </div>

      <!-- Tabel Daftar Email Admin Tersinkron -->
      <div class="p-6 lg:p-8 border-b border-[#111111] space-y-4">
        <h3 class="font-semibold text-base text-[#111111]">Daftar email admin aktif (${admins.length})</h3>
        <div class="border border-[#DCDCE0] overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                <th class="py-3 px-4 font-semibold">Email</th>
                <th class="py-3 px-4 font-semibold">Nama pengguna</th>
                <th class="py-3 px-4 font-semibold">Status sinkron</th>
                <th class="py-3 px-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${admins.length ? admins.map(function (a) {
                return `
                  <tr class="border-b border-[#DCDCE0] last:border-b-0">
                    <td class="py-3 px-4 font-medium text-[#111111]">
                      ${esc(a.email)}
                      ${a.isOwner ? '<span class="ml-2 px-2 py-0.5 text-xs font-semibold bg-[#111111] text-[#FFFFFF]">PEMILIK</span>' : ''}
                    </td>
                    <td class="py-3 px-4 text-xs text-[#52525B]">${esc(a.nama)}</td>
                    <td class="py-3 px-4">
                      <span class="px-2 py-0.5 text-xs font-semibold ${a.syncedRole === 'Admin' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#111111] text-[#111111]'}">
                        ${a.syncedRole === 'Admin' ? 'TERSINKRON (ADMIN)' : esc(a.syncedRole).toUpperCase()}
                      </span>
                    </td>
                    <td class="py-3 px-4">
                      ${a.email !== d.currentEmail ? `
                        <button type="button" onclick="AdminPanel.removeAdminEmail('${esc(a.email)}')" class="btn-accent h-8 px-3 text-xs">Cabut akses</button>
                      ` : '<span class="text-xs text-[#71717A]">Sesi aktif</span>'}
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="4" class="py-8 px-4 text-xs text-[#71717A]">Belum ada email admin tersimpan.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tabel Semua Pengguna -->
      <div class="p-6 lg:p-8 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold text-base text-[#111111]">Manajemen akun terdaftar (${users.length})</h3>
            <p class="text-xs text-[#52525B]">Tambah pengguna baru, ubah tier akses, atau hapus akun peserta</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input type="text" value="${esc(state.userSearch)}" oninput="AdminPanel.setUserSearch(this.value)" placeholder="Cari nama atau email"
              class="input-control h-9 text-xs w-44" />
            <select onchange="AdminPanel.setUserRoleFilter(this.value)" class="input-control h-9 text-xs font-medium">
              ${['Semua', 'Latihan', 'Pro', 'Admin'].map(function (r) {
                return `<option value="${r}" ${state.userRoleFilter === r ? 'selected' : ''}>${r === 'Semua' ? 'Semua peran' : r}</option>`;
              }).join('')}
            </select>
            <button type="button" onclick="AdminPanel.openCreateUserModal()" class="btn-accent h-9 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="user-plus" class="w-4 h-4"></i>
              <span>Tambah pengguna</span>
            </button>
          </div>
        </div>
        <div class="border border-[#DCDCE0] overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                <th class="py-3 px-4 font-semibold">Nama &amp; email</th>
                <th class="py-3 px-4 font-semibold hidden sm:table-cell">Nomor WA</th>
                <th class="py-3 px-4 font-semibold">Peran</th>
                <th class="py-3 px-4 font-semibold">Aksi</th>
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
                if (!filtered.length) return `<tr><td colspan="4" class="py-8 px-4 text-xs text-[#71717A]">Tidak ada pengguna yang sesuai filter.</td></tr>`;
                return filtered.map(function (u) {
                  const badge = u.role === 'Admin' ? 'bg-[#FF4F00] text-[#FFFFFF]' : u.role === 'Pro' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#111111]';
                  const isSelf = String(u.email || '').toLowerCase() === String(d.currentEmail || '').toLowerCase();
                  return `
                    <tr class="border-b border-[#DCDCE0] last:border-b-0 hover:bg-[#F7F7F8] transition-colors">
                      <td class="py-3 px-4">
                        <div class="font-medium text-[#111111]">${esc(u.nama_lengkap)} ${isSelf ? '<span class="ml-1 text-xs font-semibold text-[#FF4F00]">(ANDA)</span>' : ''}</div>
                        <div class="text-xs text-[#71717A]">${esc(u.email)}</div>
                      </td>
                      <td class="py-3 px-4 text-xs text-[#52525B] tabular-nums hidden sm:table-cell">${esc(u.no_wa || '-')}</td>
                      <td class="py-3 px-4"><span class="px-2 py-0.5 text-xs font-semibold ${badge}">${esc(u.role).toUpperCase()}</span></td>
                      <td class="py-3 px-4">
                        <div class="inline-flex flex-wrap gap-1.5">
                          ${u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.quickPromoteAdmin('${esc(u.email)}','${esc(u.nama_lengkap)}')" class="btn-primary h-8 px-2.5 text-xs">Jadikan admin</button>` : ''}
                          ${u.role !== 'Pro' && u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Pro')" class="btn-outline h-8 px-2.5 text-xs">Set Pro</button>` : ''}
                          ${u.role === 'Pro' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Latihan')" class="btn-outline h-8 px-2.5 text-xs">Set Latihan</button>` : ''}
                          ${!isSelf ? `<button type="button" onclick="AdminPanel.deleteUser('${esc(u.user_id)}','${esc(u.email)}')" class="btn-accent h-8 px-2.5 text-xs inline-flex items-center gap-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus</button>` : ''}
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
      <div class="p-6 lg:p-8 border-b border-[#111111] flex items-baseline gap-4">
        <span class="swiss-folio text-4xl font-semibold text-[#FF4F00]">05</span>
        <h1 class="text-2xl font-semibold text-[#111111] tracking-[-0.02em]">Google OAuth 2.0, Script Properties, dan migrasi</h1>
      </div>

      <!-- Pengaturan Google OAuth 2.0 -->
      <form onsubmit="AdminPanel.saveOAuthSettings(event)" class="p-6 lg:p-8 border-b border-[#111111] space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-base text-[#111111]">Login Google OAuth 2.0</h3>
              <span class="px-2 py-0.5 text-xs font-semibold ${gClient.ada && oauthAktif ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">
                ${gClient.ada && oauthAktif ? 'AKTIF' : 'PERLU CLIENT ID'}
              </span>
            </div>
            <p class="text-xs text-[#52525B] mt-1">Peserta masuk satu klik memakai akun Google dengan verifikasi token di server GAS</p>
          </div>
          <button type="button" onclick="AdminPanel.openOAuthGuideModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2 shrink-0">
            <i data-lucide="book-open" class="w-4 h-4"></i>
            <span>Panduan Google Cloud</span>
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div class="lg:col-span-5">
            <div class="flex items-center justify-between text-xs mb-1">
              <label class="font-medium text-[#111111]">Google OAuth 2.0 Client ID</label>
              <span class="tabular-nums ${gClient.ada ? 'text-[#111111] font-semibold' : 'text-[#71717A]'}">${gClient.ada ? 'Tersimpan: ' + esc(gClient.masked) : 'Belum diisi'}</span>
            </div>
            <input type="text" id="oauth-client-id" placeholder="xxxx.apps.googleusercontent.com"
              class="input-control w-full" />
          </div>

          <div class="lg:col-span-4">
            <label class="text-xs font-medium text-[#111111] block mb-1">Authorized JavaScript Origin</label>
            <div class="flex items-center gap-2">
              <input type="text" readonly id="oauth-origin-url" value="${esc(curOrigin)}" class="input-control flex-1 bg-[#F7F7F8] text-xs tabular-nums text-[#52525B]" />
              <button type="button" onclick="AdminPanel.copyOrigin()" class="btn-outline h-10 px-3 text-xs shrink-0">Salin</button>
            </div>
          </div>

          <div class="lg:col-span-3 flex items-center justify-between gap-3 h-10 px-3 bg-[#F7F7F8] border border-[#111111]">
            <label for="oauth-aktif" class="text-xs font-medium text-[#111111] cursor-pointer">Aktifkan tombol Google</label>
            <input type="checkbox" id="oauth-aktif" ${oauthAktif ? 'checked' : ''} class="w-4 h-4 accent-[#FF4F00]" />
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span class="text-xs text-[#71717A]">Ketik <code class="tabular-nums font-semibold">__HAPUS__</code> pada kolom Client ID untuk menghapus nilai tersimpan</span>
          <button type="submit" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i>
            <span>Simpan pengaturan OAuth</span>
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#111111]">
        <!-- Rahasia Script Properties -->
        <form onsubmit="AdminPanel.saveSecrets(event)" class="p-6 lg:p-8 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2 border-b border-[#DCDCE0] pb-3">
            <div>
              <h3 class="font-semibold text-base text-[#111111]">Kredensial Script Properties</h3>
              <p class="text-xs text-[#52525B]">Token disimpan di Script Properties server, kosongkan kolom bila tidak diubah</p>
            </div>
            <i data-lucide="lock" class="w-4 h-4 text-[#71717A] shrink-0"></i>
          </div>

          <div class="space-y-3">
            ${sec.filter(function (item) { return item.key !== 'GOOGLE_CLIENT_ID'; }).map(function (item) {
              return `
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <label class="tabular-nums font-semibold text-[#111111]">${esc(item.key)}</label>
                    <span class="tabular-nums ${item.ada ? 'text-[#111111] font-semibold' : 'text-[#71717A]'}">${item.ada ? 'Terpasang: ' + esc(item.masked) : 'Belum diisi'}</span>
                  </div>
                  <input type="password" id="sec-${esc(item.key)}" placeholder="Nilai baru atau __HAPUS__"
                    class="input-control w-full" />
                </div>`;
            }).join('')}
          </div>

          <div class="pt-4 border-t border-[#DCDCE0] space-y-3">
            <div class="text-xs font-semibold text-[#111111]">Pengaturan pembayaran &amp; kontak admin</div>
            <div>
              <label class="text-xs text-[#52525B]">Rekening / QRIS aktivasi Pro</label>
              <input type="text" id="set-rekening" value="${esc(set.INFO_REKENING_PRO || '')}" class="input-control mt-1 w-full" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-[#52525B]">Harga paket Pro</label>
                <input type="text" id="set-harga" value="${esc(set.HARGA_PRO || '')}" class="input-control mt-1 w-full" />
              </div>
              <div>
                <label class="text-xs text-[#52525B]">WhatsApp admin</label>
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
        <div class="p-6 lg:p-8 lg:col-span-6 space-y-4">
          <div class="flex items-start justify-between gap-2 border-b border-[#DCDCE0] pb-3">
            <div>
              <h3 class="font-semibold text-base text-[#111111]">Migrasi &amp; sinkronisasi spreadsheet</h3>
              <p class="text-xs text-[#52525B]">Salin data dari spreadsheet versi lama secara idempoten berbasis nama kolom</p>
            </div>
            <i data-lucide="database-backup" class="w-4 h-4 text-[#71717A] shrink-0"></i>
          </div>

          <div>
            <label class="text-xs font-medium text-[#52525B]">ID atau URL spreadsheet sumber</label>
            <input type="text" id="mig-source" placeholder="https://docs.google.com/spreadsheets/d/..." class="input-control mt-1 w-full" />
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" onclick="AdminPanel.runMigration(true)" class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="search" class="w-4 h-4"></i>
              <span>Pindai (dry-run)</span>
            </button>
            <button type="button" onclick="AdminPanel.runMigration(false)" class="btn-accent h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="play" class="w-4 h-4"></i>
              <span>Jalankan sinkronisasi</span>
            </button>
          </div>

          ${mig ? `
            <div class="p-4 bg-[#F7F7F8] border border-[#111111] space-y-3">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-[#111111]">${mig.dryRun ? 'Hasil pindai (dry-run)' : 'Hasil sinkronisasi'}</span>
                <span class="text-[#FF4F00]">${esc(mig.sourceName)}</span>
              </div>
              <table class="w-full text-xs text-left">
                <thead><tr class="text-[#52525B] border-b border-[#DCDCE0]"><th class="py-1.5 font-semibold">Sheet</th><th class="font-semibold">Tambah</th><th class="font-semibold">Perbarui</th><th class="font-semibold">Lewati</th></tr></thead>
                <tbody>
                  ${mig.report.map(function (r) {
                    return `<tr class="border-b border-[#DCDCE0] last:border-b-0"><td class="py-1.5 font-medium text-[#111111]">${esc(r.sheet)}</td><td class="tabular-nums text-[#111111] font-semibold">+${r.inserted}</td><td class="tabular-nums text-[#FF4F00] font-semibold">${r.updated}</td><td class="tabular-nums text-[#71717A]">${r.skipped}</td></tr>`;
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
          <div class="p-3 bg-[#F7F7F8] border border-[#DCDCE0] text-xs space-y-1">
            <div><span class="text-[#71717A]">Email:</span> <strong class="font-semibold text-[#111111]">${esc(r.email_user)}</strong></div>
            <div><span class="text-[#71717A]">Catatan:</span> <strong class="font-semibold text-[#111111]">${esc(r.catatan_user || '-')}</strong></div>
          </div>
          ${r.url_bukti_drive ? `<img src="${esc(r.url_bukti_drive)}" alt="Bukti transfer ${esc(r.nama_user)}" class="w-full max-h-80 object-contain border border-[#DCDCE0]" />`
            : `<div class="p-6 bg-[#F7F7F8] border border-[#DCDCE0] text-xs text-[#71717A]">Tidak ada lampiran gambar bukti transfer.</div>`}
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
          <div class="p-4 bg-[#F7F7F8] border-l-2 border-[#FF4F00] text-[#111111] text-xs space-y-2">
            <div class="font-semibold">Paket tujuan: ${esc(curPkg ? curPkg.nama_paket : state.selectedPaketId)}</div>
            <div>Unggah berkas .csv untuk menambahkan banyak butir soal sekaligus ke paket aktif</div>
            <button type="button" onclick="AdminPanel.downloadCsvTemplate()" class="btn-outline h-8 px-3 text-xs inline-flex items-center gap-1.5">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>Unduh template CSV</span>
            </button>
          </div>

          <div>
            <label class="text-xs font-medium text-[#52525B]">Berkas CSV soal</label>
            <input type="file" id="csv-soal-file" accept=".csv,text/csv" onchange="AdminPanel.handleCsvFile(this)"
              class="mt-1 w-full text-xs p-3 border border-[#111111] bg-[#F7F7F8]" />
          </div>

          <div id="csv-preview-box" class="hidden p-4 bg-[#F7F7F8] border border-[#DCDCE0] space-y-2 text-xs">
            <div id="csv-preview-summary" class="font-semibold text-[#111111]"></div>
            <div id="csv-preview-list" class="max-h-40 overflow-y-auto space-y-1 text-[#52525B]"></div>
          </div>

          <button type="button" id="btn-submit-csv" disabled onclick="AdminPanel.submitBulkImport()"
            class="btn-accent w-full h-10 px-4 text-xs text-left disabled:opacity-40 disabled:cursor-not-allowed">
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
          return '<div class="truncate"><strong class="tabular-nums font-semibold">' + (i + 1) + '. [' + esc(x.subtes) + ']</strong> ' + esc(x.pertanyaan) + '</div>';
        }).join('') + (items.length > 6 ? '<div class="text-[#FF4F00] font-semibold">dan ' + (items.length - 6) + ' soal lainnya</div>' : '');
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
          <div><label class="text-xs font-medium text-[#52525B]">Nama paket</label><input id="pkg-nama" required class="input-control mt-1 w-full" placeholder="Contoh: Tryout Nasional SKD #02" /></div>
          <div><label class="text-xs font-medium text-[#52525B]">Deskripsi</label><textarea id="pkg-desk" rows="2" class="mt-1 w-full p-3 border border-[#111111] text-sm"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-medium text-[#52525B]">Tier akses</label><select id="pkg-tier" class="input-control mt-1 w-full"><option value="Latihan">Latihan (gratis)</option><option value="Pro">Pro</option></select></div>
            <div><label class="text-xs font-medium text-[#52525B]">Kategori</label><input id="pkg-kat" value="CPNS SKD" class="input-control mt-1 w-full" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-medium text-[#52525B]">Durasi (menit)</label><input id="pkg-dur" type="number" value="100" class="input-control mt-1 w-full tabular-nums" /></div>
            <div><label class="text-xs font-medium text-[#52525B]">Target soal</label><input id="pkg-jml" type="number" value="110" class="input-control mt-1 w-full tabular-nums" /></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="text-xs font-medium text-[#52525B]">PG TWK</label><input id="pkg-twk" type="number" value="65" class="input-control mt-1 w-full tabular-nums" /></div>
            <div><label class="text-xs font-medium text-[#52525B]">PG TIU</label><input id="pkg-tiu" type="number" value="80" class="input-control mt-1 w-full tabular-nums" /></div>
            <div><label class="text-xs font-medium text-[#52525B]">PG TKP</label><input id="pkg-tkp" type="number" value="166" class="input-control mt-1 w-full tabular-nums" /></div>
          </div>
          <button type="submit" class="btn-accent w-full h-10 px-4 text-xs text-left">Simpan paket</button>
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
            <label class="text-xs font-medium text-[#52525B]">Nama lengkap</label>
            <input type="text" id="cu-nama" required minlength="3" placeholder="Nama lengkap" class="input-control mt-1 w-full" />
          </div>
          <div>
            <label class="text-xs font-medium text-[#52525B]">Email</label>
            <input type="email" id="cu-email" required placeholder="nama@email.com" class="input-control mt-1 w-full" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-[#52525B]">Nomor WhatsApp (opsional)</label>
              <input type="tel" id="cu-wa" placeholder="0812xxxxxxxx" class="input-control mt-1 w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-[#52525B]">Peran akun</label>
              <select id="cu-role" class="input-control mt-1 w-full font-medium">
                <option value="Latihan">Latihan</option>
                <option value="Pro">Pro</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#52525B]">Kata sandi (minimal 6 karakter)</label>
            <input type="password" id="cu-pass" required minlength="6" placeholder="Kata sandi awal" class="input-control mt-1 w-full" />
          </div>
          <button type="submit" class="btn-accent w-full h-10 px-4 text-xs text-left">Simpan pengguna</button>
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
        <ol class="space-y-3 text-xs text-[#52525B] list-decimal pl-4 leading-relaxed">
          <li>Buka <strong class="font-semibold text-[#111111]">Google Cloud Console</strong> (<code class="tabular-nums">console.cloud.google.com</code>) dan pilih proyek Anda.</li>
          <li>Buka <strong class="font-semibold text-[#111111]">APIs &amp; Services → OAuth consent screen</strong>, pilih <strong class="font-semibold text-[#111111]">External</strong>, isi nama aplikasi SimulasiTKD Pro dan email kontak.</li>
          <li>Buka <strong class="font-semibold text-[#111111]">Credentials → Create Credentials → OAuth client ID</strong> dengan tipe <strong class="font-semibold text-[#111111]">Web application</strong>.</li>
          <li>Tambahkan domain berikut pada <strong class="font-semibold text-[#111111]">Authorized JavaScript origins</strong>:<br/>
            <code class="inline-block mt-1 px-2 py-1 bg-[#F7F7F8] border border-[#111111] text-[#111111] tabular-nums font-semibold">${esc(origin)}</code>
          </li>
          <li>Salin nilai <strong class="font-semibold text-[#111111]">Client ID</strong> ke kolom Google OAuth 2.0 Client ID pada halaman ini lalu simpan.</li>
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
