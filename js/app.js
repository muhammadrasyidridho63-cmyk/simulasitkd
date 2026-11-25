/**
 * ============================================================================
 * SimulasiTKD Pro — js/app.js
 * Core SPA Controller (0ms Instant Routing, Stitch CAT Platform Design)
 * Screens: Landing & Auth | Dashboard Peserta | Ruang Ujian CAT | Evaluasi & Peringkat | Admin
 * ============================================================================
 */

const App = (function () {
  const EXAM_STORAGE_KEY = 'simtkd_active_exam_v1';
  const STITCH_LOGO_URL = 'https://lh3.googleusercontent.com/aida/ALJJyrCgxoYmh_SaCEQ6oaX69rhrfi6NdUX3exxvaE7Q01NE8iAhadoxRdehu5cipWq8mbe0oBl1EIswChPRMDGzWBIdpxe2V3RtFkbts_cTywm2V9Z_YqHbLgb4yjLfvBmBaFX5fn5-LXfge_YQ9-motV6tIlAnsh4XtoJ452d4q8bPB_AjagRtW5HNYso5FG9mxcnRpj-6J-wEo8NSkoI4lQZR18NMhzRuzGNj5hzqk20';

  let state = {
    view: 'landing', // landing | dashboard | exam | result | admin
    user: ApiClient.getSavedUser(),
    authTab: 'login', // login | register | emergency
    authConfig: null, // { googleOAuthEnabled, googleClientId, demoOAuth }
    dashData: null,
    paketFilter: 'Semua', // Semua | Latihan | Pro
    exam: null, // { paket, soal, answers, doubtful, idx, startedAt, endAt }
    examTimerId: null,
    mobileNavSheetOpen: false,
    resultData: null,
    leaderboard: [],
    resultTab: 'pembahasan', // pembahasan | peringkat
    openAccordion: {}
  };

  let resultCharts = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function refreshIcons() {
    if (window.lucide) {
      lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    }
  }

  function toast(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'bg-primary-container text-on-primary shadow-lg',
      error: 'bg-error text-on-error shadow-lg',
      warning: 'bg-tertiary-fixed text-on-tertiary-fixed shadow-lg',
      info: 'bg-surface-container-lowest text-on-surface border border-outline-variant/40 shadow-lg'
    };
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast-item px-4 py-3 rounded-xl font-label-lg text-label-lg flex items-center gap-2.5 ' + (colors[type] || colors.info);
    el.innerHTML = `<span class="material-symbols-outlined text-[18px] ${type === 'success' ? 'text-secondary-fixed' : ''}">${icons[type] || 'info'}</span><span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function openModal(title, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bottom-sheet-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="bg-surface-container-lowest rounded-xl shadow-xl max-w-[480px] w-full p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
          <div class="flex items-start justify-between gap-4">
            <h3 class="font-headline-sm text-headline-sm text-on-surface">${esc(title)}</h3>
            <button type="button" onclick="App.closeModal()" class="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant transition-colors cursor-pointer">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div>${bodyHtml}</div>
        </div>
      </div>`;
    refreshIcons();
  }

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function stopExamTimer() {
    if (state.examTimerId) {
      clearInterval(state.examTimerId);
      state.examTimerId = null;
    }
  }

  function destroyResultCharts() {
    resultCharts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    resultCharts = [];
  }

  function fmtTimer(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function fmtDurasi(sec) {
    sec = Number(sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ' menit ' + s + ' detik';
  }

  // ==========================================================================
  // ROUTER INSTAN (0ms Antar Menu)
  // ==========================================================================
  async function go(view, params) {
    stopExamTimer();
    destroyResultCharts();
    state.view = view;
    const root = document.getElementById('app');

    if (view === 'landing') {
      renderLanding(root);
      loadAuthConfigAndMountGoogle();
      return;
    }

    if (!state.user && !ApiClient.getToken()) {
      state.view = 'landing';
      renderLanding(root);
      loadAuthConfigAndMountGoogle();
      return;
    }

    if (view === 'admin') {
      if (state.user && state.user.role !== 'Admin') {
        toast('Halaman khusus administrator', 'error');
        return go('dashboard');
      }
      AdminPanel.render(root, (params && params.tab) || 'overview');
      return;
    }

    if (view === 'dashboard') {
      renderDashboard(root);
      try {
        state.dashData = await ApiClient.call('peserta.dashboard');
        state.user = state.dashData.user;
        ApiClient.setSession(null, state.user);
        if (state.view === 'dashboard') renderDashboard(root);
      } catch (e) {
        toast(e.message, 'error');
        if (/sesi/i.test(e.message)) logout();
      }
      return;
    }

    if (view === 'exam') {
      renderExamRoom(root);
      startExamCountdown();
      return;
    }

    if (view === 'result') {
      const hasilId = (params && params.hasil_id) || (state.dashData && state.dashData.riwayat && state.dashData.riwayat[0] && state.dashData.riwayat[0].hasil_id);
      if (!hasilId) {
        toast('Belum ada riwayat simulasi, kerjakan satu paket terlebih dahulu', 'info');
        return go('dashboard');
      }
      renderResultSkeleton(root);
      try {
        const [detail, lb] = await Promise.all([
          ApiClient.call('peserta.resultDetail', { hasil_id: hasilId }),
          ApiClient.call('peserta.leaderboard', { paket_id: '' })
        ]);
        state.resultData = detail;
        state.leaderboard = lb;
        state.openAccordion = { 0: true };
        renderResult(root);
        mountResultCharts();
      } catch (e) {
        toast(e.message, 'error');
        go('dashboard');
      }
    }
  }

  // ==========================================================================
  // SHARED PARTICIPANT NAVBAR & FOOTER (Stitch Glass Header)
  // ==========================================================================
  function renderNavbar(active) {
    const u = state.user;
    const activeCls = 'transition-colors bg-primary-container text-on-primary-container font-bold rounded-lg px-3 py-1.5 font-label-lg text-label-lg';
    const idleCls = 'font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors px-3 py-1.5';

    return `
      <header class="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] no-print">
        <div class="h-16 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between gap-4">
          <button type="button" onclick="App.go('${u ? 'dashboard' : 'landing'}')" class="flex items-center gap-3 cursor-pointer">
            <img alt="SimulasiTKD Pro Logo" class="h-8 w-auto object-contain" src="${STITCH_LOGO_URL}" onerror="this.style.display='none'" />
            <span class="font-title-lg text-title-lg text-primary">SimulasiTKD Pro</span>
          </button>

          <nav class="hidden md:flex items-center gap-4">
            ${u ? `
              <button type="button" onclick="App.go('dashboard')" class="cursor-pointer ${active === 'dashboard' ? activeCls : idleCls}">Ringkasan Latihan</button>
              <button type="button" onclick="App.go('result')" class="cursor-pointer ${active === 'result' ? activeCls : idleCls}">Evaluasi &amp; Rapor</button>
              ${u.role === 'Admin' ? `<button type="button" onclick="App.go('admin')" class="cursor-pointer font-label-lg text-label-lg text-secondary font-semibold hover:underline px-3 py-1.5">Panel Admin</button>` : ''}
            ` : `
              <a href="#pilar" class="${active === 'landing' ? activeCls : idleCls}">Materi SKD</a>
              <a href="#paket-pro" class="${idleCls}">Paket Pro</a>
              <a href="#auth-section" class="${idleCls}">Portal Peserta</a>
            `}
          </nav>

          <div class="flex items-center gap-3">
            ${u ? `
              <button type="button" onclick="App.openProfileMenu()" class="inline-flex items-center gap-2.5 px-2.5 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer">
                <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span class="material-symbols-outlined text-on-primary text-[18px]">person</span>
                </div>
                <span class="hidden sm:inline font-label-lg text-label-lg text-on-surface max-w-[130px] truncate pr-1">${esc(u.nama_lengkap)}</span>
              </button>
            ` : `
              <a href="#auth-section" onclick="App.setAuthTab('login')" class="hidden sm:inline-flex items-center px-3 py-1.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors">Masuk</a>
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-full px-5 py-2 font-label-md text-label-md shadow-sm">Daftar Gratis</a>
              <a href="#auth-section" class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span class="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </a>
            `}
          </div>
        </div>
      </header>
    `;
  }

  function renderFooter() {
    return `
      <footer class="w-full bg-surface-container-low py-12 mt-12 no-print">
        <div class="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-on-surface-variant font-body-sm text-body-sm">
          <span>© 2026 SimulasiTKD Pro. Platform Persiapan CAT CPNS, BUMN &amp; Sekolah Kedinasan.</span>
          <div class="flex items-center gap-6">
            <a class="hover:text-on-surface transition-colors" href="#pilar">Kurikulum SKD</a>
            <a class="hover:text-on-surface transition-colors" href="#auth-section">Portal Peserta</a>
          </div>
        </div>
      </footer>
    `;
  }

  // ==========================================================================
  // SCREEN 1: LANDING PAGE & AUTH PORTAL (Exact Stitch Layout)
  // ==========================================================================
  function renderLanding(root) {
    root.innerHTML = `
      ${renderNavbar('landing')}
      <main class="w-full pt-16 bg-surface flex-1">
        <div class="max-w-7xl mx-auto px-6 lg:px-12">
          <div class="flex flex-col w-full">

            <!-- 1. Hero Section (12-col asymmetric split) -->
            <section class="py-12 lg:py-20">
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                <!-- Left 6 cols -->
                <div class="lg:col-span-6 flex flex-col items-start">
                  <div class="bg-primary-fixed text-on-primary-fixed rounded-full px-4 py-1.5 inline-flex items-center gap-2 font-label-md text-label-md">
                    <span class="material-symbols-outlined material-fill text-[16px]">verified</span>
                    <span>Standar Resmi CAT BKN • TWK, TIU, TKP${ApiClient.isDemoMode() ? ' • Mode Pratinjau' : ''}</span>
                  </div>
                  <h1 class="font-headline-lg text-headline-lg text-on-surface mt-6">
                    Simulasi CAT TKD untuk <span class="text-secondary">Masa Depan Lebih Pasti</span>
                  </h1>
                  <p class="font-body-lg text-body-lg text-on-surface-variant mt-5">
                    Platform latihan terstruktur untuk menghadapi seleksi CPNS, BUMN, dan Sekolah Kedinasan dengan sistem penilaian ambang batas resmi serta analisis performa real-time.
                  </p>
                  <div class="flex flex-wrap items-center gap-4 mt-8">
                    <a href="#auth-section" onclick="App.setAuthTab('register')" class="bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-full px-7 py-3.5 font-label-lg text-label-lg inline-flex items-center gap-2 shadow-md">
                      <span>Mulai Latihan Gratis</span>
                      <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </a>
                    <a href="#paket-pro" class="bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors rounded-full px-7 py-3.5 font-label-lg text-label-lg shadow-sm">
                      Lihat Fitur Pro
                    </a>
                  </div>
                  <div class="grid grid-cols-3 gap-6 mt-10 w-full">
                    <div class="flex flex-col">
                      <span class="font-mono-timer text-mono-timer text-primary tabular-nums">110</span>
                      <span class="font-body-sm text-body-sm text-on-surface-variant mt-1">Butir Standar SKD</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="font-mono-timer text-mono-timer text-primary tabular-nums">100</span>
                      <span class="font-body-sm text-body-sm text-on-surface-variant mt-1">Menit Timer Real-Time</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="font-mono-timer text-mono-timer text-primary tabular-nums">3</span>
                      <span class="font-body-sm text-body-sm text-on-surface-variant mt-1">Ambang Passing Grade</span>
                    </div>
                  </div>
                </div>

                <!-- Right 6 cols: Floating CAT Exam Window Mockup -->
                <div class="lg:col-span-6 relative">
                  <div class="bg-surface-container-lowest rounded-xl shadow-xl p-6 lg:p-7 flex flex-col">
                    <!-- Mockup Header -->
                    <div class="flex flex-wrap items-center justify-between gap-3 pb-4 bg-surface-container-low/50 rounded-lg px-4 py-3">
                      <div class="flex items-center gap-2.5">
                        <span class="bg-primary text-on-primary rounded-full px-3 py-1 font-label-md text-label-md">TIU</span>
                        <span class="font-title-md text-title-md text-on-surface">Soal 14 / 110</span>
                      </div>
                      <div class="bg-primary-fixed text-on-primary-fixed rounded-full px-3.5 py-1 font-mono-timer text-mono-timer tabular-nums inline-flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px]">timer</span>
                        <span>01:12:45</span>
                      </div>
                    </div>
                    <!-- Question Stem -->
                    <p class="font-body-md text-body-md text-on-surface mt-5">
                      Semua peserta seleksi CPNS wajib mengikuti ujian CAT. Sebagian peserta yang mengikuti ujian CAT berasal dari jalur cumlaude. Simpulan yang paling tepat adalah...
                    </p>
                    <!-- 3 Answer Options -->
                    <div class="flex flex-col gap-3 mt-5">
                      <div class="bg-surface-container-low rounded-lg p-3.5 flex items-center gap-3">
                        <span class="w-7 h-7 rounded-lg bg-surface-container-lowest text-on-surface font-mono-score text-mono-score flex items-center justify-center shrink-0">A</span>
                        <span class="font-body-sm text-body-sm text-on-surface">Semua peserta jalur cumlaude tidak mengikuti ujian CAT.</span>
                      </div>
                      <div class="bg-primary-fixed text-on-primary-fixed rounded-lg p-3.5 flex items-center justify-between gap-3 shadow-sm">
                        <div class="flex items-center gap-3">
                          <span class="w-7 h-7 rounded-lg bg-secondary text-on-secondary font-mono-score text-mono-score flex items-center justify-center shrink-0">B</span>
                          <span class="font-body-sm text-body-sm font-medium">Sebagian peserta jalur cumlaude wajib mengikuti ujian CAT.</span>
                        </div>
                        <span class="material-symbols-outlined material-fill text-secondary text-[20px] shrink-0">check_circle</span>
                      </div>
                      <div class="bg-surface-container-low rounded-lg p-3.5 flex items-center gap-3">
                        <span class="w-7 h-7 rounded-lg bg-surface-container-lowest text-on-surface font-mono-score text-mono-score flex items-center justify-center shrink-0">C</span>
                        <span class="font-body-sm text-body-sm text-on-surface">Tidak ada peserta seleksi CPNS yang berasal dari jalur cumlaude.</span>
                      </div>
                    </div>
                    <!-- Mini 3-Color Question Navigator Strip -->
                    <div class="mt-6 bg-surface-container-low rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
                      <span class="font-label-md text-label-md text-on-surface-variant">Navigasi Cepat</span>
                      <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-lg bg-secondary text-on-secondary font-mono-score text-mono-score flex items-center justify-center">11</span>
                        <span class="w-8 h-8 rounded-lg bg-secondary text-on-secondary font-mono-score text-mono-score flex items-center justify-center">12</span>
                        <span class="w-8 h-8 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-mono-score text-mono-score flex items-center justify-center">13</span>
                        <span class="w-8 h-8 rounded-lg bg-primary text-on-primary font-mono-score text-mono-score flex items-center justify-center">14</span>
                        <span class="w-8 h-8 rounded-lg bg-surface-container-high text-on-surface-variant font-mono-score text-mono-score flex items-center justify-center">15</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. 4-Card Feature & Subtest Grid -->
            <section id="pilar" class="bg-surface-container-low rounded-xl py-16 px-6 lg:px-10 mt-8">
              <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">Modul &amp; Subtes SKD</span>
                  <h2 class="font-headline-md text-headline-md text-on-surface mt-2">Kurikulum Lengkap Sesuai Kisi-Kisi Terbaru</h2>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                  Setiap subtes dilengkapi ambang batas kelulusan (Passing Grade) resmi untuk mengukur kesiapan Anda secara objektif.
                </p>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
                ${[
                  { code: 'TWK • PG 65', icon: 'account_balance', title: 'Tes Wawasan Kebangsaan', desc: 'Pilar negara, UUD 1945, nasionalisme, integritas, dan bela negara berbasis studi kasus.' },
                  { code: 'TIU • PG 80', icon: 'psychology', title: 'Tes Intelegensia Umum', desc: 'Kemampuan verbal, numerik berhitung cepat, deret angka, serta penalaran logis & analitis.' },
                  { code: 'TKP • PG 166', icon: 'diversity_3', title: 'Tes Karakteristik Pribadi', desc: 'Pelayanan publik, jejaring kerja, sosial budaya, TIK, profesionalisme, dan anti-radikalisme.' },
                  { code: 'Rapor • PDF', icon: 'analytics', title: 'Evaluasi & Rapor Skor', desc: 'Pemetaan akurasi per sub-topik, manajemen waktu pengerjaan, dan unduh rapor evaluasi PDF.' }
                ].map(function (c) {
                  return `
                    <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                      <div>
                        <div class="flex items-center justify-between gap-2">
                          <div class="w-11 h-11 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
                            <span class="material-symbols-outlined text-[22px]">${c.icon}</span>
                          </div>
                          <span class="bg-surface-container-low text-on-surface font-mono-score text-mono-score rounded-full px-3 py-1">${c.code}</span>
                        </div>
                        <h3 class="font-title-lg text-title-lg text-on-surface mt-5">${c.title}</h3>
                        <p class="font-body-sm text-body-sm text-on-surface-variant mt-2 line-clamp-2">${c.desc}</p>
                      </div>
                      <a href="#auth-section" class="font-label-lg text-label-lg text-secondary inline-flex items-center gap-1.5 mt-6 hover:gap-2.5 transition-all">
                        <span>Coba Sekarang</span>
                        <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </a>
                    </div>`;
                }).join('')}
              </div>
            </section>

            <!-- 3. 3-Step Workflow Strip + Deep Forest Emerald Conversion Banner -->
            <section id="paket-pro" class="mt-16">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col">
                  <span class="font-mono-score text-mono-score text-secondary">01. LANGKAH PERTAMA</span>
                  <h3 class="font-title-lg text-title-lg text-on-surface mt-2">Daftar Akun Latihan</h3>
                  <p class="font-body-sm text-body-sm text-on-surface-variant mt-2">
                    Buat akun gratis dalam 30 detik dan akses paket tryout dasar untuk mengukur kemampuan awal Anda.
                  </p>
                </div>
                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col">
                  <span class="font-mono-score text-mono-score text-secondary">02. LANGKAH KEDUA</span>
                  <h3 class="font-title-lg text-title-lg text-on-surface mt-2">Uji Simulasi CAT Real-Time</h3>
                  <p class="font-body-sm text-body-sm text-on-surface-variant mt-2">
                    Kerjakan 110 soal dalam 100 menit dengan antarmuka navigasi soal yang identik dengan ujian BKN.
                  </p>
                </div>
                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col">
                  <span class="font-mono-score text-mono-score text-secondary">03. LANGKAH KETIGA</span>
                  <h3 class="font-title-lg text-title-lg text-on-surface mt-2">Evaluasi &amp; Upgrade Pro</h3>
                  <p class="font-body-sm text-body-sm text-on-surface-variant mt-2">
                    Tinjau pembahasan lengkap setiap butir soal dan buka akses penuh ke seluruh bank soal HOTS.
                  </p>
                </div>
              </div>

              <!-- Conversion Banner -->
              <div class="bg-primary-container text-on-primary rounded-xl p-8 lg:p-12 mt-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-lg">
                <div class="max-w-2xl">
                  <span class="font-label-md text-label-md text-primary-fixed uppercase tracking-wider">Akses Penuh SimulasiTKD Pro</span>
                  <h2 class="font-headline-md text-headline-md text-on-primary mt-2">Siap Tembus Passing Grade SKD Tahun Ini?</h2>
                  <p class="font-body-md text-body-md text-primary-fixed mt-2">
                    Dapatkan akses penuh paket Tryout Akbar, kunci pembahasan terstruktur per butir soal, rapor PDF, serta peringkat nasional real-time.
                  </p>
                </div>
                <a href="#auth-section" onclick="App.setAuthTab('register')" class="bg-surface-container-lowest text-primary hover:bg-primary-fixed transition-colors rounded-full px-8 py-4 font-label-lg text-label-lg shrink-0 shadow-md">
                  Upgrade ke Akun Pro
                </a>
              </div>
            </section>

            <!-- 4. Auth Split Card Section -->
            <section id="auth-section" class="mt-16 mb-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <!-- Left 6 cols: Freemium Benefits -->
              <div class="lg:col-span-6 flex flex-col">
                <span class="font-label-md text-label-md text-secondary uppercase tracking-wider">Portal Peserta</span>
                <h2 class="font-headline-md text-headline-md text-on-surface mt-2">Mulai Perjalanan Anda Tanpa Biaya</h2>
                <p class="font-body-md text-body-md text-on-surface-variant mt-3">
                  Masuk ke dasbor latihan Anda atau daftarkan akun baru untuk langsung mengakses simulasi CAT TKD gratis.
                </p>
                <div class="flex flex-col gap-4 mt-8">
                  <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined material-fill text-secondary text-[22px] shrink-0">check_circle</span>
                    <div>
                      <h4 class="font-title-md text-title-md text-on-surface">Paket Tryout SKD Gratis</h4>
                      <p class="font-body-sm text-body-sm text-on-surface-variant">Soal standar BKN lengkap dengan timer hitung mundur real-time.</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined material-fill text-secondary text-[22px] shrink-0">check_circle</span>
                    <div>
                      <h4 class="font-title-md text-title-md text-on-surface">Skor &amp; Status Kelulusan Instan</h4>
                      <p class="font-body-sm text-body-sm text-on-surface-variant">Lihat langsung apakah skor TWK, TIU, dan TKP Anda memenuhi ambang batas.</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined material-fill text-secondary text-[22px] shrink-0">check_circle</span>
                    <div>
                      <h4 class="font-title-md text-title-md text-on-surface">Riwayat Progres Tersimpan</h4>
                      <p class="font-body-sm text-body-sm text-on-surface-variant">Pantau perkembangan nilai dari waktu ke waktu dalam satu dasbor tenang.</p>
                    </div>
                  </div>
                </div>

                ${ApiClient.isDemoMode() ? `
                  <div class="mt-6 p-4 rounded-xl bg-surface-container-lowest shadow-sm text-xs space-y-2">
                    <div class="font-title-md text-title-md text-on-surface">Akun Uji Coba Mode Pratinjau Lokal</div>
                    <div class="space-y-1 text-on-surface-variant font-mono-score">
                      <div>Peserta Latihan: budi@demo.id / demo123</div>
                      <div>Peserta Pro: raka@demo.id / demo123</div>
                      <div>Administrator: admin@demo.id / admin123</div>
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Right 6 cols: 440px Auth Card -->
              <div class="lg:col-span-6 flex justify-center lg:justify-end">
                <div class="w-full max-w-[440px] bg-surface-container-lowest rounded-xl shadow-xl p-7 space-y-5">
                  <!-- Segmented Tab Switcher -->
                  <div class="bg-surface-container-low rounded-lg p-1 grid grid-cols-2 gap-1">
                    <button type="button" onclick="App.setAuthTab('login')" class="${state.authTab === 'login' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'} rounded-lg py-2 font-label-lg text-label-lg transition-all cursor-pointer">
                      Masuk
                    </button>
                    <button type="button" onclick="App.setAuthTab('register')" class="${state.authTab === 'register' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'} rounded-lg py-2 font-label-lg text-label-lg transition-all cursor-pointer">
                      Daftar Akun
                    </button>
                  </div>

                  ${state.authTab !== 'emergency' ? `
                    <div id="google-oauth-wrap" class="hidden space-y-3">
                      <div id="google-signin-btn" class="flex justify-center"></div>
                      <div class="relative flex items-center py-1">
                        <div class="flex-grow border-t border-outline-variant/40"></div>
                        <span class="mx-3 font-label-md text-label-md text-on-surface-variant">atau gunakan email</span>
                        <div class="flex-grow border-t border-outline-variant/40"></div>
                      </div>
                    </div>
                  ` : ''}

                  ${state.authTab === 'login' ? `
                    <form onsubmit="App.handleLogin(event)" class="flex flex-col gap-4">
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="auth-email">Alamat Email</label>
                        <input type="email" id="auth-email" required placeholder="nama@email.com" value="${ApiClient.isDemoMode() ? 'budi@demo.id' : ''}" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                          <label class="font-label-md text-label-md text-on-surface" for="auth-pass">Kata Sandi</label>
                        </div>
                        <input type="password" id="auth-pass" required placeholder="••••••••" value="${ApiClient.isDemoMode() ? 'demo123' : ''}" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <button type="submit" id="btn-auth-submit" class="bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-lg h-11 w-full font-label-lg text-label-lg mt-1 shadow-sm cursor-pointer">
                        Masuk ke Akun
                      </button>
                      <div class="text-center pt-1">
                        <button type="button" onclick="App.setAuthTab('emergency')" class="font-label-md text-label-md text-on-surface-variant hover:text-secondary underline cursor-pointer">
                          Akses darurat administrator
                        </button>
                      </div>
                    </form>
                  ` : state.authTab === 'register' ? `
                    <form onsubmit="App.handleRegister(event)" class="flex flex-col gap-3.5">
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="reg-nama">Nama Lengkap</label>
                        <input type="text" id="reg-nama" required placeholder="Contoh: Budi Santoso" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="reg-email">Alamat Email</label>
                        <input type="email" id="reg-email" required placeholder="nama@email.com" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="reg-wa">Nomor WhatsApp</label>
                        <input type="tel" id="reg-wa" required placeholder="0812xxxxxxxx" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="reg-pass">Kata Sandi (minimal 6 karakter)</label>
                        <input type="password" id="reg-pass" required minlength="6" placeholder="Buat kata sandi" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none focus:bg-surface-container" />
                      </div>
                      <button type="submit" id="btn-auth-submit" class="bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-lg h-11 w-full font-label-lg text-label-lg mt-1 shadow-sm cursor-pointer">
                        Daftar Akun Gratis
                      </button>
                    </form>
                  ` : `
                    <form onsubmit="App.handleEmergencyLogin(event)" class="flex flex-col gap-4">
                      <div class="p-3 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md">
                        Login darurat memakai kredensial Script Properties (maksimal 5 percobaan).
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="em-user">Username Darurat</label>
                        <input type="text" id="em-user" required value="darurat" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none" />
                      </div>
                      <div class="flex flex-col gap-1.5">
                        <label class="font-label-md text-label-md text-on-surface" for="em-pass">Sandi Darurat</label>
                        <input type="password" id="em-pass" required placeholder="Sandi dari log setup" class="h-10 rounded-lg bg-surface-container-low px-3.5 font-body-sm text-body-sm text-on-surface w-full focus:outline-none" />
                      </div>
                      <button type="submit" class="bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-lg h-11 w-full font-label-lg text-label-lg shadow-sm cursor-pointer">
                        Masuk Panel Admin
                      </button>
                      <div class="text-center">
                        <button type="button" onclick="App.setAuthTab('login')" class="font-label-md text-label-md text-on-surface-variant hover:text-on-surface underline cursor-pointer">
                          Kembali ke login reguler
                        </button>
                      </div>
                    </form>
                  `}
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>
      ${renderFooter()}
    `;
    refreshIcons();
  }

  // ==========================================================================
  // SCREEN 2: DASHBOARD PESERTA & UPGRADE PRO (Exact Stitch Layout)
  // ==========================================================================
  function renderDashboard(root) {
    const u = state.user || {};
    const d = state.dashData;
    const isPro = u.role === 'Pro' || u.role === 'Admin';
    const isPending = u.status_upgrade === 'Pending' && !isPro;
    const pakets = (d && d.paket || []).filter(function (p) {
      if (state.paketFilter === 'Latihan') return p.tier_akses === 'Latihan';
      if (state.paketFilter === 'Pro') return p.tier_akses === 'Pro';
      return true;
    });
    const bestPct = d ? Math.min(100, Math.round((Number(d.kpi.skorTertinggi || 0) / 550) * 100)) : 0;

    root.innerHTML = `
      ${renderNavbar('dashboard')}
      <main class="w-full pt-16 bg-surface flex-1">
        <div class="max-w-7xl mx-auto px-6 lg:px-12">
          <div class="flex flex-col w-full">

            <!-- Header Section -->
            <section class="py-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-3">
                  <span class="font-label-lg text-label-lg text-on-surface-variant">${esc(u.nama_lengkap || 'Peserta')}</span>
                  <span class="px-3 py-1 rounded-full font-label-md text-label-md ${isPro ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}">
                    ${isPro ? 'Akun Pro' : 'Akun Latihan'}
                  </span>
                  ${isPending ? `<span class="px-3 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md">Menunggu Verifikasi Admin</span>` : ''}
                </div>
                <h1 class="font-headline-md text-headline-md text-on-surface">Ringkasan Latihan</h1>
              </div>
              ${!isPro ? `
                <button type="button" onclick="App.openUpgradeModal()" class="inline-flex items-center justify-center gap-2 bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg px-5 py-3 rounded-lg shadow-sm transition-all cursor-pointer self-start md:self-auto">
                  <span class="material-symbols-outlined text-[20px]">workspace_premium</span>
                  <span>${isPending ? 'Status Pengajuan Pro' : 'Upgrade ke Akun Pro'}</span>
                </button>
              ` : ''}
            </section>

            <!-- 3 KPI Stat Cards -->
            ${!d ? `<section class="grid grid-cols-1 md:grid-cols-3 gap-6 pb-10"><div class="skeleton h-36"></div><div class="skeleton h-36"></div><div class="skeleton h-36"></div></section>` : `
              <section class="grid grid-cols-1 md:grid-cols-3 gap-6 pb-10">
                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between gap-4">
                  <div class="flex items-center justify-between">
                    <span class="font-label-lg text-label-lg text-on-surface-variant">Simulasi Diselesaikan</span>
                    <span class="material-symbols-outlined text-secondary text-[22px]">task_alt</span>
                  </div>
                  <div class="flex items-end justify-between gap-4">
                    <span class="font-headline-md text-headline-md text-on-surface tabular-nums">${d.kpi.tryoutSelesai}</span>
                    <svg class="w-20 h-8 text-secondary" fill="none" viewBox="0 0 80 32" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 28L18 22L32 25L48 12L64 15L78 4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path>
                    </svg>
                  </div>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">Tersimpan pada riwayat akun</p>
                </div>

                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between gap-4">
                  <div class="flex items-center justify-between">
                    <span class="font-label-lg text-label-lg text-on-surface-variant">Skor Tertinggi</span>
                    <span class="material-symbols-outlined text-secondary text-[22px]">leaderboard</span>
                  </div>
                  <div class="flex flex-col gap-2">
                    <span class="font-headline-md text-headline-md text-on-surface tabular-nums">${d.kpi.skorTertinggi} <span class="font-title-md text-title-md text-on-surface-variant">/ 550</span></span>
                    <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                      <div class="h-full bg-secondary rounded-full" style="width: ${bestPct}%;"></div>
                    </div>
                  </div>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">Standar maksimum SKD 550 poin</p>
                </div>

                <div class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between gap-4">
                  <div class="flex items-center justify-between">
                    <span class="font-label-lg text-label-lg text-on-surface-variant">Status Percobaan Terakhir</span>
                    <span class="material-symbols-outlined text-secondary text-[22px]">verified</span>
                  </div>
                  ${d.kpi.terakhir ? `
                    <div>
                      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-label-md ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">
                        <span class="material-symbols-outlined material-fill text-[16px]">${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'check_circle' : 'error'}</span>
                        ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'Lulus Passing Grade' : 'Belum Lulus PG'}
                      </span>
                    </div>
                    <p class="font-mono-score text-mono-score text-on-surface-variant tabular-nums">TWK ${d.kpi.terakhir.skor_twk} • TIU ${d.kpi.terakhir.skor_tiu} • TKP ${d.kpi.terakhir.skor_tkp}</p>
                  ` : `
                    <div>
                      <span class="inline-flex items-center px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-md text-label-md">Belum ada percobaan</span>
                    </div>
                    <p class="font-body-sm text-body-sm text-on-surface-variant">Mulai simulasi pertama Anda di bawah</p>
                  `}
                </div>
              </section>
            `}

            <!-- Katalog Paket Simulasi -->
            <section class="flex flex-col gap-6 pb-12">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex flex-col gap-1">
                  <h2 class="font-headline-sm text-headline-sm text-on-surface">Katalog Paket Simulasi</h2>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">Pilih paket tryout sesuai target seleksi Anda</p>
                </div>
                <div class="inline-flex items-center gap-1 bg-surface-container-low p-1 rounded-xl self-start sm:self-auto">
                  ${['Semua', 'Latihan', 'Pro'].map(function (f) {
                    const label = f === 'Semua' ? 'Semua Paket' : f === 'Latihan' ? 'Latihan (Gratis)' : 'Paket Pro';
                    const active = state.paketFilter === f;
                    return `<button type="button" onclick="App.setPaketFilter('${f}')" class="px-4 py-2 rounded-lg font-label-md text-label-md transition-all cursor-pointer ${active ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}">${label}</button>`;
                  }).join('')}
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${pakets.map(function (p) {
                  const locked = p.tier_akses === 'Pro' && !isPro;
                  return `
                    <article class="${locked ? 'bg-surface-container-low' : 'bg-surface-container-lowest'} rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-6">
                      <div class="flex flex-col gap-4">
                        <div class="flex items-center justify-between gap-2">
                          <span class="px-3 py-1 rounded-full font-label-md text-label-md ${p.tier_akses === 'Latihan' ? 'bg-secondary-container text-on-secondary-container' : 'bg-primary-fixed text-on-primary-fixed'}">
                            ${p.tier_akses === 'Latihan' ? 'GRATIS / LATIHAN' : 'PRO PREMIUM'}
                          </span>
                          <span class="font-label-md text-label-md text-on-surface-variant">${esc(p.kategori_label || 'CPNS SKD')}</span>
                        </div>
                        <div class="flex flex-col gap-2">
                          <h3 class="font-title-lg text-title-lg text-on-surface">${esc(p.nama_paket)}</h3>
                          <p class="font-body-sm text-body-sm text-on-surface-variant">${p.durasi_menit} Menit • ${p.jumlah_soal} Soal • ${p.tier_akses === 'Pro' ? 'Pembahasan Lengkap' : 'PG Resmi'}</p>
                          <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">${esc(p.deskripsi)}</p>
                        </div>
                      </div>
                      ${locked ? `
                        <button type="button" onclick="App.openUpgradeModal()" class="inline-flex items-center justify-center gap-2 w-full bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant font-label-lg text-label-lg py-3 px-4 rounded-lg shadow-sm transition-colors cursor-pointer">
                          <span class="material-symbols-outlined text-[18px]">lock</span>
                          <span>Terkunci — Buka dengan Akun Pro</span>
                        </button>
                      ` : `
                        <button type="button" onclick="App.confirmStartExam('${esc(p.paket_id)}')" class="inline-flex items-center justify-center gap-2 w-full bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg py-3 px-4 rounded-lg transition-colors cursor-pointer">
                          <span>Mulai Simulasi</span>
                          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                      `}
                    </article>`;
                }).join('')}
              </div>
            </section>

            <!-- Riwayat Terakhir -->
            ${d && d.riwayat && d.riwayat.length ? `
              <section class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-4 mb-8">
                <div class="flex items-center justify-between gap-4">
                  <h3 class="font-title-lg text-title-lg text-on-surface">Riwayat Pengerjaan Terakhir</h3>
                  <button type="button" onclick="App.go('result')" class="inline-flex items-center gap-1.5 font-label-lg text-label-lg text-secondary hover:underline cursor-pointer">
                    <span>Evaluasi Lengkap</span>
                    <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
                <div class="flex flex-col gap-2.5">
                  ${d.riwayat.slice(0, 5).map(function (r) {
                    const ok = r.status_kelulusan === 'Lulus';
                    return `
                      <div class="p-4 rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-1">
                          <div class="font-title-md text-title-md text-on-surface">${esc(r.nama_paket)}</div>
                          <div class="font-mono-score text-mono-score text-on-surface-variant tabular-nums">TWK ${r.skor_twk} • TIU ${r.skor_tiu} • TKP ${r.skor_tkp} • Total <strong class="text-on-surface">${r.skor_total}</strong></div>
                        </div>
                        <div class="flex items-center gap-2.5">
                          <span class="px-3 py-1 rounded-full font-label-md text-label-md ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${esc(r.status_kelulusan)}</span>
                          <button type="button" onclick="App.go('result', { hasil_id: '${esc(r.hasil_id)}' })" class="px-3.5 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container font-label-md text-label-md text-on-surface shadow-sm transition-colors cursor-pointer">Rincian</button>
                        </div>
                      </div>`;
                  }).join('')}
                </div>
              </section>
            ` : ''}

          </div>
        </div>
      </main>
      ${renderFooter()}
    `;
    refreshIcons();
  }

  // ==========================================================================
  // SCREEN 3: RUANG UJIAN CAT REAL-TIME (Exact Stitch Layout)
  // ==========================================================================
  function saveExamLocal() {
    if (state.exam) localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify(state.exam));
  }

  function renderExamRoom(root) {
    const ex = state.exam;
    if (!ex) return go('dashboard');
    const q = ex.soal[ex.idx];
    const total = ex.soal.length;
    const isDoubtful = !!ex.doubtful[q.soal_id];
    const picked = ex.answers[q.soal_id] || '';
    const remSec = Math.max(0, Math.floor((ex.endAt - Date.now()) / 1000));
    const timerCls = remSec < 300
      ? 'bg-error-container text-on-error-container'
      : remSec < 900
        ? 'bg-tertiary-fixed text-on-tertiary-fixed'
        : 'bg-surface-container-low text-on-surface';

    let countAnswered = 0;
    let countDoubtful = 0;
    let countUnanswered = 0;

    const navTilesHtml = ex.soal.map(function (item, i) {
      const hasDoubt = !!ex.doubtful[item.soal_id];
      const hasAns = !!ex.answers[item.soal_id];
      if (hasDoubt) countDoubtful++;
      else if (hasAns) countAnswered++;
      else countUnanswered++;

      const st = hasDoubt ? 'doubtful' : hasAns ? 'answered' : 'unanswered';
      const active = i === ex.idx ? 'active-tile' : '';
      return `<button type="button" onclick="App.jumpSoal(${i})" class="nav-tile ${st} ${active}">${i + 1}</button>`;
    }).join('');

    const subtesFull = q.subtes === 'TWK'
      ? 'TWK — Tes Wawasan Kebangsaan'
      : q.subtes === 'TIU'
        ? 'TIU — Tes Intelegensia Umum'
        : 'TKP — Tes Karakteristik Pribadi';

    root.innerHTML = `
      <main class="w-full bg-surface min-h-screen flex flex-col">
        <!-- Sticky Exam Top Bar -->
        <header class="sticky top-0 z-30 w-full h-16 bg-surface-container-lowest shadow-sm px-6 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <span class="font-title-md text-title-md text-on-surface truncate">${esc(ex.paket.nama_paket)}</span>
            <span class="hidden sm:inline-flex items-center px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md shrink-0">
              ${esc(subtesFull)}
            </span>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <div id="exam-timer-pill" class="flex items-center gap-2 px-4 py-1.5 rounded-full font-mono-timer text-mono-timer tabular-nums transition-colors ${timerCls}">
              <span class="material-symbols-outlined text-[20px]">schedule</span>
              <span id="exam-timer-text">${fmtTimer(remSec)}</span>
            </div>
            <button type="button" onclick="App.confirmFinishExam()" class="h-[38px] px-4 rounded-lg bg-error-container text-on-error-container font-label-lg text-label-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">stop_circle</span>
              <span>Selesai<span class="hidden sm:inline"> Ujian</span></span>
            </button>
          </div>
        </header>

        <!-- Mobile Question Navigator Trigger -->
        <div class="lg:hidden px-6 pt-4">
          <button type="button" onclick="App.toggleMobileNavSheet(true)" class="w-full h-11 px-4 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between font-label-lg text-label-lg cursor-pointer">
            <span class="inline-flex items-center gap-2 text-on-surface">
              <span class="material-symbols-outlined text-secondary text-[20px]">grid_view</span>
              <span>Navigasi Soal (${countAnswered}/${total})</span>
            </span>
            <span class="text-on-surface-variant inline-flex items-center gap-1 font-label-md text-label-md">
              <span>Buka Daftar</span>
              <span class="material-symbols-outlined text-[18px]">expand_more</span>
            </span>
          </button>
        </div>

        <!-- Main Split Workspace -->
        <div class="max-w-[1280px] w-full mx-auto px-6 py-6 pb-24 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
          <!-- Left 8 Cols: Question & Options Card -->
          <section class="lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-6">
            <!-- Question Header Bar -->
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="font-label-lg text-label-lg font-semibold tabular-nums text-on-surface">
                  Soal No. ${ex.idx + 1} dari ${total}
                </span>
                ${isDoubtful ? `
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md">
                    <span class="material-symbols-outlined text-[14px]">flag</span>
                    Ragu-ragu
                  </span>
                ` : ''}
              </div>
              <span class="px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-mono-score text-mono-score tabular-nums">
                ${esc(q.topik ? q.topik + ' • ' : '')}${q.subtes === 'TKP' ? 'Skala Bobot 1–5' : 'Benar +5 • Salah 0'}
              </span>
            </div>

            <!-- Question Stem -->
            <div class="font-body-md text-body-md text-on-surface max-w-[70ch] leading-relaxed whitespace-pre-line">${esc(q.pertanyaan)}</div>

            ${q.image_url ? `<div class="rounded-xl overflow-hidden bg-surface-container-low p-3"><img src="${esc(q.image_url)}" alt="Ilustrasi soal nomor ${ex.idx + 1}" class="max-h-72 mx-auto object-contain rounded-lg" /></div>` : ''}

            <!-- Answer Option Rows (A-E) -->
            <div class="flex flex-col gap-3">
              ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
                const txt = q.opsi && q.opsi[opt];
                if (!txt) return '';
                const sel = picked === opt;
                return `
                  <button type="button" onclick="App.selectAnswer('${esc(q.soal_id)}', '${opt}')" class="cat-option ${sel ? 'selected' : ''} w-full min-h-[52px] rounded-lg p-3 flex items-center gap-4 text-left">
                    <span class="opt-badge w-8 h-8 rounded-md flex items-center justify-center font-mono-score text-mono-score shrink-0 ${sel ? 'bg-primary-container text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant'}">${opt}</span>
                    <span class="font-body-md text-body-md ${sel ? 'font-medium' : ''}">${esc(txt)}</span>
                  </button>`;
              }).join('')}
            </div>

            <!-- Bottom Action Bar (Desktop) -->
            <div class="hidden lg:flex flex-wrap items-center justify-between gap-3 pt-2">
              <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled' : ''} class="px-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                <span>← Sebelumnya</span>
              </button>
              <div class="flex flex-wrap items-center gap-3">
                <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="px-4 py-2.5 rounded-lg font-label-lg text-label-lg transition-opacity cursor-pointer flex items-center gap-1.5 ${isDoubtful ? 'bg-tertiary text-on-tertiary' : 'bg-tertiary-fixed text-on-tertiary-fixed hover:opacity-90'}">
                  <span class="material-symbols-outlined text-[18px]">flag</span>
                  <span>${isDoubtful ? 'Ragu-ragu Aktif' : 'Tandai Ragu-ragu'}</span>
                </button>
                <button type="button" onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="px-5 py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary transition-colors cursor-pointer flex items-center gap-1.5">
                  <span>${ex.idx < total - 1 ? 'Simpan & Lanjutkan →' : 'Selesai & Kumpulkan →'}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Right 4 Cols: 3-State Question Navigator Matrix -->
          <aside class="hidden lg:flex lg:col-span-4 lg:sticky lg:top-20 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex-col gap-4">
            <div class="flex items-center justify-between">
              <h2 class="font-title-md text-title-md text-on-surface tabular-nums">Navigasi Soal (${countAnswered}/${total})</h2>
              <span class="font-label-md text-label-md text-on-surface-variant">${esc(q.subtes)}</span>
            </div>

            <!-- 6-column grid of 36x36px numbered tiles -->
            <div class="grid grid-cols-6 gap-2 max-h-[380px] overflow-y-auto pr-1">${navTilesHtml}</div>

            <!-- Legend Footer -->
            <div class="flex flex-col gap-3 pt-2">
              <div class="grid grid-cols-3 gap-2">
                <div class="flex items-center gap-2 bg-surface-container-low rounded-lg px-2.5 py-2">
                  <span class="w-3 h-3 rounded-sm bg-secondary shrink-0"></span>
                  <div class="flex flex-col min-w-0">
                    <span class="font-label-md text-label-md text-on-surface-variant truncate">Dijawab</span>
                    <span class="font-mono-score text-mono-score text-on-surface tabular-nums">${countAnswered}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 bg-surface-container-low rounded-lg px-2.5 py-2">
                  <span class="w-3 h-3 rounded-sm bg-tertiary-fixed shrink-0"></span>
                  <div class="flex flex-col min-w-0">
                    <span class="font-label-md text-label-md text-on-surface-variant truncate">Ragu</span>
                    <span class="font-mono-score text-mono-score text-on-surface tabular-nums">${countDoubtful}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 bg-surface-container-low rounded-lg px-2.5 py-2">
                  <span class="w-3 h-3 rounded-sm bg-surface-container-high shrink-0"></span>
                  <div class="flex flex-col min-w-0">
                    <span class="font-label-md text-label-md text-on-surface-variant truncate">Kosong</span>
                    <span class="font-mono-score text-mono-score text-on-surface tabular-nums">${countUnanswered}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md">
                <span class="material-symbols-outlined text-[16px] text-secondary">cloud_done</span>
                <span>Jawaban tersimpan otomatis di perangkat</span>
              </div>
            </div>
          </aside>
        </div>

        <!-- Mobile Sticky Bottom Action Bar -->
        <div class="lg:hidden fixed bottom-0 inset-x-0 bg-surface-container-lowest shadow-[0_-2px_10px_rgba(0,0,0,0.06)] px-4 py-3 z-30 flex items-center justify-between gap-2">
          <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled' : ''} class="px-3.5 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-label-md text-label-md disabled:opacity-40">
            ← Sebelumnya
          </button>
          <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="px-3.5 py-2.5 rounded-lg font-label-md text-label-md ${isDoubtful ? 'bg-tertiary text-on-tertiary' : 'bg-tertiary-fixed text-on-tertiary-fixed'}">
            Ragu-ragu
          </button>
          <button type="button" onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="flex-1 py-2.5 px-4 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md text-center">
            ${ex.idx < total - 1 ? 'Simpan & Lanjut →' : 'Kumpulkan →'}
          </button>
        </div>

        <!-- Mobile Bottom Sheet Drawer -->
        ${state.mobileNavSheetOpen ? `
          <div class="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bottom-sheet-backdrop" onclick="if(event.target===this) App.toggleMobileNavSheet(false)">
            <div class="bg-surface-container-lowest bottom-sheet-panel p-5 max-h-[75vh] flex flex-col gap-4">
              <div class="flex items-center justify-between">
                <h3 class="font-title-md text-title-md text-on-surface">Navigasi Soal (${countAnswered}/${total})</h3>
                <button type="button" onclick="App.toggleMobileNavSheet(false)" class="p-1.5 rounded-lg bg-surface-container-low text-on-surface-variant"><span class="material-symbols-outlined text-[20px]">close</span></button>
              </div>
              <div class="grid grid-cols-6 gap-2 overflow-y-auto p-1">${navTilesHtml}</div>
            </div>
          </div>
        ` : ''}
      </main>
    `;
    refreshIcons();
  }

  function startExamCountdown() {
    stopExamTimer();
    state.examTimerId = setInterval(function () {
      if (!state.exam) return stopExamTimer();
      const rem = Math.floor((state.exam.endAt - Date.now()) / 1000);
      const el = document.getElementById('exam-timer-text');
      if (el) el.textContent = fmtTimer(rem);
      if (rem <= 0) {
        stopExamTimer();
        toast('Waktu habis, jawaban dikumpulkan otomatis', 'warning');
        submitExamNow();
      }
    }, 1000);
  }

  async function submitExamNow() {
    if (!state.exam) return;
    stopExamTimer();
    const ex = state.exam;
    const durasiDetik = Math.max(1, Math.floor((Date.now() - new Date(ex.startedAt).getTime()) / 1000));
    try {
      const res = await ApiClient.call('peserta.submitExam', {
        paket_id: ex.paket.paket_id,
        answers: ex.answers,
        waktu_mulai: ex.startedAt,
        durasi_pakai_detik: durasiDetik
      });
      localStorage.removeItem(EXAM_STORAGE_KEY);
      state.exam = null;
      toast('Simulasi selesai, skor total: ' + res.skor_total, 'success');
      go('result', { hasil_id: res.hasil_id });
    } catch (err) {
      toast('Gagal mengirim jawaban: ' + err.message, 'error');
    }
  }

  // ==========================================================================
  // SCREEN 4: EVALUASI, GRAFIK, PEMBAHASAN & PERINGKAT (Exact Stitch Layout)
  // ==========================================================================
  function renderResultSkeleton(root) {
    root.innerHTML = `${renderNavbar('result')}<main class="w-full pt-16 bg-surface flex-1"><div class="max-w-7xl mx-auto px-6 lg:px-12 py-8 space-y-6"><div class="skeleton h-40"></div><div class="grid grid-cols-1 lg:grid-cols-12 gap-6"><div class="lg:col-span-8 skeleton h-64"></div><div class="lg:col-span-4 skeleton h-64"></div></div></div></main>`;
  }

  function renderResult(root) {
    const d = state.resultData;
    if (!d) return go('dashboard');
    const h = d.hasil;
    const p = d.paket || {};
    const pgTwk = Number(p.pg_twk || 65), pgTiu = Number(p.pg_tiu || 80), pgTkp = Number(p.pg_tkp || 166);
    const lulus = h.status_kelulusan === 'Lulus';

    const subCard = function (label, val, pg, maxVal) {
      const ok = Number(val) >= pg;
      const pct = Math.min(100, Math.round((Number(val) / maxVal) * 100));
      const pgPct = Math.min(100, Math.round((pg / maxVal) * 100));
      const delta = Number(val) - pg;
      const deltaStr = (delta >= 0 ? '+' + delta + ' di atas PG' : delta + ' di bawah PG');
      return `
        <div class="bg-surface-container-low rounded-lg p-4 flex flex-col justify-between gap-4">
          <div class="flex items-center justify-between gap-2">
            <span class="font-title-md text-title-md text-on-surface">${label}</span>
            <span class="rounded-full px-2.5 py-0.5 font-label-md text-label-md ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${ok ? 'Lulus' : 'Belum Lulus'}</span>
          </div>
          <div class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between">
              <span class="font-headline-sm text-headline-sm text-on-surface tabular-nums">${val}</span>
              <span class="font-mono-score text-mono-score text-on-surface-variant">PG ${pg}</span>
            </div>
            <span class="font-label-md text-label-md ${ok ? 'text-secondary' : 'text-error'}">${deltaStr}</span>
          </div>
          <div class="pg-track">
            <div class="pg-fill ${ok ? 'bg-primary-container' : 'bg-error'}" style="width: ${pct}%;"></div>
            <div class="pg-marker" style="left: ${pgPct}%;" title="Ambang Batas: ${pg}"></div>
          </div>
        </div>`;
    };

    root.innerHTML = `
      ${renderNavbar('result')}
      <main class="w-full pt-16 bg-surface flex-1">
        <div class="max-w-7xl mx-auto px-6 lg:px-12">
          <div class="flex flex-col w-full gap-8 py-6">

            <!-- Score Hero Summary Card -->
            <section class="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div class="lg:col-span-4 flex flex-col justify-between gap-6">
                  <div class="flex flex-col gap-3">
                    <div class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 w-fit ${lulus ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">
                      <span class="material-symbols-outlined material-fill text-[16px]">${lulus ? 'verified' : 'error'}</span>
                      <span class="font-label-md text-label-md">${lulus ? 'LULUS AMBANG BATAS' : 'BELUM LULUS AMBANG BATAS'}</span>
                    </div>
                    <div class="font-label-md text-label-md text-on-surface-variant">${esc(h.nama_paket)}</div>
                    <div class="flex items-baseline gap-2">
                      <span class="font-headline-lg text-headline-lg text-on-surface tabular-nums">${h.skor_total}</span>
                      <span class="font-title-lg text-title-lg text-on-surface-variant tabular-nums">/ 550</span>
                    </div>
                    <div class="flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
                      <span class="material-symbols-outlined text-[18px]">timer</span>
                      <span>Waktu pengerjaan: <strong class="text-on-surface font-label-lg text-label-lg">${fmtDurasi(h.durasi_pakai_detik)}</strong></span>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-3 no-print">
                    <button type="button" onclick="window.print()" class="inline-flex items-center justify-center gap-2 bg-surface-container-low hover:bg-surface-container text-on-surface rounded-lg px-4 py-2.5 font-label-lg text-label-lg transition-colors cursor-pointer">
                      <span class="material-symbols-outlined text-[18px]">download</span>
                      <span>Unduh Rapor PDF</span>
                    </button>
                    <button type="button" onclick="App.go('dashboard')" class="inline-flex items-center justify-center gap-2 bg-primary-container hover:bg-primary text-on-primary rounded-lg px-4 py-2.5 font-label-lg text-label-lg transition-colors cursor-pointer">
                      <span class="material-symbols-outlined text-[18px]">arrow_back</span>
                      <span>Kembali ke Katalog</span>
                    </button>
                  </div>
                </div>
                <div class="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                  ${subCard('TWK', h.skor_twk, pgTwk, 150)}
                  ${subCard('TIU', h.skor_tiu, pgTiu, 175)}
                  ${subCard('TKP', h.skor_tkp, pgTkp, 225)}
                </div>
              </div>
            </section>

            <!-- Charts Section -->
            <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div class="lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between gap-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 class="font-title-lg text-title-lg text-on-surface">Perbandingan Skor vs Ambang Batas BKN</h2>
                    <p class="font-body-sm text-body-sm text-on-surface-variant">Evaluasi capaian tiap subtes terhadap standar kelulusan resmi.</p>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-sm bg-primary-container inline-block"></span>
                      <span class="font-label-md text-label-md text-on-surface-variant">Skor Anda</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-sm bg-surface-dim inline-block"></span>
                      <span class="font-label-md text-label-md text-on-surface-variant">Passing Grade</span>
                    </div>
                  </div>
                </div>
                <div class="h-60"><canvas id="chartResultSubtes"></canvas></div>
              </div>

              <div class="lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col justify-between gap-4">
                <div>
                  <h2 class="font-title-lg text-title-lg text-on-surface">Tren Tryout Terakhir</h2>
                  <p class="font-body-sm text-body-sm text-on-surface-variant">Riwayat perkembangan total skor antar percobaan.</p>
                </div>
                <div class="h-60"><canvas id="chartResultTrend"></canvas></div>
              </div>
            </section>

            <!-- Tabs Pembahasan & Papan Peringkat -->
            <section class="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-6">
              <div class="flex flex-wrap items-center gap-2 bg-surface-container-low p-1.5 rounded-xl w-fit no-print">
                <button type="button" onclick="App.setResultTab('pembahasan')" class="rounded-lg px-4 py-2 font-label-lg text-label-lg transition-colors cursor-pointer ${state.resultTab === 'pembahasan' ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}">
                  Pembahasan Detail Soal
                </button>
                <button type="button" onclick="App.setResultTab('peringkat')" class="rounded-lg px-4 py-2 font-label-lg text-label-lg transition-colors cursor-pointer ${state.resultTab === 'peringkat' ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}">
                  Papan Peringkat Nasional (${state.leaderboard.length})
                </button>
              </div>

              ${state.resultTab === 'pembahasan' ? `
                <div class="flex flex-col gap-4">
                  ${d.pembahasan.filter(function (x) { return !x.locked; }).map(function (item, i) {
                    const open = !!state.openAccordion[i];
                    const badgeCls = item.poin >= 5
                      ? 'bg-secondary-container text-on-secondary-container'
                      : item.poin > 0
                        ? 'bg-primary-fixed text-on-primary-fixed'
                        : 'bg-error-container text-on-error-container';
                    const numStr = String(item.nomor_urut).padStart(2, '0');
                    return `
                      <div class="bg-surface-container-low rounded-xl p-5 flex flex-col gap-4">
                        <button type="button" onclick="App.toggleAccordion(${i})" class="w-full flex flex-wrap items-center justify-between gap-3 text-left cursor-pointer">
                          <div class="flex flex-wrap items-center gap-3">
                            <span class="font-mono-score text-mono-score bg-surface-container-lowest text-on-surface px-2.5 py-1 rounded-md">Soal #${numStr}</span>
                            <span class="bg-primary-fixed text-on-primary-fixed rounded-full px-2.5 py-0.5 font-label-md text-label-md">${esc(item.subtes)}</span>
                            <span class="font-title-md text-title-md text-on-surface">${esc(item.topik || ('Butir Soal ' + item.subtes))}</span>
                          </div>
                          <div class="flex items-center gap-3">
                            <span class="${badgeCls} rounded-full px-3 py-1 font-label-md text-label-md">${item.subtes === 'TKP' ? 'Poin +' + item.poin : (item.benar ? 'Benar (+5 Poin)' : 'Salah (0 Poin)')}</span>
                            <span class="material-symbols-outlined text-on-surface-variant">${open ? 'expand_less' : 'expand_more'}</span>
                          </div>
                        </button>
                        ${open ? `
                          <div class="flex flex-col gap-4 pt-1">
                            <p class="font-body-md text-body-md text-on-surface">${esc(item.pertanyaan)}</p>
                            <div class="flex flex-wrap items-center gap-4 font-label-lg text-label-lg">
                              <span class="bg-surface-container-lowest text-on-surface px-3 py-1.5 rounded-lg">Jawaban Anda: <strong class="text-secondary">${esc(item.jawaban_user || 'Kosong')}</strong></span>
                              <span class="bg-secondary-container text-on-secondary-container px-3 py-1.5 rounded-lg">Kunci / Bobot: <strong>${esc(item.kunci_atau_bobot)}</strong></span>
                            </div>
                            <div class="bg-surface-container-lowest rounded-lg p-4 flex gap-3">
                              <div class="w-1 bg-secondary rounded-full shrink-0"></div>
                              <div class="flex flex-col gap-1">
                                <span class="font-label-lg text-label-lg text-on-surface">Pembahasan Resmi</span>
                                <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(item.pembahasan || 'Pembahasan belum tersedia')}</p>
                              </div>
                            </div>
                          </div>
                        ` : ''}
                      </div>`;
                  }).join('')}

                  ${d.lockedCount > 0 ? `
                    <div class="relative rounded-xl overflow-hidden bg-surface-container-low p-8 min-h-[210px] no-print">
                      <div class="blur-sm select-none pointer-events-none flex flex-col gap-3 opacity-60">
                        <div class="flex items-center justify-between">
                          <span class="font-mono-score text-mono-score bg-surface-container-lowest px-2.5 py-1 rounded-md">Soal #03</span>
                          <span class="bg-secondary-container text-on-secondary-container rounded-full px-3 py-1 font-label-md text-label-md">TKP (+5 Poin)</span>
                        </div>
                        <p class="font-body-md text-body-md text-on-surface">
                          Ketika rekan kerja Anda mengalami kendala teknis menjelang tenggat waktu pelaporan kinerja bulanan, sikap Anda yang paling tepat adalah...
                        </p>
                      </div>
                      <div class="absolute inset-0 bg-surface-container-lowest/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 gap-4">
                        <div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary">
                          <span class="material-symbols-outlined text-[24px]">lock</span>
                        </div>
                        <div class="flex flex-col gap-1 max-w-md">
                          <h3 class="font-title-md text-title-md text-on-surface">${d.lockedCount} Pembahasan Soal Lainnya Terkunci untuk Akun Latihan</h3>
                          <p class="font-body-sm text-body-sm text-on-surface-variant">Buka seluruh kunci jawaban, bobot nilai TKP, dan analisis mendalam tiap butir soal.</p>
                        </div>
                        <button type="button" onclick="App.openUpgradeModal()" class="bg-primary-container hover:bg-primary text-on-primary rounded-lg px-5 py-2.5 font-label-lg text-label-lg transition-colors cursor-pointer">
                          Upgrade ke Akun Pro Sekarang
                        </button>
                      </div>
                    </div>
                  ` : ''}
                </div>
              ` : `
                <div class="flex flex-col gap-4">
                  <div class="bg-surface-container-low rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-secondary text-[24px]">emoji_events</span>
                      <div>
                        <p class="font-title-md text-title-md text-on-surface">Papan Peringkat Peserta Nasional</p>
                        <p class="font-body-sm text-body-sm text-on-surface-variant">Diurutkan berdasarkan status kelulusan ambang batas dan total skor tertinggi</p>
                      </div>
                    </div>
                    <span class="bg-secondary-container text-on-secondary-container rounded-full px-3 py-1 font-mono-score text-mono-score">Skor Anda: ${h.skor_total}</span>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="grid grid-cols-12 gap-2 px-4 py-2 font-label-md text-label-md text-on-surface-variant">
                      <div class="col-span-2">Peringkat</div>
                      <div class="col-span-4">Nama Peserta</div>
                      <div class="col-span-3 text-right">TWK / TIU / TKP</div>
                      <div class="col-span-1 text-right">Total</div>
                      <div class="col-span-2 text-right">Status</div>
                    </div>
                    ${state.leaderboard.map(function (lb) {
                      const ok = lb.status_kelulusan === 'Lulus';
                      const isMe = state.user && lb.nama_user === state.user.nama_lengkap;
                      return `
                        <div class="grid grid-cols-12 gap-2 items-center ${isMe ? 'bg-primary-fixed' : 'bg-surface-container-low'} rounded-lg px-4 py-3">
                          <div class="col-span-2 font-mono-score text-mono-score text-on-surface">#${lb.rank}</div>
                          <div class="col-span-4 font-label-lg text-label-lg text-on-surface truncate">${esc(lb.nama_user)}</div>
                          <div class="col-span-3 text-right font-mono-score text-mono-score text-on-surface-variant tabular-nums">${lb.skor_twk} • ${lb.skor_tiu} • ${lb.skor_tkp}</div>
                          <div class="col-span-1 text-right font-mono-score text-mono-score text-secondary font-semibold tabular-nums">${lb.skor_total}</div>
                          <div class="col-span-2 text-right">
                            <span class="px-2.5 py-0.5 rounded-full font-label-md text-label-md ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}">${esc(lb.status_kelulusan)}</span>
                          </div>
                        </div>`;
                    }).join('')}
                  </div>
                </div>
              `}
            </section>

          </div>
        </div>
      </main>
      ${renderFooter()}
    `;
    refreshIcons();
  }

  function mountResultCharts() {
    if (!state.resultData || !window.Chart) return;
    const h = state.resultData.hasil;
    const p = state.resultData.paket || {};
    const monoFont = { family: "'JetBrains Mono', monospace", size: 11 };
    const gridColor = '#dce9ff';
    const tickColor = '#414944';

    const ctx1 = document.getElementById('chartResultSubtes');
    if (ctx1) {
      resultCharts.push(new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['TWK', 'TIU', 'TKP'],
          datasets: [
            { label: 'Skor Anda', data: [h.skor_twk, h.skor_tiu, h.skor_tkp], backgroundColor: '#0e3b2c', borderRadius: 4, barPercentage: 0.6 },
            { label: 'Passing Grade', data: [p.pg_twk || 65, p.pg_tiu || 80, p.pg_tkp || 166], backgroundColor: '#ccdbf3', borderRadius: 4, barPercentage: 0.6 }
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
    const ctx2 = document.getElementById('chartResultTrend');
    if (ctx2) {
      const tr = state.resultData.trend || [];
      resultCharts.push(new Chart(ctx2, {
        type: 'line',
        data: {
          labels: tr.map(function (t) { return t.label; }),
          datasets: [{
            label: 'Total Skor',
            data: tr.map(function (t) { return t.total; }),
            borderColor: '#006d44',
            borderWidth: 2.5,
            backgroundColor: 'rgba(0, 109, 68, 0.14)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: '#006d44'
          }]
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

  async function loadAuthConfigAndMountGoogle() {
    try {
      if (!state.authConfig) {
        state.authConfig = await ApiClient.call('auth.config');
      }
      mountGoogleSignInButton();
    } catch (e) {
      // Abaikan jika auth.config tidak tersedia
    }
  }

  function mountGoogleSignInButton(attempt) {
    attempt = attempt || 0;
    const cfg = state.authConfig;
    const wrap = document.getElementById('google-oauth-wrap');
    const slot = document.getElementById('google-signin-btn');
    if (!wrap || !slot || !cfg || !cfg.googleOAuthEnabled) return;

    wrap.classList.remove('hidden');

    if (cfg.demoOAuth || ApiClient.isDemoMode()) {
      slot.innerHTML = `
        <button type="button" onclick="App.handleDemoGoogleLogin()"
          class="w-full h-10 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container font-label-lg text-label-lg text-on-surface inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer">
          <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
          <span>Lanjutkan dengan Google (Mode Pratinjau)</span>
        </button>`;
      return;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (attempt < 15) setTimeout(function () { mountGoogleSignInButton(attempt + 1); }, 300);
      return;
    }

    slot.innerHTML = '';
    const targetWidth = Math.min(392, Math.max(260, (slot.parentElement && slot.parentElement.clientWidth) || 360));
    window.google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: handleGoogleCredentialResponse
    });
    window.google.accounts.id.renderButton(slot, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: state.authTab === 'register' ? 'signup_with' : 'signin_with',
      width: targetWidth,
      locale: 'id'
    });
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      return toast('Login Google dibatalkan', 'warning');
    }
    try {
      toast('Memverifikasi akun Google...', 'info');
      const res = await ApiClient.call('auth.googleLogin', { credential: response.credential });
      ApiClient.setSession(res.token, res.user);
      state.user = res.user;
      toast(res.isNewUser ? 'Akun latihan dibuat melalui Google' : 'Masuk sebagai ' + res.user.nama_lengkap, 'success');
      go(res.user.role === 'Admin' ? 'admin' : 'dashboard');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ==========================================================================
  // PUBLIC HANDLERS & INIT
  // ==========================================================================
  function logout() {
    ApiClient.call('auth.logout').catch(function () {});
    ApiClient.clearSession();
    state.user = null;
    state.dashData = null;
    closeModal();
    go('landing');
    toast('Anda telah keluar dari akun', 'info');
  }

  function init() {
    try {
      const savedExam = localStorage.getItem(EXAM_STORAGE_KEY);
      if (savedExam && state.user) {
        const parsed = JSON.parse(savedExam);
        if (parsed && parsed.endAt > Date.now()) {
          state.exam = parsed;
          toast('Sesi ujian aktif dipulihkan', 'info');
          return go('exam');
        } else {
          localStorage.removeItem(EXAM_STORAGE_KEY);
        }
      }
    } catch (e) {}

    if (state.user && ApiClient.getToken()) {
      go(state.user.role === 'Admin' ? 'admin' : 'dashboard');
    } else {
      go('landing');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    go: go,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    logout: logout,
    setAuthTab: function (t) { state.authTab = t; renderLanding(document.getElementById('app')); mountGoogleSignInButton(); },
    handleDemoGoogleLogin: function () { handleGoogleCredentialResponse({ credential: 'DEMO_ID_TOKEN' }); },
    handleLogin: async function (e) {
      e.preventDefault();
      try {
        const res = await ApiClient.call('auth.login', {
          email: document.getElementById('auth-email').value,
          password: document.getElementById('auth-pass').value
        });
        ApiClient.setSession(res.token, res.user);
        state.user = res.user;
        toast('Masuk sebagai ' + res.user.nama_lengkap, 'success');
        go(res.user.role === 'Admin' ? 'admin' : 'dashboard');
      } catch (err) { toast(err.message, 'error'); }
    },
    handleRegister: async function (e) {
      e.preventDefault();
      try {
        const res = await ApiClient.call('auth.register', {
          nama_lengkap: document.getElementById('reg-nama').value,
          email: document.getElementById('reg-email').value,
          no_wa: document.getElementById('reg-wa').value,
          password: document.getElementById('reg-pass').value
        });
        ApiClient.setSession(res.token, res.user);
        state.user = res.user;
        toast('Akun latihan aktif', 'success');
        go('dashboard');
      } catch (err) { toast(err.message, 'error'); }
    },
    handleEmergencyLogin: async function (e) {
      e.preventDefault();
      try {
        const res = await ApiClient.call('auth.emergencyLogin', {
          username: document.getElementById('em-user').value,
          password: document.getElementById('em-pass').value
        });
        ApiClient.setSession(res.token, res.user);
        state.user = res.user;
        toast('Akses darurat administrator aktif', 'success');
        go('admin');
      } catch (err) { toast(err.message, 'error'); }
    },
    openProfileMenu: function () {
      const u = state.user || {};
      openModal('Profil Akun', `
        <div class="flex flex-col gap-4">
          <div class="p-4 rounded-xl bg-surface-container-low space-y-1">
            <div class="font-title-md text-title-md text-on-surface">${esc(u.nama_lengkap)}</div>
            <div class="font-body-sm text-body-sm text-on-surface-variant">${esc(u.email)}</div>
            <div class="pt-2"><span class="px-3 py-1 rounded-full font-label-md text-label-md bg-secondary-container text-on-secondary-container">Peran: ${esc(u.role)}</span></div>
          </div>
          ${u.role === 'Admin' ? `<button type="button" onclick="App.closeModal(); App.go('admin')" class="w-full py-3 px-4 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg transition-colors cursor-pointer">Buka Panel Kontrol Admin</button>` : ''}
          <button type="button" onclick="App.logout()" class="w-full py-3 px-4 rounded-lg bg-error-container text-on-error-container hover:opacity-90 font-label-lg text-label-lg transition-opacity cursor-pointer">Keluar dari Akun</button>
        </div>
      `);
    },
    setPaketFilter: function (f) { state.paketFilter = f; renderDashboard(document.getElementById('app')); },
    openUpgradeModal: function () {
      const set = (state.dashData && state.dashData.settings) || {};
      openModal('Upgrade ke Akun Pro', `
        <div class="flex flex-col gap-4">
          <div class="bg-primary-fixed/40 rounded-xl p-4 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="font-body-sm text-body-sm text-on-primary-fixed">Biaya Aktivasi</span>
              <span class="font-title-lg text-title-lg text-on-primary-fixed">${esc(set.HARGA_PRO || 'Rp 99.000 / 6 Bulan')}</span>
            </div>
            <div class="pt-1 flex flex-col gap-1">
              <span class="font-label-md text-label-md text-on-primary-fixed-variant">Tujuan Transfer Bank / QRIS</span>
              <span class="font-mono-score text-mono-score text-on-primary-fixed">${esc(set.INFO_REKENING_PRO || 'BCA 7410 8829 14 a.n. PT Simulasi Edukasi Nusantara')}</span>
            </div>
          </div>
          <form onsubmit="App.submitUpgrade(event)" class="flex flex-col gap-4">
            <label for="upg-file" class="bg-surface-container-low hover:bg-surface-container rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors">
              <span class="material-symbols-outlined text-secondary text-[32px]">cloud_upload</span>
              <span class="font-label-lg text-label-lg text-on-surface" id="upg-file-label">Unggah Bukti Transfer</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">Format JPG, PNG, atau PDF (Maks. 2MB)</span>
              <input type="file" id="upg-file" accept="image/*,.pdf" class="hidden" onchange="document.getElementById('upg-file-label').textContent = (this.files && this.files[0]) ? this.files[0].name : 'Unggah Bukti Transfer'" />
            </label>
            <div class="flex flex-col gap-1.5">
              <label class="font-label-md text-label-md text-on-surface-variant" for="upg-note">Catatan Pengirim (Nama Rekening / Waktu Transfer)</label>
              <input type="text" id="upg-note" required placeholder="Contoh: BCA a.n. Budi Santoso" class="w-full bg-surface-container-low rounded-lg px-4 py-2.5 font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container transition-colors" />
            </div>
            <button type="submit" class="w-full bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg py-3 px-4 rounded-lg shadow-sm transition-colors cursor-pointer">
              Kirim Bukti Aktivasi
            </button>
          </form>
        </div>
      `);
    },
    submitUpgrade: async function (e) {
      e.preventDefault();
      const fileInput = document.getElementById('upg-file');
      const note = document.getElementById('upg-note').value;
      const send = async function (b64, mime, fname) {
        try {
          await ApiClient.call('peserta.requestUpgrade', { fileBase64: b64, mimeType: mime, fileName: fname, catatan: note });
          closeModal();
          toast('Pengajuan upgrade terkirim, menunggu verifikasi admin', 'success');
          go('dashboard');
        } catch (err) { toast(err.message, 'error'); }
      };
      if (fileInput.files && fileInput.files[0]) {
        const f = fileInput.files[0];
        if (f.size > 2.2 * 1024 * 1024) return toast('Ukuran berkas maksimal 2MB', 'warning');
        const reader = new FileReader();
        reader.onload = function () { send(reader.result, f.type, f.name); };
        reader.readAsDataURL(f);
      } else {
        send('', '', '');
      }
    },
    confirmStartExam: function (paketId) {
      const p = (state.dashData && state.dashData.paket || []).find(function (x) { return x.paket_id === paketId; });
      if (!p) return;
      openModal('Mulai Simulasi CAT', `
        <div class="flex flex-col gap-4">
          <div class="font-title-lg text-title-lg text-on-surface">${esc(p.nama_paket)}</div>
          <div class="grid grid-cols-2 gap-2.5 font-mono-score text-mono-score">
            <div class="p-3 rounded-lg bg-surface-container-low">Durasi: <strong class="text-on-surface">${p.durasi_menit} menit</strong></div>
            <div class="p-3 rounded-lg bg-surface-container-low">Jumlah: <strong class="text-on-surface">${p.jumlah_soal} soal</strong></div>
            <div class="p-3 rounded-lg bg-surface-container-low col-span-2">Passing Grade: <strong class="text-on-surface">TWK ${p.pg_twk} • TIU ${p.pg_tiu} • TKP ${p.pg_tkp}</strong></div>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant">Waktu langsung berjalan saat ujian dimulai dan jawaban tersimpan otomatis di peramban Anda.</p>
          <button type="button" onclick="App.startExamNow('${esc(paketId)}')" class="w-full bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg py-3 px-4 rounded-lg shadow-sm transition-colors cursor-pointer">
            Mulai Kerjakan Sekarang
          </button>
        </div>
      `);
    },
    startExamNow: async function (paketId) {
      closeModal();
      try {
        const data = await ApiClient.call('peserta.startExam', { paket_id: paketId });
        const durMs = Number(data.paket.durasi_menit || 15) * 60 * 1000;
        state.exam = {
          paket: data.paket,
          soal: data.soal,
          answers: {},
          doubtful: {},
          idx: 0,
          startedAt: data.waktu_mulai || new Date().toISOString(),
          endAt: Date.now() + durMs
        };
        saveExamLocal();
        go('exam');
      } catch (err) { toast(err.message, 'error'); }
    },
    selectAnswer: function (soalId, opt) {
      if (!state.exam) return;
      state.exam.answers[soalId] = opt;
      saveExamLocal();
      renderExamRoom(document.getElementById('app'));
    },
    toggleDoubtful: function (soalId) {
      if (!state.exam) return;
      if (state.exam.doubtful[soalId]) delete state.exam.doubtful[soalId];
      else state.exam.doubtful[soalId] = true;
      saveExamLocal();
      renderExamRoom(document.getElementById('app'));
    },
    moveSoal: function (delta) {
      if (!state.exam) return;
      const next = state.exam.idx + delta;
      if (next >= 0 && next < state.exam.soal.length) {
        state.exam.idx = next;
        saveExamLocal();
        renderExamRoom(document.getElementById('app'));
      }
    },
    jumpSoal: function (i) {
      if (!state.exam) return;
      state.exam.idx = i;
      state.mobileNavSheetOpen = false;
      saveExamLocal();
      renderExamRoom(document.getElementById('app'));
    },
    toggleMobileNavSheet: function (open) {
      state.mobileNavSheetOpen = !!open;
      renderExamRoom(document.getElementById('app'));
    },
    confirmFinishExam: function () {
      if (!state.exam) return;
      const total = state.exam.soal.length;
      const dijawab = Object.keys(state.exam.answers).length;
      const kosong = total - dijawab;
      openModal('Akhiri Sesi Ujian?', `
        <div class="flex flex-col gap-4">
          <div class="p-4 rounded-xl bg-surface-container-low font-mono-score text-mono-score space-y-1">
            <div>Terjawab: <strong class="text-secondary">${dijawab} / ${total} soal</strong></div>
            <div>Belum Dijawab: <strong class="${kosong > 0 ? 'text-error' : 'text-secondary'}">${kosong} soal</strong></div>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            Pastikan seluruh jawaban telah diperiksa. Setelah dikumpulkan, jawaban tidak dapat diubah dan skor TWK, TIU, TKP langsung dihitung.
          </p>
          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="App.closeModal()" class="px-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors cursor-pointer">
              Kembali ke Ujian
            </button>
            <button type="button" onclick="App.closeModal(); App.finishExam()" class="px-4 py-2.5 rounded-lg bg-error text-on-error font-label-lg text-label-lg hover:opacity-90 transition-opacity cursor-pointer">
              Ya, Selesai Sekarang
            </button>
          </div>
        </div>
      `);
    },
    finishExam: submitExamNow,
    setResultTab: function (t) { state.resultTab = t; renderResult(document.getElementById('app')); mountResultCharts(); },
    toggleAccordion: function (i) { state.openAccordion[i] = !state.openAccordion[i]; renderResult(document.getElementById('app')); mountResultCharts(); }
  };
})();
