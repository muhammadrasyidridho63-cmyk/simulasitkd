/**
 * ============================================================================
 * SimulasiTKD Pro — js/admin.js
 * Panel Kontrol Admin (Stitch CAT Platform Design)
 * Seluruh pengaturan, fitur CRUD, Impor CSV, CRM WA, OAuth 2.0 & Migrasi tetap utuh
 * ============================================================================
 */

const AdminPanel = (function () {
  const STITCH_LOGO_URL = 'https://lh3.googleusercontent.com/aida/ALJJyrCgxoYmh_SaCEQ6oaX69rhrfi6NdUX3exxvaE7Q01NE8iAhadoxRdehu5cipWq8mbe0oBl1EIswChPRMDGzWBIdpxe2V3RtFkbts_cTywm2V9Z_YqHbLgb4yjLfvBmBaFX5fn5-LXfge_YQ9-motV6tIlAnsh4XtoJ452d4q8bPB_AjagRtW5HNYso5FG9mxcnRpj-6J-wEo8NSkoI4lQZR18NMhzRuzGNj5hzqk20';

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

  function refreshIcons() {
    if (window.lucide) {
      lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
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
    const navItems = [
      { id: 'overview', label: 'Ringkasan & Verifikasi Pro', icon: 'verified_user', badge: pendingCount > 0 ? pendingCount : '' },
      { id: 'questions', label: 'Bank Soal & Laporan', icon: 'library_books' },
      { id: 'crm', label: 'Notifikasi WA & CRM', icon: 'forum' },
      { id: 'admins', label: 'Manajemen User', icon: 'group' },
      { id: 'security', label: 'Pengaturan Sistem', icon: 'settings' }
    ];

    const navHtml = navItems.map(function (item) {
      const active = state.tab === item.id;
      return `
        <button type="button" onclick="AdminPanel.switchTab('${item.id}')"
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left cursor-pointer ${active ? 'bg-secondary text-on-secondary font-bold' : 'font-label-lg text-label-lg text-on-primary-container hover:bg-secondary/40 hover:text-on-secondary'}">
          <span class="flex items-center min-w-0">
            <span class="material-symbols-outlined mr-3 text-[20px] shrink-0">${item.icon}</span>
            <span class="truncate text-sm">${item.label}</span>
          </span>
          ${item.badge ? `<span class="font-mono-score text-mono-score text-xs px-2 py-0.5 rounded-full bg-error text-on-error">${item.badge}</span>` : ''}
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="min-h-screen bg-surface">
        <!-- Fixed Left Sidebar (Exact Stitch Admin Panel Sidebar) -->
        <aside class="hidden lg:flex fixed left-0 top-0 h-full w-60 bg-primary-container text-on-primary z-50 flex-col pt-6 pb-8 no-print">
          <div class="px-6 mb-8 font-title-lg text-title-lg text-on-primary">Admin Panel</div>
          <nav class="flex-1 px-3 space-y-1">${navHtml}</nav>
          <div class="px-3 pt-4 space-y-1">
            <button type="button" onclick="App.go('dashboard')" class="w-full flex items-center px-3 py-2.5 rounded-lg font-label-lg text-label-lg text-on-primary-container hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer">
              <span class="material-symbols-outlined mr-3 text-[20px]">visibility</span>
              <span>Pratinjau Portal Peserta</span>
            </button>
            <button type="button" onclick="App.logout()" class="w-full flex items-center px-3 py-2.5 rounded-lg font-label-lg text-label-lg text-on-primary-container hover:bg-error hover:text-on-error transition-colors cursor-pointer">
              <span class="material-symbols-outlined mr-3 text-[20px]">logout</span>
              <span>Keluar</span>
            </button>
          </div>
        </aside>

        <!-- Mobile Sidebar Drawer -->
        ${state.mobileSidebarOpen ? `
          <div class="fixed inset-0 z-50 lg:hidden flex">
            <div class="fixed inset-0 bg-on-surface/50 backdrop-blur-sm" onclick="AdminPanel.toggleSidebar(false)"></div>
            <aside class="relative w-64 max-w-[82vw] bg-primary-container text-on-primary flex flex-col pt-6 pb-6 z-10">
              <div class="px-6 mb-6 flex items-center justify-between">
                <span class="font-title-lg text-title-lg text-on-primary">Admin Panel</span>
                <button type="button" onclick="AdminPanel.toggleSidebar(false)" class="p-1.5 rounded-lg hover:bg-secondary/40 text-on-primary"><span class="material-symbols-outlined text-[20px]">close</span></button>
              </div>
              <nav class="flex-1 px-3 space-y-1">${navHtml}</nav>
              <div class="px-3 pt-4 space-y-1">
                <button type="button" onclick="App.go('dashboard')" class="w-full flex items-center px-3 py-2.5 rounded-lg font-label-lg text-label-lg text-on-primary-container hover:bg-secondary hover:text-on-secondary transition-colors">
                  <span class="material-symbols-outlined mr-3 text-[20px]">visibility</span>
                  <span>Pratinjau Portal Peserta</span>
                </button>
                <button type="button" onclick="App.logout()" class="w-full flex items-center px-3 py-2.5 rounded-lg font-label-lg text-label-lg text-on-primary-container hover:bg-error hover:text-on-error transition-colors">
                  <span class="material-symbols-outlined mr-3 text-[20px]">logout</span>
                  <span>Keluar</span>
                </button>
              </div>
            </aside>
          </div>
        ` : ''}

        <!-- Main Workspace -->
        <div class="lg:pl-60">
          <header class="fixed top-0 left-0 lg:left-60 right-0 h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 px-6 lg:px-8 flex items-center justify-between no-print">
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.toggleSidebar(true)" class="lg:hidden p-2 rounded-lg bg-surface-container-low text-on-surface">
                <span class="material-symbols-outlined text-[20px]">menu</span>
              </button>
              <img alt="SimulasiTKD Pro Logo" class="h-8 w-auto object-contain" src="${STITCH_LOGO_URL}" onerror="this.style.display='none'" />
              <span class="font-title-md text-title-md text-primary">SimulasiTKD Pro</span>
              ${ApiClient.isDemoMode() ? '<span class="hidden sm:inline-flex px-2.5 py-0.5 rounded-full font-label-md text-label-md bg-primary-fixed text-on-primary-fixed">Mode Pratinjau</span>' : ''}
            </div>
            <div class="flex items-center gap-3">
              <button type="button" onclick="AdminPanel.refresh()" class="w-9 h-9 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors cursor-pointer" title="Muat ulang data">
                <span class="material-symbols-outlined text-[18px]">refresh</span>
              </button>
              <div class="hidden sm:block text-right">
                <div class="font-label-lg text-label-lg text-on-surface leading-tight">${esc(savedAdmin.nama_lengkap || 'Administrator')}</div>
                <div class="font-label-md text-label-md text-on-surface-variant leading-tight">${esc(savedAdmin.email || '')}</div>
              </div>
              <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span class="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
            </div>
          </header>

          <main class="relative pt-16 bg-surface w-full px-6 lg:px-8">
            <div class="max-w-[1440px] mx-auto flex flex-col w-full gap-8 pb-12">
              ${state.tab === 'overview' ? renderOverview() : ''}
              ${state.tab === 'questions' ? renderQuestionsAndReports() : ''}
              ${state.tab === 'crm' ? renderCrmWa() : ''}
              ${state.tab === 'admins' ? renderAdminEmails() : ''}
              ${state.tab === 'security' ? renderSecurityMigration() : ''}
            </div>
          </main>
        </div>
      </div>
    `;
    refreshIcons();
  }

  // --------------------------------------------------------------------------
  // TAB 1: RINGKASAN ANALITIK & ANTREAN PERSETUJUAN PRO (Exact Stitch Layout)
  // --------------------------------------------------------------------------
  function renderOverview() {
    if (!state.overview) {
      return `<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        <div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div>
      </section>`;
    }
    const k = state.overview.kpi;
    const list = (state.overview.upgrades || []).filter(function (r) {
      const matchStatus = state.upgradeFilter === 'Semua' || r.status_verifikasi === state.upgradeFilter;
      const q = state.upgradeSearch.toLowerCase();
      const matchQ = !q || String(r.nama_user).toLowerCase().includes(q) || String(r.email_user).toLowerCase().includes(q);
      return matchStatus && matchQ;
    });

    const rowsHtml = list.length ? list.map(function (r) {
      const badgeCls = r.status_verifikasi === 'Approved' ? 'bg-secondary-container text-on-secondary-container'
        : r.status_verifikasi === 'Rejected' ? 'bg-error-container text-on-error-container'
        : 'bg-tertiary-fixed text-on-tertiary-fixed-variant';
      return `
        <tr class="transition-colors hover:bg-surface-container-low/50">
          <td class="py-3.5 px-4">
            <div class="font-title-md text-title-md text-on-surface">${esc(r.nama_user)}</div>
            <div class="font-body-sm text-body-sm text-on-surface-variant">${esc(r.email_user)}</div>
          </td>
          <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface-variant">${fmtDate(r.tanggal_request)}</td>
          <td class="py-3.5 px-4">
            <button type="button" onclick="AdminPanel.previewProof('${esc(r.req_id)}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low text-primary font-label-md text-label-md hover:bg-primary-fixed transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>Lihat Bukti Drive</span>
            </button>
          </td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full font-label-md text-label-md ${badgeCls}">${esc(r.status_verifikasi)}</span>
          </td>
          <td class="py-3.5 px-4 text-right">
            ${r.status_verifikasi === 'Pending' ? `
              <div class="inline-flex items-center gap-2">
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Approved')" class="h-8 px-3 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md hover:bg-secondary transition-colors cursor-pointer">Setujui &amp; Aktifkan Pro</button>
                <button type="button" onclick="AdminPanel.processUpgrade('${esc(r.req_id)}','Rejected')" class="h-8 px-3 rounded-lg bg-error text-on-error font-label-md text-label-md hover:opacity-90 transition-opacity cursor-pointer">Tolak</button>
              </div>
            ` : `<span class="font-label-md text-label-md text-on-surface-variant">${esc(r.catatan_admin || 'Terverifikasi')}</span>`}
          </td>
        </tr>`;
    }).join('') : `<tr><td colspan="5" class="py-10 text-center font-body-sm text-body-sm text-on-surface-variant">Tidak ada pengajuan upgrade yang sesuai filter</td></tr>`;

    return `
      <!-- 1. Admin KPI Row -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        <!-- KPI 1 -->
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md">
          <div class="flex items-center justify-between">
            <span class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Total Peserta Terdaftar</span>
            <span class="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
              <span class="material-symbols-outlined text-[20px]">group</span>
            </span>
          </div>
          <div class="mt-4 flex items-end justify-between">
            <div>
              <div class="font-headline-md text-headline-md text-on-surface tabular-nums">${k.totalPeserta}</div>
              <div class="font-label-md text-label-md text-secondary mt-1 flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">trending_up</span>
                <span>Akun terdaftar aktif</span>
              </div>
            </div>
            <svg class="w-16 h-8 text-secondary" fill="none" viewBox="0 0 64 32">
              <path d="M2 26L14 20L24 22L36 12L48 15L62 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path>
            </svg>
          </div>
        </div>

        <!-- KPI 2 -->
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md">
          <div class="flex items-center justify-between">
            <span class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Peserta Akun Pro Aktif</span>
            <span class="w-9 h-9 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-container">
              <span class="material-symbols-outlined text-[20px]">workspace_premium</span>
            </span>
          </div>
          <div class="mt-4">
            <div class="flex items-baseline gap-2">
              <span class="font-headline-md text-headline-md text-on-surface tabular-nums">${k.totalPro}</span>
              <span class="font-label-md text-label-md px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">${k.rasioPro}% konversi</span>
            </div>
            <div class="w-full h-1.5 bg-surface-container-low rounded-full mt-3 overflow-hidden">
              <div class="h-full bg-secondary rounded-full transition-all duration-500" style="width: ${Math.min(100, Number(k.rasioPro || 0))}%"></div>
            </div>
          </div>
        </div>

        <!-- KPI 3 -->
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md">
          <div class="flex items-center justify-between">
            <span class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Antrean Verifikasi Upgrade</span>
            <span class="w-9 h-9 rounded-lg bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed-variant">
              <span class="material-symbols-outlined text-[20px]">pending_actions</span>
            </span>
          </div>
          <div class="mt-4 flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2.5">
                <span class="relative flex h-3 w-3">
                  ${k.pendingUpgrade > 0 ? '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>' : ''}
                  <span class="relative inline-flex rounded-full h-3 w-3 ${k.pendingUpgrade > 0 ? 'bg-error' : 'bg-secondary'}"></span>
                </span>
                <span class="font-headline-md text-headline-md text-on-surface tabular-nums">${k.pendingUpgrade} Pending</span>
              </div>
              <p class="font-label-md text-label-md text-on-surface-variant mt-1">${k.pendingUpgrade > 0 ? 'Butuh tinjauan bukti transfer' : 'Tidak ada antrean tertunda'}</p>
            </div>
          </div>
        </div>

        <!-- KPI 4 -->
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col justify-between transition-all hover:shadow-md">
          <div class="flex items-center justify-between">
            <span class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Rata-rata Kelulusan PG</span>
            <span class="w-9 h-9 rounded-lg bg-primary-fixed flex items-center justify-center text-on-primary-fixed-variant">
              <span class="material-symbols-outlined text-[20px]">analytics</span>
            </span>
          </div>
          <div class="mt-4 flex items-end justify-between">
            <div>
              <div class="font-headline-md text-headline-md text-on-surface tabular-nums">${k.passRate}%</div>
              <div class="font-label-md text-label-md text-on-surface-variant mt-1">Ambang batas SKD Nasional</div>
            </div>
            <svg class="w-12 h-12 text-secondary -rotate-90" viewBox="0 0 36 36">
              <circle class="text-surface-container-low" cx="18" cy="18" fill="none" r="15" stroke="currentColor" stroke-width="4"></circle>
              <circle cx="18" cy="18" fill="none" r="15" stroke="currentColor" stroke-dasharray="${Math.min(100, Number(k.passRate || 0))} 100" stroke-linecap="round" stroke-width="4"></circle>
            </svg>
          </div>
        </div>
      </section>

      <!-- Charts Hierarchy -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-8 flex flex-col justify-between gap-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-title-lg text-title-lg text-on-surface">Aktivitas Ujian &amp; Kelulusan Mingguan</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant">Jumlah pengerjaan simulasi dan peserta lulus 7 hari terakhir</p>
            </div>
            <div class="flex items-center gap-4 font-label-md text-label-md text-on-surface-variant">
              <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-primary-container"></span> Lulus PG</span>
              <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-surface-dim"></span> Total Ujian</span>
            </div>
          </div>
          <div class="h-60"><canvas id="chartAdminWeekly"></canvas></div>
        </div>
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-4 flex flex-col justify-between gap-4">
          <div>
            <h3 class="font-title-lg text-title-lg text-on-surface">Komposisi Tier Akun</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Proporsi peserta Pro dan Latihan</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-32 h-32 relative shrink-0"><canvas id="chartAdminTier"></canvas></div>
            <div class="space-y-2.5 flex-1">
              <div class="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                <span class="font-label-md text-label-md text-on-surface">Akun Pro</span>
                <span class="font-mono-score text-mono-score text-on-surface tabular-nums">${k.totalPro}</span>
              </div>
              <div class="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                <span class="font-label-md text-label-md text-on-surface-variant">Latihan</span>
                <span class="font-mono-score text-mono-score text-on-surface tabular-nums">${k.totalLatihan}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Pro Upgrade Verification Queue Table -->
      <section class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">01 / Verifikasi Pembayaran</span>
            <h2 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">Antrean Verifikasi Upgrade Pro</h2>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input id="adm-upg-search" type="text" value="${esc(state.upgradeSearch)}" oninput="AdminPanel.setUpgradeSearch(this.value, this.selectionStart)" placeholder="Cari nama atau email peserta..."
                class="pl-9 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm placeholder:text-on-surface-variant focus:outline-none w-64" />
            </div>
            <div class="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-lg">
              ${['Semua', 'Pending', 'Approved', 'Rejected'].map(function (st) {
                const active = state.upgradeFilter === st;
                return `<button type="button" onclick="AdminPanel.setUpgradeFilter('${st}')" class="px-3 py-1.5 rounded-md font-label-md text-label-md transition-colors cursor-pointer ${active ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}">${st}</button>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                <th class="py-3 px-4 rounded-l-lg">Peserta &amp; Email</th>
                <th class="py-3 px-4">Tanggal Pengajuan</th>
                <th class="py-3 px-4">Bukti Transfer</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 rounded-r-lg text-right">Aksi 1-Klik</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm">${rowsHtml}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function mountOverviewCharts() {
    if (!state.overview || !window.Chart) return;
    const k = state.overview.kpi;
    const monoFont = { family: "'JetBrains Mono', monospace", size: 11 };
    const gridColor = '#dce9ff';
    const tickColor = '#414944';

    const ctx1 = document.getElementById('chartAdminTier');
    if (ctx1) {
      charts.push(new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Akun Pro', 'Latihan'],
          datasets: [{ data: [k.totalPro || 0, k.totalLatihan || 1], backgroundColor: ['#0e3b2c', '#ccdbf3'], borderWidth: 0 }]
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
            { label: 'Lulus PG', data: w.map(function (d) { return d.lulus; }), backgroundColor: '#0e3b2c', borderRadius: 4, barPercentage: 0.6 },
            { label: 'Total Ujian', data: w.map(function (d) { return d.total; }), backgroundColor: '#ccdbf3', borderRadius: 4, barPercentage: 0.6 }
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
  // TAB 2: BANK SOAL, EDITOR PAKET & LAPORAN SKOR (Exact Stitch Layout)
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
      <!-- Top Action Bar -->
      <section class="pt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">02 / Bank Soal &amp; Paket</span>
          <h1 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">Manajemen Paket, Butir Soal &amp; Rekap Nilai</h1>
        </div>
        <div class="flex flex-wrap gap-2.5">
          <button type="button" onclick="AdminPanel.openPackageModal()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">create_new_folder</span>
            <span>Paket Baru</span>
          </button>
          <button type="button" onclick="AdminPanel.openImportModal()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Impor CSV</span>
          </button>
          <button type="button" onclick="AdminPanel.newQuestion()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Tambah Soal</span>
          </button>
        </div>
      </section>

      <!-- 3. Split Question Bank & TKP Weight Editor -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left 4 Cols: Package & Question List -->
        <div class="lg:col-span-4 bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h2 class="font-title-lg text-title-lg text-on-surface">Daftar Butir Soal</h2>
            <span class="font-mono-score text-mono-score text-on-surface-variant">${soalFiltered.length} soal</span>
          </div>

          <select onchange="AdminPanel.selectPaket(this.value)" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
            ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${p.paket_id === state.selectedPaketId ? 'selected' : ''}>${esc(p.nama_paket)} — ${esc(p.tier_akses)}</option>`; }).join('')}
          </select>

          <div class="flex items-center gap-1.5 bg-surface-container-low p-1 rounded-lg">
            ${['Semua', 'TWK', 'TIU', 'TKP'].map(function (st) {
              const active = state.qSubtesFilter === st;
              return `<button type="button" onclick="AdminPanel.setQSubtes('${st}')" class="flex-1 py-1.5 rounded-md font-label-md text-label-md transition-colors cursor-pointer ${active ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}">${st}</button>`;
            }).join('')}
          </div>

          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input id="adm-q-search" type="text" value="${esc(state.qSearch)}" oninput="AdminPanel.setQSearch(this.value, this.selectionStart)" placeholder="Cari teks pertanyaan..."
              class="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>

          <div class="flex flex-col gap-2.5 max-h-[520px] overflow-y-auto pr-1">
            ${soalFiltered.length ? soalFiltered.map(function (s, idx) {
              const active = ed.soal_id === s.soal_id;
              return `
                <div onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" class="text-left p-3.5 rounded-xl transition-all cursor-pointer ${active ? 'bg-primary-fixed/60 ring-1 ring-primary-container' : 'bg-surface-container-low hover:bg-surface-container'}">
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono-score text-mono-score ${active ? 'text-on-primary-fixed' : 'text-on-surface-variant'}">Soal #${s.nomor_urut || idx + 1}</span>
                      <span class="px-2 py-0.5 rounded-full font-label-md text-label-md ${s.subtes === 'TKP' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface'}">${esc(s.subtes)}</span>
                    </div>
                    <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                      <button type="button" onclick="AdminPanel.editSoal('${esc(s.soal_id)}')" title="Edit Soal" class="px-2 py-1 rounded-md bg-surface-container-lowest hover:bg-primary-fixed text-on-surface font-label-md text-[11px] inline-flex items-center gap-1 shadow-xs cursor-pointer">
                        <span class="material-symbols-outlined text-[14px]">edit</span> Edit
                      </button>
                      <button type="button" onclick="AdminPanel.deleteQuestion('${esc(s.soal_id)}')" title="Hapus Soal" class="px-2 py-1 rounded-md bg-error-container hover:bg-error hover:text-on-error text-on-error-container font-label-md text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer">
                        <span class="material-symbols-outlined text-[14px]">delete</span> Hapus
                      </button>
                    </div>
                  </div>
                  <p class="font-body-sm text-body-sm text-on-surface line-clamp-2">${esc(s.pertanyaan)}</p>
                </div>`;
            }).join('') : `<div class="py-10 text-center font-body-sm text-body-sm text-on-surface-variant">Belum ada soal di paket ini, klik Tambah Soal</div>`}
          </div>
        </div>

        <!-- Right 8 Cols: Question & TKP Weight Editor -->
        <div id="q-editor-form" class="lg:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">Editor Butir Soal • ${esc(ed.subtes)} #${esc(ed.nomor_urut || 1)}</span>
              <h3 class="font-title-lg text-title-lg text-on-surface mt-0.5">${ed.soal_id ? 'Konten Soal & Pembobotan Skor' : 'Buat Butir Soal Baru'}</h3>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="q-nomor" value="${ed.nomor_urut || 1}" min="1" class="w-16 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" title="Nomor urut" />
              <select id="q-subtes" onchange="AdminPanel.changeEditorSubtes(this.value)" class="px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md focus:outline-none cursor-pointer">
                <option value="TWK" ${ed.subtes === 'TWK' ? 'selected' : ''}>TWK (Benar +5)</option>
                <option value="TIU" ${ed.subtes === 'TIU' ? 'selected' : ''}>TIU (Benar +5)</option>
                <option value="TKP" ${ed.subtes === 'TKP' ? 'selected' : ''}>Skala TKP (1–5 Poin)</option>
              </select>
            </div>
          </div>

          <form onsubmit="AdminPanel.saveQuestion(event)" class="flex flex-col gap-4">
            <input type="hidden" id="q-id" value="${esc(ed.soal_id || '')}" />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-label-lg text-label-lg text-on-surface mb-1.5">Topik Materi</label>
                <input type="text" id="q-topik" value="${esc(ed.topik || '')}" placeholder="Contoh: Pilar Negara / Silogisme" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
              </div>
              <div>
                <label class="block font-label-lg text-label-lg text-on-surface mb-1.5">ID Gambar Google Drive (Opsional)</label>
                <div class="relative">
                  <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">add_photo_alternate</span>
                  <input type="text" id="q-img" value="${esc(ed.drive_image_id || '')}" placeholder="Contoh: 1A2B3C4D5E6F7G8H9I0J" class="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" />
                </div>
              </div>
            </div>

            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1.5">Pertanyaan (Question Stem)</label>
              <textarea id="q-pertanyaan" rows="3" required class="w-full p-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">${esc(ed.pertanyaan || '')}</textarea>
            </div>

            <div class="flex flex-col gap-3">
              <label class="block font-label-lg text-label-lg text-on-surface">
                Opsi Jawaban (A–E) &amp; ${ed.subtes === 'TKP' ? 'Bobot Poin TKP (1–5)' : 'Kunci Jawaban Benar (+5)'}
              </label>
              ${['A', 'B', 'C', 'D', 'E'].map(function (opt, idx) {
                const val = ed['opsi_' + opt.toLowerCase()] || '';
                const isTop = (ed.subtes === 'TKP' && tkpWeights[opt] === 5) || (ed.subtes !== 'TKP' && String(ed.kunci_atau_bobot).toUpperCase() === opt);
                return `
                  <div class="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                    <span class="w-8 h-9 rounded-lg ${isTop ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface'} flex items-center justify-center font-mono-score text-mono-score shrink-0">${opt}</span>
                    <input type="text" id="q-opsi-${opt}" value="${esc(val)}" required placeholder="Teks opsi ${opt}" class="flex-1 px-3.5 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
                    ${ed.subtes === 'TKP' ? `
                      <select id="q-bobot-${opt}" class="w-32 px-3 py-2 rounded-lg ${tkpWeights[opt] === 5 ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-low text-on-surface'} font-mono-score text-mono-score focus:outline-none">
                        ${[5, 4, 3, 2, 1].map(function (n) { return `<option value="${n}" ${tkpWeights[opt] === n ? 'selected' : ''}>${n} Poin</option>`; }).join('')}
                      </select>
                    ` : `
                      <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low font-label-md text-label-md text-on-surface cursor-pointer">
                        <input type="radio" name="q-kunci" value="${opt}" ${String(ed.kunci_atau_bobot).toUpperCase() === opt ? 'checked' : ''} class="accent-[#0e3b2c]" />
                        <span>Kunci Benar</span>
                      </label>
                    `}
                  </div>`;
              }).join('')}
            </div>

            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1.5">Pembahasan Resmi</label>
              <textarea id="q-pembahasan" rows="2" class="w-full p-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">${esc(ed.pembahasan || '')}</textarea>
            </div>

            <div class="flex items-center justify-between pt-2">
              ${ed.soal_id ? `<button type="button" onclick="AdminPanel.deleteQuestion('${esc(ed.soal_id)}')" class="px-4 py-2.5 rounded-lg bg-error-container text-on-error-container font-label-lg text-label-lg hover:opacity-90 transition-opacity cursor-pointer">Hapus Soal</button>` : '<div></div>'}
              <button type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-secondary transition-colors shadow-sm cursor-pointer">
                <span class="material-symbols-outlined text-[18px]">save</span>
                <span>Simpan Butir Soal</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      <!-- 4. Score Recap & Export Toolbar -->
      <section class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">03 / Rekapitulasi Nilai</span>
            <h2 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">Rekap Skor &amp; Laporan Kelulusan</h2>
          </div>
          <div class="flex flex-wrap items-center gap-2.5 no-print">
            <button type="button" onclick="AdminPanel.exportReportsCSV()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-low text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">table_view</span>
              <span>Unduh CSV / Excel</span>
            </button>
            <button type="button" onclick="window.print()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-secondary transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              <span>Cetak Laporan PDF</span>
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 no-print">
          <div class="relative flex-1 min-w-[220px]">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
            <input id="adm-rep-search" type="text" value="${esc(state.repSearch)}" oninput="AdminPanel.setRepFilter('search', this.value, this.selectionStart)" placeholder="Cari nama peserta..."
              class="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>
          <select onchange="AdminPanel.setRepFilter('paket', this.value)" class="px-3.5 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
            <option value="">Semua Paket Tryout</option>
            ${pakets.map(function (p) { return `<option value="${esc(p.paket_id)}" ${state.repFilterPaket === p.paket_id ? 'selected' : ''}>${esc(p.nama_paket)}</option>`; }).join('')}
          </select>
          <select onchange="AdminPanel.setRepFilter('status', this.value)" class="px-3.5 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
            <option value="">Semua Status PG</option>
            <option value="Lulus" ${state.repFilterStatus === 'Lulus' ? 'selected' : ''}>Lulus</option>
            <option value="Tidak Lulus" ${state.repFilterStatus === 'Tidak Lulus' ? 'selected' : ''}>Tidak Lulus</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                <th class="py-3 px-4 rounded-l-lg">Nama Peserta</th>
                <th class="py-3 px-4">Paket Tryout</th>
                <th class="py-3 px-4">TWK</th>
                <th class="py-3 px-4">TIU</th>
                <th class="py-3 px-4">TKP</th>
                <th class="py-3 px-4">Total Skor</th>
                <th class="py-3 px-4 rounded-r-lg">Status PG</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm">
              ${repList.length ? repList.map(function (h) {
                const ok = h.status_kelulusan === 'Lulus';
                return `
                  <tr class="hover:bg-surface-container-low/50 transition-colors">
                    <td class="py-3.5 px-4 font-title-md text-title-md text-on-surface">${esc(h.nama_user)}</td>
                    <td class="py-3.5 px-4 text-on-surface-variant">${esc(h.nama_paket)}</td>
                    <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface tabular-nums">${h.skor_twk}</td>
                    <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface tabular-nums">${h.skor_tiu}</td>
                    <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface tabular-nums">${h.skor_tkp}</td>
                    <td class="py-3.5 px-4 font-mono-score text-mono-score text-primary font-bold tabular-nums">${h.skor_total}</td>
                    <td class="py-3.5 px-4">
                      <span class="inline-flex items-center px-2.5 py-1 rounded-full font-label-md text-label-md ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${esc(h.status_kelulusan)}</span>
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="7" class="py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Belum ada riwayat pengerjaan yang sesuai filter</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
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
      <section class="pt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">03 / Notifikasi &amp; CRM</span>
          <h1 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">WhatsApp Gateway, Blast &amp; Kontak Peserta</h1>
        </div>
        <div class="flex flex-wrap gap-2.5">
          <button type="button" onclick="AdminPanel.syncCrm()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">sync</span>
            <span>Sinkron Kontak</span>
          </button>
          <button type="button" onclick="AdminPanel.validateWa()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">verified</span>
            <span>Validasi Nomor WA</span>
          </button>
        </div>
      </section>

      <!-- Saklar Kanal & Blast Form -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-5 flex flex-col gap-4">
          <h3 class="font-title-lg text-title-lg text-on-surface">Saklar Kanal Notifikasi</h3>
          <div class="flex flex-col gap-3">
            <label class="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low cursor-pointer">
              <div>
                <div class="font-title-md text-title-md text-on-surface">Notifikasi WhatsApp (Fonnte)</div>
                <div class="font-label-md text-label-md text-on-surface-variant">Token: ${cfg.fonnteAda ? '<span class="text-secondary font-semibold">Terpasang di Script Properties</span>' : '<span class="text-error">Belum diatur di tab Pengaturan</span>'}</div>
              </div>
              <input type="checkbox" id="cfg-wa" ${cfg.waAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#0e3b2c]" />
            </label>
            <label class="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low cursor-pointer">
              <div>
                <div class="font-title-md text-title-md text-on-surface">Notifikasi Email (MailApp)</div>
                <div class="font-label-md text-label-md text-on-surface-variant">Antrean non-blocking via pemicu berkala</div>
              </div>
              <input type="checkbox" id="cfg-em" ${cfg.emailAktif ? 'checked' : ''} onchange="AdminPanel.saveNotifToggle()" class="w-4 h-4 accent-[#0e3b2c]" />
            </label>
          </div>

          <div class="pt-2">
            <div class="font-label-lg text-label-lg text-on-surface mb-2">Matriks Kejadian Otomatis</div>
            <div class="flex flex-col gap-2">
              ${Object.keys(cfg.matriks || {}).map(function (ev) {
                const m = cfg.matriks[ev];
                return `<div class="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-container-low">
                  <span class="font-body-sm text-body-sm text-on-surface">${esc(m.label || ev)}</span>
                  <span class="flex gap-1.5">
                    <span class="px-2.5 py-0.5 rounded-full font-label-md text-label-md ${m.wa ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}">WA</span>
                    <span class="px-2.5 py-0.5 rounded-full font-label-md text-label-md ${m.email ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}">Email</span>
                  </span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <form onsubmit="AdminPanel.sendBlast(event)" class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-7 flex flex-col gap-4">
          <div>
            <h3 class="font-title-lg text-title-lg text-on-surface">Blast WhatsApp Terjadwal</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Melewati kontak bertanda Opt-Out dan mengirim bertahap dengan jeda acak 3–8 detik</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1">Judul Kampanye</label>
              <input type="text" id="bl-judul" required placeholder="Contoh: Pembukaan Tryout SKD #02" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
            </div>
            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1">Segmen Sasaran</label>
              <select id="bl-sasaran" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
                <option value="SEMUA">Semua Kontak Aktif</option>
                <option value="Latihan">Akun Latihan</option>
                <option value="Pro">Akun Pro</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block font-label-lg text-label-lg text-on-surface mb-1">Isi Pesan (variabel: <code class="font-mono-score">{nama}</code>, <code class="font-mono-score">{institusi}</code>, <code class="font-mono-score">{link}</code>)</label>
            <textarea id="bl-pesan" rows="3" required placeholder="Halo {nama}, paket Tryout SKD terbaru sudah tersedia di {institusi}" class="w-full p-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"></textarea>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-mono-score text-mono-score text-on-surface-variant">Batch 20 pesan • Jeda 3–8 detik</span>
            <button type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">send</span>
              <span>Jadwalkan Blast</span>
            </button>
          </div>
          ${blasts.length ? `<div class="pt-3 flex flex-col gap-2">
            <div class="font-label-lg text-label-lg text-on-surface">Riwayat Blast Terakhir</div>
            ${blasts.slice(0, 3).map(function (b) {
              return `<div class="flex justify-between p-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm"><span><strong class="text-on-surface">${esc(b.Judul)}</strong> (${esc(b.Sasaran)})</span><span class="font-mono-score text-mono-score text-secondary">${b.Terkirim}/${b.Total} • ${esc(b.Status)}</span></div>`;
            }).join('')}
          </div>` : ''}
        </form>
      </section>

      <!-- Tabel CRM Kontak -->
      <section class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-4">
        <h3 class="font-title-lg text-title-lg text-on-surface">Daftar Kontak CRM (${kontak.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                <th class="py-3 px-4 rounded-l-lg">Nama &amp; Email</th>
                <th class="py-3 px-4">Nomor WA</th>
                <th class="py-3 px-4">Segmen</th>
                <th class="py-3 px-4">Status WA</th>
                <th class="py-3 px-4 rounded-r-lg text-right">Status Blast</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm">
              ${kontak.map(function (k) {
                const optOut = String(k.OptOut || '').toUpperCase() === 'YA';
                return `
                  <tr class="hover:bg-surface-container-low/50 transition-colors">
                    <td class="py-3.5 px-4"><div class="font-title-md text-title-md text-on-surface">${esc(k.Nama)}</div><div class="text-on-surface-variant">${esc(k.Email)}</div></td>
                    <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface-variant">${esc(k.NoWA || '-')}</td>
                    <td class="py-3.5 px-4"><span class="px-2.5 py-1 rounded-full font-label-md text-label-md ${k.Segmen === 'Pro' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}">${esc(k.Segmen)}</span></td>
                    <td class="py-3.5 px-4 text-on-surface-variant">${esc(k.StatusWA || 'Belum dicek')}</td>
                    <td class="py-3.5 px-4 text-right">
                      <button type="button" onclick="AdminPanel.toggleOptOut('${esc(k.KontakID)}', ${!optOut})" class="h-8 px-3 rounded-lg font-label-md text-label-md transition-colors cursor-pointer ${optOut ? 'bg-error-container text-on-error-container' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}">
                        ${optOut ? 'Opt-out Aktif' : 'Menerima'}
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // --------------------------------------------------------------------------
  // TAB 4: KELOLA ADMIN & MANAJEMEN USER
  // --------------------------------------------------------------------------
  function renderAdminEmails() {
    const d = state.adminEmailsData;
    if (!d) return `<div class="pt-6 space-y-4"><div class="skeleton h-32"></div><div class="skeleton h-52"></div></div>`;
    const admins = d.admins || [];
    const users = d.users || [];

    return `
      <section class="pt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">04 / Otorisasi &amp; Manajemen User</span>
          <h1 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">Kelola Admin &amp; Akun Peserta Terdaftar</h1>
        </div>
        <button type="button" onclick="AdminPanel.syncAdminEmails()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer self-start sm:self-auto">
          <span class="material-symbols-outlined text-[18px]">sync</span>
          <span>Sinkronkan Email Admin</span>
        </button>
      </section>

      <!-- Info Akun Aktif & Form Tambah Email Admin -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-5 flex flex-col gap-3">
          <div class="font-title-md text-title-md text-on-surface">Status Sesi Saat Ini</div>
          <div class="p-3.5 rounded-xl bg-primary-fixed/50 text-on-primary-fixed space-y-1">
            <div class="font-label-md text-label-md">Email Login Aktif</div>
            <div class="font-mono-score text-mono-score break-all">${esc(d.currentEmail || '-')}</div>
          </div>
          <div class="p-3.5 rounded-xl bg-surface-container-low space-y-1">
            <div class="font-label-md text-label-md text-on-surface-variant">Pemilik Google Apps Script</div>
            <div class="font-mono-score text-mono-score text-on-surface break-all">${esc(d.ownerEmail || 'Terdeteksi otomatis di GAS')}</div>
          </div>
        </div>

        <form onsubmit="AdminPanel.addAdminEmail(event)" class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-7 flex flex-col gap-4">
          <div>
            <h3 class="font-title-lg text-title-lg text-on-surface">Tambah Email Administrator</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Disinkronkan ke Script Properties dan tabel Users secara otomatis</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1">Alamat Email</label>
              <input type="email" id="adm-new-email" required placeholder="admin@instansi.id" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
            </div>
            <div>
              <label class="block font-label-lg text-label-lg text-on-surface mb-1">Nama Tampilan (Opsional)</label>
              <input type="text" id="adm-new-nama" placeholder="Contoh: Pengelola Tryout" class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
            </div>
          </div>
          <div>
            <button type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">person_add</span>
              <span>Tambahkan Admin</span>
            </button>
          </div>
        </form>
      </section>

      <!-- Tabel Daftar Email Admin Tersinkron -->
      <section class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-4">
        <h3 class="font-title-lg text-title-lg text-on-surface">Daftar Email Admin Aktif (${admins.length})</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                <th class="py-3 px-4 rounded-l-lg">Email</th>
                <th class="py-3 px-4">Nama Pengguna</th>
                <th class="py-3 px-4">Status Sinkron</th>
                <th class="py-3 px-4 rounded-r-lg text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm">
              ${admins.length ? admins.map(function (a) {
                return `
                  <tr class="hover:bg-surface-container-low/50 transition-colors">
                    <td class="py-3.5 px-4 font-title-md text-title-md text-on-surface">
                      ${esc(a.email)}
                      ${a.isOwner ? '<span class="ml-2 px-2.5 py-0.5 rounded-full font-label-md text-label-md bg-primary-container text-on-primary">Pemilik</span>' : ''}
                    </td>
                    <td class="py-3.5 px-4 text-on-surface-variant">${esc(a.nama)}</td>
                    <td class="py-3.5 px-4">
                      <span class="px-2.5 py-1 rounded-full font-label-md text-label-md ${a.syncedRole === 'Admin' ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-fixed text-on-tertiary-fixed'}">
                        ${a.syncedRole === 'Admin' ? 'Tersinkron (Admin)' : esc(a.syncedRole)}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 text-right">
                      ${a.email !== d.currentEmail ? `
                        <button type="button" onclick="AdminPanel.removeAdminEmail('${esc(a.email)}')" class="h-8 px-3 rounded-lg bg-error-container text-on-error-container font-label-md text-label-md hover:opacity-90 transition-opacity cursor-pointer">Cabut Akses</button>
                      ` : '<span class="font-label-md text-label-md text-on-surface-variant">Sesi Aktif</span>'}
                    </td>
                  </tr>`;
              }).join('') : `<tr><td colspan="4" class="py-8 text-center text-on-surface-variant">Belum ada email admin tersimpan</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Tabel Semua Pengguna -->
      <section class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 class="font-title-lg text-title-lg text-on-surface">Manajemen Akun Terdaftar (${users.length})</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Tambah pengguna baru, ubah tier akses, atau hapus akun peserta</p>
          </div>
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
              <input id="adm-user-search" type="text" value="${esc(state.userSearch)}" oninput="AdminPanel.setUserSearch(this.value, this.selectionStart)" placeholder="Cari nama atau email..."
                class="pl-9 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none w-52" />
            </div>
            <select onchange="AdminPanel.setUserRoleFilter(this.value)" class="px-3.5 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
              ${['Semua', 'Latihan', 'Pro', 'Admin'].map(function (r) {
                return `<option value="${r}" ${state.userRoleFilter === r ? 'selected' : ''}>${r === 'Semua' ? 'Semua Peran' : r}</option>`;
              }).join('')}
            </select>
            <button type="button" onclick="AdminPanel.openCreateUserModal()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">person_add</span>
              <span>Tambah Pengguna</span>
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                <th class="py-3 px-4 rounded-l-lg">Nama &amp; Email</th>
                <th class="py-3 px-4 hidden sm:table-cell">Nomor WA</th>
                <th class="py-3 px-4">Peran</th>
                <th class="py-3 px-4 rounded-r-lg text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm">
              ${(function () {
                const q = state.userSearch.toLowerCase();
                const filtered = users.filter(function (u) {
                  const mr = state.userRoleFilter === 'Semua' || u.role === state.userRoleFilter;
                  const mq = !q || String(u.nama_lengkap).toLowerCase().includes(q) || String(u.email).toLowerCase().includes(q);
                  return mr && mq;
                });
                if (!filtered.length) return `<tr><td colspan="4" class="py-8 text-center text-on-surface-variant">Tidak ada pengguna yang sesuai filter</td></tr>`;
                return filtered.map(function (u) {
                  const badge = u.role === 'Admin'
                    ? 'bg-primary-container text-on-primary'
                    : u.role === 'Pro'
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container text-on-surface-variant';
                  const isSelf = String(u.email || '').toLowerCase() === String(d.currentEmail || '').toLowerCase();
                  return `
                    <tr class="hover:bg-surface-container-low/50 transition-colors">
                      <td class="py-3.5 px-4">
                        <div class="font-title-md text-title-md text-on-surface">${esc(u.nama_lengkap)} ${isSelf ? '<span class="ml-1 font-label-md text-label-md text-secondary">(Anda)</span>' : ''}</div>
                        <div class="text-on-surface-variant">${esc(u.email)}</div>
                      </td>
                      <td class="py-3.5 px-4 font-mono-score text-mono-score text-on-surface-variant hidden sm:table-cell">${esc(u.no_wa || '-')}</td>
                      <td class="py-3.5 px-4"><span class="px-2.5 py-1 rounded-full font-label-md text-label-md ${badge}">${esc(u.role)}</span></td>
                      <td class="py-3.5 px-4 text-right">
                        <div class="inline-flex flex-wrap justify-end gap-1.5">
                          ${u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.quickPromoteAdmin('${esc(u.email)}','${esc(u.nama_lengkap)}')" class="h-8 px-2.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md hover:bg-secondary transition-colors cursor-pointer">Jadikan Admin</button>` : ''}
                          ${u.role !== 'Pro' && u.role !== 'Admin' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Pro')" class="h-8 px-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-label-md text-label-md cursor-pointer">Set Pro</button>` : ''}
                          ${u.role === 'Pro' ? `<button type="button" onclick="AdminPanel.setUserTier('${esc(u.user_id)}','Latihan')" class="h-8 px-2.5 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md cursor-pointer">Set Latihan</button>` : ''}
                          ${!isSelf ? `<button type="button" onclick="AdminPanel.deleteUser('${esc(u.user_id)}','${esc(u.email)}')" class="h-8 px-2.5 rounded-lg bg-error-container text-on-error-container font-label-md text-label-md inline-flex items-center gap-1 hover:opacity-90 cursor-pointer"><span class="material-symbols-outlined text-[15px]">delete</span> Hapus</button>` : ''}
                        </div>
                      </td>
                    </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </section>
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
      <section class="pt-6">
        <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">05 / Pengaturan Sistem &amp; Keamanan</span>
        <h1 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">Google OAuth 2.0, Script Properties &amp; Migrasi Database</h1>
      </section>

      <!-- Pengaturan Google OAuth 2.0 -->
      <form onsubmit="AdminPanel.saveOAuthSettings(event)" class="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-4">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-title-lg text-title-lg text-on-surface">Login Google OAuth 2.0</h3>
                <span class="px-2.5 py-0.5 rounded-full font-label-md text-label-md ${gClient.ada && oauthAktif ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-fixed text-on-tertiary-fixed'}">
                  ${gClient.ada && oauthAktif ? 'Aktif' : 'Perlu Client ID'}
                </span>
              </div>
              <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Peserta masuk satu klik memakai akun Google dengan verifikasi token di server GAS</p>
            </div>
          </div>
          <button type="button" onclick="AdminPanel.openOAuthGuideModal()" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors shrink-0 cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">menu_book</span>
            <span>Panduan Google Cloud</span>
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div class="lg:col-span-5">
            <div class="flex items-center justify-between font-label-md text-label-md mb-1">
              <label class="text-on-surface">Google OAuth 2.0 Client ID</label>
              <span class="font-mono-score ${gClient.ada ? 'text-secondary' : 'text-on-surface-variant'}">${gClient.ada ? 'Tersimpan: ' + esc(gClient.masked) : 'Belum diisi'}</span>
            </div>
            <input type="text" id="oauth-client-id" placeholder="xxxx.apps.googleusercontent.com"
              class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>

          <div class="lg:col-span-4">
            <label class="font-label-md text-label-md text-on-surface block mb-1">Authorized JavaScript Origin</label>
            <div class="flex items-center gap-2">
              <input type="text" readonly id="oauth-origin-url" value="${esc(curOrigin)}" class="flex-1 px-3.5 py-2.5 rounded-lg bg-surface-container-low font-mono-score text-mono-score text-on-surface-variant focus:outline-none" />
              <button type="button" onclick="AdminPanel.copyOrigin()" class="px-3.5 py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container font-label-md text-label-md text-on-surface shrink-0 cursor-pointer">Salin</button>
            </div>
          </div>

          <div class="lg:col-span-3 flex items-center justify-between gap-3 h-[42px] px-3.5 rounded-lg bg-surface-container-low">
            <label for="oauth-aktif" class="font-label-md text-label-md text-on-surface cursor-pointer">Aktifkan Tombol Google</label>
            <input type="checkbox" id="oauth-aktif" ${oauthAktif ? 'checked' : ''} class="w-4 h-4 accent-[#0e3b2c]" />
          </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span class="font-label-md text-label-md text-on-surface-variant">Ketik <code class="font-mono-score">__HAPUS__</code> pada kolom Client ID untuk menghapus nilai tersimpan</span>
          <button type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">save</span>
            <span>Simpan Pengaturan OAuth</span>
          </button>
        </div>
      </form>

      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Rahasia Script Properties -->
        <form onsubmit="AdminPanel.saveSecrets(event)" class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-6 flex flex-col gap-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-title-lg text-title-lg text-on-surface">Kredensial Script Properties</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant">Token disimpan di Script Properties server, kosongkan kolom bila tidak diubah</p>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">lock</span>
          </div>

          <div class="flex flex-col gap-3">
            ${sec.filter(function (item) { return item.key !== 'GOOGLE_CLIENT_ID'; }).map(function (item) {
              return `
                <div>
                  <div class="flex items-center justify-between font-label-md text-label-md mb-1">
                    <label class="font-mono-score text-on-surface">${esc(item.key)}</label>
                    <span class="font-mono-score ${item.ada ? 'text-secondary' : 'text-on-surface-variant'}">${item.ada ? 'Terpasang: ' + esc(item.masked) : 'Belum diisi'}</span>
                  </div>
                  <input type="password" id="sec-${esc(item.key)}" placeholder="Nilai baru atau __HAPUS__"
                    class="w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
                </div>`;
            }).join('')}
          </div>

          <div class="pt-3 flex flex-col gap-3">
            <div class="font-title-md text-title-md text-on-surface">Pengaturan Pembayaran &amp; Kontak Admin</div>
            <div>
              <label class="font-label-md text-label-md text-on-surface-variant">Rekening / QRIS Aktivasi Pro</label>
              <input type="text" id="set-rekening" value="${esc(set.INFO_REKENING_PRO || '')}" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-label-md text-label-md text-on-surface-variant">Harga Paket Pro</label>
                <input type="text" id="set-harga" value="${esc(set.HARGA_PRO || '')}" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
              </div>
              <div>
                <label class="font-label-md text-label-md text-on-surface-variant">WhatsApp Admin</label>
                <input type="text" id="set-wa" value="${esc(set.WA_ADMIN || '')}" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
              </div>
            </div>
          </div>

          <div>
            <button type="submit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">verified_user</span>
              <span>Simpan Kredensial</span>
            </button>
          </div>
        </form>

        <!-- Migrasi Database Antar-Spreadsheet -->
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-6 lg:col-span-6 flex flex-col gap-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="font-title-lg text-title-lg text-on-surface">Migrasi &amp; Sinkronisasi Spreadsheet</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant">Salin data dari spreadsheet versi lama secara idempoten berbasis nama kolom</p>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">database</span>
          </div>

          <div>
            <label class="font-label-md text-label-md text-on-surface-variant">ID atau URL Spreadsheet Sumber</label>
            <input type="text" id="mig-source" placeholder="https://docs.google.com/spreadsheets/d/..." class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>

          <div class="flex flex-wrap gap-2.5">
            <button type="button" onclick="AdminPanel.runMigration(true)" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">Find_in_page</span>
              <span>Pindai (Dry-Run)</span>
            </button>
            <button type="button" onclick="AdminPanel.runMigration(false)" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-container hover:bg-secondary text-on-primary font-label-lg text-label-lg transition-colors shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">play_arrow</span>
              <span>Jalankan Sinkronisasi</span>
            </button>
          </div>

          ${mig ? `
            <div class="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
              <div class="flex items-center justify-between font-label-lg text-label-lg">
                <span class="text-on-surface">${mig.dryRun ? 'Hasil Pindai (Dry-Run)' : 'Hasil Sinkronisasi'}</span>
                <span class="text-secondary">${esc(mig.sourceName)}</span>
              </div>
              <table class="w-full font-body-sm text-body-sm">
                <thead><tr class="text-on-surface-variant font-label-md text-label-md"><th class="py-1.5 text-left">Sheet</th><th class="text-right">Tambah</th><th class="text-right">Perbarui</th><th class="text-right">Lewati</th></tr></thead>
                <tbody>
                  ${mig.report.map(function (r) {
                    return `<tr><td class="py-1.5 font-medium text-on-surface">${esc(r.sheet)}</td><td class="text-right font-mono-score text-secondary">+${r.inserted}</td><td class="text-right font-mono-score text-on-surface">${r.updated}</td><td class="text-right font-mono-score text-on-surface-variant">${r.skipped}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </section>
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
        <div class="flex flex-col gap-4">
          <div class="p-3.5 rounded-xl bg-surface-container-low font-body-sm text-body-sm space-y-1">
            <div><span class="text-on-surface-variant">Email:</span> <strong class="text-on-surface">${esc(r.email_user)}</strong></div>
            <div><span class="text-on-surface-variant">Catatan:</span> <strong class="text-on-surface">${esc(r.catatan_user || '-')}</strong></div>
          </div>
          ${r.url_bukti_drive ? `<img src="${esc(r.url_bukti_drive)}" alt="Bukti transfer ${esc(r.nama_user)}" class="w-full max-h-80 object-contain rounded-xl bg-surface-container-low" />`
            : `<div class="p-8 text-center rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">Tidak ada lampiran gambar bukti transfer</div>`}
          <div class="flex justify-end">
            <button type="button" onclick="App.closeModal()" class="px-4 py-2 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg cursor-pointer">Tutup Pratinjau</button>
          </div>
        </div>
      `);
    },
    processUpgrade: async function (reqId, decision) {
      const catatan = decision === 'Rejected' ? (prompt('Alasan penolakan untuk peserta:', 'Bukti transfer kurang terbaca') || '') : 'Terverifikasi admin';
      try {
        await ApiClient.call('admin.processUpgrade', { req_id: reqId, decision: decision, catatan_admin: catatan });
        App.toast(decision === 'Approved' ? 'Akun Pro peserta berhasil diaktifkan!' : 'Pengajuan upgrade ditolak', 'success');
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
        App.toast('Butir soal berhasil disimpan ke Bank Soal!', 'success');
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
      App.openModal('Impor Massal Bank Soal (CSV)', `
        <div class="flex flex-col gap-4">
          <div class="p-4 rounded-xl bg-primary-fixed/40 text-on-primary-fixed space-y-2">
            <div class="font-title-md text-title-md">Paket Tujuan: ${esc(curPkg ? curPkg.nama_paket : state.selectedPaketId)}</div>
            <div class="font-body-sm text-body-sm text-on-primary-fixed-variant">Unggah berkas .csv untuk menambahkan banyak butir soal sekaligus ke paket aktif</div>
            <button type="button" onclick="AdminPanel.downloadCsvTemplate()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">download</span>
              <span>Unduh Template CSV</span>
            </button>
          </div>

          <div>
            <label class="font-label-md text-label-md text-on-surface-variant">Berkas CSV Soal</label>
            <input type="file" id="csv-soal-file" accept=".csv,text/csv" onchange="AdminPanel.handleCsvFile(this)"
              class="mt-1 w-full font-body-sm text-body-sm p-3 rounded-xl bg-surface-container-low" />
          </div>

          <div id="csv-preview-box" class="hidden p-4 rounded-xl bg-surface-container-low space-y-2">
            <div id="csv-preview-summary" class="font-label-lg text-label-lg text-secondary"></div>
            <div id="csv-preview-list" class="max-h-40 overflow-y-auto space-y-1 font-body-sm text-body-sm text-on-surface-variant"></div>
          </div>

          <button type="button" id="btn-submit-csv" disabled onclick="AdminPanel.submitBulkImport()"
            class="w-full py-3 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            Simpan Soal ke Database
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
        sum.textContent = 'Siap diimpor: ' + items.length + ' soal (TWK ' + cTwk + ' • TIU ' + cTiu + ' • TKP ' + cTkp + ')';
        list.innerHTML = items.slice(0, 6).map(function (x, i) {
          return '<div class="truncate"><strong class="font-mono-score">' + (i + 1) + '. [' + esc(x.subtes) + ']</strong> ' + esc(x.pertanyaan) + '</div>';
        }).join('') + (items.length > 6 ? '<div class="text-secondary font-medium">dan ' + (items.length - 6) + ' soal lainnya</div>' : '');
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
        if (btn) { btn.disabled = false; btn.textContent = 'Simpan Soal ke Database'; }
      }
    },
    openPackageModal: function () {
      App.openModal('Tambah Paket Simulasi', `
        <form onsubmit="AdminPanel.savePackage(event)" class="flex flex-col gap-3.5">
          <div><label class="font-label-md text-label-md text-on-surface-variant">Nama Paket</label><input id="pkg-nama" required class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" placeholder="Contoh: Tryout Nasional SKD #02" /></div>
          <div><label class="font-label-md text-label-md text-on-surface-variant">Deskripsi</label><textarea id="pkg-desk" rows="2" class="mt-1 w-full p-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="font-label-md text-label-md text-on-surface-variant">Tier Akses</label><select id="pkg-tier" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none"><option value="Latihan">Latihan (Gratis)</option><option value="Pro">Pro</option></select></div>
            <div><label class="font-label-md text-label-md text-on-surface-variant">Kategori</label><input id="pkg-kat" value="CPNS SKD" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" /></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="font-label-md text-label-md text-on-surface-variant">Durasi (Menit)</label><input id="pkg-dur" type="number" value="100" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" /></div>
            <div><label class="font-label-md text-label-md text-on-surface-variant">Target Soal</label><input id="pkg-jml" type="number" value="110" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" /></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="font-label-md text-label-md text-on-surface-variant">PG TWK</label><input id="pkg-twk" type="number" value="65" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" /></div>
            <div><label class="font-label-md text-label-md text-on-surface-variant">PG TIU</label><input id="pkg-tiu" type="number" value="80" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" /></div>
            <div><label class="font-label-md text-label-md text-on-surface-variant">PG TKP</label><input id="pkg-tkp" type="number" value="166" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-mono-score text-mono-score focus:outline-none" /></div>
          </div>
          <button type="submit" class="w-full py-3 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg transition-colors cursor-pointer">Simpan Paket</button>
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
      App.toast('Mengunduh rekap skor dalam format CSV / Excel...', 'success');
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
    setUserSearch: function (q, pos) { state.userSearch = q; paintShell(document.getElementById('app')); refocusInput('adm-user-search', pos); },
    setUserRoleFilter: function (r) { state.userRoleFilter = r; paintShell(document.getElementById('app')); },
    openCreateUserModal: function () {
      App.openModal('Tambah Pengguna Baru', `
        <form onsubmit="AdminPanel.createUser(event)" class="flex flex-col gap-3.5">
          <div>
            <label class="font-label-md text-label-md text-on-surface-variant">Nama Lengkap</label>
            <input type="text" id="cu-nama" required minlength="3" placeholder="Nama lengkap" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>
          <div>
            <label class="font-label-md text-label-md text-on-surface-variant">Email</label>
            <input type="email" id="cu-email" required placeholder="nama@email.com" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="font-label-md text-label-md text-on-surface-variant">Nomor WhatsApp (Opsional)</label>
              <input type="tel" id="cu-wa" placeholder="0812xxxxxxxx" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
            </div>
            <div>
              <label class="font-label-md text-label-md text-on-surface-variant">Peran Akun</label>
              <select id="cu-role" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none">
                <option value="Latihan">Latihan</option>
                <option value="Pro">Pro</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label class="font-label-md text-label-md text-on-surface-variant">Kata Sandi (Minimal 6 Karakter)</label>
            <input type="password" id="cu-pass" required minlength="6" placeholder="Kata sandi awal" class="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none" />
          </div>
          <button type="submit" class="w-full py-3 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg transition-colors cursor-pointer">Simpan Pengguna</button>
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
        <ol class="space-y-3 font-body-sm text-body-sm text-on-surface-variant list-decimal pl-4">
          <li>Buka <strong class="text-on-surface">Google Cloud Console</strong> (<code class="font-mono-score">console.cloud.google.com</code>) dan pilih proyek Anda.</li>
          <li>Buka <strong class="text-on-surface">APIs &amp; Services → OAuth consent screen</strong>, pilih <strong class="text-on-surface">External</strong>, isi nama aplikasi SimulasiTKD Pro dan email kontak.</li>
          <li>Buka <strong class="text-on-surface">Credentials → Create Credentials → OAuth client ID</strong> dengan tipe <strong class="text-on-surface">Web application</strong>.</li>
          <li>Tambahkan domain berikut pada <strong class="text-on-surface">Authorized JavaScript origins</strong>:<br/>
            <code class="inline-block mt-1 px-2.5 py-1 rounded-lg bg-primary-fixed text-on-primary-fixed font-mono-score">${esc(origin)}</code>
          </li>
          <li>Salin nilai <strong class="text-on-surface">Client ID</strong> ke kolom Google OAuth 2.0 Client ID pada halaman ini lalu simpan.</li>
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
