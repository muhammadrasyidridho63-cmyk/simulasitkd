/**
 * ============================================================================
 * SimulasiTKD Pro — js/app.js
 * Core SPA Controller (0ms Instant Routing, Stitch Visual Fidelity, Mobile-First)
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
  let isSubmittingExam = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'bg-[#0E3B2C] text-white border-[#22A06B]',
      error: 'bg-[#991B1B] text-white border-[#DC2626]',
      warning: 'bg-[#FEF9C3] text-[#854D0E] border-[#D97706]',
      info: 'bg-white text-[#111827] border-[#E2E8F0]'
    };
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast-item px-4 py-3 rounded-2xl border shadow-lg text-xs font-semibold flex items-center gap-2 ' + (colors[type] || colors.info);
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function openModal(title, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bottom-sheet-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <h3 class="font-heading font-bold text-lg text-[#111827]">${esc(title)}</h3>
            <button onclick="App.closeModal()" class="p-1.5 rounded-full hover:bg-[#F7FAF8] text-[#64748B]"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div>${bodyHtml}</div>
        </div>
      </div>`;
    if (window.lucide) lucide.createIcons();
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
    return m + ' Menit ' + s + ' Detik';
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
        toast('Halaman khusus Administrator.', 'error');
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
        toast('Belum ada riwayat tryout. Silakan kerjakan simulasi terlebih dahulu.', 'info');
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
  // SHARED PARTICIPANT NAVBAR (Stitch Screen #1, #2, #4)
  // ==========================================================================
  function renderNavbar(active) {
    const u = state.user;
    return `
      <header class="h-16 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] sticky top-0 z-30 no-print">
        <div class="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <button onclick="App.go('${u ? 'dashboard' : 'landing'}')" class="flex items-center gap-2.5 font-heading font-bold text-[#0E3B2C] text-base">
            <span class="w-8 h-8 rounded-xl bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
            </span>
            <span>SimulasiTKD Pro</span>
          </button>

          <nav class="hidden md:flex items-center gap-7 text-sm font-medium text-[#4B5563]">
            ${u ? `
              <button onclick="App.go('dashboard')" class="${active === 'dashboard' ? 'text-[#0E3B2C] font-bold' : 'hover:text-[#0E3B2C]'}">Paket Tryout</button>
              <button onclick="App.go('result')" class="${active === 'result' ? 'text-[#0E3B2C] font-bold' : 'hover:text-[#0E3B2C]'}">Evaluasi &amp; Peringkat</button>
              ${u.role === 'Admin' ? `<button onclick="App.go('admin')" class="text-[#1F8A5B] font-bold hover:underline">Panel Admin</button>` : ''}
            ` : `
              <a href="#pilar" class="hover:text-[#0E3B2C]">Fitur</a>
              <a href="#cara-kerja" class="hover:text-[#0E3B2C]">Cara Kerja</a>
              <a href="#auth-section" class="hover:text-[#0E3B2C]">Masuk / Daftar</a>
            `}
          </nav>

          <div class="flex items-center gap-2.5">
            ${u ? `
              <button onclick="App.openProfileMenu()" class="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-[#E2E8F0] hover:bg-[#F7FAF8]">
                <span class="w-7 h-7 rounded-full bg-[#0E3B2C] text-white text-xs font-bold flex items-center justify-center">${esc((u.nama_lengkap || 'U').slice(0, 1).toUpperCase())}</span>
                <span class="hidden sm:inline text-xs font-semibold text-[#111827] max-w-[110px] truncate">${esc(u.nama_lengkap)}</span>
                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-[#64748B]"></i>
              </button>
            ` : `
              <a href="#auth-section" class="hidden sm:inline-flex px-4 py-2 text-xs font-semibold text-[#111827] hover:text-[#1F8A5B]">Masuk</a>
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-primary px-4 py-2 text-xs">Daftar Gratis</a>
            `}
          </div>
        </div>
      </header>
    `;
  }

  // ==========================================================================
  // SCREEN 1: LANDING PAGE & AUTH (Stitch Screen #1)
  // ==========================================================================
  function renderLanding(root) {
    root.innerHTML = `
      ${renderNavbar('landing')}
      <main class="flex-1 bg-white">
        <!-- Hero Section -->
        <section class="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16 lg:pt-16 lg:pb-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div class="lg:col-span-6 space-y-6">
            <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E8F5EE] text-[#1F8A5B] text-xs font-semibold">
              <span class="w-2 h-2 rounded-full bg-[#1F8A5B]"></span> Platform Tryout CAT TKD #1 ${ApiClient.isDemoMode() ? '• Mode Pratinjau Demo' : ''}
            </div>
            <h1 class="text-3xl sm:text-5xl font-heading font-extrabold leading-tight tracking-tight text-[#111827]">
              Simulasi CAT TKD <span class="text-[#1F8A5B]">untuk Masa Depan Pasti</span>
            </h1>
            <p class="text-sm sm:text-base text-[#4B5563] leading-relaxed max-w-xl">
              Persiapan ujian CPNS, BUMN, dan Kedinasan dengan sistem Computer Assisted Test (CAT) berstandar BKN. Latih kecepatan, ketepatan, dan pantau passing grade secara real-time.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-primary px-6 py-3.5 text-sm inline-flex items-center gap-2">
                Mulai Latihan Gratis <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </a>
              <a href="#auth-section" onclick="App.setAuthTab('login')" class="btn-outline px-6 py-3.5 text-sm">Masuk Akun</a>
            </div>
            <div class="grid grid-cols-3 gap-4 pt-4 max-w-md">
              <div>
                <div class="font-heading font-bold text-lg text-[#111827] tabular-nums">110 Soal</div>
                <div class="text-xs text-[#64748B]">Standar BKN</div>
              </div>
              <div>
                <div class="font-heading font-bold text-lg text-[#111827]">Skor Instan</div>
                <div class="text-xs text-[#64748B]">Real-Time PG</div>
              </div>
              <div>
                <div class="font-heading font-bold text-lg text-[#111827]">100%</div>
                <div class="text-xs text-[#64748B]">Mobile Friendly</div>
              </div>
            </div>
          </div>

          <!-- Right Phone Mockup (Stitch Screen #1) -->
          <div class="lg:col-span-6 relative flex justify-center">
            <div class="hero-glow absolute inset-0 rounded-full"></div>
            <div class="relative w-72 sm:w-80 bg-[#0E3B2C] p-3 rounded-[36px] shadow-2xl border-4 border-[#002419]">
              <div class="bg-white rounded-[26px] overflow-hidden">
                <div class="bg-[#0E3B2C] text-white px-4 py-3.5 flex items-center justify-between">
                  <div>
                    <div class="text-[10px] text-emerald-200">Simulasi TKD #01</div>
                    <div class="font-heading font-bold text-sm">Soal 24 / 110</div>
                  </div>
                  <div class="px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold tabular-nums">01:12:45</div>
                </div>
                <div class="p-4 space-y-3">
                  <span class="inline-block px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#0E3B2C] text-[10px] font-bold">TIU • Penalaran Analitis</span>
                  <p class="text-xs text-[#111827] leading-relaxed">Lima peserta ujian CPNS duduk berjajar. Budi duduk di sebelah Andi, namun tidak bersebelahan dengan Citra...</p>
                  <div class="space-y-2 text-xs">
                    <div class="p-2.5 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0]">A. Andi dan Dewi</div>
                    <div class="p-2.5 rounded-xl bg-[#E8F5EE] border-2 border-[#1F8A5B] font-semibold text-[#0E3B2C]">B. Budi dan Eko</div>
                    <div class="p-2.5 rounded-xl bg-[#F7FAF8] border border-[#E2E8F0]">C. Citra dan Andi</div>
                  </div>
                </div>
              </div>
              <div class="absolute -bottom-4 -right-4 bg-white rounded-2xl px-4 py-2.5 shadow-xl border border-[#E2E8F0] flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center"><i data-lucide="check-circle-2" class="w-4 h-4"></i></span>
                <div>
                  <div class="text-xs font-bold text-[#111827]">Lulus Passing Grade</div>
                  <div class="text-[11px] text-[#64748B] tabular-nums">Skor Total: 432 / 550</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4 Pilar Kelulusan -->
        <section id="pilar" class="bg-[#F7FAF8] py-16">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div class="text-xs font-bold uppercase tracking-wider text-[#1F8A5B]">Materi Terstruktur</div>
                <h2 class="text-2xl sm:text-3xl font-heading font-bold text-[#111827] mt-1">Fokus Pada 4 Pilar Kelulusan</h2>
              </div>
              <p class="text-xs sm:text-sm text-[#4B5563] max-w-md">Setiap paket soal dirancang mengikuti kisi-kisi terbaru dengan pembahasan mendalam dan analisis skor otomatis.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              ${[
                { icon: 'landmark', title: 'Tes Wawasan Kebangsaan (TWK)', desc: 'Nasionalisme, integritas, bela negara, dan pilar negara dengan studi kasus penalaran HOTS.' },
                { icon: 'calculator', title: 'Tes Intelegensia Umum (TIU)', desc: 'Kemampuan verbal, numerik, deret angka, silogisme, serta figural untuk melatih logika cepat.' },
                { icon: 'heart-handshake', title: 'Tes Karakteristik Pribadi (TKP)', desc: 'Pelayanan publik, jejaring kerja, sosial budaya, TIK, dan anti-radikalisme berskor 1–5.' },
                { icon: 'bar-chart-2', title: 'Analisis Passing Grade', desc: 'Grafik evaluasi sub-tes, peringkat nasional, dan rekomendasi materi yang perlu ditingkatkan.' }
              ].map(function (c) {
                return `
                  <div class="card-stitch card-stitch-hover p-6 flex flex-col justify-between space-y-5">
                    <div class="space-y-3">
                      <div class="w-11 h-11 rounded-2xl bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="${c.icon}" class="w-5 h-5"></i></div>
                      <h3 class="font-heading font-bold text-base text-[#111827]">${c.title}</h3>
                      <p class="text-xs text-[#4B5563] leading-relaxed">${c.desc}</p>
                    </div>
                    <a href="#auth-section" class="inline-flex items-center gap-2 text-xs font-bold text-[#0E3B2C] hover:text-[#1F8A5B]">
                      Coba Sekarang <span class="w-5 h-5 rounded-full bg-[#1F8A5B] text-white inline-flex items-center justify-center"><i data-lucide="arrow-right" class="w-3 h-3"></i></span>
                    </a>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </section>

        <!-- 3 Langkah Mudah + Dark CTA Banner -->
        <section id="cara-kerja" class="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-12">
          <div class="text-center space-y-2">
            <div class="text-xs font-bold uppercase tracking-wider text-[#1F8A5B]">Cara Kerja</div>
            <h2 class="text-2xl sm:text-3xl font-heading font-bold">Mulai Simulasi dalam 3 Langkah Mudah</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            ${[
              { n: '1', t: '1. Daftar Akun Latihan', d: 'Buat akun gratis dalam hitungan detik untuk mengakses paket tryout pemula dan dashboard progres.' },
              { n: '2', t: '2. Kerjakan Simulasi CAT', d: 'Rasakan pengalaman ujian CAT BKN sesungguhnya lengkap dengan timer hitung mundur dan navigasi soal.' },
              { n: '3', t: '3. Evaluasi & Upgrade Pro', d: 'Lihat skor real-time, pelajari pembahasan lengkap, dan buka akses seluruh paket tryout premium.' }
            ].map(function (s) {
              return `<div class="p-6 rounded-3xl bg-[#F7FAF8] border border-[#E2E8F0] text-center space-y-2.5">
                <div class="w-10 h-10 mx-auto rounded-full bg-[#E8F5EE] text-[#1F8A5B] font-heading font-bold flex items-center justify-center">${s.n}</div>
                <h3 class="font-heading font-bold text-sm">${s.t}</h3>
                <p class="text-xs text-[#4B5563] leading-relaxed">${s.d}</p>
              </div>`;
            }).join('')}
          </div>

          <div class="rounded-[28px] bg-[#0E3B2C] text-white p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div class="space-y-2 max-w-xl">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-emerald-200 text-xs font-semibold">Akses Penuh Tanpa Batas</span>
              <h3 class="text-2xl sm:text-3xl font-heading font-bold">Siap Raih Skor Tertinggi di Ujian CAT Tahun Ini?</h3>
              <p class="text-xs sm:text-sm text-emerald-100/80">Dapatkan akses ke paket tryout terupdate, analisis passing grade mendalam, dan peringkat nasional.</p>
            </div>
            <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-accent px-6 py-3.5 text-sm inline-flex items-center gap-2 shrink-0">
              Upgrade ke Akun Pro <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </a>
          </div>
        </section>

        <!-- Auth Section -->
        <section id="auth-section" class="bg-[#F7FAF8] py-16 border-t border-[#E2E8F0]">
          <div class="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div class="lg:col-span-6 space-y-4">
              <div class="text-xs font-bold uppercase tracking-wider text-[#1F8A5B]">Akses Peserta &amp; Admin</div>
              <h2 class="text-2xl sm:text-3xl font-heading font-bold text-[#111827]">Masuk atau Buat Akun Latihan Sekarang</h2>
              <p class="text-sm text-[#4B5563] leading-relaxed">Simpan seluruh riwayat tryout, pantau grafik perkembangan skor TWK, TIU, dan TKP, serta akses pembahasan soal kapan saja.</p>
              ${ApiClient.isDemoMode() ? `
                <div class="p-4 rounded-2xl bg-white border border-[#E2E8F0] text-xs space-y-1.5">
                  <div class="font-bold text-[#0E3B2C]">⚡ Akun Uji Coba Cepat (Mode Demo Lokal):</div>
                  <div>• <b>Peserta Latihan:</b> <code>budi@demo.id</code> / <code>demo123</code></div>
                  <div>• <b>Peserta Pro:</b> <code>raka@demo.id</code> / <code>demo123</code></div>
                  <div>• <b>Administrator:</b> <code>admin@demo.id</code> / <code>admin123</code></div>
                </div>
              ` : ''}
            </div>

            <div class="lg:col-span-6">
              <div class="card-stitch p-6 sm:p-7 space-y-5">
                <div class="grid grid-cols-2 p-1 rounded-full bg-[#F7FAF8] border border-[#E2E8F0] text-xs font-semibold">
                  <button onclick="App.setAuthTab('login')" class="py-2.5 rounded-full ${state.authTab === 'login' ? 'bg-white text-[#0E3B2C] shadow-sm' : 'text-[#64748B]'}">Masuk</button>
                  <button onclick="App.setAuthTab('register')" class="py-2.5 rounded-full ${state.authTab === 'register' ? 'bg-white text-[#0E3B2C] shadow-sm' : 'text-[#64748B]'}">Daftar Akun Latihan</button>
                </div>

                ${state.authTab !== 'emergency' ? `
                  <div id="google-oauth-wrap" class="hidden space-y-3">
                    <div id="google-signin-btn" class="flex justify-center"></div>
                    <div class="relative flex items-center py-1">
                      <div class="flex-grow border-t border-[#E2E8F0]"></div>
                      <span class="mx-3 text-[11px] font-medium text-[#64748B]">atau lanjutkan dengan email</span>
                      <div class="flex-grow border-t border-[#E2E8F0]"></div>
                    </div>
                  </div>
                ` : ''}

                ${state.authTab === 'login' ? `
                  <form onsubmit="App.handleLogin(event)" class="space-y-4">
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Email</label>
                      <input type="email" id="auth-email" required placeholder="nama@email.com" value="${ApiClient.isDemoMode() ? 'budi@demo.id' : ''}" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Kata Sandi</label>
                      <input type="password" id="auth-pass" required placeholder="Masukkan kata sandi" value="${ApiClient.isDemoMode() ? 'demo123' : ''}" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-primary w-full py-3.5 text-sm">Masuk ke Dashboard</button>
                    <div class="text-center">
                      <button type="button" onclick="App.setAuthTab('emergency')" class="text-[11px] text-[#64748B] hover:text-[#0E3B2C] underline">Akses Darurat Administrator</button>
                    </div>
                  </form>
                ` : state.authTab === 'register' ? `
                  <form onsubmit="App.handleRegister(event)" class="space-y-3.5">
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Nama Lengkap</label>
                      <input type="text" id="reg-nama" required placeholder="Nama sesuai identitas" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Email</label>
                      <input type="email" id="reg-email" required placeholder="nama@email.com" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Nomor WhatsApp (Aktif)</label>
                      <input type="tel" id="reg-wa" required placeholder="0812xxxxxxxx" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Kata Sandi (Min. 6 Karakter)</label>
                      <input type="password" id="reg-pass" required minlength="6" placeholder="Buat kata sandi" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-primary w-full py-3.5 text-sm">Buat Akun Latihan Gratis</button>
                  </form>
                ` : `
                  <form onsubmit="App.handleEmergencyLogin(event)" class="space-y-4">
                    <div class="p-3 rounded-xl bg-[#FEF9C3] text-[#854D0E] text-xs">Login darurat menggunakan kredensial Script Properties (maks. 5x percobaan).</div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Username Darurat</label>
                      <input type="text" id="em-user" required value="darurat" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <div>
                      <label class="text-xs font-semibold text-[#4B5563]">Sandi Darurat</label>
                      <input type="password" id="em-pass" required placeholder="Masukkan sandi dari log setup" class="mt-1 w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#F7FAF8] text-sm" />
                    </div>
                    <button type="submit" class="btn-primary w-full py-3.5 text-sm">Masuk Panel Admin</button>
                    <div class="text-center"><button type="button" onclick="App.setAuthTab('login')" class="text-xs text-[#64748B] underline">Kembali ke Login Biasa</button></div>
                  </form>
                `}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer class="bg-white border-t border-[#E2E8F0] py-6 text-center text-xs text-[#64748B]">
        © 2026 SimulasiTKD Pro. Platform Simulasi CAT CPNS, BUMN &amp; Kedinasan.
      </footer>
    `;
    if (window.lucide) lucide.createIcons();
  }

  // ==========================================================================
  // SCREEN 2: DASHBOARD PESERTA & UPGRADE PRO (Stitch Screen #2)
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
      <main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-7 flex-1">
        <!-- Header Sapaan & Badges -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span class="uppercase tracking-wider text-[#64748B]">Dashboard Peserta</span>
            <span class="px-3 py-1 rounded-full ${isPro ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF9C3] text-[#854D0E]'}">
              • ${isPro ? 'Akun Pro Aktif' : 'Akun Latihan'}
            </span>
            ${isPending ? `<span class="px-3 py-1 rounded-full bg-[#FEF9C3] text-[#854D0E] inline-flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> Menunggu Verifikasi Admin</span>` : ''}
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-extrabold text-[#111827]">Selamat Datang, ${esc(u.nama_lengkap || 'Peserta')}</h1>
          <p class="text-sm text-[#4B5563]">Pantau progres simulasi CAT Anda dan tingkatkan kesiapan menghadapi seleksi CPNS, BUMN, dan Kedinasan.</p>
        </div>

        <!-- Banner Upgrade Pro (untuk Akun Latihan) -->
        ${!isPro ? `
          <div class="rounded-[24px] bg-[#E8F5EE] border border-[#CBEAD9] p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-2xl bg-[#0E3B2C] text-white flex items-center justify-center shrink-0">
                <i data-lucide="award" class="w-6 h-6"></i>
              </div>
              <div>
                <div class="text-[11px] font-bold uppercase tracking-wider text-[#1F8A5B]">Akses Penuh Simulasi CAT</div>
                <h2 class="font-heading font-bold text-lg text-[#111827]">Buka Seluruh Tryout Penuh &amp; Pembahasan</h2>
                <p class="text-xs sm:text-sm text-[#4B5563] mt-0.5">Dapatkan akses ke seluruh paket tryout SKD &amp; BUMN terbaru, pembahasan detail tiap soal, serta peringkat nasional real-time.</p>
              </div>
            </div>
            <button onclick="App.openUpgradeModal()" class="btn-accent px-5 py-3 text-xs sm:text-sm inline-flex items-center gap-2 shrink-0">
              ${isPending ? 'Lihat Status Upgrade' : 'Upgrade ke Akun Pro'} <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
          </div>
        ` : ''}

        <!-- 3 KPI Cards -->
        ${!d ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="skeleton h-28"></div><div class="skeleton h-28"></div><div class="skeleton h-28"></div></div>` : `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="card-stitch p-5 flex items-center justify-between">
              <div>
                <div class="text-xs font-medium text-[#64748B]">Tryout Selesai</div>
                <div class="text-3xl font-heading font-bold tabular-nums mt-1">${d.kpi.tryoutSelesai}</div>
                <div class="text-xs text-[#1F8A5B] mt-1">Riwayat tersimpan otomatis</div>
              </div>
              <div class="w-11 h-11 rounded-2xl bg-[#E8F5EE] text-[#1F8A5B] flex items-center justify-center"><i data-lucide="trending-up" class="w-5 h-5"></i></div>
            </div>
            <div class="card-stitch p-5 flex items-center justify-between">
              <div>
                <div class="text-xs font-medium text-[#64748B]">Skor Tertinggi</div>
                <div class="text-3xl font-heading font-bold tabular-nums mt-1">${d.kpi.skorTertinggi}</div>
                <div class="text-xs text-[#64748B] mt-1">Dari maksimal 550 poin</div>
              </div>
              <div class="w-11 h-11 rounded-2xl bg-[#E8F5EE] text-[#0E3B2C] flex items-center justify-center"><i data-lucide="target" class="w-5 h-5"></i></div>
            </div>
            <div class="card-stitch p-5">
              <div class="text-xs font-medium text-[#64748B]">Status Kelulusan Terakhir</div>
              ${d.kpi.terakhir ? `
                <div class="mt-2">
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">
                    ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? '✓ Lulus Passing Grade' : '✕ Belum Lulus PG'}
                  </span>
                </div>
                <div class="text-xs text-[#4B5563] mt-2 tabular-nums">TWK ${d.kpi.terakhir.skor_twk} • TIU ${d.kpi.terakhir.skor_tiu} • TKP ${d.kpi.terakhir.skor_tkp}</div>
              ` : `<div class="text-sm font-semibold text-[#64748B] mt-3">Belum ada percobaan</div>`}
            </div>
          </div>
        `}

        <!-- Katalog Paket Tryout -->
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div class="text-xs font-bold uppercase tracking-wider text-[#1F8A5B]">Katalog Simulasi</div>
              <h2 class="text-xl sm:text-2xl font-heading font-bold">Pilih Paket Tryout CAT</h2>
            </div>
            <div class="flex items-center gap-2">
              ${['Semua', 'Latihan', 'Pro'].map(function (f) {
                const label = f === 'Semua' ? 'Semua Paket' : f === 'Latihan' ? 'Latihan Gratis' : 'Paket Pro';
                const active = state.paketFilter === f;
                return `<button onclick="App.setPaketFilter('${f}')" class="px-4 py-2 rounded-full text-xs font-semibold ${active ? 'bg-[#0E3B2C] text-white' : 'bg-white border border-[#E2E8F0] text-[#4B5563]'}">${label}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            ${pakets.map(function (p) {
              const locked = p.tier_akses === 'Pro' && !isPro;
              return `
                <div class="card-stitch card-stitch-hover p-6 flex flex-col justify-between space-y-5">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between text-xs">
                      <span class="px-3 py-1 rounded-full font-bold ${p.tier_akses === 'Latihan' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#475569]'}">
                        ${locked ? '🔒 ' : ''}${p.tier_akses === 'Latihan' ? 'Latihan Gratis' : 'Paket Pro'}
                      </span>
                      <span class="text-[#64748B] font-semibold">${esc(p.kategori_label || 'SKD')}</span>
                    </div>
                    <h3 class="font-heading font-bold text-lg text-[#111827]">${esc(p.nama_paket)}</h3>
                    <p class="text-xs text-[#4B5563] leading-relaxed">${esc(p.deskripsi)}</p>
                    <div class="flex items-center gap-4 text-xs text-[#4B5563] pt-1">
                      <span class="inline-flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5 text-[#1F8A5B]"></i> ${p.durasi_menit} Menit</span>
                      <span class="inline-flex items-center gap-1"><i data-lucide="file-text" class="w-3.5 h-3.5 text-[#1F8A5B]"></i> ${p.jumlah_soal} Soal</span>
                    </div>
                  </div>
                  ${locked ? `
                    <button onclick="App.openUpgradeModal()" class="w-full py-3 rounded-full bg-[#E8F5EE] text-[#0E3B2C] font-heading font-bold text-xs inline-flex items-center justify-center gap-2 hover:bg-[#D4EFE0]">
                      <i data-lucide="lock" class="w-3.5 h-3.5"></i> Buka dengan Pro
                    </button>
                  ` : `
                    <button onclick="App.confirmStartExam('${esc(p.paket_id)}')" class="btn-primary w-full py-3 text-xs inline-flex items-center justify-center gap-2">
                      Mulai Simulasi <i data-lucide="play" class="w-3.5 h-3.5"></i>
                    </button>
                  `}
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Riwayat Terakhir -->
        ${d && d.riwayat && d.riwayat.length ? `
          <div class="card-stitch p-5 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-heading font-bold text-base">Riwayat Simulasi Terakhir</h3>
              <button onclick="App.go('result')" class="text-xs font-bold text-[#1F8A5B] hover:underline">Lihat Evaluasi Lengkap →</button>
            </div>
            <div class="divide-y divide-[#E2E8F0]">
              ${d.riwayat.slice(0, 5).map(function (r) {
                const ok = r.status_kelulusan === 'Lulus';
                return `
                  <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div class="font-semibold text-sm text-[#111827]">${esc(r.nama_paket)}</div>
                      <div class="text-xs text-[#64748B] tabular-nums">TWK ${r.skor_twk} • TIU ${r.skor_tiu} • TKP ${r.skor_tkp} • Total <b>${r.skor_total}</b></div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold ${ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(r.status_kelulusan)}</span>
                      <button onclick="App.go('result', { hasil_id: '${esc(r.hasil_id)}' })" class="btn-outline px-3 py-1.5 text-xs">Evaluasi</button>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </main>
    `;
    if (window.lucide) lucide.createIcons();
  }

  // ==========================================================================
  // SCREEN 3: RUANG UJIAN CAT REAL-TIME (Stitch Screen #3 + Mobile 390px)
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
    const timerCls = remSec < 600 ? 'bg-[#FEE2E2] text-[#991B1B]' : remSec < 900 ? 'bg-[#FEF9C3] text-[#854D0E]' : 'bg-[#F7FAF8] text-[#0E3B2C]';

    const navTilesHtml = ex.soal.map(function (item, i) {
      const st = ex.doubtful[item.soal_id] ? 'doubtful' : ex.answers[item.soal_id] ? 'answered' : 'unanswered';
      const active = i === ex.idx ? 'active-tile' : '';
      return `<button type="button" onclick="App.jumpSoal(${i})" class="nav-tile ${st} ${active}">${i + 1}</button>`;
    }).join('');

    root.innerHTML = `
      <!-- Sticky Top Bar -->
      <header class="h-16 bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div class="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 rounded-xl bg-[#0E3B2C] text-white hidden sm:flex items-center justify-center shrink-0"><i data-lucide="file-check-2" class="w-4 h-4"></i></span>
            <span class="font-heading font-bold text-sm sm:text-base truncate">${esc(ex.paket.nama_paket)}</span>
            <span class="px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#0E3B2C] text-[11px] font-bold shrink-0">${esc(q.subtes)}</span>
          </div>

          <div id="exam-timer-pill" class="px-3.5 py-1.5 rounded-full font-heading font-bold text-xs sm:text-sm tabular-nums inline-flex items-center gap-1.5 ${timerCls}">
            <i data-lucide="clock" class="w-4 h-4"></i> <span id="exam-timer-text">${fmtTimer(remSec)}</span>
          </div>

          <button onclick="App.confirmFinishExam()" class="px-3.5 py-2 rounded-full bg-[#FEE2E2] text-[#991B1B] hover:bg-red-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0">
            <i data-lucide="flag" class="w-3.5 h-3.5 hidden sm:inline"></i> Selesai<span class="hidden sm:inline"> Ujian</span>
          </button>
        </div>
      </header>

      <!-- Mobile Question Navigator Trigger (Sesuai Stitch Mobile 390px) -->
      <div class="lg:hidden px-4 pt-3">
        <button onclick="App.toggleMobileNavSheet(true)" class="w-full py-2.5 px-4 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-between text-xs font-bold shadow-sm">
          <span class="inline-flex items-center gap-2 text-[#111827]">
            <i data-lucide="layout-grid" class="w-4 h-4 text-[#1F8A5B]"></i> Navigasi Soal
            <span class="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534]">${answeredCount}/${total} Terisi</span>
          </span>
          <span class="text-[#64748B] inline-flex items-center gap-1">Buka Kisi <i data-lucide="chevron-down" class="w-4 h-4"></i></span>
        </button>
      </div>

      <!-- Main Split Content -->
      <main class="max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        <!-- Left 8 Cols: Question Card -->
        <div class="lg:col-span-8 space-y-4">
          <div class="card-stitch p-5 sm:p-7 space-y-5">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#111827]">
                <span>Soal No. <b class="tabular-nums">${ex.idx + 1}</b> dari ${total}</span>
                <span class="text-[#CBD5E1]">•</span>
                <span class="px-2.5 py-0.5 rounded-full bg-[#E8F5EE] text-[#1F8A5B] text-xs font-bold">Subtes ${esc(q.subtes)}</span>
              </div>
              <span class="text-xs text-[#64748B] font-medium">${esc(q.topik || '')} • ${q.subtes === 'TKP' ? 'Skala 1–5' : 'Bobot Benar: +5'}</span>
            </div>

            <div class="text-sm sm:text-base text-[#111827] leading-relaxed whitespace-pre-line">${esc(q.pertanyaan)}</div>

            ${q.image_url ? `<div class="rounded-2xl overflow-hidden border border-[#E2E8F0] bg-[#F7FAF8] p-2"><img src="${esc(q.image_url)}" alt="Ilustrasi Soal" class="max-h-72 mx-auto object-contain rounded-xl" /></div>` : ''}

            <div class="space-y-3 pt-1">
              ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
                const txt = q.opsi && q.opsi[opt];
                if (!txt) return '';
                const sel = picked === opt;
                return `
                  <div onclick="App.selectAnswer('${esc(q.soal_id)}', '${opt}')" class="cat-option ${sel ? 'selected' : ''} px-4 py-3 flex items-center gap-3.5">
                    <span class="opt-badge w-8 h-8 rounded-full border border-[#CBD5E1] bg-white text-[#111827] text-xs font-bold flex items-center justify-center shrink-0">${opt}</span>
                    <span class="text-sm text-[#111827] leading-snug flex-1">${esc(txt)}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Desktop Action Bar -->
          <div class="hidden lg:flex card-stitch p-4 items-center justify-between">
            <button onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled class="opacity-40 cursor-not-allowed btn-outline px-5 py-2.5 text-xs inline-flex items-center gap-2"' : 'class="btn-outline px-5 py-2.5 text-xs inline-flex items-center gap-2"'}>
              <i data-lucide="arrow-left" class="w-4 h-4"></i> Sebelumnya
            </button>
            <div class="flex items-center gap-3">
              <button onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="px-5 py-2.5 rounded-full text-xs font-bold inline-flex items-center gap-2 ${isDoubtful ? 'bg-[#D97706] text-white' : 'bg-[#FEF9C3] text-[#854D0E]'}">
                <i data-lucide="bookmark" class="w-4 h-4"></i> ${isDoubtful ? 'Ragu-ragu Aktif' : 'Tandai Ragu-ragu'}
              </button>
              <button onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="btn-primary px-6 py-2.5 text-xs inline-flex items-center gap-2">
                ${ex.idx < total - 1 ? 'Simpan & Lanjut' : 'Selesai & Kumpulkan'} <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Right 4 Cols: Desktop Question Navigator -->
        <aside class="hidden lg:block lg:col-span-4 card-stitch p-5 sticky top-20 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-heading font-bold text-base">Navigasi Soal</h3>
            <span class="px-3 py-1 rounded-full bg-[#E8F5EE] text-[#166534] text-xs font-bold tabular-nums">${answeredCount} / ${total} Dijawab</span>
          </div>
          <div class="grid grid-cols-6 gap-2 max-h-[380px] overflow-y-auto p-1">${navTilesHtml}</div>
          <div class="flex items-center justify-between pt-3 border-t border-[#E2E8F0] text-[11px] text-[#4B5563]">
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-[#16A34A]"></span> Dijawab</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-[#D97706]"></span> Ragu-ragu</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-[#F1F5F9] border border-[#CBD5E1]"></span> Belum</span>
          </div>
        </aside>
      </main>

      <!-- Mobile Sticky Bottom Action Bar (Sesuai Stitch Mobile 390px) -->
      <div class="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8F0] px-3 py-3 z-30 flex items-center justify-between gap-2 shadow-lg">
        <button onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled' : ''} class="px-3.5 py-2.5 rounded-full bg-[#F1F5F9] text-[#111827] text-xs font-bold disabled:opacity-40">‹ Sebelumnya</button>
        <button onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="px-3.5 py-2.5 rounded-full text-xs font-bold ${isDoubtful ? 'bg-[#D97706] text-white' : 'bg-[#FEF9C3] text-[#854D0E]'}">Ragu</button>
        <button onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="btn-primary flex-1 py-2.5 px-4 text-xs">${ex.idx < total - 1 ? 'Simpan & Lanjut ›' : 'Selesai ✓'}</button>
      </div>

      <!-- Mobile Bottom Sheet Drawer -->
      ${state.mobileNavSheetOpen ? `
        <div class="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bottom-sheet-backdrop" onclick="if(event.target===this) App.toggleMobileNavSheet(false)">
          <div class="bg-white bottom-sheet-panel p-5 max-h-[75vh] flex flex-col space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-heading font-bold text-base">Kisi-Kisi Nomor Soal (${answeredCount}/${total})</h3>
              <button onclick="App.toggleMobileNavSheet(false)" class="p-1.5 rounded-full bg-[#F7FAF8]"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="grid grid-cols-6 gap-2 overflow-y-auto p-1">${navTilesHtml}</div>
          </div>
        </div>
      ` : ''}
    `;
    if (window.lucide) lucide.createIcons();
  }

  function startExamCountdown() {
    stopExamTimer();
    state.examTimerId = setInterval(function () {
      if (!state.exam) return stopExamTimer();
      const rem = Math.floor((state.exam.endAt - Date.now()) / 1000);
      const el = document.getElementById('exam-timer-text');
      if (el) el.textContent = fmtTimer(rem);
      const pill = document.getElementById('exam-timer-pill');
      if (pill) {
        const cls = rem < 600 ? 'bg-[#FEE2E2] text-[#991B1B]' : rem < 900 ? 'bg-[#FEF9C3] text-[#854D0E]' : 'bg-[#F7FAF8] text-[#0E3B2C]';
        pill.className = 'px-3.5 py-1.5 rounded-full font-heading font-bold text-xs sm:text-sm tabular-nums inline-flex items-center gap-1.5 ' + cls;
      }
      if (rem <= 0) {
        stopExamTimer();
        toast('Waktu habis! Jawaban Anda otomatis dikumpulkan.', 'warning');
        submitExamNow();
      }
    }, 1000);
  }

  async function submitExamNow() {
    if (!state.exam || isSubmittingExam) return;
    isSubmittingExam = true;
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
      toast('Ujian selesai! Skor total Anda: ' + res.skor_total, 'success');
      go('result', { hasil_id: res.hasil_id });
    } catch (err) {
      toast('Gagal mengirim jawaban: ' + err.message, 'error');
    } finally {
      isSubmittingExam = false;
    }
  }

  // ==========================================================================
  // SCREEN 4: EVALUASI, GRAFIK, PEMBAHASAN & PERINGKAT (Stitch Screen #4)
  // ==========================================================================
  function renderResultSkeleton(root) {
    root.innerHTML = `${renderNavbar('result')}<main class="max-w-6xl mx-auto w-full px-4 py-8 space-y-5"><div class="skeleton h-40"></div><div class="grid grid-cols-1 md:grid-cols-2 gap-5"><div class="skeleton h-64"></div><div class="skeleton h-64"></div></div></main>`;
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
      return `
        <div class="p-4 rounded-2xl bg-[#F7FAF8] border border-[#E2E8F0] space-y-2">
          <div class="flex items-center justify-between text-xs font-bold">
            <span class="text-[#4B5563]">${label}</span>
            <span class="px-2 py-0.5 rounded-full ${ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${ok ? 'Lulus' : 'Belum'}</span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-heading font-extrabold tabular-nums">${val}</span>
            <span class="text-xs text-[#64748B]">vs PG ${pg}</span>
          </div>
          <div class="h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
            <div class="h-full rounded-full ${ok ? 'bg-[#16A34A]' : 'bg-[#DC2626]'}" style="width:${pct}%"></div>
          </div>
        </div>`;
    };

    root.innerHTML = `
      ${renderNavbar('result')}
      <main class="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6 flex-1">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F5EE] text-[#1F8A5B] text-[11px] font-bold">✓ HASIL EVALUASI CAT INSTAN</span>
            <h1 class="text-2xl sm:text-3xl font-heading font-extrabold mt-2">${esc(h.nama_paket)}</h1>
            <p class="text-xs text-[#64748B] mt-1">Durasi Pengerjaan: ${fmtDurasi(h.durasi_pakai_detik)}</p>
          </div>
          <div class="flex items-center gap-2 no-print">
            <button onclick="window.print()" class="btn-outline px-4 py-2.5 text-xs inline-flex items-center gap-2">
              <i data-lucide="download" class="w-4 h-4"></i> Unduh Rapor PDF
            </button>
            <button onclick="App.go('dashboard')" class="btn-primary px-4 py-2.5 text-xs">Dashboard</button>
          </div>
        </div>

        <!-- Hero Summary Card -->
        <div class="card-stitch p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div class="lg:col-span-4 space-y-2">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${lulus ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">
              ${lulus ? '✓ LULUS PASSING GRADE' : '✕ BELUM LULUS PASSING GRADE'}
            </span>
            <div class="text-[11px] font-bold uppercase tracking-wider text-[#64748B] pt-1">Total Skor Akhir</div>
            <div class="flex items-baseline gap-2">
              <span class="text-5xl font-heading font-extrabold tabular-nums text-[#0E3B2C]">${h.skor_total}</span>
              <span class="text-sm text-[#64748B]">/ 550 Maks</span>
            </div>
          </div>
          <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${subCard('TWK', h.skor_twk, pgTwk, 150)}
            ${subCard('TIU', h.skor_tiu, pgTiu, 175)}
            ${subCard('TKP', h.skor_tkp, pgTkp, 225)}
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="card-stitch p-5 space-y-2">
            <h3 class="font-heading font-bold text-base">Perbandingan Skor vs Passing Grade</h3>
            <p class="text-xs text-[#64748B]">Membandingkan perolehan skor Anda terhadap ambang batas resmi.</p>
            <div class="h-52 pt-2"><canvas id="chartResultSubtes"></canvas></div>
          </div>
          <div class="card-stitch p-5 space-y-2">
            <h3 class="font-heading font-bold text-base">Tren Perkembangan Skor</h3>
            <p class="text-xs text-[#64748B]">Grafik perkembangan total skor dari percobaan tryout Anda.</p>
            <div class="h-52 pt-2"><canvas id="chartResultTrend"></canvas></div>
          </div>
        </div>

        <!-- Tabs Pembahasan & Papan Peringkat -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 no-print">
            <button onclick="App.setResultTab('pembahasan')" class="px-5 py-2.5 rounded-full text-xs font-bold ${state.resultTab === 'pembahasan' ? 'bg-[#0E3B2C] text-white' : 'bg-white border border-[#E2E8F0] text-[#4B5563]'}">Pembahasan Soal</button>
            <button onclick="App.setResultTab('peringkat')" class="px-5 py-2.5 rounded-full text-xs font-bold ${state.resultTab === 'peringkat' ? 'bg-[#0E3B2C] text-white' : 'bg-white border border-[#E2E8F0] text-[#4B5563]'}">Papan Peringkat (${state.leaderboard.length})</button>
          </div>

          ${state.resultTab === 'pembahasan' ? `
            <div class="space-y-3">
              ${d.pembahasan.filter(function (x) { return !x.locked; }).map(function (item, i) {
                const open = !!state.openAccordion[i];
                const badgeCls = item.poin >= 5 ? 'bg-[#DCFCE7] text-[#166534]' : item.poin > 0 ? 'bg-[#FEF9C3] text-[#854D0E]' : 'bg-[#FEE2E2] text-[#991B1B]';
                return `
                  <div class="card-stitch p-5 space-y-3">
                    <div onclick="App.toggleAccordion(${i})" class="flex items-start justify-between gap-3 cursor-pointer">
                      <div class="flex items-start gap-3">
                        <span class="w-8 h-8 rounded-full bg-[#E8F5EE] text-[#0E3B2C] text-xs font-bold flex items-center justify-center shrink-0">${item.nomor_urut}</span>
                        <div>
                          <div class="text-[11px] font-bold uppercase text-[#1F8A5B]">${esc(item.subtes)} • ${esc(item.topik || '')}</div>
                          <div class="text-sm font-semibold text-[#111827] mt-0.5">${esc(item.pertanyaan)}</div>
                        </div>
                      </div>
                      <span class="px-3 py-1 rounded-full text-xs font-bold shrink-0 ${badgeCls}">${item.subtes === 'TKP' ? 'Poin +' + item.poin : (item.benar ? 'Benar (+5)' : 'Salah (0)')}</span>
                    </div>
                    ${open ? `
                      <div class="pl-11 space-y-2.5 pt-2 border-t border-[#F1F5F9]">
                        ${item.image_url ? `<div class="rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F7FAF8] p-2"><img src="${esc(item.image_url)}" alt="Ilustrasi Soal" class="max-h-56 mx-auto object-contain rounded-lg" /></div>` : ''}
                        <div class="flex flex-wrap gap-2 text-xs">
                          <span class="px-3 py-1 rounded-lg bg-[#F7FAF8] border border-[#E2E8F0]">Jawaban Anda: <b>${esc(item.jawaban_user || 'Kosong')}</b></span>
                          <span class="px-3 py-1 rounded-lg bg-[#DCFCE7] text-[#166534]">Kunci / Bobot: <b>${esc(item.kunci_atau_bobot)}</b></span>
                        </div>
                        <div class="p-3.5 rounded-xl bg-[#F7FAF8] text-xs text-[#4B5563] leading-relaxed">
                          <div class="font-bold text-[#111827] mb-1">Pembahasan Resmi:</div>
                          ${esc(item.pembahasan || 'Pembahasan belum tersedia.')}
                        </div>
                      </div>
                    ` : ''}
                  </div>`;
              }).join('')}

              ${d.lockedCount > 0 ? `
                <div class="card-stitch p-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-[#F7FAF8] to-[#E8F5EE] no-print">
                  <div class="flex items-center gap-3">
                    <span class="w-11 h-11 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#0E3B2C]"><i data-lucide="lock" class="w-5 h-5"></i></span>
                    <div>
                      <div class="font-heading font-bold text-base">${d.lockedCount} Pembahasan Soal Lainnya Terkunci</div>
                      <div class="text-xs text-[#4B5563]">Upgrade ke Akun Pro untuk membuka seluruh pembahasan detail &amp; paket tryout penuh.</div>
                    </div>
                  </div>
                  <button onclick="App.openUpgradeModal()" class="btn-primary px-5 py-3 text-xs shrink-0">Upgrade ke Pro untuk Akses Pembahasan Lengkap</button>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="card-stitch p-5 overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="bg-[#F7FAF8] text-[11px] uppercase tracking-wider text-[#64748B]">
                    <th class="py-3 px-4 rounded-l-lg">Peringkat</th>
                    <th class="py-3 px-4">Peserta</th>
                    <th class="py-3 px-3 text-center">TWK</th>
                    <th class="py-3 px-3 text-center">TIU</th>
                    <th class="py-3 px-3 text-center">TKP</th>
                    <th class="py-3 px-3 text-center">Total</th>
                    <th class="py-3 px-4 text-right rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.leaderboard.map(function (lb) {
                    const ok = lb.status_kelulusan === 'Lulus';
                    return `<tr class="border-t border-[#E2E8F0]">
                      <td class="py-3 px-4 font-heading font-bold">#${lb.rank}</td>
                      <td class="py-3 px-4 font-semibold">${esc(lb.nama_user)}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${lb.skor_twk}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${lb.skor_tiu}</td>
                      <td class="py-3 px-3 text-center tabular-nums">${lb.skor_tkp}</td>
                      <td class="py-3 px-3 text-center font-bold tabular-nums">${lb.skor_total}</td>
                      <td class="py-3 px-4 text-right"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${ok ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}">${esc(lb.status_kelulusan)}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </main>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function mountResultCharts() {
    if (!state.resultData || !window.Chart) return;
    const h = state.resultData.hasil;
    const p = state.resultData.paket || {};
    const ctx1 = document.getElementById('chartResultSubtes');
    if (ctx1) {
      resultCharts.push(new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['TWK', 'TIU', 'TKP'],
          datasets: [
            { label: 'Skor Anda', data: [h.skor_twk, h.skor_tiu, h.skor_tkp], backgroundColor: '#0E3B2C', borderRadius: 8 },
            { label: 'Passing Grade', data: [p.pg_twk || 65, p.pg_tiu || 80, p.pg_tkp || 166], backgroundColor: '#A7F3D0', borderRadius: 8 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      }));
    }
    const ctx2 = document.getElementById('chartResultTrend');
    if (ctx2) {
      const tr = state.resultData.trend || [];
      resultCharts.push(new Chart(ctx2, {
        type: 'line',
        data: {
          labels: tr.map(function (t) { return t.label; }),
          datasets: [{ label: 'Total Skor', data: tr.map(function (t) { return t.total; }), borderColor: '#1F8A5B', backgroundColor: 'rgba(31,138,91,0.12)', fill: true, tension: 0.35, pointRadius: 5, pointBackgroundColor: '#0E3B2C' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
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
      // Abaikan diam-diam jika auth.config gagal
    }
  }

  function mountGoogleSignInButton(attempt) {
    attempt = attempt || 0;
    const cfg = state.authConfig;
    const wrap = document.getElementById('google-oauth-wrap');
    const slot = document.getElementById('google-signin-btn');
    if (!wrap || !slot || !cfg || !cfg.googleOAuthEnabled) return;

    wrap.classList.remove('hidden');

    // Mode Demo Lokal (tanpa Google Client ID asli)
    if (cfg.demoOAuth || ApiClient.isDemoMode()) {
      slot.innerHTML = `
        <button type="button" onclick="App.handleDemoGoogleLogin()"
          class="w-full h-11 px-4 rounded-full border border-[#E2E8F0] bg-white hover:bg-[#F7FAF8] text-xs sm:text-sm font-semibold text-[#111827] inline-flex items-center justify-center gap-2.5 shadow-sm transition">
          <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.28A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.99-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.99 3.09C6.23 6.88 8.88 4.77 12 4.77z"/></svg>
          Masuk dengan Google (Mode Demo)
        </button>`;
      return;
    }

    // Mode Produksi: Google Identity Services (OAuth 2.0)
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (attempt < 15) setTimeout(function () { mountGoogleSignInButton(attempt + 1); }, 300);
      return;
    }

    slot.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: handleGoogleCredentialResponse
    });
    window.google.accounts.id.renderButton(slot, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: state.authTab === 'register' ? 'signup_with' : 'signin_with',
      width: Math.min(360, Math.max(260, slot.parentElement.offsetWidth || 320)),
      locale: 'id'
    });
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      return toast('Login Google dibatalkan atau gagal.', 'warning');
    }
    try {
      toast('Memverifikasi akun Google Anda...', 'info');
      const res = await ApiClient.call('auth.googleLogin', { credential: response.credential });
      ApiClient.setSession(res.token, res.user);
      state.user = res.user;
      toast(res.isNewUser ? 'Akun Latihan dibuat otomatis via Google!' : 'Selamat datang kembali, ' + res.user.nama_lengkap, 'success');
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
    toast('Anda telah keluar dari akun.', 'info');
  }

  function init() {
    // Pulihkan ujian yang sedang berlangsung jika halaman ter-refresh (Anti-hilang jawaban!)
    try {
      const savedExam = localStorage.getItem(EXAM_STORAGE_KEY);
      if (savedExam && state.user) {
        const parsed = JSON.parse(savedExam);
        if (parsed && parsed.endAt > Date.now()) {
          state.exam = parsed;
          toast('Sesi ujian CAT Anda dipulihkan otomatis!', 'info');
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
        toast('Berhasil masuk! Selamat datang, ' + res.user.nama_lengkap, 'success');
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
        toast('Akun Latihan berhasil dibuat! Selamat belajar.', 'success');
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
        toast('Akses Darurat Admin berhasil.', 'success');
        go('admin');
      } catch (err) { toast(err.message, 'error'); }
    },
    openProfileMenu: function () {
      const u = state.user || {};
      openModal('Profil Akun', `
        <div class="space-y-4 text-sm">
          <div class="p-4 rounded-2xl bg-[#F7FAF8] border border-[#E2E8F0] space-y-1">
            <div class="font-bold text-base">${esc(u.nama_lengkap)}</div>
            <div class="text-xs text-[#64748B]">${esc(u.email)}</div>
            <div class="pt-1"><span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#DCFCE7] text-[#166534]">Peran: ${esc(u.role)}</span></div>
          </div>
          ${u.role === 'Admin' ? `<button onclick="App.closeModal(); App.go('admin')" class="btn-primary w-full py-2.5 text-xs">Buka Panel Kontrol Admin</button>` : ''}
          <button onclick="App.logout()" class="w-full py-2.5 rounded-full bg-[#FEE2E2] text-[#991B1B] font-bold text-xs">Keluar dari Akun</button>
        </div>
      `);
    },
    setPaketFilter: function (f) { state.paketFilter = f; renderDashboard(document.getElementById('app')); },
    openUpgradeModal: function () {
      const set = (state.dashData && state.dashData.settings) || {};
      openModal('Upgrade ke Akun Pro', `
        <form onsubmit="App.submitUpgrade(event)" class="space-y-4 text-sm">
          <div class="p-4 rounded-2xl bg-[#E8F5EE] text-[#0E3B2C] text-xs space-y-1">
            <div class="font-bold">Biaya Aktivasi: ${esc(set.HARGA_PRO || 'Rp 99.000 / 6 Bulan')}</div>
            <div>Tujuan Transfer: <b>${esc(set.INFO_REKENING_PRO || 'BCA 1234567890 a.n. SimulasiTKD Pro')}</b></div>
          </div>
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Unggah Bukti Transfer (JPG/PNG, maks 2MB)</label>
            <input type="file" id="upg-file" accept="image/*" class="mt-1 w-full text-xs p-2.5 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F7FAF8]" />
          </div>
          <div>
            <label class="text-xs font-semibold text-[#4B5563]">Catatan / Nama Pengirim</label>
            <input type="text" id="upg-note" required placeholder="Misal: Transfer BCA a.n. Budi Santoso" class="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-sm" />
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-xs">Kirim Bukti Aktivasi Pro</button>
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
          toast('Pengajuan Upgrade Pro terkirim! Menunggu verifikasi Admin.', 'success');
          go('dashboard');
        } catch (err) { toast(err.message, 'error'); }
      };
      if (fileInput.files && fileInput.files[0]) {
        const f = fileInput.files[0];
        if (f.size > 2.2 * 1024 * 1024) return toast('Ukuran file maksimal 2MB.', 'warning');
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
      openModal('Konfirmasi Mulai Ujian CAT', `
        <div class="space-y-4 text-sm">
          <div class="font-bold text-base text-[#0E3B2C]">${esc(p.nama_paket)}</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-3 rounded-xl bg-[#F7FAF8]">Durasi: <b>${p.durasi_menit} Menit</b></div>
            <div class="p-3 rounded-xl bg-[#F7FAF8]">Jumlah Soal: <b>${p.jumlah_soal} Butir</b></div>
            <div class="p-3 rounded-xl bg-[#F7FAF8] col-span-2">Passing Grade: <b>TWK ${p.pg_twk} • TIU ${p.pg_tiu} • TKP ${p.pg_tkp}</b></div>
          </div>
          <p class="text-xs text-[#4B5563]">Timer akan langsung berjalan dan jawaban tersimpan otomatis di browser Anda. Pastikan koneksi stabil saat selesai ujian.</p>
          <button onclick="App.startExamNow('${esc(paketId)}')" class="btn-primary w-full py-3 text-sm">Mulai Kerjakan Sekarang</button>
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
      openModal('Selesaikan & Kumpulkan Ujian?', `
        <div class="space-y-4 text-sm">
          <div class="p-4 rounded-2xl bg-[#F7FAF8] text-xs space-y-1">
            <div>Soal Terjawab: <b class="text-[#166534]">${dijawab} / ${total}</b></div>
            <div>Belum Dijawab: <b class="${kosong > 0 ? 'text-[#DC2626]' : 'text-[#166534]'}">${kosong}</b></div>
          </div>
          <p class="text-xs text-[#4B5563]">Setelah dikumpulkan, jawaban tidak dapat diubah lagi dan skor TWK, TIU, TKP akan langsung dihitung.</p>
          <div class="flex gap-2">
            <button onclick="App.closeModal()" class="btn-outline flex-1 py-2.5 text-xs">Periksa Lagi</button>
            <button onclick="App.closeModal(); App.finishExam()" class="btn-primary flex-1 py-2.5 text-xs">Ya, Kumpulkan</button>
          </div>
        </div>
      `);
    },
    finishExam: submitExamNow,
    setResultTab: function (t) { state.resultTab = t; renderResult(document.getElementById('app')); mountResultCharts(); },
    toggleAccordion: function (i) { state.openAccordion[i] = !state.openAccordion[i]; renderResult(document.getElementById('app')); mountResultCharts(); }
  };
})();
