/**
 * ============================================================================
 * SimulasiTKD Pro — js/app.js
 * Core SPA Controller (0ms Instant Routing, Unslop Redline Polish)
 * Screens: Landing & Auth | Dashboard Peserta | Ruang Ujian CAT | Evaluasi & Peringkat | Admin
 * ============================================================================
 */

const App = (function () {
  const EXAM_STORAGE_KEY = 'simtkd_active_exam_v1';

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
      lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    }
  }

  function toast(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'bg-[#0E3B2C] text-white border-[#09291E]',
      error: 'bg-[#991B1B] text-white border-[#7F1D1D]',
      warning: 'bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]',
      info: 'bg-white text-[#11181C] border-[#E4E7E6]'
    };
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast-item px-4 py-3 rounded-lg border shadow-sm text-xs font-medium flex items-center gap-2 ' + (colors[type] || colors.info);
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function openModal(title, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bottom-sheet-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-[#E4E7E6] space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between gap-4">
            <h3 class="font-heading font-semibold text-base text-[#11181C]">${esc(title)}</h3>
            <button type="button" onclick="App.closeModal()" class="w-8 h-8 rounded-lg hover:bg-[#EFF1F0] text-[#687076] inline-flex items-center justify-center transition-colors duration-150">
              <i data-lucide="x" class="w-4 h-4"></i>
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
  // SHARED PARTICIPANT NAVBAR (Quiet Chrome, Z-40 Sticky Safe)
  // ==========================================================================
  function renderNavbar(active) {
    const u = state.user;
    return `
      <header class="h-16 bg-white/95 backdrop-blur-md border-b border-[#E4E7E6] sticky top-0 z-40 no-print">
        <div class="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <button type="button" onclick="App.go('${u ? 'dashboard' : 'landing'}')" class="inline-flex items-center gap-2 font-heading font-semibold text-[#11181C] text-base tracking-[-0.01em]">
            <span class="w-7 h-7 rounded-md bg-[#0E3B2C] text-white flex items-center justify-center shrink-0">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </span>
            <span>SimulasiTKD Pro</span>
          </button>

          <nav class="hidden md:flex items-center gap-6 text-sm text-[#4B5358]">
            ${u ? `
              <button type="button" onclick="App.go('dashboard')" class="transition-colors duration-150 ${active === 'dashboard' ? 'text-[#11181C] font-medium' : 'hover:text-[#11181C]'}">Paket simulasi</button>
              <button type="button" onclick="App.go('result')" class="transition-colors duration-150 ${active === 'result' ? 'text-[#11181C] font-medium' : 'hover:text-[#11181C]'}">Evaluasi &amp; peringkat</button>
              ${u.role === 'Admin' ? `<button type="button" onclick="App.go('admin')" class="text-[#166E48] font-medium hover:underline">Panel admin</button>` : ''}
            ` : `
              <a href="#pilar" class="hover:text-[#11181C] transition-colors duration-150">Materi</a>
              <a href="#cara-kerja" class="hover:text-[#11181C] transition-colors duration-150">Alur latihan</a>
              <a href="#auth-section" class="hover:text-[#11181C] transition-colors duration-150">Akses akun</a>
            `}
          </nav>

          <div class="flex items-center gap-3">
            ${u ? `
              <button type="button" onclick="App.openProfileMenu()" class="h-9 pl-2 pr-3 rounded-lg border border-[#E4E7E6] bg-white hover:bg-[#EFF1F0] inline-flex items-center gap-2 transition-colors duration-150">
                <span class="w-6 h-6 rounded-md bg-[#0E3B2C] text-white text-xs font-medium flex items-center justify-center">${esc((u.nama_lengkap || 'U').slice(0, 1).toUpperCase())}</span>
                <span class="hidden sm:inline text-xs font-medium text-[#11181C] max-w-[120px] truncate">${esc(u.nama_lengkap)}</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-[#687076]"></i>
              </button>
            ` : `
              <a href="#auth-section" onclick="App.setAuthTab('login')" class="hidden sm:inline-flex items-center h-9 px-3 text-sm text-[#4B5358] hover:text-[#11181C] transition-colors duration-150">Masuk</a>
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-primary h-9 px-4 text-xs inline-flex items-center">Daftar gratis</a>
            `}
          </div>
        </div>
      </header>
    `;
  }

  // ==========================================================================
  // SCREEN 1: LANDING PAGE & AUTH
  // ==========================================================================
  function renderLanding(root) {
    root.innerHTML = `
      ${renderNavbar('landing')}
      <main class="flex-1 bg-white relative z-0 isolate">
        <!-- Hero Section: Asymmetric Split + Real CAT Workspace Window -->
        <section class="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-20 lg:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div class="lg:col-span-6 space-y-6">
            <div class="inline-flex items-center gap-2 text-xs font-mono-num text-[#687076]">
              <span class="w-2 h-2 rounded-full bg-[#166E48]"></span>
              <span>Standar SKD BKN · TWK, TIU, TKP${ApiClient.isDemoMode() ? ' · Mode pratinjau lokal' : ''}</span>
            </div>
            <h1 class="text-4xl sm:text-5xl font-heading font-medium leading-[1.08] tracking-[-0.02em] text-[#11181C]">
              Simulasi ujian CAT untuk seleksi CPNS, BUMN, dan Kedinasan
            </h1>
            <p class="text-base text-[#4B5358] leading-relaxed max-w-xl">
              Latih kecepatan menjawab 110 butir soal berwaktu nyata, ukur capaian ambang batas tiap subtes, dan pelajari pembahasan resmi per butir soal
            </p>
            <div class="flex flex-wrap items-center gap-3 pt-1">
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-primary h-11 px-5 text-sm inline-flex items-center gap-2">
                <span>Mulai latihan gratis</span>
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </a>
              <a href="#auth-section" onclick="App.setAuthTab('login')" class="btn-outline h-11 px-5 text-sm inline-flex items-center">
                Masuk akun
              </a>
            </div>
            <div class="grid grid-cols-3 gap-6 pt-6 border-t border-[#E4E7E6] max-w-md">
              <div>
                <div class="font-mono-num font-medium text-lg text-[#11181C]">110 butir</div>
                <div class="text-xs text-[#687076] mt-1">Komposisi SKD resmi</div>
              </div>
              <div>
                <div class="font-mono-num font-medium text-lg text-[#11181C]">100 menit</div>
                <div class="text-xs text-[#687076] mt-1">Hitung mundur presisi</div>
              </div>
              <div>
                <div class="font-mono-num font-medium text-lg text-[#11181C]">3 ambang</div>
                <div class="text-xs text-[#687076] mt-1">Evaluasi PG otomatis</div>
              </div>
            </div>
          </div>

          <!-- Right Product Preview: Real CAT Exam Sheet Window (Moment #1) -->
          <div class="lg:col-span-6">
            <div class="rounded-2xl bg-[#F6F7F6] p-4 sm:p-5 border border-[#E4E7E6] shadow-[0_8px_24px_rgba(0,0,0,0.06)] space-y-4">
              <!-- Window Header -->
              <div class="bg-white rounded-xl border border-[#E4E7E6] px-4 py-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="px-2 py-0.5 rounded-md bg-[#EAF3EE] text-[#0E3B2C] text-xs font-mono-num font-medium">TIU</span>
                  <span class="text-xs font-medium text-[#11181C] truncate">Tryout Nasional SKD #01</span>
                </div>
                <div class="px-2.5 py-1 rounded-md bg-[#EFF1F0] text-[#11181C] text-xs font-mono-num font-medium inline-flex items-center gap-1.5 shrink-0">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-[#687076]"></i>
                  <span>01:12:45</span>
                </div>
              </div>

              <!-- Question Body -->
              <div class="bg-white rounded-xl border border-[#E4E7E6] p-4 sm:p-5 space-y-4">
                <div class="flex items-center justify-between text-xs text-[#687076]">
                  <span class="font-mono-num text-[#11181C] font-medium">Soal 24 / 110</span>
                  <span>Penalaran analitis · Bobot +5</span>
                </div>
                <p class="text-sm text-[#11181C] leading-relaxed">
                  Lima peserta ujian duduk berjajar satu baris. Budi duduk tepat di sebelah Andi, tetapi tidak bersebelahan dengan Citra. Jika Dewi duduk di ujung kiri, pasangan yang duduk berdampingan adalah...
                </p>
                <div class="space-y-2 text-xs">
                  <div class="px-3 py-2.5 rounded-lg border border-[#E4E7E6] text-[#4B5358] flex items-center gap-3">
                    <span class="w-6 h-6 rounded-md bg-[#EFF1F0] text-[#11181C] font-mono-num font-medium flex items-center justify-center shrink-0">A</span>
                    <span>Andi dan Dewi</span>
                  </div>
                  <div class="px-3 py-2.5 rounded-lg border border-[#166E48] bg-[#EAF3EE] text-[#11181C] font-medium flex items-center gap-3">
                    <span class="w-6 h-6 rounded-md bg-[#0E3B2C] text-white font-mono-num font-medium flex items-center justify-center shrink-0">B</span>
                    <span>Budi dan Eko</span>
                  </div>
                  <div class="px-3 py-2.5 rounded-lg border border-[#E4E7E6] text-[#4B5358] flex items-center gap-3">
                    <span class="w-6 h-6 rounded-md bg-[#EFF1F0] text-[#11181C] font-mono-num font-medium flex items-center justify-center shrink-0">C</span>
                    <span>Citra dan Andi</span>
                  </div>
                </div>
              </div>

              <!-- Navigator Strip & Passing Grade Signature Bar -->
              <div class="bg-white rounded-xl border border-[#E4E7E6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-1.5 font-mono-num text-xs">
                  <span class="w-7 h-7 rounded-md bg-[#16A34A] text-white flex items-center justify-center">21</span>
                  <span class="w-7 h-7 rounded-md bg-[#16A34A] text-white flex items-center justify-center">22</span>
                  <span class="w-7 h-7 rounded-md bg-[#D97706] text-white flex items-center justify-center">23</span>
                  <span class="w-7 h-7 rounded-md bg-[#16A34A] text-white ring-2 ring-[#0E3B2C] ring-offset-1 flex items-center justify-center">24</span>
                  <span class="w-7 h-7 rounded-md bg-[#EFF1F0] text-[#4B5358] flex items-center justify-center">25</span>
                  <span class="w-7 h-7 rounded-md bg-[#EFF1F0] text-[#4B5358] flex items-center justify-center">26</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="px-2 py-0.5 rounded-md bg-[#E8F5EE] text-[#166534] font-medium">Lulus PG</span>
                  <span class="font-mono-num text-[#4B5358]">422 / 550</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4 Pilar Kelulusan -->
        <section id="pilar" class="bg-[#F6F7F6] py-16 lg:py-20 border-t border-[#E4E7E6]">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div class="space-y-1">
                <div class="text-xs font-medium text-[#166E48]">Materi terstruktur</div>
                <h2 class="text-2xl sm:text-3xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Empat komponen evaluasi ujian</h2>
              </div>
              <p class="text-sm text-[#4B5358] max-w-md">Setiap paket disusun mengikuti kisi-kisi terbaru lengkap dengan bobot penilaian resmi dan pembahasan per butir soal</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              ${[
                { code: 'TWK · PG 65', icon: 'landmark', title: 'Tes Wawasan Kebangsaan', desc: 'Nasionalisme, integritas, bela negara, dan pilar negara berbasis studi kasus penalaran.' },
                { code: 'TIU · PG 80', icon: 'calculator', title: 'Tes Intelegensia Umum', desc: 'Kemampuan verbal, numerik, deret angka, silogisme, dan analitis untuk ketepatan logika.' },
                { code: 'TKP · PG 166', icon: 'users', title: 'Tes Karakteristik Pribadi', desc: 'Pelayanan publik, jejaring kerja, sosial budaya, profesionalisme, dan anti-radikalisme berskala 1–5.' },
                { code: 'Rapor · PDF', icon: 'bar-chart-2', title: 'Analisis Ambang Batas', desc: 'Pemetaan skor subtes terhadap passing grade, tren percobaan, dan peringkat peserta nasional.' }
              ].map(function (c) {
                return `
                  <div class="card-stitch card-stitch-hover p-6 flex flex-col justify-between space-y-6">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between text-xs text-[#687076]">
                        <span class="font-mono-num">${c.code}</span>
                        <i data-lucide="${c.icon}" class="w-4 h-4 text-[#687076]"></i>
                      </div>
                      <h3 class="font-heading font-medium text-base text-[#11181C]">${c.title}</h3>
                      <p class="text-xs text-[#4B5358] leading-relaxed">${c.desc}</p>
                    </div>
                    <a href="#auth-section" class="inline-flex items-center gap-2 text-xs font-medium text-[#166E48] hover:text-[#0E3B2C] transition-colors duration-150">
                      <span>Mulai latihan</span>
                      <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </a>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </section>

        <!-- 3 Langkah + Dark CTA Panel -->
        <section id="cara-kerja" class="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20 space-y-12">
          <div class="space-y-1">
            <div class="text-xs font-medium text-[#166E48]">Alur latihan</div>
            <h2 class="text-2xl sm:text-3xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Tiga tahap persiapan terukur</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${[
              { n: '01', t: 'Buat akun latihan', d: 'Daftar menggunakan email atau Google untuk menyimpan riwayat pengerjaan dan membuka paket latihan dasar.' },
              { n: '02', t: 'Kerjakan simulasi berwaktu', d: 'Jawab soal dengan antarmuka CAT berwaktu nyata, penanda ragu-ragu, dan penyimpanan jawaban otomatis.' },
              { n: '03', t: 'Evaluasi skor dan pembahasan', d: 'Periksa rincian skor TWK, TIU, TKP terhadap ambang batas resmi serta pelajari pembahasan tiap soal.' }
            ].map(function (s) {
              return `<div class="p-6 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] space-y-3">
                <div class="font-mono-num text-xs font-medium text-[#687076]">${s.n}</div>
                <h3 class="font-heading font-medium text-base text-[#11181C]">${s.t}</h3>
                <p class="text-xs text-[#4B5358] leading-relaxed">${s.d}</p>
              </div>`;
            }).join('')}
          </div>

          <div class="rounded-2xl bg-[#0E3B2C] text-white p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div class="space-y-2 max-w-xl">
              <div class="text-xs font-mono-num text-white/70">Akses penuh paket simulasi</div>
              <h3 class="text-xl sm:text-2xl font-heading font-medium tracking-[-0.01em]">Buka seluruh paket tryout SKD, BUMN, dan pembahasan lengkap</h3>
              <p class="text-xs sm:text-sm text-white/75">Termasuk simulasi 110 soal penuh, kunci pembahasan tiap butir soal, rapor PDF, dan papan peringkat nasional</p>
            </div>
            <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-on-dark h-11 px-5 text-sm inline-flex items-center gap-2 shrink-0">
              <span>Daftar &amp; upgrade Pro</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </a>
          </div>
        </section>

        <!-- Auth Section (Proportioned Split + Max-Width Form Card) -->
        <section id="auth-section" class="bg-[#F6F7F6] py-16 lg:py-20 border-t border-[#E4E7E6]">
          <div class="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div class="md:col-span-6 space-y-4">
              <div class="text-xs font-medium text-[#166E48]">Akses peserta &amp; admin</div>
              <h2 class="text-2xl sm:text-3xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Masuk atau buat akun latihan</h2>
              <p class="text-sm text-[#4B5358] leading-relaxed">Simpan seluruh riwayat pengerjaan, pantau perkembangan skor TWK, TIU, dan TKP, serta buka pembahasan soal dari satu akun</p>
              ${ApiClient.isDemoMode() ? `
                <div class="p-4 rounded-xl bg-white border border-[#E4E7E6] text-xs space-y-2">
                  <div class="font-medium text-[#11181C]">Akun uji coba mode pratinjau lokal</div>
                  <div class="space-y-1 text-[#4B5358] font-mono-num">
                    <div>Peserta latihan: budi@demo.id / demo123</div>
                    <div>Peserta Pro: raka@demo.id / demo123</div>
                    <div>Administrator: admin@demo.id / admin123</div>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="md:col-span-6 w-full max-w-[440px] mx-auto md:ml-auto md:mr-0">
              <div class="card-stitch p-6 space-y-5">
                <div class="grid grid-cols-2 p-1 rounded-lg bg-[#EFF1F0] text-xs font-medium">
                  <button type="button" onclick="App.setAuthTab('login')" class="h-9 rounded-md transition-colors duration-150 ${state.authTab === 'login' ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">Masuk</button>
                  <button type="button" onclick="App.setAuthTab('register')" class="h-9 rounded-md transition-colors duration-150 ${state.authTab === 'register' ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">Daftar akun</button>
                </div>

                ${state.authTab !== 'emergency' ? `
                  <div id="google-oauth-wrap" class="hidden space-y-3">
                    <div id="google-signin-btn" class="flex justify-center"></div>
                    <div class="relative flex items-center py-1">
                      <div class="flex-grow border-t border-[#E4E7E6]"></div>
                      <span class="mx-3 text-xs text-[#687076]">atau gunakan email</span>
                      <div class="flex-grow border-t border-[#E4E7E6]"></div>
                    </div>
                  </div>
                ` : ''}

                ${state.authTab === 'login' ? `
                  <form onsubmit="App.handleLogin(event)" class="space-y-4">
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Email</label>
                      <input type="email" id="auth-email" required placeholder="nama@email.com" value="${ApiClient.isDemoMode() ? 'budi@demo.id' : ''}" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Kata sandi</label>
                      <input type="password" id="auth-pass" required placeholder="Kata sandi akun" value="${ApiClient.isDemoMode() ? 'demo123' : ''}" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-primary w-full h-11 text-sm">Masuk ke dashboard</button>
                    <div class="text-center">
                      <button type="button" onclick="App.setAuthTab('emergency')" class="text-xs text-[#687076] hover:text-[#11181C] underline transition-colors duration-150">Akses darurat administrator</button>
                    </div>
                  </form>
                ` : state.authTab === 'register' ? `
                  <form onsubmit="App.handleRegister(event)" class="space-y-3">
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Nama lengkap</label>
                      <input type="text" id="reg-nama" required placeholder="Nama sesuai identitas" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Email</label>
                      <input type="email" id="reg-email" required placeholder="nama@email.com" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Nomor WhatsApp</label>
                      <input type="tel" id="reg-wa" required placeholder="0812xxxxxxxx" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Kata sandi (minimal 6 karakter)</label>
                      <input type="password" id="reg-pass" required minlength="6" placeholder="Buat kata sandi" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-primary w-full h-11 text-sm">Buat akun latihan</button>
                  </form>
                ` : `
                  <form onsubmit="App.handleEmergencyLogin(event)" class="space-y-4">
                    <div class="p-3 rounded-lg bg-[#FEF3C7] text-[#92400E] text-xs">Login darurat memakai kredensial Script Properties (maksimal 5 percobaan)</div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Username darurat</label>
                      <input type="text" id="em-user" required value="darurat" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#4B5358]">Sandi darurat</label>
                      <input type="password" id="em-pass" required placeholder="Sandi dari log setup" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" class="btn-primary w-full h-11 text-sm">Masuk panel admin</button>
                    <div class="text-center">
                      <button type="button" onclick="App.setAuthTab('login')" class="text-xs text-[#687076] hover:text-[#11181C] underline">Kembali ke login reguler</button>
                    </div>
                  </form>
                `}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer class="bg-white border-t border-[#E4E7E6] py-6 text-center text-xs text-[#687076]">
        © 2026 SimulasiTKD Pro · Platform simulasi CAT CPNS, BUMN, dan Kedinasan
      </footer>
    `;
    refreshIcons();
  }

  // ==========================================================================
  // SCREEN 2: DASHBOARD PESERTA & UPGRADE PRO
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

    root.innerHTML = `
      ${renderNavbar('dashboard')}
      <main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8 flex-1">
        <!-- Context Page Title (No Greeting Headline) -->
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-xs text-[#687076]">
              <span>${esc(u.nama_lengkap || 'Peserta')}</span>
              <span>·</span>
              <span class="px-2 py-0.5 rounded-md font-medium ${isPro ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#4B5358]'}">
                ${isPro ? 'Akun Pro' : 'Akun Latihan'}
              </span>
              ${isPending ? `<span class="px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] font-medium">Menunggu verifikasi admin</span>` : ''}
            </div>
            <h1 class="text-2xl sm:text-3xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">Ringkasan latihan</h1>
          </div>
          ${!isPro ? `
            <button type="button" onclick="App.openUpgradeModal()" class="btn-primary h-10 px-4 text-xs inline-flex items-center gap-2 self-start sm:self-auto">
              <span>${isPending ? 'Status pengajuan Pro' : 'Upgrade ke Akun Pro'}</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>

        <!-- 3 KPI Stat Cards (Numbers Only, Zero Decorative Icon Boxes) -->
        ${!d ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="skeleton h-28"></div><div class="skeleton h-28"></div><div class="skeleton h-28"></div></div>` : `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="card-stitch p-5 space-y-2">
              <div class="text-xs text-[#687076]">Simulasi diselesaikan</div>
              <div class="text-3xl font-mono-num font-medium text-[#11181C]">${d.kpi.tryoutSelesai}</div>
              <div class="text-xs text-[#4B5358]">Tersimpan pada riwayat akun</div>
            </div>
            <div class="card-stitch p-5 space-y-2">
              <div class="text-xs text-[#687076]">Skor tertinggi</div>
              <div class="text-3xl font-mono-num font-medium text-[#11181C]">${d.kpi.skorTertinggi}</div>
              <div class="text-xs text-[#4B5358]">Dari batas maksimum 550 poin</div>
            </div>
            <div class="card-stitch p-5 space-y-2">
              <div class="text-xs text-[#687076]">Percobaan terakhir</div>
              ${d.kpi.terakhir ? `
                <div>
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">
                    ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'Lulus ambang batas' : 'Belum lulus ambang batas'}
                  </span>
                </div>
                <div class="text-xs font-mono-num text-[#4B5358]">TWK ${d.kpi.terakhir.skor_twk} · TIU ${d.kpi.terakhir.skor_tiu} · TKP ${d.kpi.terakhir.skor_tkp}</div>
              ` : `<div class="text-sm font-medium text-[#687076] pt-1">Belum ada percobaan</div>`}
            </div>
          </div>
        `}

        <!-- Banner Upgrade Pro (Quiet Tinted Surface) -->
        ${!isPro ? `
          <div class="rounded-xl bg-white border border-[#E4E7E6] p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="space-y-1 max-w-2xl">
              <div class="text-xs font-medium text-[#166E48]">Akses penuh simulasi</div>
              <h2 class="font-heading font-medium text-base text-[#11181C]">Buka seluruh paket tryout penuh dan pembahasan tiap soal</h2>
              <p class="text-xs text-[#4B5358]">Akses paket SKD CPNS, BUMN, dan Kedinasan 110 soal beserta pembahasan resmi dan rapor PDF</p>
            </div>
            <button type="button" onclick="App.openUpgradeModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2 shrink-0">
              <span>${isPending ? 'Lihat status verifikasi' : 'Pelajari paket Pro'}</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
          </div>
        ` : ''}

        <!-- Katalog Paket Tryout -->
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div class="space-y-1">
              <div class="text-xs font-medium text-[#166E48]">Katalog simulasi</div>
              <h2 class="text-xl font-heading font-medium text-[#11181C]">Pilih paket ujian CAT</h2>
            </div>
            <div class="inline-flex items-center p-1 rounded-lg bg-[#EFF1F0] gap-1 self-start sm:self-auto">
              ${['Semua', 'Latihan', 'Pro'].map(function (f) {
                const label = f === 'Semua' ? 'Semua' : f === 'Latihan' ? 'Latihan gratis' : 'Paket Pro';
                const active = state.paketFilter === f;
                return `<button type="button" onclick="App.setPaketFilter('${f}')" class="h-8 px-3 rounded-md text-xs font-medium transition-colors duration-150 ${active ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">${label}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${pakets.map(function (p) {
              const locked = p.tier_akses === 'Pro' && !isPro;
              return `
                <div class="card-stitch card-stitch-hover p-6 flex flex-col justify-between space-y-6">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between text-xs">
                      <span class="px-2 py-0.5 rounded-md font-medium ${p.tier_akses === 'Latihan' ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#EFF1F0] text-[#4B5358]'}">
                        ${p.tier_akses === 'Latihan' ? 'Latihan gratis' : 'Paket Pro'}
                      </span>
                      <span class="text-[#687076] font-mono-num">${esc(p.kategori_label || 'SKD')}</span>
                    </div>
                    <h3 class="font-heading font-medium text-base text-[#11181C]">${esc(p.nama_paket)}</h3>
                    <p class="text-xs text-[#4B5358] leading-relaxed">${esc(p.deskripsi)}</p>
                    <div class="flex items-center gap-4 text-xs font-mono-num text-[#687076] pt-1">
                      <span class="inline-flex items-center gap-1.5"><i data-lucide="clock" class="w-4 h-4"></i> ${p.durasi_menit} menit</span>
                      <span class="inline-flex items-center gap-1.5"><i data-lucide="file-text" class="w-4 h-4"></i> ${p.jumlah_soal} soal</span>
                    </div>
                  </div>
                  ${locked ? `
                    <button type="button" onclick="App.openUpgradeModal()" class="btn-outline w-full h-10 text-xs inline-flex items-center justify-center gap-2">
                      <i data-lucide="lock" class="w-4 h-4 text-[#687076]"></i>
                      <span>Buka dengan Pro</span>
                    </button>
                  ` : `
                    <button type="button" onclick="App.confirmStartExam('${esc(p.paket_id)}')" class="btn-primary w-full h-10 text-xs inline-flex items-center justify-center gap-2">
                      <span>Mulai simulasi</span>
                      <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                  `}
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Riwayat Terakhir -->
        ${d && d.riwayat && d.riwayat.length ? `
          <div class="card-stitch p-6 space-y-4">
            <div class="flex items-center justify-between gap-4">
              <h3 class="font-heading font-medium text-base text-[#11181C]">Riwayat pengerjaan terakhir</h3>
              <button type="button" onclick="App.go('result')" class="inline-flex items-center gap-1.5 text-xs font-medium text-[#166E48] hover:text-[#0E3B2C]">
                <span>Evaluasi lengkap</span>
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </button>
            </div>
            <div class="divide-y divide-[#E4E7E6]">
              ${d.riwayat.slice(0, 5).map(function (r) {
                const ok = r.status_kelulusan === 'Lulus';
                return `
                  <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="space-y-1">
                      <div class="font-medium text-sm text-[#11181C]">${esc(r.nama_paket)}</div>
                      <div class="text-xs font-mono-num text-[#687076]">TWK ${r.skor_twk} · TIU ${r.skor_tiu} · TKP ${r.skor_tkp} · Total <span class="text-[#11181C] font-medium">${r.skor_total}</span></div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-1 rounded-md text-xs font-medium ${ok ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(r.status_kelulusan)}</span>
                      <button type="button" onclick="App.go('result', { hasil_id: '${esc(r.hasil_id)}' })" class="btn-outline h-8 px-3 text-xs">Rincian</button>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </main>
    `;
    refreshIcons();
  }

  // ==========================================================================
  // SCREEN 3: RUANG UJIAN CAT REAL-TIME
  // ==========================================================================
  function saveExamLocal() {
    if (state.exam) localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify(state.exam));
  }

  function renderExamRoom(root) {
    const ex = state.exam;
    if (!ex) return go('dashboard');
    const q = ex.soal[ex.idx];
    const total = ex.soal.length;
    const answeredCount = Object.keys(ex.answers).length;
    const isDoubtful = !!ex.doubtful[q.soal_id];
    const picked = ex.answers[q.soal_id] || '';
    const remSec = Math.max(0, Math.floor((ex.endAt - Date.now()) / 1000));
    const timerCls = remSec < 600 ? 'bg-[#FEE2E2] text-[#991B1B]' : remSec < 900 ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#EFF1F0] text-[#11181C]';

    const navTilesHtml = ex.soal.map(function (item, i) {
      const st = ex.doubtful[item.soal_id] ? 'doubtful' : ex.answers[item.soal_id] ? 'answered' : 'unanswered';
      const active = i === ex.idx ? 'active-tile' : '';
      return `<button type="button" onclick="App.jumpSoal(${i})" class="nav-tile ${st} ${active}">${i + 1}</button>`;
    }).join('');

    root.innerHTML = `
      <!-- Sticky Top Bar -->
      <header class="h-16 bg-white border-b border-[#E4E7E6] sticky top-0 z-40">
        <div class="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 rounded-lg bg-[#0E3B2C] text-white hidden sm:flex items-center justify-center shrink-0">
              <i data-lucide="file-check-2" class="w-4 h-4"></i>
            </span>
            <span class="font-heading font-medium text-sm sm:text-base text-[#11181C] truncate">${esc(ex.paket.nama_paket)}</span>
            <span class="px-2 py-0.5 rounded-md bg-[#EAF3EE] text-[#0E3B2C] text-xs font-mono-num font-medium shrink-0">${esc(q.subtes)}</span>
          </div>

          <div id="exam-timer-pill" class="h-9 px-3 rounded-lg font-mono-num font-medium text-xs sm:text-sm inline-flex items-center gap-2 ${timerCls}">
            <i data-lucide="clock" class="w-4 h-4"></i>
            <span id="exam-timer-text">${fmtTimer(remSec)}</span>
          </div>

          <button type="button" onclick="App.confirmFinishExam()" class="h-9 px-3 rounded-lg bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 text-xs font-medium inline-flex items-center gap-2 shrink-0 transition-colors duration-150">
            <i data-lucide="flag" class="w-4 h-4 hidden sm:inline"></i>
            <span>Selesai<span class="hidden sm:inline"> ujian</span></span>
          </button>
        </div>
      </header>

      <!-- Mobile Question Navigator Trigger -->
      <div class="lg:hidden px-4 pt-4">
        <button type="button" onclick="App.toggleMobileNavSheet(true)" class="w-full h-11 px-4 rounded-xl bg-white border border-[#E4E7E6] flex items-center justify-between text-xs font-medium">
          <span class="inline-flex items-center gap-2 text-[#11181C]">
            <i data-lucide="layout-grid" class="w-4 h-4 text-[#687076]"></i>
            <span>Navigasi soal</span>
            <span class="px-2 py-0.5 rounded-md bg-[#E8F5EE] text-[#166534] font-mono-num">${answeredCount}/${total}</span>
          </span>
          <span class="text-[#687076] inline-flex items-center gap-1">
            <span>Buka kisi</span>
            <i data-lucide="chevron-down" class="w-4 h-4"></i>
          </span>
        </button>
      </div>

      <!-- Main Split Content -->
      <main class="max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        <!-- Left 8 Cols: Question Card -->
        <div class="lg:col-span-8 space-y-4">
          <div class="card-stitch p-5 sm:p-6 space-y-5">
            <div class="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-[#E4E7E6]">
              <div class="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#11181C]">
                <span class="font-mono-num">Soal ${ex.idx + 1} / ${total}</span>
                <span class="text-[#687076]">·</span>
                <span class="px-2 py-0.5 rounded-md bg-[#EAF3EE] text-[#0E3B2C] text-xs font-medium">Subtes ${esc(q.subtes)}</span>
              </div>
              <span class="text-xs text-[#687076] font-mono-num">${esc(q.topik ? q.topik + ' · ' : '')}${q.subtes === 'TKP' ? 'Skala 1–5' : 'Benar +5'}</span>
            </div>

            <div class="text-sm sm:text-base text-[#11181C] leading-relaxed max-w-[70ch] whitespace-pre-line">${esc(q.pertanyaan)}</div>

            ${q.image_url ? `<div class="rounded-xl overflow-hidden border border-[#E4E7E6] bg-[#F6F7F6] p-3"><img src="${esc(q.image_url)}" alt="Ilustrasi soal nomor ${ex.idx + 1}" class="max-h-72 mx-auto object-contain rounded-lg" /></div>` : ''}

            <div class="space-y-2 pt-1">
              ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
                const txt = q.opsi && q.opsi[opt];
                if (!txt) return '';
                const sel = picked === opt;
                return `
                  <div onclick="App.selectAnswer('${esc(q.soal_id)}', '${opt}')" class="cat-option ${sel ? 'selected' : ''} px-4 py-3 flex items-center gap-3">
                    <span class="opt-badge w-7 h-7 rounded-md border border-[#E4E7E6] bg-[#EFF1F0] text-[#11181C] text-xs font-mono-num font-medium flex items-center justify-center shrink-0">${opt}</span>
                    <span class="text-sm text-[#11181C] leading-snug flex-1">${esc(txt)}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Desktop Action Bar -->
          <div class="hidden lg:flex card-stitch p-4 items-center justify-between">
            <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled class="opacity-40 cursor-not-allowed btn-outline h-10 px-4 text-xs inline-flex items-center gap-2"' : 'class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2"'}>
              <i data-lucide="arrow-left" class="w-4 h-4"></i>
              <span>Sebelumnya</span>
            </button>
            <div class="flex items-center gap-3">
              <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="h-10 px-4 rounded-lg text-xs font-medium inline-flex items-center gap-2 transition-colors duration-150 ${isDoubtful ? 'bg-[#D97706] text-white' : 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'}">
                <i data-lucide="bookmark" class="w-4 h-4"></i>
                <span>${isDoubtful ? 'Ragu-ragu aktif' : 'Tandai ragu-ragu'}</span>
              </button>
              <button type="button" onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="btn-primary h-10 px-5 text-xs inline-flex items-center gap-2">
                <span>${ex.idx < total - 1 ? 'Simpan & lanjut' : 'Selesai & kumpulkan'}</span>
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Right 4 Cols: Desktop Question Navigator -->
        <aside class="hidden lg:block lg:col-span-4 card-stitch p-5 sticky top-20 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-heading font-medium text-sm text-[#11181C]">Navigasi soal</h3>
            <span class="px-2 py-0.5 rounded-md bg-[#EAF3EE] text-[#166534] text-xs font-mono-num font-medium">${answeredCount} / ${total}</span>
          </div>
          <div class="grid grid-cols-6 gap-2 max-h-[384px] overflow-y-auto p-1">${navTilesHtml}</div>
          <div class="flex items-center justify-between pt-3 border-t border-[#E4E7E6] text-xs text-[#4B5358]">
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#16A34A]"></span> Dijawab</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#D97706]"></span> Ragu-ragu</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-[#EFF1F0] border border-[#E4E7E6]"></span> Kosong</span>
          </div>
        </aside>
      </main>

      <!-- Mobile Sticky Bottom Action Bar -->
      <div class="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E4E7E6] px-4 py-3 z-30 flex items-center justify-between gap-2">
        <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled' : ''} class="btn-outline h-10 px-3 text-xs inline-flex items-center gap-1 disabled:opacity-40">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
          <span>Sebelumnya</span>
        </button>
        <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="h-10 px-3 rounded-lg text-xs font-medium ${isDoubtful ? 'bg-[#D97706] text-white' : 'bg-[#FEF3C7] text-[#92400E]'}">Ragu</button>
        <button type="button" onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="btn-primary flex-1 h-10 px-4 text-xs inline-flex items-center justify-center gap-1.5">
          <span>${ex.idx < total - 1 ? 'Simpan & lanjut' : 'Kumpulkan'}</span>
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Mobile Bottom Sheet Drawer -->
      ${state.mobileNavSheetOpen ? `
        <div class="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bottom-sheet-backdrop" onclick="if(event.target===this) App.toggleMobileNavSheet(false)">
          <div class="bg-white bottom-sheet-panel p-5 max-h-[75vh] flex flex-col space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-heading font-medium text-base text-[#11181C]">Kisi nomor soal (${answeredCount}/${total})</h3>
              <button type="button" onclick="App.toggleMobileNavSheet(false)" class="w-8 h-8 rounded-lg bg-[#EFF1F0] inline-flex items-center justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="grid grid-cols-6 gap-2 overflow-y-auto p-1">${navTilesHtml}</div>
          </div>
        </div>
      ` : ''}
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
  // SCREEN 4: EVALUASI, GRAFIK, PEMBAHASAN & PERINGKAT
  // ==========================================================================
  function renderResultSkeleton(root) {
    root.innerHTML = `${renderNavbar('result')}<main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6"><div class="skeleton h-36"></div><div class="grid grid-cols-1 lg:grid-cols-12 gap-4"><div class="lg:col-span-8 skeleton h-64"></div><div class="lg:col-span-4 skeleton h-64"></div></div></main>`;
  }

  function renderResult(root) {
    const d = state.resultData;
    if (!d) return go('dashboard');
    const h = d.hasil;
    const p = d.paket || {};
    const pgTwk = Number(p.pg_twk || 65), pgTiu = Number(p.pg_tiu || 80), pgTkp = Number(p.pg_tkp || 166);
    const lulus = h.status_kelulusan === 'Lulus';

    // Signature Detail: Subtest card with exact Passing Grade threshold marker
    const subCard = function (label, val, pg, maxVal) {
      const ok = Number(val) >= pg;
      const pct = Math.min(100, Math.round((Number(val) / maxVal) * 100));
      const pgPct = Math.min(100, Math.round((pg / maxVal) * 100));
      const delta = Number(val) - pg;
      const deltaStr = (delta >= 0 ? '+' : '') + delta + ' dari PG ' + pg;
      return `
        <div class="p-4 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] space-y-3">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-[#11181C]">${label}</span>
            <span class="px-2 py-0.5 rounded-md font-medium ${ok ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${ok ? 'Lulus' : 'Belum lulus'}</span>
          </div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-2xl font-mono-num font-medium text-[#11181C]">${val}</span>
            <span class="text-xs font-mono-num text-[#687076]">${deltaStr}</span>
          </div>
          <div class="pg-track">
            <div class="pg-fill ${ok ? 'bg-[#0E3B2C]' : 'bg-[#DC2626]'}" style="width:${pct}%"></div>
            <span class="pg-marker" style="left:${pgPct}%" title="Passing grade ${pg}"></span>
          </div>
        </div>`;
    };

    root.innerHTML = `
      ${renderNavbar('result')}
      <main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 flex-1">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="space-y-1">
            <div class="text-xs font-medium text-[#166E48]">Hasil evaluasi simulasi</div>
            <h1 class="text-2xl sm:text-3xl font-heading font-medium text-[#11181C] tracking-[-0.015em]">${esc(h.nama_paket)}</h1>
            <p class="text-xs font-mono-num text-[#687076]">Durasi pengerjaan: ${fmtDurasi(h.durasi_pakai_detik)}</p>
          </div>
          <div class="flex items-center gap-2 no-print">
            <button type="button" onclick="window.print()" class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="download" class="w-4 h-4 text-[#687076]"></i>
              <span>Unduh rapor PDF</span>
            </button>
            <button type="button" onclick="App.go('dashboard')" class="btn-primary h-10 px-4 text-xs">Kembali ke paket</button>
          </div>
        </div>

        <!-- Score Summary Panel -->
        <div class="card-stitch p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div class="lg:col-span-4 space-y-2">
            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${lulus ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">
              ${lulus ? 'Lulus ambang batas' : 'Belum lulus ambang batas'}
            </span>
            <div class="text-xs text-[#687076] pt-1">Total skor akhir</div>
            <div class="flex items-baseline gap-2">
              <span class="text-5xl font-mono-num font-semibold text-[#11181C] tracking-[-0.02em]">${h.skor_total}</span>
              <span class="text-sm font-mono-num text-[#687076]">/ 550</span>
            </div>
          </div>
          <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${subCard('TWK', h.skor_twk, pgTwk, 150)}
            ${subCard('TIU', h.skor_tiu, pgTiu, 175)}
            ${subCard('TKP', h.skor_tkp, pgTkp, 225)}
          </div>
        </div>

        <!-- Asymmetric Chart Hierarchy (8 cols Main Chart + 4 cols Trend) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div class="card-stitch p-6 lg:col-span-8 flex flex-col justify-between space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-heading font-medium text-base text-[#11181C]">Perbandingan skor terhadap ambang batas</h3>
                <p class="text-xs text-[#687076]">Skor perolehan subtes dibandingkan standar kelulusan minimum BKN</p>
              </div>
              <div class="flex items-center gap-4 text-xs text-[#687076]">
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#0E3B2C]"></span> Skor Anda</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#D6DBD9]"></span> Ambang PG</span>
              </div>
            </div>
            <div class="h-64"><canvas id="chartResultSubtes"></canvas></div>
          </div>
          <div class="card-stitch p-6 lg:col-span-4 flex flex-col justify-between space-y-4">
            <div>
              <h3 class="font-heading font-medium text-base text-[#11181C]">Tren total skor</h3>
              <p class="text-xs text-[#687076]">Riwayat skor antar percobaan</p>
            </div>
            <div class="h-64"><canvas id="chartResultTrend"></canvas></div>
          </div>
        </div>

        <!-- Tabs Pembahasan & Papan Peringkat -->
        <div class="space-y-4">
          <div class="inline-flex items-center p-1 rounded-lg bg-[#EFF1F0] gap-1 no-print">
            <button type="button" onclick="App.setResultTab('pembahasan')" class="h-9 px-4 rounded-md text-xs font-medium transition-colors duration-150 ${state.resultTab === 'pembahasan' ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">Pembahasan soal</button>
            <button type="button" onclick="App.setResultTab('peringkat')" class="h-9 px-4 rounded-md text-xs font-medium transition-colors duration-150 ${state.resultTab === 'peringkat' ? 'bg-white text-[#11181C] shadow-sm' : 'text-[#687076] hover:text-[#11181C]'}">Papan peringkat (${state.leaderboard.length})</button>
          </div>

          ${state.resultTab === 'pembahasan' ? `
            <div class="space-y-3">
              ${d.pembahasan.filter(function (x) { return !x.locked; }).map(function (item, i) {
                const open = !!state.openAccordion[i];
                const badgeCls = item.poin >= 5 ? 'bg-[#E8F5EE] text-[#166534]' : item.poin > 0 ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#FEE2E2] text-[#991B1B]';
                return `
                  <div class="card-stitch p-5 space-y-3">
                    <div onclick="App.toggleAccordion(${i})" class="flex items-start justify-between gap-3 cursor-pointer">
                      <div class="flex items-start gap-3">
                        <span class="w-7 h-7 rounded-md bg-[#EFF1F0] text-[#11181C] text-xs font-mono-num font-medium flex items-center justify-center shrink-0">${item.nomor_urut}</span>
                        <div>
                          <div class="text-xs text-[#687076]">${esc(item.subtes)}${item.topik ? ' · ' + esc(item.topik) : ''}</div>
                          <div class="text-sm font-medium text-[#11181C] mt-1">${esc(item.pertanyaan)}</div>
                        </div>
                      </div>
                      <span class="px-2.5 py-1 rounded-md text-xs font-mono-num font-medium shrink-0 ${badgeCls}">${item.subtes === 'TKP' ? '+' + item.poin + ' poin' : (item.benar ? '+5 benar' : '0 salah')}</span>
                    </div>
                    ${open ? `
                      <div class="pl-10 space-y-3 pt-3 border-t border-[#E4E7E6]">
                        <div class="flex flex-wrap gap-2 text-xs font-mono-num">
                          <span class="px-2.5 py-1 rounded-md bg-[#F6F7F6] border border-[#E4E7E6] text-[#4B5358]">Jawaban Anda: <strong class="font-medium text-[#11181C]">${esc(item.jawaban_user || 'Kosong')}</strong></span>
                          <span class="px-2.5 py-1 rounded-md bg-[#E8F5EE] text-[#166534]">Kunci / bobot: <strong class="font-medium">${esc(item.kunci_atau_bobot)}</strong></span>
                        </div>
                        <div class="p-4 rounded-lg bg-[#F6F7F6] text-xs text-[#4B5358] leading-relaxed">
                          <div class="font-medium text-[#11181C] mb-1">Pembahasan resmi</div>
                          ${esc(item.pembahasan || 'Pembahasan belum tersedia')}
                        </div>
                      </div>
                    ` : ''}
                  </div>`;
              }).join('')}

              ${d.lockedCount > 0 ? `
                <div class="card-stitch p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
                  <div class="flex items-start gap-3">
                    <span class="w-10 h-10 rounded-lg bg-[#EFF1F0] flex items-center justify-center text-[#4B5358] shrink-0"><i data-lucide="lock" class="w-4 h-4"></i></span>
                    <div>
                      <div class="font-heading font-medium text-base text-[#11181C]">${d.lockedCount} pembahasan soal lainnya terkunci</div>
                      <div class="text-xs text-[#4B5358] mt-0.5">Upgrade ke Akun Pro untuk membuka seluruh kunci pembahasan dan paket simulasi 110 soal</div>
                    </div>
                  </div>
                  <button type="button" onclick="App.openUpgradeModal()" class="btn-primary h-10 px-4 text-xs shrink-0">Upgrade ke Akun Pro</button>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="card-stitch p-5 overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="border-b border-[#E4E7E6] text-xs text-[#687076]">
                    <th class="py-3 px-4 font-medium">Peringkat</th>
                    <th class="py-3 px-4 font-medium">Peserta</th>
                    <th class="py-3 px-3 text-right font-medium">TWK</th>
                    <th class="py-3 px-3 text-right font-medium">TIU</th>
                    <th class="py-3 px-3 text-right font-medium">TKP</th>
                    <th class="py-3 px-3 text-right font-medium">Total</th>
                    <th class="py-3 px-4 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.leaderboard.map(function (lb) {
                    const ok = lb.status_kelulusan === 'Lulus';
                    return `<tr class="border-b border-[#E4E7E6] last:border-b-0 hover:bg-[#F6F7F6] transition-colors duration-150">
                      <td class="py-3 px-4 font-mono-num text-xs text-[#687076]">#${lb.rank}</td>
                      <td class="py-3 px-4 font-medium text-[#11181C]">${esc(lb.nama_user)}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${lb.skor_twk}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${lb.skor_tiu}</td>
                      <td class="py-3 px-3 text-right font-mono-num text-[#4B5358]">${lb.skor_tkp}</td>
                      <td class="py-3 px-3 text-right font-mono-num font-medium text-[#11181C]">${lb.skor_total}</td>
                      <td class="py-3 px-4 text-right"><span class="px-2 py-0.5 rounded-md text-xs font-medium ${ok ? 'bg-[#E8F5EE] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(lb.status_kelulusan)}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </main>
    `;
    refreshIcons();
  }

  function mountResultCharts() {
    if (!state.resultData || !window.Chart) return;
    const h = state.resultData.hasil;
    const p = state.resultData.paket || {};
    const monoFont = { family: "'IBM Plex Mono', monospace", size: 11 };
    const gridColor = 'rgba(17, 24, 28, 0.06)';
    const tickColor = '#687076';

    const ctx1 = document.getElementById('chartResultSubtes');
    if (ctx1) {
      resultCharts.push(new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['TWK', 'TIU', 'TKP'],
          datasets: [
            { label: 'Skor Anda', data: [h.skor_twk, h.skor_tiu, h.skor_tkp], backgroundColor: '#0E3B2C', borderRadius: 4, barPercentage: 0.6 },
            { label: 'Ambang PG', data: [p.pg_twk || 65, p.pg_tiu || 80, p.pg_tkp || 166], backgroundColor: '#D6DBD9', borderRadius: 4, barPercentage: 0.6 }
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
            label: 'Total skor',
            data: tr.map(function (t) { return t.total; }),
            borderColor: '#0E3B2C',
            borderWidth: 2,
            backgroundColor: 'rgba(14, 59, 44, 0.06)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#0E3B2C'
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
          class="w-full h-10 px-4 rounded-lg border border-[#E4E7E6] bg-white hover:bg-[#EFF1F0] text-xs sm:text-sm font-medium text-[#11181C] inline-flex items-center justify-center gap-2 transition-colors duration-150">
          <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
          <span>Lanjutkan dengan Google (mode pratinjau)</span>
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
      openModal('Profil akun', `
        <div class="space-y-4 text-sm">
          <div class="p-4 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] space-y-1">
            <div class="font-medium text-base text-[#11181C]">${esc(u.nama_lengkap)}</div>
            <div class="text-xs text-[#687076]">${esc(u.email)}</div>
            <div class="pt-2"><span class="px-2 py-0.5 rounded-md text-xs font-medium bg-[#E8F5EE] text-[#166534]">Peran: ${esc(u.role)}</span></div>
          </div>
          ${u.role === 'Admin' ? `<button type="button" onclick="App.closeModal(); App.go('admin')" class="btn-primary w-full h-10 text-xs">Buka panel kontrol admin</button>` : ''}
          <button type="button" onclick="App.logout()" class="w-full h-10 rounded-lg bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 font-medium text-xs transition-colors duration-150">Keluar dari akun</button>
        </div>
      `);
    },
    setPaketFilter: function (f) { state.paketFilter = f; renderDashboard(document.getElementById('app')); },
    openUpgradeModal: function () {
      const set = (state.dashData && state.dashData.settings) || {};
      openModal('Upgrade ke Akun Pro', `
        <form onsubmit="App.submitUpgrade(event)" class="space-y-4 text-sm">
          <div class="p-4 rounded-xl bg-[#EAF3EE] text-[#0E3B2C] text-xs space-y-1">
            <div class="font-medium">Biaya aktivasi: ${esc(set.HARGA_PRO || 'Rp 99.000 / 6 bulan')}</div>
            <div>Tujuan transfer: <span class="font-mono-num font-medium">${esc(set.INFO_REKENING_PRO || 'BCA 7410 8829 14 a.n. PT Simulasi Edukasi Nusantara')}</span></div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Bukti transfer (JPG/PNG, maksimal 2MB)</label>
            <input type="file" id="upg-file" accept="image/*" class="mt-1 w-full text-xs p-3 rounded-lg border border-dashed border-[#D6DBD9] bg-[#F6F7F6]" />
          </div>
          <div>
            <label class="text-xs font-medium text-[#4B5358]">Catatan pengirim</label>
            <input type="text" id="upg-note" required placeholder="Contoh: BCA a.n. Budi Santoso" class="input-control mt-1 w-full" />
          </div>
          <button type="submit" class="btn-primary w-full h-10 text-xs">Kirim bukti aktivasi</button>
        </form>
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
      openModal('Mulai simulasi CAT', `
        <div class="space-y-4 text-sm">
          <div class="font-heading font-medium text-base text-[#11181C]">${esc(p.nama_paket)}</div>
          <div class="grid grid-cols-2 gap-2 text-xs font-mono-num">
            <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6]">Durasi: <strong class="font-medium text-[#11181C]">${p.durasi_menit} menit</strong></div>
            <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6]">Jumlah: <strong class="font-medium text-[#11181C]">${p.jumlah_soal} soal</strong></div>
            <div class="p-3 rounded-lg bg-[#F6F7F6] border border-[#E4E7E6] col-span-2">Ambang batas: <strong class="font-medium text-[#11181C]">TWK ${p.pg_twk} · TIU ${p.pg_tiu} · TKP ${p.pg_tkp}</strong></div>
          </div>
          <p class="text-xs text-[#4B5358] leading-relaxed">Waktu langsung berjalan saat ujian dimulai dan jawaban tersimpan otomatis di peramban Anda.</p>
          <button type="button" onclick="App.startExamNow('${esc(paketId)}')" class="btn-primary w-full h-11 text-sm">Mulai kerjakan</button>
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
      openModal('Kumpulkan jawaban ujian', `
        <div class="space-y-4 text-sm">
          <div class="p-4 rounded-xl bg-[#F6F7F6] border border-[#E4E7E6] text-xs font-mono-num space-y-1">
            <div>Terjawab: <strong class="font-medium text-[#166534]">${dijawab} / ${total}</strong></div>
            <div>Kosong: <strong class="font-medium ${kosong > 0 ? 'text-[#DC2626]' : 'text-[#166534]'}">${kosong}</strong></div>
          </div>
          <p class="text-xs text-[#4B5358] leading-relaxed">Setelah dikumpulkan, jawaban tidak dapat diubah dan skor TWK, TIU, TKP langsung dihitung.</p>
          <div class="flex gap-2">
            <button type="button" onclick="App.closeModal()" class="btn-outline flex-1 h-10 text-xs">Periksa lagi</button>
            <button type="button" onclick="App.closeModal(); App.finishExam()" class="btn-primary flex-1 h-10 text-xs">Kumpulkan</button>
          </div>
        </div>
      `);
    },
    finishExam: submitExamNow,
    setResultTab: function (t) { state.resultTab = t; renderResult(document.getElementById('app')); mountResultCharts(); },
    toggleAccordion: function (i) { state.openAccordion[i] = !state.openAccordion[i]; renderResult(document.getElementById('app')); mountResultCharts(); }
  };
})();
