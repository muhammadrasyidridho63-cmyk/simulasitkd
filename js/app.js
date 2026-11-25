/**
 * ============================================================================
 * SimulasiTKD Pro — js/app.js
 * Swiss International Typographic System (Anchor: Swiss)
 * Surface: #FFFFFF / #F7F7F8 | Ink: #111111 | Accent: International Orange #FF4F00
 * Structure: Exposed 1px hairline grid, left-aligned asymmetric typography, condensed folio numerals
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

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toast(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'bg-[#111111] text-[#FFFFFF] border-[#111111]',
      error: 'bg-[#FF4F00] text-[#FFFFFF] border-[#FF4F00]',
      warning: 'bg-[#F7F7F8] text-[#111111] border-[#FF4F00]',
      info: 'bg-[#FFFFFF] text-[#111111] border-[#111111]'
    };
    const box = document.getElementById('toast-container');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast-item px-4 py-3 border text-xs font-medium flex items-center justify-between gap-3 ' + (colors[type] || colors.info);
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  function openModal(title, bodyHtml) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bottom-sheet-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="bg-[#FFFFFF] max-w-md w-full border border-[#111111] max-h-[90vh] overflow-y-auto">
          <div class="px-5 py-4 border-b border-[#DCDCE0] flex items-center justify-between gap-4">
            <h3 class="font-semibold text-base text-[#111111] tracking-[-0.015em]">${esc(title)}</h3>
            <button type="button" onclick="App.closeModal()" class="w-8 h-8 border border-[#DCDCE0] hover:border-[#111111] text-[#52525B] hover:text-[#111111] inline-flex items-center justify-center transition-colors">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="p-5">${bodyHtml}</div>
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
  // SHARED PARTICIPANT NAVBAR (Swiss 1px Hairline Header)
  // ==========================================================================
  function renderNavbar(active) {
    const u = state.user;
    return `
      <header class="h-14 bg-[#FFFFFF] border-b border-[#111111] sticky top-0 z-40 no-print">
        <div class="max-w-7xl mx-auto h-full border-x border-[#DCDCE0] flex items-stretch justify-between">
          <button type="button" onclick="App.go('${u ? 'dashboard' : 'landing'}')" class="px-4 sm:px-6 border-r border-[#DCDCE0] inline-flex items-center gap-3 font-semibold text-[#111111] text-sm tracking-[-0.02em] hover:bg-[#F7F7F8] transition-colors">
            <span class="w-2.5 h-2.5 bg-[#FF4F00] inline-block shrink-0"></span>
            <span>SimulasiTKD Pro</span>
          </button>

          <nav class="hidden md:flex items-stretch text-xs font-medium text-[#52525B]">
            ${u ? `
              <button type="button" onclick="App.go('dashboard')" class="px-5 border-r border-[#DCDCE0] inline-flex items-center transition-colors ${active === 'dashboard' ? 'bg-[#F7F7F8] text-[#111111] shadow-[inset_0_-2px_0_#FF4F00]' : 'hover:text-[#111111] hover:bg-[#F7F7F8]'}">Paket simulasi</button>
              <button type="button" onclick="App.go('result')" class="px-5 border-r border-[#DCDCE0] inline-flex items-center transition-colors ${active === 'result' ? 'bg-[#F7F7F8] text-[#111111] shadow-[inset_0_-2px_0_#FF4F00]' : 'hover:text-[#111111] hover:bg-[#F7F7F8]'}">Evaluasi &amp; peringkat</button>
              ${u.role === 'Admin' ? `<button type="button" onclick="App.go('admin')" class="px-5 border-r border-[#DCDCE0] inline-flex items-center text-[#FF4F00] font-semibold hover:bg-[#F7F7F8]">Panel admin</button>` : ''}
            ` : `
              <a href="#pilar" class="px-5 border-r border-[#DCDCE0] inline-flex items-center hover:text-[#111111] hover:bg-[#F7F7F8] transition-colors">01 / Komponen SKD</a>
              <a href="#cara-kerja" class="px-5 border-r border-[#DCDCE0] inline-flex items-center hover:text-[#111111] hover:bg-[#F7F7F8] transition-colors">02 / Tahapan</a>
              <a href="#auth-section" class="px-5 border-r border-[#DCDCE0] inline-flex items-center hover:text-[#111111] hover:bg-[#F7F7F8] transition-colors">03 / Akun</a>
            `}
          </nav>

          <div class="flex items-stretch">
            ${u ? `
              <button type="button" onclick="App.openProfileMenu()" class="px-4 sm:px-5 border-l border-[#DCDCE0] bg-[#FFFFFF] hover:bg-[#F7F7F8] inline-flex items-center gap-2.5 transition-colors">
                <span class="w-6 h-6 bg-[#111111] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center">${esc((u.nama_lengkap || 'U').slice(0, 1).toUpperCase())}</span>
                <span class="hidden sm:inline text-xs font-medium text-[#111111] max-w-[140px] truncate">${esc(u.nama_lengkap)}</span>
                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-[#71717A]"></i>
              </button>
            ` : `
              <a href="#auth-section" onclick="App.setAuthTab('login')" class="hidden sm:inline-flex items-center px-5 border-l border-[#DCDCE0] text-xs font-medium text-[#111111] hover:bg-[#F7F7F8] transition-colors">Masuk</a>
              <a href="#auth-section" onclick="App.setAuthTab('register')" class="px-5 bg-[#FF4F00] hover:bg-[#111111] text-[#FFFFFF] text-xs font-medium inline-flex items-center transition-colors">Daftar</a>
            `}
          </div>
        </div>
      </header>
    `;
  }

  // ==========================================================================
  // SCREEN 1: LANDING PAGE & AUTH (Swiss Exposed Hairline Grid & Folio Numerals)
  // ==========================================================================
  function renderLanding(root) {
    root.innerHTML = `
      ${renderNavbar('landing')}
      <main class="flex-1 bg-[#FFFFFF]">
        <!-- Hero Section: Exposed 12-Col Swiss Hairline Grid -->
        <section class="max-w-7xl mx-auto border-x border-b border-[#111111] grid grid-cols-1 lg:grid-cols-12">
          <!-- Left 7 Cols: Asymmetric Typography + Oversized Numeric Composition -->
          <div class="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-[#111111] flex flex-col justify-between">
            <div class="p-6 sm:p-10 lg:p-12 space-y-6">
              <div class="flex items-center justify-between border-b border-[#DCDCE0] pb-3 text-xs font-medium text-[#52525B] tabular-nums">
                <span>SKD BKN · TWK / TIU / TKP</span>
                <span class="text-[#FF4F00] font-semibold">${ApiClient.isDemoMode() ? 'PRATINJAU LOKAL' : 'CAT STANDAR BKN'}</span>
              </div>
              <h1 class="text-4xl sm:text-5xl lg:text-[54px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#111111]">
                Simulasi ujian CAT untuk seleksi CPNS, BUMN, dan Kedinasan
              </h1>
              <p class="text-base text-[#52525B] leading-relaxed max-w-xl">
                Latih kecepatan menjawab 110 butir soal berwaktu nyata, ukur capaian ambang batas tiap subtes, dan pelajari pembahasan resmi per butir soal.
              </p>
              <div class="flex flex-wrap items-center gap-3 pt-2">
                <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-accent h-11 px-6 text-xs uppercase tracking-[0.04em] inline-flex items-center gap-3">
                  <span>Daftar akun latihan</span>
                  <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </a>
                <a href="#auth-section" onclick="App.setAuthTab('login')" class="btn-outline h-11 px-6 text-xs uppercase tracking-[0.04em] inline-flex items-center">
                  Masuk
                </a>
              </div>
            </div>

            <!-- Numeric Folio Bar (3 Hairline Cells) -->
            <div class="grid grid-cols-3 border-t border-[#111111] divide-x divide-[#DCDCE0] bg-[#F7F7F8]">
              <div class="p-5 sm:p-6 space-y-1">
                <div class="swiss-folio text-3xl sm:text-4xl font-semibold text-[#111111]">110</div>
                <div class="text-xs text-[#52525B]">Butir soal SKD</div>
              </div>
              <div class="p-5 sm:p-6 space-y-1">
                <div class="swiss-folio text-3xl sm:text-4xl font-semibold text-[#111111]">100</div>
                <div class="text-xs text-[#52525B]">Menit durasi</div>
              </div>
              <div class="p-5 sm:p-6 space-y-1">
                <div class="swiss-folio text-3xl sm:text-4xl font-semibold text-[#FF4F00]">550</div>
                <div class="text-xs text-[#52525B]">Skor maksimum</div>
              </div>
            </div>
          </div>

          <!-- Right 5 Cols: Real SOAL-001 from PKT-001 (Zero Fabricated Content) -->
          <div class="lg:col-span-5 bg-[#F7F7F8] flex flex-col justify-between">
            <div class="px-6 py-4 bg-[#FFFFFF] border-b border-[#DCDCE0] flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="px-2 py-0.5 bg-[#111111] text-[#FFFFFF] text-xs font-semibold tabular-nums">TWK</span>
                <span class="text-xs font-medium text-[#111111] truncate">Tryout Mini SKD CPNS #01</span>
              </div>
              <span class="text-xs font-semibold tabular-nums text-[#FF4F00]">PKT-001</span>
            </div>

            <div class="p-6 sm:p-8 space-y-5 flex-1">
              <div class="flex items-baseline justify-between border-b border-[#DCDCE0] pb-3">
                <div class="flex items-baseline gap-3">
                  <span class="swiss-folio text-3xl font-semibold text-[#111111]">01</span>
                  <span class="text-xs text-[#71717A] tabular-nums">/ 06 · Pilar Negara</span>
                </div>
                <span class="text-xs font-medium text-[#52525B] tabular-nums">Benar +5</span>
              </div>

              <p class="text-sm text-[#111111] leading-relaxed">
                Dalam konteks menjaga keutuhan NKRI, implementasi nilai-nilai Pancasila sila ketiga di lingkungan kerja ASN dapat diwujudkan melalui...
              </p>

              <div class="space-y-2 text-xs">
                <div class="p-3 bg-[#FFFFFF] border border-[#DCDCE0] text-[#52525B] flex items-start gap-3">
                  <span class="w-6 h-6 border border-[#DCDCE0] text-[#111111] font-semibold tabular-nums flex items-center justify-center shrink-0">A</span>
                  <span>Mengutamakan kepentingan golongan di atas kepentingan umum</span>
                </div>
                <div class="p-3 bg-[#FFFFFF] border border-[#FF4F00] shadow-[inset_3px_0_0_#FF4F00] text-[#111111] font-medium flex items-start gap-3">
                  <span class="w-6 h-6 bg-[#FF4F00] text-[#FFFFFF] font-semibold tabular-nums flex items-center justify-center shrink-0">B</span>
                  <span>Menjaga netralitas dan tidak diskriminatif dalam pelayanan publik</span>
                </div>
                <div class="p-3 bg-[#FFFFFF] border border-[#DCDCE0] text-[#52525B] flex items-start gap-3">
                  <span class="w-6 h-6 border border-[#DCDCE0] text-[#111111] font-semibold tabular-nums flex items-center justify-center shrink-0">C</span>
                  <span>Menolak bekerja sama dengan rekan dari latar belakang berbeda</span>
                </div>
              </div>
            </div>

            <!-- Navigator Strip & Official Passing Grade Thresholds -->
            <div class="px-6 py-4 bg-[#FFFFFF] border-t border-[#DCDCE0] flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-1 tabular-nums text-xs">
                <span class="w-7 h-7 bg-[#FF4F00] text-[#FFFFFF] font-semibold flex items-center pl-1.5">01</span>
                <span class="w-7 h-7 bg-[#111111] text-[#FFFFFF] font-semibold flex items-center pl-1.5">02</span>
                <span class="w-7 h-7 bg-[#111111] text-[#FFFFFF] font-semibold flex items-center pl-1.5">03</span>
                <span class="w-7 h-7 bg-[#FFFFFF] border border-[#DCDCE0] text-[#52525B] font-semibold flex items-center pl-1.5">04</span>
                <span class="w-7 h-7 bg-[#FFFFFF] border border-[#DCDCE0] text-[#52525B] font-semibold flex items-center pl-1.5">05</span>
                <span class="w-7 h-7 bg-[#FFFFFF] border border-[#DCDCE0] text-[#52525B] font-semibold flex items-center pl-1.5">06</span>
              </div>
              <div class="text-xs font-medium tabular-nums text-[#52525B]">
                PG: TWK 65 · TIU 80 · TKP 166
              </div>
            </div>
          </div>
        </section>

        <!-- Section 01: Empat Komponen Evaluasi Ujian -->
        <section id="pilar" class="max-w-7xl mx-auto border-x border-b border-[#111111]">
          <div class="grid grid-cols-1 lg:grid-cols-12 border-b border-[#DCDCE0]">
            <div class="lg:col-span-2 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-[#DCDCE0] bg-[#F7F7F8]">
              <div class="swiss-folio text-4xl font-semibold text-[#FF4F00]">01</div>
            </div>
            <div class="lg:col-span-6 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-[#DCDCE0]">
              <h2 class="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-[-0.02em]">Empat komponen evaluasi ujian</h2>
            </div>
            <div class="lg:col-span-4 p-6 sm:p-8 flex items-center">
              <p class="text-xs text-[#52525B] leading-relaxed">Setiap paket disusun mengikuti kisi-kisi terbaru lengkap dengan bobot penilaian resmi dan pembahasan per butir soal.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCDCE0]">
            ${[
              { folio: '65', code: 'TWK · 30 SOAL', title: 'Tes Wawasan Kebangsaan', desc: 'Nasionalisme, integritas, bela negara, dan pilar negara berbasis studi kasus penalaran.' },
              { folio: '80', code: 'TIU · 35 SOAL', title: 'Tes Intelegensia Umum', desc: 'Kemampuan verbal, numerik, deret angka, silogisme, dan analitis untuk ketepatan logika.' },
              { folio: '166', code: 'TKP · 45 SOAL', title: 'Tes Karakteristik Pribadi', desc: 'Pelayanan publik, jejaring kerja, sosial budaya, profesionalisme, dan anti-radikalisme berskala 1–5.' },
              { folio: '550', code: 'RAPOR · PDF', title: 'Analisis Ambang Batas', desc: 'Pemetaan skor subtes terhadap passing grade, tren percobaan, dan peringkat peserta nasional.' }
            ].map(function (c) {
              return `
                <div class="p-6 sm:p-8 flex flex-col justify-between space-y-8 bg-[#FFFFFF] hover:bg-[#F7F7F8] transition-colors">
                  <div class="space-y-4">
                    <div class="flex items-baseline justify-between border-b border-[#DCDCE0] pb-3">
                      <span class="text-xs font-semibold text-[#52525B] tabular-nums">${c.code}</span>
                      <span class="swiss-folio text-2xl font-semibold text-[#111111]">PG ${c.folio}</span>
                    </div>
                    <h3 class="font-semibold text-base text-[#111111] tracking-[-0.01em]">${c.title}</h3>
                    <p class="text-xs text-[#52525B] leading-relaxed">${c.desc}</p>
                  </div>
                  <a href="#auth-section" class="inline-flex items-center gap-2 text-xs font-semibold text-[#FF4F00] hover:text-[#111111] transition-colors">
                    <span>Mulai latihan</span>
                    <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                  </a>
                </div>`;
            }).join('')}
          </div>
        </section>

        <!-- Section 02: Tiga Tahap Persiapan Terukur -->
        <section id="cara-kerja" class="max-w-7xl mx-auto border-x border-b border-[#111111]">
          <div class="grid grid-cols-1 lg:grid-cols-12 border-b border-[#DCDCE0]">
            <div class="lg:col-span-2 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-[#DCDCE0] bg-[#F7F7F8]">
              <div class="swiss-folio text-4xl font-semibold text-[#FF4F00]">02</div>
            </div>
            <div class="lg:col-span-10 p-6 sm:p-8">
              <h2 class="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-[-0.02em]">Tiga tahap persiapan terukur</h2>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#DCDCE0]">
            ${[
              { n: '02.1', t: 'Buat akun latihan', d: 'Daftar menggunakan email atau Google untuk menyimpan riwayat pengerjaan dan membuka paket latihan dasar.' },
              { n: '02.2', t: 'Kerjakan simulasi berwaktu', d: 'Jawab soal dengan antarmuka CAT berwaktu nyata, penanda ragu-ragu, dan penyimpanan jawaban otomatis.' },
              { n: '02.3', t: 'Evaluasi skor dan pembahasan', d: 'Periksa rincian skor TWK, TIU, TKP terhadap ambang batas resmi serta pelajari pembahasan tiap soal.' }
            ].map(function (s) {
              return `<div class="p-6 sm:p-8 bg-[#FFFFFF] space-y-4">
                <div class="swiss-folio text-2xl font-semibold text-[#111111] border-b border-[#DCDCE0] pb-2">${s.n}</div>
                <h3 class="font-semibold text-base text-[#111111]">${s.t}</h3>
                <p class="text-xs text-[#52525B] leading-relaxed">${s.d}</p>
              </div>`;
            }).join('')}
          </div>

          <div class="bg-[#111111] text-[#FFFFFF] p-6 sm:p-10 border-t border-[#111111] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div class="space-y-2 max-w-xl">
              <h3 class="text-xl sm:text-2xl font-semibold tracking-[-0.02em]">Buka seluruh paket tryout SKD, BUMN, dan pembahasan lengkap</h3>
              <p class="text-xs sm:text-sm text-[#DCDCE0]">Termasuk simulasi 110 soal penuh, kunci pembahasan tiap butir soal, rapor PDF, dan papan peringkat nasional.</p>
            </div>
            <a href="#auth-section" onclick="App.setAuthTab('register')" class="btn-on-dark h-11 px-6 text-xs uppercase tracking-[0.04em] inline-flex items-center gap-3 shrink-0">
              <span>Daftar &amp; upgrade Pro</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </a>
          </div>
        </section>

        <!-- Section 03: Auth Section -->
        <section id="auth-section" class="max-w-7xl mx-auto border-x border-b border-[#111111] bg-[#F7F7F8]">
          <div class="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#DCDCE0]">
            <div class="md:col-span-6 p-6 sm:p-10 lg:p-12 space-y-6">
              <div class="swiss-folio text-4xl font-semibold text-[#FF4F00]">03</div>
              <h2 class="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-[-0.02em]">Masuk atau buat akun latihan</h2>
              <p class="text-sm text-[#52525B] leading-relaxed">Simpan seluruh riwayat pengerjaan, pantau perkembangan skor TWK, TIU, dan TKP, serta buka pembahasan soal dari satu akun.</p>
              ${ApiClient.isDemoMode() ? `
                <div class="p-4 bg-[#FFFFFF] border border-[#111111] text-xs space-y-2">
                  <div class="font-semibold text-[#111111]">Akun uji coba mode pratinjau lokal</div>
                  <div class="space-y-1 text-[#52525B] tabular-nums">
                    <div>Peserta latihan: budi@demo.id / demo123</div>
                    <div>Peserta Pro: raka@demo.id / demo123</div>
                    <div>Administrator: admin@demo.id / admin123</div>
                  </div>
                </div>
              ` : ''}
            </div>

            <div class="md:col-span-6 p-6 sm:p-10 lg:p-12 bg-[#FFFFFF]">
              <div class="max-w-[440px] space-y-5">
                <div class="grid grid-cols-2 border border-[#111111] text-xs font-semibold">
                  <button type="button" onclick="App.setAuthTab('login')" class="h-10 px-4 text-left transition-colors ${state.authTab === 'login' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] text-[#52525B] hover:text-[#111111]'}">01 · Masuk</button>
                  <button type="button" onclick="App.setAuthTab('register')" class="h-10 px-4 text-left border-l border-[#111111] transition-colors ${state.authTab === 'register' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] text-[#52525B] hover:text-[#111111]'}">02 · Daftar</button>
                </div>

                ${state.authTab !== 'emergency' ? `
                  <div id="google-oauth-wrap" class="hidden space-y-3">
                    <div id="google-signin-btn" class="flex justify-start"></div>
                    <div class="border-b border-[#DCDCE0] pb-2 text-xs text-[#71717A]">Atau masuk dengan email</div>
                  </div>
                ` : ''}

                ${state.authTab === 'login' ? `
                  <form onsubmit="App.handleLogin(event)" class="space-y-4">
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Email</label>
                      <input type="email" id="auth-email" required placeholder="nama@email.com" value="${ApiClient.isDemoMode() ? 'budi@demo.id' : ''}" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Kata sandi</label>
                      <input type="password" id="auth-pass" required placeholder="Kata sandi akun" value="${ApiClient.isDemoMode() ? 'demo123' : ''}" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-primary w-full h-11 px-4 text-xs uppercase tracking-[0.04em] text-left flex items-center justify-between">
                      <span>Masuk</span>
                      <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                    <div class="pt-1">
                      <button type="button" onclick="App.setAuthTab('emergency')" class="text-xs text-[#71717A] hover:text-[#FF4F00] underline transition-colors">Akses darurat administrator</button>
                    </div>
                  </form>
                ` : state.authTab === 'register' ? `
                  <form onsubmit="App.handleRegister(event)" class="space-y-3">
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Nama lengkap</label>
                      <input type="text" id="reg-nama" required placeholder="Nama sesuai identitas" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Email</label>
                      <input type="email" id="reg-email" required placeholder="nama@email.com" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Nomor WhatsApp</label>
                      <input type="tel" id="reg-wa" required placeholder="0812xxxxxxxx" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Kata sandi (minimal 6 karakter)</label>
                      <input type="password" id="reg-pass" required minlength="6" placeholder="Buat kata sandi" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" id="btn-auth-submit" class="btn-accent w-full h-11 px-4 text-xs uppercase tracking-[0.04em] text-left flex items-center justify-between">
                      <span>Daftar</span>
                      <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                  </form>
                ` : `
                  <form onsubmit="App.handleEmergencyLogin(event)" class="space-y-4">
                    <div class="p-3 bg-[#F7F7F8] border-l-2 border-[#FF4F00] text-[#111111] text-xs">Login darurat memakai kredensial Script Properties (maksimal 5 percobaan).</div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Username darurat</label>
                      <input type="text" id="em-user" required value="darurat" class="input-control mt-1 w-full" />
                    </div>
                    <div>
                      <label class="text-xs font-medium text-[#52525B]">Sandi darurat</label>
                      <input type="password" id="em-pass" required placeholder="Sandi dari log setup" class="input-control mt-1 w-full" />
                    </div>
                    <button type="submit" class="btn-primary w-full h-11 px-4 text-xs uppercase tracking-[0.04em] text-left flex items-center justify-between">
                      <span>Masuk panel admin</span>
                      <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                    <div>
                      <button type="button" onclick="App.setAuthTab('login')" class="text-xs text-[#71717A] hover:text-[#111111] underline">Kembali ke login reguler</button>
                    </div>
                  </form>
                `}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer class="max-w-7xl mx-auto w-full border-x border-b border-[#DCDCE0] bg-[#FFFFFF] px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#71717A]">
        <span>© 2026 SimulasiTKD Pro</span>
        <span>Platform simulasi CAT CPNS, BUMN, dan Kedinasan</span>
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
      <main class="max-w-7xl mx-auto w-full border-x border-b border-[#DCDCE0] flex-1 bg-[#FFFFFF]">
        <!-- Header Bar -->
        <div class="p-6 sm:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-xs text-[#52525B]">
              <span class="font-medium text-[#111111]">${esc(u.nama_lengkap || 'Peserta')}</span>
              <span>/</span>
              <span class="px-2 py-0.5 font-semibold ${isPro ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#111111]'}">
                ${isPro ? 'AKUN PRO' : 'AKUN LATIHAN'}
              </span>
              ${isPending ? `<span class="px-2 py-0.5 bg-[#FF4F00] text-[#FFFFFF] font-semibold">VERIFIKASI TERTUNDA</span>` : ''}
            </div>
            <h1 class="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-[-0.02em]">Ringkasan latihan</h1>
          </div>
          ${!isPro ? `
            <button type="button" onclick="App.openUpgradeModal()" class="btn-accent h-10 px-5 text-xs uppercase tracking-[0.04em] inline-flex items-center gap-2 self-start sm:self-auto">
              <span>${isPending ? 'Status pengajuan Pro' : 'Upgrade ke Akun Pro'}</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>

        <!-- 3 KPI Folio Cells -->
        ${!d ? `<div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#DCDCE0] border-b border-[#DCDCE0]"><div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div></div>` : `
          <div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#DCDCE0] border-b border-[#111111]">
            <div class="p-6 sm:p-8 space-y-2 bg-[#FFFFFF]">
              <div class="flex items-center justify-between text-xs text-[#71717A]">
                <span>Simulasi diselesaikan</span>
                <span class="tabular-nums font-semibold">01</span>
              </div>
              <div class="swiss-folio text-4xl sm:text-5xl font-semibold text-[#111111]">${d.kpi.tryoutSelesai}</div>
              <div class="text-xs text-[#52525B]">Tersimpan pada riwayat akun</div>
            </div>
            <div class="p-6 sm:p-8 space-y-2 bg-[#FFFFFF]">
              <div class="flex items-center justify-between text-xs text-[#71717A]">
                <span>Skor tertinggi</span>
                <span class="tabular-nums font-semibold">02</span>
              </div>
              <div class="swiss-folio text-4xl sm:text-5xl font-semibold text-[#111111]">${d.kpi.skorTertinggi}</div>
              <div class="text-xs text-[#52525B]">Dari batas maksimum 550 poin</div>
            </div>
            <div class="p-6 sm:p-8 space-y-2 bg-[#F7F7F8]">
              <div class="flex items-center justify-between text-xs text-[#71717A]">
                <span>Percobaan terakhir</span>
                <span class="tabular-nums font-semibold">03</span>
              </div>
              ${d.kpi.terakhir ? `
                <div>
                  <span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">
                    ${d.kpi.terakhir.status_kelulusan === 'Lulus' ? 'LULUS AMBANG BATAS' : 'BELUM LULUS AMBANG BATAS'}
                  </span>
                </div>
                <div class="text-xs tabular-nums font-medium text-[#111111] pt-1">TWK ${d.kpi.terakhir.skor_twk} · TIU ${d.kpi.terakhir.skor_tiu} · TKP ${d.kpi.terakhir.skor_tkp}</div>
              ` : `<div class="text-sm font-medium text-[#71717A] pt-1">Belum ada percobaan</div>`}
            </div>
          </div>
        `}

        <!-- Banner Upgrade Pro -->
        ${!isPro ? `
          <div class="bg-[#F7F7F8] border-b border-[#DCDCE0] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="space-y-1 max-w-2xl">
              <h2 class="font-semibold text-base text-[#111111]">Buka seluruh paket tryout penuh dan pembahasan tiap soal</h2>
              <p class="text-xs text-[#52525B]">Akses paket SKD CPNS, BUMN, dan Kedinasan 110 soal beserta pembahasan resmi dan rapor PDF.</p>
            </div>
            <button type="button" onclick="App.openUpgradeModal()" class="btn-outline h-9 px-4 text-xs inline-flex items-center gap-2 shrink-0">
              <span>${isPending ? 'Lihat status verifikasi' : 'Pelajari paket Pro'}</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        ` : ''}

        <!-- Katalog Paket Tryout -->
        <div class="p-6 sm:p-8 border-b border-[#DCDCE0] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="flex items-baseline gap-3">
            <span class="swiss-folio text-2xl font-semibold text-[#FF4F00]">01</span>
            <h2 class="text-xl font-semibold text-[#111111] tracking-[-0.015em]">Pilih paket ujian CAT (${pakets.length})</h2>
          </div>
          <div class="inline-flex items-center border border-[#111111] self-start sm:self-auto">
            ${['Semua', 'Latihan', 'Pro'].map(function (f, i) {
              const label = f === 'Semua' ? 'Semua' : f === 'Latihan' ? 'Latihan' : 'Pro';
              const active = state.paketFilter === f;
              return `<button type="button" onclick="App.setPaketFilter('${f}')" class="h-8 px-3.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-[#111111]' : ''} ${active ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#52525B] hover:text-[#111111]'}">${label}</button>`;
            }).join('')}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#DCDCE0] border-b border-[#111111]">
          ${pakets.map(function (p, idx) {
            const locked = p.tier_akses === 'Pro' && !isPro;
            return `
              <div class="p-6 sm:p-8 flex flex-col justify-between space-y-6 bg-[#FFFFFF] hover:bg-[#F7F7F8] transition-colors">
                <div class="space-y-4">
                  <div class="flex items-center justify-between border-b border-[#DCDCE0] pb-3 text-xs">
                    <span class="swiss-folio text-2xl font-semibold text-[#111111]">${pad2(idx + 1)}</span>
                    <div class="flex items-center gap-2">
                      <span class="text-[#71717A] tabular-nums">${esc(p.kategori_label || 'SKD')}</span>
                      <span class="px-2 py-0.5 font-semibold ${p.tier_akses === 'Latihan' ? 'bg-[#F7F7F8] border border-[#DCDCE0] text-[#111111]' : 'bg-[#111111] text-[#FFFFFF]'}">
                        ${p.tier_akses === 'Latihan' ? 'LATIHAN' : 'PRO'}
                      </span>
                    </div>
                  </div>
                  <h3 class="font-semibold text-base text-[#111111] tracking-[-0.01em]">${esc(p.nama_paket)}</h3>
                  <p class="text-xs text-[#52525B] leading-relaxed">${esc(p.deskripsi)}</p>
                  <div class="flex items-center gap-4 text-xs tabular-nums font-medium text-[#111111] pt-1">
                    <span>${p.durasi_menit} menit</span>
                    <span>·</span>
                    <span>${p.jumlah_soal} butir soal</span>
                  </div>
                </div>
                ${locked ? `
                  <button type="button" onclick="App.openUpgradeModal()" class="btn-outline w-full h-10 px-4 text-xs inline-flex items-center justify-between">
                    <span>Buka dengan Pro</span>
                    <i data-lucide="lock" class="w-3.5 h-3.5"></i>
                  </button>
                ` : `
                  <button type="button" onclick="App.confirmStartExam('${esc(p.paket_id)}')" class="btn-primary w-full h-10 px-4 text-xs inline-flex items-center justify-between">
                    <span>Mulai simulasi</span>
                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                  </button>
                `}
              </div>`;
          }).join('')}
        </div>

        <!-- Riwayat Terakhir -->
        ${d && d.riwayat && d.riwayat.length ? `
          <div class="p-6 sm:p-8 space-y-4">
            <div class="flex items-center justify-between gap-4 border-b border-[#111111] pb-3">
              <div class="flex items-baseline gap-3">
                <span class="swiss-folio text-2xl font-semibold text-[#FF4F00]">02</span>
                <h3 class="font-semibold text-base text-[#111111]">Riwayat pengerjaan terakhir</h3>
              </div>
              <button type="button" onclick="App.go('result')" class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF4F00] hover:text-[#111111]">
                <span>Evaluasi lengkap</span>
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
              </button>
            </div>
            <div class="divide-y divide-[#DCDCE0]">
              ${d.riwayat.slice(0, 5).map(function (r, idx) {
                const ok = r.status_kelulusan === 'Lulus';
                return `
                  <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-baseline gap-4">
                      <span class="swiss-folio text-lg font-semibold text-[#71717A] w-6">${pad2(idx + 1)}</span>
                      <div class="space-y-0.5">
                        <div class="font-semibold text-sm text-[#111111]">${esc(r.nama_paket)}</div>
                        <div class="text-xs tabular-nums text-[#52525B]">TWK ${r.skor_twk} · TIU ${r.skor_tiu} · TKP ${r.skor_tkp} · Total <span class="text-[#111111] font-semibold">${r.skor_total}</span></div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">${esc(r.status_kelulusan).toUpperCase()}</span>
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
  // SCREEN 3: RUANG UJIAN CAT REAL-TIME (Swiss Hairline Examination Sheet)
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
    const timerCls = remSec < 600 ? 'bg-[#FF4F00] text-[#FFFFFF]' : 'bg-[#F7F7F8] text-[#111111] border-x border-[#DCDCE0]';

    const navTilesHtml = ex.soal.map(function (item, i) {
      const st = ex.doubtful[item.soal_id] ? 'doubtful' : ex.answers[item.soal_id] ? 'answered' : 'unanswered';
      const active = i === ex.idx ? 'active-tile' : '';
      return `<button type="button" onclick="App.jumpSoal(${i})" class="nav-tile ${st} ${active}">${pad2(i + 1)}</button>`;
    }).join('');

    root.innerHTML = `
      <!-- Sticky Top Bar -->
      <header class="h-14 bg-[#FFFFFF] border-b border-[#111111] sticky top-0 z-40">
        <div class="max-w-7xl mx-auto h-full border-x border-[#DCDCE0] flex items-stretch justify-between">
          <div class="px-4 sm:px-6 flex items-center gap-3 min-w-0">
            <span class="px-2 py-0.5 bg-[#111111] text-[#FFFFFF] text-xs font-semibold tabular-nums shrink-0">${esc(q.subtes)}</span>
            <span class="font-semibold text-sm text-[#111111] truncate">${esc(ex.paket.nama_paket)}</span>
          </div>

          <div class="flex items-stretch">
            <div id="exam-timer-pill" class="px-4 sm:px-5 tabular-nums font-semibold text-xs sm:text-sm inline-flex items-center gap-2 ${timerCls}">
              <i data-lucide="clock" class="w-3.5 h-3.5"></i>
              <span id="exam-timer-text">${fmtTimer(remSec)}</span>
            </div>

            <button type="button" onclick="App.confirmFinishExam()" class="px-4 sm:px-5 bg-[#111111] hover:bg-[#FF4F00] text-[#FFFFFF] text-xs font-semibold inline-flex items-center gap-2 shrink-0 transition-colors">
              <span>Selesai<span class="hidden sm:inline"> ujian</span></span>
            </button>
          </div>
        </div>
      </header>

      <!-- Mobile Question Navigator Trigger -->
      <div class="lg:hidden border-b border-[#DCDCE0] bg-[#F7F7F8]">
        <button type="button" onclick="App.toggleMobileNavSheet(true)" class="w-full h-11 px-4 flex items-center justify-between text-xs font-semibold">
          <span class="inline-flex items-center gap-2 text-[#111111]">
            <span>Navigasi soal</span>
            <span class="px-2 py-0.5 bg-[#111111] text-[#FFFFFF] tabular-nums">${answeredCount}/${total}</span>
          </span>
          <span class="text-[#52525B] inline-flex items-center gap-1">
            <span>Buka matriks</span>
            <i data-lucide="chevron-down" class="w-4 h-4"></i>
          </span>
        </button>
      </div>

      <!-- Main Split Content (Exposed Hairline Grid) -->
      <main class="max-w-7xl mx-auto w-full border-x border-b border-[#111111] pb-20 lg:pb-0 grid grid-cols-1 lg:grid-cols-12 flex-1 bg-[#FFFFFF]">
        <!-- Left 8 Cols: Question Sheet -->
        <div class="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-[#111111] flex flex-col justify-between">
          <div class="p-6 sm:p-8 lg:p-10 space-y-6">
            <div class="flex items-baseline justify-between flex-wrap gap-2 pb-4 border-b border-[#111111]">
              <div class="flex items-baseline gap-3">
                <span class="swiss-folio text-4xl font-semibold text-[#111111]">${pad2(ex.idx + 1)}</span>
                <span class="text-xs font-semibold text-[#71717A] tabular-nums">/ ${pad2(total)} · SUBTES ${esc(q.subtes)}</span>
              </div>
              <span class="text-xs text-[#52525B] tabular-nums">${esc(q.topik ? q.topik + ' · ' : '')}${q.subtes === 'TKP' ? 'Skala 1–5' : 'Benar +5'}</span>
            </div>

            <div class="text-sm sm:text-base text-[#111111] leading-relaxed max-w-[70ch] whitespace-pre-line">${esc(q.pertanyaan)}</div>

            ${q.image_url ? `<div class="border border-[#DCDCE0] bg-[#F7F7F8] p-3"><img src="${esc(q.image_url)}" alt="Ilustrasi soal nomor ${ex.idx + 1}" class="max-h-72 object-contain" /></div>` : ''}

            <div class="space-y-2 pt-2">
              ${['A', 'B', 'C', 'D', 'E'].map(function (opt) {
                const txt = q.opsi && q.opsi[opt];
                if (!txt) return '';
                const sel = picked === opt;
                return `
                  <div onclick="App.selectAnswer('${esc(q.soal_id)}', '${opt}')" class="cat-option ${sel ? 'selected' : ''} px-4 py-3 flex items-center gap-3">
                    <span class="opt-badge w-7 h-7 border border-[#DCDCE0] bg-[#F7F7F8] text-[#111111] text-xs tabular-nums font-semibold flex items-center justify-center shrink-0">${opt}</span>
                    <span class="text-sm text-[#111111] leading-snug flex-1">${esc(txt)}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Desktop Action Bar -->
          <div class="hidden lg:flex border-t border-[#111111] bg-[#F7F7F8] p-4 items-center justify-between">
            <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled class="opacity-40 cursor-not-allowed btn-outline h-10 px-4 text-xs inline-flex items-center gap-2"' : 'class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2"'}>
              <i data-lucide="arrow-left" class="w-4 h-4"></i>
              <span>Sebelumnya</span>
            </button>
            <div class="flex items-center gap-3">
              <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="h-10 px-4 border text-xs font-semibold inline-flex items-center gap-2 transition-colors ${isDoubtful ? 'bg-[#FF4F00] border-[#FF4F00] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#111111] text-[#111111] hover:border-[#FF4F00] hover:text-[#FF4F00]'}">
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

        <!-- Right 4 Cols: Desktop Question Navigator Matrix -->
        <aside class="hidden lg:block lg:col-span-4 bg-[#F7F7F8] p-6 space-y-5">
          <div class="flex items-baseline justify-between border-b border-[#111111] pb-3">
            <h3 class="font-semibold text-sm text-[#111111]">Matriks nomor soal</h3>
            <span class="text-xs tabular-nums font-semibold text-[#111111]">${pad2(answeredCount)} / ${pad2(total)}</span>
          </div>
          <div class="grid grid-cols-6 gap-1.5 max-h-[384px] overflow-y-auto">${navTilesHtml}</div>
          <div class="flex items-center justify-between pt-3 border-t border-[#DCDCE0] text-xs text-[#52525B]">
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 bg-[#111111]"></span> Dijawab</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 border border-[#FF4F00] bg-[#F7F7F8]"></span> Ragu</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 bg-[#FFFFFF] border border-[#DCDCE0]"></span> Kosong</span>
          </div>
        </aside>
      </main>

      <!-- Mobile Sticky Bottom Action Bar -->
      <div class="lg:hidden fixed bottom-0 inset-x-0 bg-[#FFFFFF] border-t border-[#111111] px-4 py-3 z-30 flex items-center justify-between gap-2">
        <button type="button" onclick="App.moveSoal(-1)" ${ex.idx === 0 ? 'disabled' : ''} class="btn-outline h-10 px-3 text-xs inline-flex items-center gap-1 disabled:opacity-40">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
          <span>Sebelumnya</span>
        </button>
        <button type="button" onclick="App.toggleDoubtful('${esc(q.soal_id)}')" class="h-10 px-3 border text-xs font-semibold ${isDoubtful ? 'bg-[#FF4F00] border-[#FF4F00] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#111111] text-[#111111]'}">Ragu</button>
        <button type="button" onclick="${ex.idx < total - 1 ? 'App.moveSoal(1)' : 'App.confirmFinishExam()'}" class="btn-primary flex-1 h-10 px-4 text-xs inline-flex items-center justify-between">
          <span>${ex.idx < total - 1 ? 'Simpan & lanjut' : 'Kumpulkan'}</span>
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Mobile Bottom Sheet Drawer -->
      ${state.mobileNavSheetOpen ? `
        <div class="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bottom-sheet-backdrop" onclick="if(event.target===this) App.toggleMobileNavSheet(false)">
          <div class="bg-[#FFFFFF] bottom-sheet-panel p-5 max-h-[75vh] flex flex-col space-y-4">
            <div class="flex items-center justify-between border-b border-[#DCDCE0] pb-3">
              <h3 class="font-semibold text-base text-[#111111]">Matriks nomor soal (${answeredCount}/${total})</h3>
              <button type="button" onclick="App.toggleMobileNavSheet(false)" class="w-8 h-8 border border-[#DCDCE0] inline-flex items-center justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <div class="grid grid-cols-6 gap-1.5 overflow-y-auto">${navTilesHtml}</div>
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
    root.innerHTML = `${renderNavbar('result')}<main class="max-w-7xl mx-auto w-full border-x border-[#DCDCE0] p-8 space-y-6"><div class="skeleton h-36"></div><div class="grid grid-cols-1 lg:grid-cols-12 gap-4"><div class="lg:col-span-8 skeleton h-64"></div><div class="lg:col-span-4 skeleton h-64"></div></div></main>`;
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
      const deltaStr = (delta >= 0 ? '+' : '') + delta + ' dari PG ' + pg;
      return `
        <div class="p-6 bg-[#FFFFFF] space-y-3">
          <div class="flex items-center justify-between text-xs border-b border-[#DCDCE0] pb-2">
            <span class="font-semibold text-[#111111]">${label}</span>
            <span class="px-2 py-0.5 font-semibold ${ok ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">${ok ? 'LULUS' : 'BELUM LULUS'}</span>
          </div>
          <div class="flex items-baseline justify-between gap-2">
            <span class="swiss-folio text-4xl font-semibold text-[#111111]">${val}</span>
            <span class="text-xs tabular-nums text-[#52525B]">${deltaStr}</span>
          </div>
          <div class="pg-track">
            <div class="pg-fill ${ok ? 'bg-[#111111]' : 'bg-[#FF4F00]'}" style="width:${pct}%"></div>
            <span class="pg-marker" style="left:${pgPct}%" title="Passing grade ${pg}"></span>
          </div>
        </div>`;
    };

    root.innerHTML = `
      ${renderNavbar('result')}
      <main class="max-w-7xl mx-auto w-full border-x border-b border-[#111111] flex-1 bg-[#FFFFFF]">
        <!-- Header Bar -->
        <div class="p-6 sm:p-8 border-b border-[#111111] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="space-y-1">
            <h1 class="text-2xl sm:text-3xl font-semibold text-[#111111] tracking-[-0.02em]">${esc(h.nama_paket)}</h1>
            <p class="text-xs tabular-nums text-[#52525B]">Durasi pengerjaan: ${fmtDurasi(h.durasi_pakai_detik)}</p>
          </div>
          <div class="flex items-center gap-2 no-print">
            <button type="button" onclick="window.print()" class="btn-outline h-10 px-4 text-xs inline-flex items-center gap-2">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>Unduh rapor PDF</span>
            </button>
            <button type="button" onclick="App.go('dashboard')" class="btn-primary h-10 px-4 text-xs">Kembali ke paket</button>
          </div>
        </div>

        <!-- Score Summary Hairline Matrix -->
        <div class="grid grid-cols-1 lg:grid-cols-12 border-b border-[#111111] divide-y lg:divide-y-0 lg:divide-x divide-[#DCDCE0]">
          <div class="lg:col-span-4 p-6 sm:p-8 bg-[#F7F7F8] space-y-2">
            <span class="inline-flex items-center px-2.5 py-1 text-xs font-semibold ${lulus ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">
              ${lulus ? 'LULUS AMBANG BATAS' : 'BELUM LULUS AMBANG BATAS'}
            </span>
            <div class="text-xs text-[#52525B] pt-2">Total skor akhir</div>
            <div class="flex items-baseline gap-2">
              <span class="swiss-folio text-6xl font-semibold text-[#111111]">${h.skor_total}</span>
              <span class="text-sm tabular-nums text-[#71717A]">/ 550</span>
            </div>
          </div>
          <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#DCDCE0]">
            ${subCard('TWK', h.skor_twk, pgTwk, 150)}
            ${subCard('TIU', h.skor_tiu, pgTiu, 175)}
            ${subCard('TKP', h.skor_tkp, pgTkp, 225)}
          </div>
        </div>

        <!-- Asymmetric Chart Hierarchy (8 cols Main Chart + 4 cols Trend) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 border-b border-[#111111] divide-y lg:divide-y-0 lg:divide-x divide-[#DCDCE0]">
          <div class="p-6 sm:p-8 lg:col-span-8 flex flex-col justify-between space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCDCE0] pb-3">
              <div>
                <h3 class="font-semibold text-base text-[#111111]">Perbandingan skor terhadap ambang batas</h3>
                <p class="text-xs text-[#52525B]">Skor perolehan subtes dibandingkan standar kelulusan minimum BKN</p>
              </div>
              <div class="flex items-center gap-4 text-xs text-[#52525B]">
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-[#111111]"></span> Skor Anda</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-[#FF4F00]"></span> Ambang PG</span>
              </div>
            </div>
            <div class="h-64"><canvas id="chartResultSubtes"></canvas></div>
          </div>
          <div class="p-6 sm:p-8 lg:col-span-4 flex flex-col justify-between space-y-4">
            <div class="border-b border-[#DCDCE0] pb-3">
              <h3 class="font-semibold text-base text-[#111111]">Tren total skor</h3>
              <p class="text-xs text-[#52525B]">Riwayat skor antar percobaan</p>
            </div>
            <div class="h-64"><canvas id="chartResultTrend"></canvas></div>
          </div>
        </div>

        <!-- Tabs Pembahasan & Papan Peringkat -->
        <div class="p-6 sm:p-8 space-y-6">
          <div class="inline-flex items-center border border-[#111111] no-print">
            <button type="button" onclick="App.setResultTab('pembahasan')" class="h-9 px-4 text-xs font-semibold transition-colors ${state.resultTab === 'pembahasan' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#52525B] hover:text-[#111111]'}">01 · Pembahasan soal</button>
            <button type="button" onclick="App.setResultTab('peringkat')" class="h-9 px-4 border-l border-[#111111] text-xs font-semibold transition-colors ${state.resultTab === 'peringkat' ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#52525B] hover:text-[#111111]'}">02 · Papan peringkat (${state.leaderboard.length})</button>
          </div>

          ${state.resultTab === 'pembahasan' ? `
            <div class="border-t border-l border-[#DCDCE0]">
              ${d.pembahasan.filter(function (x) { return !x.locked; }).map(function (item, i) {
                const open = !!state.openAccordion[i];
                const badgeCls = item.poin >= 5 ? 'bg-[#111111] text-[#FFFFFF]' : item.poin > 0 ? 'bg-[#F7F7F8] border border-[#111111] text-[#111111]' : 'bg-[#FF4F00] text-[#FFFFFF]';
                return `
                  <div class="border-r border-b border-[#DCDCE0] p-5 space-y-3 bg-[#FFFFFF]">
                    <div onclick="App.toggleAccordion(${i})" class="flex items-start justify-between gap-4 cursor-pointer">
                      <div class="flex items-start gap-4">
                        <span class="swiss-folio text-2xl font-semibold text-[#111111] w-8 shrink-0">${pad2(item.nomor_urut)}</span>
                        <div>
                          <div class="text-xs font-semibold text-[#71717A]">${esc(item.subtes)}${item.topik ? ' · ' + esc(item.topik) : ''}</div>
                          <div class="text-sm font-medium text-[#111111] mt-1">${esc(item.pertanyaan)}</div>
                        </div>
                      </div>
                      <span class="px-2.5 py-1 text-xs tabular-nums font-semibold shrink-0 ${badgeCls}">${item.subtes === 'TKP' ? '+' + item.poin + ' POIN' : (item.benar ? '+5 BENAR' : '0 SALAH')}</span>
                    </div>
                    ${open ? `
                      <div class="pl-12 space-y-3 pt-3 border-t border-[#DCDCE0]">
                        <div class="flex flex-wrap gap-2 text-xs tabular-nums">
                          <span class="px-2.5 py-1 bg-[#F7F7F8] border border-[#DCDCE0] text-[#52525B]">Jawaban Anda: <strong class="font-semibold text-[#111111]">${esc(item.jawaban_user || 'Kosong')}</strong></span>
                          <span class="px-2.5 py-1 bg-[#111111] text-[#FFFFFF]">Kunci / bobot: <strong class="font-semibold">${esc(item.kunci_atau_bobot)}</strong></span>
                        </div>
                        <div class="p-4 bg-[#F7F7F8] border-l-2 border-[#FF4F00] text-xs text-[#52525B] leading-relaxed">
                          <div class="font-semibold text-[#111111] mb-1">Pembahasan resmi</div>
                          ${esc(item.pembahasan || 'Pembahasan belum tersedia')}
                        </div>
                      </div>
                    ` : ''}
                  </div>`;
              }).join('')}

              ${d.lockedCount > 0 ? `
                <div class="border-r border-b border-[#111111] bg-[#F7F7F8] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
                  <div class="space-y-1">
                    <div class="font-semibold text-base text-[#111111]">${d.lockedCount} pembahasan soal lainnya terkunci</div>
                    <div class="text-xs text-[#52525B]">Upgrade ke Akun Pro untuk membuka seluruh kunci pembahasan dan paket simulasi 110 soal.</div>
                  </div>
                  <button type="button" onclick="App.openUpgradeModal()" class="btn-accent h-10 px-5 text-xs shrink-0">Upgrade ke Akun Pro</button>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="border border-[#111111] overflow-x-auto">
              <table class="w-full text-left border-collapse text-sm">
                <thead>
                  <tr class="border-b border-[#111111] bg-[#F7F7F8] text-xs text-[#52525B]">
                    <th class="py-3 px-4 font-semibold">Peringkat</th>
                    <th class="py-3 px-4 font-semibold">Peserta</th>
                    <th class="py-3 px-3 font-semibold">TWK</th>
                    <th class="py-3 px-3 font-semibold">TIU</th>
                    <th class="py-3 px-3 font-semibold">TKP</th>
                    <th class="py-3 px-3 font-semibold">Total</th>
                    <th class="py-3 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.leaderboard.map(function (lb) {
                    const ok = lb.status_kelulusan === 'Lulus';
                    return `<tr class="border-b border-[#DCDCE0] last:border-b-0 hover:bg-[#F7F7F8] transition-colors">
                      <td class="py-3 px-4 swiss-folio text-lg font-semibold text-[#111111]">${pad2(lb.rank)}</td>
                      <td class="py-3 px-4 font-medium text-[#111111]">${esc(lb.nama_user)}</td>
                      <td class="py-3 px-3 tabular-nums text-[#52525B]">${lb.skor_twk}</td>
                      <td class="py-3 px-3 tabular-nums text-[#52525B]">${lb.skor_tiu}</td>
                      <td class="py-3 px-3 tabular-nums text-[#52525B]">${lb.skor_tkp}</td>
                      <td class="py-3 px-3 tabular-nums font-semibold text-[#111111]">${lb.skor_total}</td>
                      <td class="py-3 px-4"><span class="px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FF4F00] text-[#FFFFFF]'}">${esc(lb.status_kelulusan).toUpperCase()}</span></td>
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
    const swissFont = { family: "'Helvetica Neue', 'Akzidenz-Grotesk', 'Söhne', Helvetica, Arial, sans-serif", size: 11 };
    const gridColor = '#DCDCE0';
    const tickColor = '#52525B';

    const ctx1 = document.getElementById('chartResultSubtes');
    if (ctx1) {
      resultCharts.push(new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['TWK', 'TIU', 'TKP'],
          datasets: [
            { label: 'Skor Anda', data: [h.skor_twk, h.skor_tiu, h.skor_tkp], backgroundColor: '#111111', borderRadius: 0, barPercentage: 0.6 },
            { label: 'Ambang PG', data: [p.pg_twk || 65, p.pg_tiu || 80, p.pg_tkp || 166], backgroundColor: '#FF4F00', borderRadius: 0, barPercentage: 0.6 }
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
            borderColor: '#FF4F00',
            borderWidth: 2,
            backgroundColor: 'rgba(255, 79, 0, 0.08)',
            fill: true,
            tension: 0,
            pointRadius: 3,
            pointBackgroundColor: '#111111'
          }]
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
          class="w-full h-10 px-4 border border-[#111111] bg-[#FFFFFF] hover:bg-[#F7F7F8] text-xs font-semibold text-[#111111] inline-flex items-center justify-between transition-colors">
          <span>Lanjutkan dengan Google (pratinjau)</span>
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>`;
      refreshIcons();
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
          <div class="p-4 bg-[#F7F7F8] border border-[#DCDCE0] space-y-1">
            <div class="font-semibold text-base text-[#111111]">${esc(u.nama_lengkap)}</div>
            <div class="text-xs text-[#52525B]">${esc(u.email)}</div>
            <div class="pt-2"><span class="px-2 py-0.5 text-xs font-semibold bg-[#111111] text-[#FFFFFF]">PERAN: ${esc(u.role).toUpperCase()}</span></div>
          </div>
          ${u.role === 'Admin' ? `<button type="button" onclick="App.closeModal(); App.go('admin')" class="btn-primary w-full h-10 px-4 text-xs text-left">Buka panel kontrol admin</button>` : ''}
          <button type="button" onclick="App.logout()" class="w-full h-10 px-4 bg-[#FF4F00] text-[#FFFFFF] font-semibold text-xs text-left transition-colors">Keluar dari akun</button>
        </div>
      `);
    },
    setPaketFilter: function (f) { state.paketFilter = f; renderDashboard(document.getElementById('app')); },
    openUpgradeModal: function () {
      const set = (state.dashData && state.dashData.settings) || {};
      openModal('Upgrade ke Akun Pro', `
        <form onsubmit="App.submitUpgrade(event)" class="space-y-4 text-sm">
          <div class="p-4 bg-[#F7F7F8] border-l-2 border-[#FF4F00] text-[#111111] text-xs space-y-1">
            <div class="font-semibold">Biaya aktivasi: ${esc(set.HARGA_PRO || 'Rp 99.000 / 6 bulan')}</div>
            <div>Tujuan transfer: <span class="tabular-nums font-semibold">${esc(set.INFO_REKENING_PRO || 'BCA 7410 8829 14 a.n. PT Simulasi Edukasi Nusantara')}</span></div>
          </div>
          <div>
            <label class="text-xs font-medium text-[#52525B]">Bukti transfer (JPG/PNG, maksimal 2MB)</label>
            <input type="file" id="upg-file" accept="image/*" class="mt-1 w-full text-xs p-3 border border-[#111111] bg-[#F7F7F8]" />
          </div>
          <div>
            <label class="text-xs font-medium text-[#52525B]">Catatan pengirim</label>
            <input type="text" id="upg-note" required placeholder="Contoh: BCA a.n. Budi Santoso" class="input-control mt-1 w-full" />
          </div>
          <button type="submit" class="btn-accent w-full h-10 px-4 text-xs text-left">Kirim bukti aktivasi</button>
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
          <div class="font-semibold text-base text-[#111111]">${esc(p.nama_paket)}</div>
          <div class="grid grid-cols-2 border-t border-l border-[#DCDCE0] text-xs tabular-nums">
            <div class="p-3 bg-[#F7F7F8] border-r border-b border-[#DCDCE0]">Durasi: <strong class="font-semibold text-[#111111]">${p.durasi_menit} menit</strong></div>
            <div class="p-3 bg-[#F7F7F8] border-r border-b border-[#DCDCE0]">Jumlah: <strong class="font-semibold text-[#111111]">${p.jumlah_soal} soal</strong></div>
            <div class="p-3 bg-[#F7F7F8] border-r border-b border-[#DCDCE0] col-span-2">Ambang batas: <strong class="font-semibold text-[#111111]">TWK ${p.pg_twk} · TIU ${p.pg_tiu} · TKP ${p.pg_tkp}</strong></div>
          </div>
          <p class="text-xs text-[#52525B] leading-relaxed">Waktu langsung berjalan saat ujian dimulai dan jawaban tersimpan otomatis di peramban Anda.</p>
          <button type="button" onclick="App.startExamNow('${esc(paketId)}')" class="btn-accent w-full h-11 px-4 text-xs uppercase tracking-[0.04em] text-left">Mulai kerjakan</button>
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
          <div class="p-4 bg-[#F7F7F8] border border-[#DCDCE0] text-xs tabular-nums space-y-1">
            <div>Terjawab: <strong class="font-semibold text-[#111111]">${dijawab} / ${total}</strong></div>
            <div>Kosong: <strong class="font-semibold ${kosong > 0 ? 'text-[#FF4F00]' : 'text-[#111111]'}">${kosong}</strong></div>
          </div>
          <p class="text-xs text-[#52525B] leading-relaxed">Setelah dikumpulkan, jawaban tidak dapat diubah dan skor TWK, TIU, TKP langsung dihitung.</p>
          <div class="flex gap-2">
            <button type="button" onclick="App.closeModal()" class="btn-outline flex-1 h-10 px-4 text-xs text-left">Periksa lagi</button>
            <button type="button" onclick="App.closeModal(); App.finishExam()" class="btn-accent flex-1 h-10 px-4 text-xs text-left">Kumpulkan</button>
          </div>
        </div>
      `);
    },
    finishExam: submitExamNow,
    setResultTab: function (t) { state.resultTab = t; renderResult(document.getElementById('app')); mountResultCharts(); },
    toggleAccordion: function (i) { state.openAccordion[i] = !state.openAccordion[i]; renderResult(document.getElementById('app')); mountResultCharts(); }
  };
})();
