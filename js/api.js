/**
 * ============================================================================
 * SimulasiTKD Pro — js/api.js
 * REST API Client (gas-pro-api + gas-scale-turbo):
 * - Wajib Content-Type: text/plain;charset=utf-8 pada POST (Bebas CORS GAS)
 * - Deduplikasi request in-flight & Write Epoch
 * - SWR Cache Instan (0ms antar menu & data)
 * - Auto-drain antrean notifikasi di background
 * - Mode Pratinjau Demo Lokal otomatis bila GAS_URL belum diisi
 * ============================================================================
 */

const ApiClient = (function () {
  const _inflight = {};
  const _memCache = {};
  let _writeEpoch = 0;

  const TOKEN_KEY = 'simtkd_session_token';
  const USER_KEY = 'simtkd_session_user';
  const DEMO_DB_KEY = 'simtkd_demo_db_v1';

  function getGasUrl() {
    const u = (window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '';
    return u && u !== 'YOUR_GAS_EXEC_URL_HERE' ? u.trim() : '';
  }

  function isDemoMode() {
    return !getGasUrl();
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getSavedUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    Object.keys(_memCache).forEach(function (k) { delete _memCache[k]; });
  }

  /** Request POST CORS-safe ke GAS + Deduplikasi + SWR */
  async function call(action, data, opts) {
    opts = opts || {};
    if (isDemoMode()) {
      return DemoBackend.handle(action, data || {}, getToken());
    }

    const isRead = /^(public\.|auth\.config|auth\.me|peserta\.dashboard|peserta\.leaderboard|peserta\.resultDetail|admin\.overview|admin\.get|admin\.crmList|admin\.notifConfig)/i.test(action);
    const cacheKey = action + '|' + JSON.stringify(data || {});

    if (!isRead) {
      _writeEpoch++;
      Object.keys(_memCache).forEach(function (k) { delete _memCache[k]; });
    } else if (!opts.forceFresh && _memCache[cacheKey]) {
      const entry = _memCache[cacheKey];
      if (Date.now() - entry.ts < (opts.ttlMs || 45000)) {
        return entry.val;
      }
    }

    const inflightKey = _writeEpoch + '|' + cacheKey;
    if (isRead && _inflight[inflightKey]) return _inflight[inflightKey];

    const promise = (async function () {
      const res = await fetch(getGasUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // WAJIB anti-CORS GAS
        body: JSON.stringify({
          action: action,
          data: data || {},
          token: getToken()
        })
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || 'Permintaan gagal diproses server.');
      }
      if (isRead) {
        _memCache[cacheKey] = { ts: Date.now(), val: json.data };
      }
      // Background drain antrean notifikasi tanpa memblokir UI (gas-scale-turbo)
      if (json.nq && json.nq > 0 && action !== 'notif.drain') {
        setTimeout(function () {
          fetch(getGasUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'notif.drain', data: {}, token: getToken() })
          }).catch(function () {});
        }, 400);
      }
      return json.data;
    })();

    if (isRead) {
      _inflight[inflightKey] = promise;
      promise.finally(function () { delete _inflight[inflightKey]; });
    }
    return promise;
  }

  function invalidateCache() {
    _writeEpoch++;
    Object.keys(_memCache).forEach(function (k) { delete _memCache[k]; });
  }

  // ==========================================================================
  // DEMO BACKEND LOKAL (Aktif otomatis jika GAS_URL belum dikonfigurasi)
  // Memungkinkan uji coba instan 0ms seluruh fitur Peserta + Admin di browser!
  // ==========================================================================
  const DemoBackend = (function () {
    function loadDb() {
      try {
        const raw = localStorage.getItem(DEMO_DB_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      const seed = createSeed();
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(seed));
      return seed;
    }

    function saveDb(db) {
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    }

    function createSeed() {
      return {
        settings: {
          NAMA_PLATFORM: 'SimulasiTKD Pro',
          HARGA_PRO: 'Rp 99.000 / 6 Bulan',
          INFO_REKENING_PRO: 'BCA 1234567890 a.n. SimulasiTKD Pro / QRIS Resmi',
          WA_ADMIN: '081234567890',
          PG_TWK_DEFAULT: '65',
          PG_TIU_DEFAULT: '80',
          PG_TKP_DEFAULT: '166',
          OAUTH_GOOGLE_AKTIF: 'YA',
          APP_URL: window.location.href
        },
        secrets: [
          { key: 'FONNTE_TOKEN', ada: false, masked: '' },
          { key: 'GOOGLE_CLIENT_ID', ada: false, masked: '' },
          { key: 'WEBHOOK_SECRET', ada: false, masked: '' }
        ],
        notifConfig: {
          waAktif: true,
          emailAktif: true,
          fonnteAda: false,
          matriks: {
            PENDAFTARAN_MASUK: { label: 'Pendaftaran akun latihan baru', wa: true, email: true },
            UPGRADE_REQUEST: { label: 'Pengajuan upgrade ke Pro diterima', wa: true, email: true },
            UPGRADE_APPROVED: { label: 'Akun Pro disetujui & aktif', wa: true, email: true },
            UPGRADE_REJECTED: { label: 'Pengajuan upgrade Pro ditolak', wa: true, email: true },
            HASIL_TRYOUT: { label: 'Ringkasan skor selesai tryout', wa: false, email: true }
          }
        },
        users: [
          { user_id: 'USR-001', nama_lengkap: 'Budi Santoso', email: 'budi@demo.id', no_wa: '081234567801', password: 'demo123', role: 'Latihan', status_akun: 'Aktif', status_upgrade: 'None', tanggal_daftar: '2026-11-10T08:00:00Z' },
          { user_id: 'USR-002', nama_lengkap: 'Raka Pratama', email: 'raka@demo.id', no_wa: '081234567802', password: 'demo123', role: 'Pro', status_akun: 'Aktif', status_upgrade: 'Approved', tanggal_daftar: '2026-11-05T09:00:00Z' },
          { user_id: 'USR-003', nama_lengkap: 'Siti Nurhaliza', email: 'siti@demo.id', no_wa: '081234567803', password: 'demo123', role: 'Pro', status_akun: 'Aktif', status_upgrade: 'Approved', tanggal_daftar: '2026-11-06T10:00:00Z' },
          { user_id: 'USR-004', nama_lengkap: 'Rina Kusuma', email: 'rina@demo.id', no_wa: '081234567804', password: 'demo123', role: 'Latihan', status_akun: 'Aktif', status_upgrade: 'Pending', tanggal_daftar: '2026-11-20T09:42:00Z' },
          { user_id: 'USR-ADMIN', nama_lengkap: 'Admin SimulasiTKD', email: 'admin@demo.id', no_wa: '081234567890', password: 'admin123', role: 'Admin', status_akun: 'Aktif', status_upgrade: 'Approved', tanggal_daftar: '2026-11-01T07:00:00Z' }
        ],
        paket: [
          { paket_id: 'PKT-001', nama_paket: 'Tryout Mini SKD CPNS #01', deskripsi: 'Simulasi pengenalan sistem CAT dengan komposisi soal TWK, TIU, dan TKP dasar.', kategori_label: 'CPNS SKD', tier_akses: 'Latihan', durasi_menit: 15, jumlah_soal: 6, pg_twk: 10, pg_tiu: 10, pg_tkp: 8, status_aktif: 'Aktif' },
          { paket_id: 'PKT-002', nama_paket: 'Latihan Dasar TKD BUMN', deskripsi: 'Uji kecepatan verbal, numerik, dan diagramatik untuk persiapan seleksi BUMN.', kategori_label: 'BUMN TKD', tier_akses: 'Latihan', durasi_menit: 15, jumlah_soal: 6, pg_twk: 10, pg_tiu: 10, pg_tkp: 8, status_aktif: 'Aktif' },
          { paket_id: 'PKT-003', nama_paket: 'Tryout Akbar SKD CPNS 2025 #01', deskripsi: 'Simulasi penuh standar BKN dengan soal HOTS terbaru, pembahasan lengkap, dan peringkat nasional.', kategori_label: 'CPNS SKD', tier_akses: 'Pro', durasi_menit: 100, jumlah_soal: 110, pg_twk: 65, pg_tiu: 80, pg_tkp: 166, status_aktif: 'Aktif' },
          { paket_id: 'PKT-004', nama_paket: 'Simulasi SKD Sekolah Kedinasan', deskripsi: 'Paket khusus persiapan STAN, STIS, dan IPDN dengan tingkat kesulitan adaptif.', kategori_label: 'Kedinasan', tier_akses: 'Pro', durasi_menit: 100, jumlah_soal: 110, pg_twk: 65, pg_tiu: 80, pg_tkp: 166, status_aktif: 'Aktif' }
        ],
        soal: [
          { soal_id: 'SOAL-001', paket_id: 'PKT-001', nomor_urut: 1, subtes: 'TWK', topik: 'Pilar Negara', pertanyaan: 'Dalam konteks menjaga keutuhan NKRI, implementasi nilai-nilai Pancasila sila ketiga di lingkungan kerja ASN dapat diwujudkan melalui...', drive_image_id: '', opsi_a: 'Mengutamakan kepentingan golongan di atas kepentingan umum', opsi_b: 'Menjaga netralitas dan tidak diskriminatif dalam pelayanan publik', opsi_c: 'Menolak bekerja sama dengan rekan dari latar belakang berbeda', opsi_d: 'Memprioritaskan daerah asal dalam pengambilan keputusan', opsi_e: 'Mengikuti seluruh rapat tanpa memberikan kontribusi', kunci_atau_bobot: 'B', pembahasan: 'Sila ketiga Pancasila (Persatuan Indonesia) menuntut ASN untuk bersikap netral, adil, dan tidak diskriminatif dalam melayani seluruh lapisan masyarakat.' },
          { soal_id: 'SOAL-002', paket_id: 'PKT-001', nomor_urut: 2, subtes: 'TWK', topik: 'Integritas', pertanyaan: 'Seorang pejabat publik menolak pemberian bingkisan bernilai besar dari vendor proyek meski proyek sudah selesai. Sikap ini mencerminkan nilai...', drive_image_id: '', opsi_a: 'Kepedulian sosial', opsi_b: 'Kemauan bekerja keras', opsi_c: 'Integritas dan anti-gratifikasi', opsi_d: 'Kerendahan hati', opsi_e: 'Disiplin waktu', kunci_atau_bobot: 'C', pembahasan: 'Menolak gratifikasi yang berhubungan dengan jabatan merupakan wujud nyata integritas dan kepatuhan terhadap kode etik ASN.' },
          { soal_id: 'SOAL-003', paket_id: 'PKT-001', nomor_urut: 3, subtes: 'TIU', topik: 'Aritmetika Sosial', pertanyaan: 'Sebuah proyek pembangunan gedung perkantoran direncanakan selesai dalam waktu 45 hari jika dikerjakan oleh 24 orang pekerja. Setelah berjalan selama 15 hari, pekerjaan terpaksa dihentikan selama 6 hari karena kendala cuaca ekstrem. Agar proyek dapat selesai tepat waktu, berapa banyak tambahan pekerja yang diperlukan?', drive_image_id: '', opsi_a: '4 orang', opsi_b: '6 orang', opsi_c: '8 orang', opsi_d: '10 orang', opsi_e: '12 orang', kunci_atau_bobot: 'B', pembahasan: 'Sisa waktu normal = 45 - 15 = 30 hari (24 pekerja). Setelah berhenti 6 hari, sisa waktu = 24 hari. Perbandingan berbalik nilai: 30 × 24 = 24 × P → P = 30 pekerja. Tambahan pekerja = 30 - 24 = 6 orang.' },
          { soal_id: 'SOAL-004', paket_id: 'PKT-001', nomor_urut: 4, subtes: 'TIU', topik: 'Silogisme', pertanyaan: 'Semua ASN wajib mengikuti pelatihan dasar. Sebagian peserta pelatihan dasar adalah lulusan terbaik universitas. Kesimpulan yang paling tepat adalah...', drive_image_id: '', opsi_a: 'Semua lulusan terbaik adalah ASN', opsi_b: 'Sebagian ASN adalah lulusan terbaik universitas', opsi_c: 'Tidak ada ASN yang bukan lulusan terbaik', opsi_d: 'Semua peserta pelatihan bukan ASN', opsi_e: 'Sebagian lulusan terbaik tidak wajib pelatihan', kunci_atau_bobot: 'B', pembahasan: 'Karena semua ASN adalah peserta pelatihan dan sebagian peserta pelatihan adalah lulusan terbaik, maka sebagian ASN adalah lulusan terbaik.' },
          { soal_id: 'SOAL-005', paket_id: 'PKT-001', nomor_urut: 5, subtes: 'TKP', topik: 'Pelayanan Publik', pertanyaan: 'Saat antrean loket sedang padat, seorang lansia tampak kebingungan mengisi formulir digital di mesin anjungan mandiri. Sikap Anda sebagai petugas adalah...', drive_image_id: '', opsi_a: 'Memintanya membaca petunjuk di layar dengan teliti', opsi_b: 'Menghampiri dengan ramah dan membantu mengisikan formulir sesuai datanya', opsi_c: 'Menyuruh petugas keamanan menanganinya', opsi_d: 'Memintanya datang kembali besok saat antrean sepi', opsi_e: 'Membiarkannya karena masih banyak antrean lain', kunci_atau_bobot: 'A:2,B:5,C:3,D:1,E:1', pembahasan: 'Pelayanan publik berorientasi pada empati, responsivitas, dan bantuan langsung kepada kelompok rentan/lansia (Opsi B bernilai maksimal 5).' },
          { soal_id: 'SOAL-006', paket_id: 'PKT-001', nomor_urut: 6, subtes: 'TKP', topik: 'Jejaring Kerja', pertanyaan: 'Rekan kerja Anda meminta bantuan menyelesaikan laporan mendadak padahal Anda juga memiliki tenggat waktu laporan sendiri hari ini. Tindakan terbaik Anda adalah...', drive_image_id: '', opsi_a: 'Menolak mentah-mentah karena bukan tugas Anda', opsi_b: 'Langsung meninggalkan pekerjaan sendiri demi membantu rekan', opsi_c: 'Menyelesaikan prioritas utama Anda terlebih dahulu lalu membantu bagian yang bisa dikolaborasikan', opsi_d: 'Mengeluh kepada atasan soal beban kerja rekan', opsi_e: 'Menunda kedua pekerjaan hingga besok pagi', kunci_atau_bobot: 'A:1,B:3,C:5,D:2,E:1', pembahasan: 'Kolaborasi efektif menyeimbangkan tanggung jawab pribadi dan dukungan tim secara profesional (Opsi C bernilai 5).' }
        ],
        hasil: [
          { hasil_id: 'HSL-101', user_id: 'USR-002', nama_user: 'Raka Pratama', paket_id: 'PKT-003', nama_paket: 'Tryout Akbar SKD CPNS 2025 #01', waktu_mulai: '2026-11-22T08:00:00Z', waktu_selesai: '2026-11-22T09:28:00Z', durasi_pakai_detik: 5280, skor_twk: 115, skor_tiu: 145, skor_tkp: 198, skor_total: 458, status_kelulusan: 'Lulus', detail_jawaban_json: '{}' },
          { hasil_id: 'HSL-102', user_id: 'USR-003', nama_user: 'Siti Nurhaliza', paket_id: 'PKT-003', nama_paket: 'Tryout Akbar SKD CPNS 2025 #01', waktu_mulai: '2026-11-23T08:00:00Z', waktu_selesai: '2026-11-23T09:31:00Z', durasi_pakai_detik: 5460, skor_twk: 105, skor_tiu: 130, skor_tkp: 192, skor_total: 427, status_kelulusan: 'Lulus', detail_jawaban_json: '{}' },
          { hasil_id: 'HSL-103', user_id: 'USR-001', nama_user: 'Budi Santoso', paket_id: 'PKT-001', nama_paket: 'Tryout Mini SKD CPNS #01', waktu_mulai: '2026-11-23T10:00:00Z', waktu_selesai: '2026-11-23T10:12:00Z', durasi_pakai_detik: 720, skor_twk: 10, skor_tiu: 10, skor_tkp: 9, skor_total: 29, status_kelulusan: 'Lulus', detail_jawaban_json: '{"SOAL-001":"B","SOAL-002":"C","SOAL-003":"B","SOAL-004":"B","SOAL-005":"B","SOAL-006":"C"}' }
        ],
        upgrades: [
          { req_id: 'UPG-001', user_id: 'USR-004', nama_user: 'Rina Kusuma', email_user: 'rina@demo.id', no_wa_user: '081234567804', url_bukti_drive: '', catatan_user: 'Transfer BCA Rp 99.000 a.n Rina', status_verifikasi: 'Pending', diproses_oleh: '', tanggal_request: '2026-11-24T09:42:00Z', tanggal_proses: '', catatan_admin: '' }
        ],
        crmKontak: [
          { KontakID: 'KTK-001', Nama: 'Budi Santoso', Email: 'budi@demo.id', NoWA: '081234567801', Segmen: 'Latihan', Tag: 'lead-trial', StatusWA: 'Terdaftar', OptOut: 'TIDAK', Catatan: '' },
          { KontakID: 'KTK-002', Nama: 'Raka Pratama', Email: 'raka@demo.id', NoWA: '081234567802', Segmen: 'Pro', Tag: 'member-pro', StatusWA: 'Terdaftar', OptOut: 'TIDAK', Catatan: '' },
          { KontakID: 'KTK-003', Nama: 'Rina Kusuma', Email: 'rina@demo.id', NoWA: '081234567804', Segmen: 'Latihan', Tag: 'pending-upgrade', StatusWA: 'Belum Dicek', OptOut: 'TIDAK', Catatan: '' }
        ],
        blasts: []
      };
    }

    function currentUser(db, token) {
      const uid = String(token || '').replace('demo-token-', '');
      return db.users.find(function (u) { return u.user_id === uid; });
    }

    function parseTkp(raw) {
      const m = { A: 1, B: 1, C: 1, D: 1, E: 1 };
      String(raw || '').split(',').forEach(function (p) {
        const kv = p.split(':');
        if (kv.length === 2) m[kv[0].trim().toUpperCase()] = Number(kv[1]) || 0;
      });
      return m;
    }

    async function handle(action, data, token) {
      const db = loadDb();
      if (action === 'public.init') {
        return { settings: db.settings, paket: db.paket, stats: { totalPaket: db.paket.length, standarSoal: 110 } };
      }
      if (action === 'auth.config') {
        const gItem = (db.secrets || []).find(function (s) { return s.key === 'GOOGLE_CLIENT_ID'; });
        const aktif = db.settings.OAUTH_GOOGLE_AKTIF !== 'TIDAK';
        return {
          googleOAuthEnabled: aktif,
          googleClientId: (gItem && gItem.ada) ? 'DEMO_CLIENT_ID' : 'DEMO_CLIENT_ID',
          demoOAuth: true
        };
      }
      if (action === 'auth.googleLogin') {
        const email = 'peserta.google@gmail.com';
        let u = db.users.find(function (x) { return x.email === email; });
        let isNew = false;
        if (!u) {
          isNew = true;
          u = {
            user_id: 'USR-G' + Date.now().toString().slice(-3),
            nama_lengkap: 'Peserta Google (Demo)',
            email: email,
            no_wa: '',
            password: '',
            role: 'Latihan',
            status_akun: 'Aktif',
            status_upgrade: 'None',
            tanggal_daftar: new Date().toISOString()
          };
          db.users.push(u);
          saveDb(db);
        }
        return { token: 'demo-token-' + u.user_id, isNewUser: isNew, user: u };
      }
      if (action === 'auth.login') {
        const em = String(data.email || '').toLowerCase().trim();
        const u = db.users.find(function (x) { return x.email === em && x.password === data.password; });
        if (!u) throw new Error('Email atau kata sandi salah. (Demo: budi@demo.id / demo123 atau admin@demo.id / admin123)');
        return { token: 'demo-token-' + u.user_id, user: u };
      }
      if (action === 'auth.emergencyLogin') {
        if (data.username === 'darurat' && data.password === 'admin123') {
          const u = db.users.find(function (x) { return x.role === 'Admin'; });
          return { token: 'demo-token-' + u.user_id, user: u };
        }
        throw new Error('Mode Demo: gunakan darurat / admin123.');
      }
      if (action === 'auth.register') {
        const em = String(data.email || '').toLowerCase().trim();
        if (db.users.some(function (x) { return x.email === em; })) throw new Error('Email sudah terdaftar.');
        const nu = {
          user_id: 'USR-' + Date.now().toString().slice(-4),
          nama_lengkap: data.nama_lengkap,
          email: em,
          no_wa: data.no_wa || '',
          password: data.password,
          role: 'Latihan',
          status_akun: 'Aktif',
          status_upgrade: 'None',
          tanggal_daftar: new Date().toISOString()
        };
        db.users.push(nu);
        db.crmKontak.push({ KontakID: 'KTK-' + Date.now().toString().slice(-4), Nama: nu.nama_lengkap, Email: nu.email, NoWA: nu.no_wa, Segmen: 'Latihan', Tag: 'lead-trial', StatusWA: 'Belum Dicek', OptOut: 'TIDAK', Catatan: '' });
        saveDb(db);
        return { token: 'demo-token-' + nu.user_id, user: nu };
      }
      if (action === 'auth.logout') return { loggedOut: true };

      const me = currentUser(db, token);
      if (!me) throw new Error('Sesi berakhir. Silakan masuk kembali.');

      if (action === 'auth.me') return { user: me };

      if (action === 'peserta.dashboard') {
        const myH = db.hasil.filter(function (h) { return h.user_id === me.user_id; }).sort(function (a, b) { return new Date(b.waktu_selesai) - new Date(a.waktu_selesai); });
        const best = myH.reduce(function (m, x) { return Math.max(m, Number(x.skor_total || 0)); }, 0);
        return {
          user: me,
          settings: db.settings,
          paket: db.paket,
          kpi: { tryoutSelesai: myH.length, skorTertinggi: best, terakhir: myH[0] || null },
          riwayat: myH
        };
      }

      if (action === 'peserta.startExam') {
        const pkt = db.paket.find(function (p) { return p.paket_id === data.paket_id; });
        if (!pkt) throw new Error('Paket tidak ditemukan.');
        if (pkt.tier_akses === 'Pro' && me.role !== 'Pro' && me.role !== 'Admin') throw new Error('Paket khusus Akun Pro.');
        let soal = db.soal.filter(function (s) { return s.paket_id === pkt.paket_id; });
        if (!soal.length) soal = db.soal; // Fallback demo questions
        return {
          paket: pkt,
          waktu_mulai: new Date().toISOString(),
          soal: soal.map(function (s, idx) {
            return {
              soal_id: s.soal_id,
              nomor_urut: idx + 1,
              subtes: s.subtes,
              topik: s.topik,
              pertanyaan: s.pertanyaan,
              image_url: s.drive_image_id || '',
              opsi: { A: s.opsi_a, B: s.opsi_b, C: s.opsi_c, D: s.opsi_d, E: s.opsi_e }
            };
          })
        };
      }

      if (action === 'peserta.submitExam') {
        const pkt = db.paket.find(function (p) { return p.paket_id === data.paket_id; }) || db.paket[0];
        let soal = db.soal.filter(function (s) { return s.paket_id === pkt.paket_id; });
        if (!soal.length) soal = db.soal;
        const ans = data.answers || {};
        let twk = 0, tiu = 0, tkp = 0;
        soal.forEach(function (s) {
          const p = (ans[s.soal_id] || '').toUpperCase();
          if (!p) return;
          if (s.subtes === 'TKP') tkp += Number(parseTkp(s.kunci_atau_bobot)[p] || 0);
          else if (p === String(s.kunci_atau_bobot).toUpperCase()) {
            if (s.subtes === 'TWK') twk += 5; else tiu += 5;
          }
        });
        const total = twk + tiu + tkp;
        const lulus = twk >= pkt.pg_twk && tiu >= pkt.pg_tiu && tkp >= pkt.pg_tkp;
        const row = {
          hasil_id: 'HSL-' + Date.now().toString().slice(-5),
          user_id: me.user_id,
          nama_user: me.nama_lengkap,
          paket_id: pkt.paket_id,
          nama_paket: pkt.nama_paket,
          waktu_mulai: data.waktu_mulai,
          waktu_selesai: new Date().toISOString(),
          durasi_pakai_detik: data.durasi_pakai_detik || 120,
          skor_twk: twk,
          skor_tiu: tiu,
          skor_tkp: tkp,
          skor_total: total,
          status_kelulusan: lulus ? 'Lulus' : 'Tidak Lulus',
          detail_jawaban_json: JSON.stringify(ans)
        };
        db.hasil.unshift(row);
        saveDb(db);
        return row;
      }

      if (action === 'peserta.resultDetail') {
        const h = db.hasil.find(function (x) { return x.hasil_id === data.hasil_id; }) || db.hasil[0];
        const pkt = db.paket.find(function (p) { return p.paket_id === h.paket_id; }) || db.paket[0];
        let soal = db.soal.filter(function (s) { return s.paket_id === h.paket_id; });
        if (!soal.length) soal = db.soal;
        const ans = JSON.parse(h.detail_jawaban_json || '{}');
        const isPro = me.role === 'Pro' || me.role === 'Admin';
        const pembahasan = soal.map(function (s, idx) {
          const locked = !isPro && idx >= 3;
          const pick = (ans[s.soal_id] || '').toUpperCase();
          let poin = 0, benar = false;
          if (s.subtes === 'TKP') { poin = pick ? Number(parseTkp(s.kunci_atau_bobot)[pick] || 0) : 0; benar = poin === 5; }
          else { benar = pick && pick === String(s.kunci_atau_bobot).toUpperCase(); poin = benar ? 5 : 0; }
          if (locked) return { nomor_urut: idx + 1, subtes: s.subtes, topik: s.topik, locked: true };
          return {
            soal_id: s.soal_id, nomor_urut: idx + 1, subtes: s.subtes, topik: s.topik,
            pertanyaan: s.pertanyaan, opsi: { A: s.opsi_a, B: s.opsi_b, C: s.opsi_c, D: s.opsi_d, E: s.opsi_e },
            jawaban_user: pick, kunci_atau_bobot: s.kunci_atau_bobot, poin: poin, benar: benar, pembahasan: s.pembahasan, locked: false
          };
        });
        const myTrend = db.hasil.filter(function (x) { return x.user_id === h.user_id; }).reverse().map(function (x, i) { return { label: 'TO #' + (i + 1), total: x.skor_total }; });
        return { hasil: h, paket: pkt, isPro: isPro, lockedCount: isPro ? 0 : Math.max(0, soal.length - 3), pembahasan: pembahasan, trend: myTrend };
      }

      if (action === 'peserta.leaderboard') {
        return db.hasil.slice().sort(function (a, b) { return b.skor_total - a.skor_total; }).map(function (h, i) {
          return Object.assign({ rank: i + 1 }, h);
        });
      }

      if (action === 'peserta.requestUpgrade') {
        const req = {
          req_id: 'UPG-' + Date.now().toString().slice(-4),
          user_id: me.user_id, nama_user: me.nama_lengkap, email_user: me.email, no_wa_user: me.no_wa,
          url_bukti_drive: data.fileBase64 || '', catatan_user: data.catatan || '',
          status_verifikasi: 'Pending', tanggal_request: new Date().toISOString(), catatan_admin: ''
        };
        db.upgrades.unshift(req);
        me.status_upgrade = 'Pending';
        saveDb(db);
        return req;
      }

      // Admin Demo Endpoints
      if (me.role !== 'Admin') throw new Error('Khusus Administrator.');

      if (action === 'admin.overview') {
        const peserta = db.users.filter(function (u) { return u.role !== 'Admin'; });
        const pro = peserta.filter(function (u) { return u.role === 'Pro'; }).length;
        const pend = db.upgrades.filter(function (r) { return r.status_verifikasi === 'Pending'; }).length;
        const lulus = db.hasil.filter(function (h) { return h.status_kelulusan === 'Lulus'; }).length;
        return {
          kpi: {
            totalPeserta: peserta.length, totalPro: pro, totalLatihan: peserta.length - pro,
            rasioPro: peserta.length ? Math.round((pro / peserta.length) * 1000) / 10 : 0,
            pendingUpgrade: pend,
            passRate: db.hasil.length ? Math.round((lulus / db.hasil.length) * 1000) / 10 : 0,
            totalSoal: db.soal.length
          },
          weeklyChart: [
            { label: 'Sen', total: 14, lulus: 9 }, { label: 'Sel', total: 22, lulus: 15 },
            { label: 'Rab', total: 18, lulus: 12 }, { label: 'Kam', total: 26, lulus: 18 },
            { label: 'Jum', total: 20, lulus: 13 }, { label: 'Sab', total: 31, lulus: 22 },
            { label: 'Min', total: 25, lulus: 17 }
          ],
          upgrades: db.upgrades
        };
      }

      if (action === 'admin.processUpgrade') {
        const req = db.upgrades.find(function (r) { return r.req_id === data.req_id; });
        if (req) {
          req.status_verifikasi = data.decision;
          req.catatan_admin = data.catatan_admin || (data.decision === 'Approved' ? 'Terverifikasi' : 'Ditolak');
          const u = db.users.find(function (x) { return x.user_id === req.user_id; });
          if (u) {
            u.status_upgrade = data.decision;
            if (data.decision === 'Approved') u.role = 'Pro';
          }
          saveDb(db);
        }
        return { status: data.decision };
      }

      if (action === 'admin.getQuestions') {
        const soal = data.paket_id ? db.soal.filter(function (s) { return s.paket_id === data.paket_id; }) : db.soal;
        return { paket: db.paket, soal: soal };
      }

      if (action === 'admin.saveQuestion') {
        const idx = db.soal.findIndex(function (s) { return s.soal_id === data.soal_id; });
        if (idx > -1) {
          db.soal[idx] = Object.assign(db.soal[idx], data);
        } else {
          data.soal_id = 'SOAL-' + Date.now().toString().slice(-4);
          db.soal.push(data);
        }
        saveDb(db);
        return data;
      }

      if (action === 'admin.importQuestions') {
        const pid = data.paket_id;
        const items = Array.isArray(data.items) ? data.items : [];
        let maxNo = db.soal.filter(function (s) { return s.paket_id === pid; }).reduce(function (m, s) { return Math.max(m, Number(s.nomor_urut || 0)); }, 0);
        let added = 0;
        items.forEach(function (it, i) {
          if (!String(it.pertanyaan || '').trim()) return;
          maxNo++;
          db.soal.push({
            soal_id: 'SOAL-' + Date.now().toString().slice(-4) + '-' + i,
            paket_id: pid,
            nomor_urut: Number(it.nomor_urut || maxNo),
            subtes: String(it.subtes || 'TWK').toUpperCase(),
            topik: it.topik || '',
            pertanyaan: it.pertanyaan,
            drive_image_id: it.drive_image_id || '',
            opsi_a: it.opsi_a || '',
            opsi_b: it.opsi_b || '',
            opsi_c: it.opsi_c || '',
            opsi_d: it.opsi_d || '',
            opsi_e: it.opsi_e || '',
            kunci_atau_bobot: it.kunci_atau_bobot || 'A',
            pembahasan: it.pembahasan || ''
          });
          added++;
        });
        const pkt = db.paket.find(function (p) { return p.paket_id === pid; });
        const totalInPkg = db.soal.filter(function (s) { return s.paket_id === pid; }).length;
        if (pkt) pkt.jumlah_soal = totalInPkg;
        saveDb(db);
        return { imported: added, totalInPackage: totalInPkg };
      }

      if (action === 'admin.deleteQuestion') {
        db.soal = db.soal.filter(function (s) { return s.soal_id !== data.soal_id; });
        saveDb(db);
        return { deleted: data.soal_id };
      }

      if (action === 'admin.savePackage') {
        const idx = db.paket.findIndex(function (p) { return p.paket_id === data.paket_id; });
        if (idx > -1) db.paket[idx] = Object.assign(db.paket[idx], data);
        else { data.paket_id = 'PKT-' + Date.now().toString().slice(-3); db.paket.push(data); }
        saveDb(db);
        return data;
      }

      if (action === 'admin.getReports') {
        return { users: db.users.filter(function (u) { return u.role !== 'Admin'; }), hasil: db.hasil };
      }

      if (action === 'admin.updateUserTier') {
        const u = db.users.find(function (x) { return x.user_id === data.user_id; });
        if (u) { u.role = data.role; u.status_upgrade = data.role === 'Pro' ? 'Approved' : 'None'; saveDb(db); }
        return { role: data.role };
      }

      if (action === 'admin.crmList') return { kontak: db.crmKontak, blasts: db.blasts, antrian: [] };
      if (action === 'admin.crmSync') return { inserted: 0, updated: 0, total: db.crmKontak.length };
      if (action === 'admin.crmUpdate') {
        const k = db.crmKontak.find(function (x) { return x.KontakID === data.kontakId; });
        if (k) {
          if (data.tag !== undefined) k.Tag = data.tag;
          if (data.optOut !== undefined) k.OptOut = data.optOut ? 'YA' : 'TIDAK';
          saveDb(db);
        }
        return { success: true };
      }
      if (action === 'admin.crmValidateWA') return { checked: 1, registered: 1 };
      if (action === 'admin.notifConfig') return db.notifConfig;
      if (action === 'admin.saveNotifConfig') {
        db.notifConfig = Object.assign(db.notifConfig, data);
        saveDb(db);
        return db.notifConfig;
      }
      if (action === 'admin.createBlast') {
        const b = { BlastID: 'BLW-' + Date.now().toString().slice(-4), Judul: data.judul, Sasaran: data.sasaran, Total: db.crmKontak.length, Terkirim: db.crmKontak.length, Gagal: 0, Status: 'Selesai', Tanggal: new Date().toISOString() };
        db.blasts.unshift(b);
        saveDb(db);
        return { blastId: b.BlastID, total: b.Total, message: 'Simulasi Blast WA berhasil dijadwalkan!' };
      }
      if (action === 'admin.getSecrets') return { secrets: db.secrets, settings: db.settings };
      if (action === 'admin.saveSecret') {
        if (data.secrets) {
          Object.keys(data.secrets).forEach(function (k) {
            const val = String(data.secrets[k] || '').trim();
            const item = db.secrets.find(function (s) { return s.key === k; });
            if (!item || !val) return;
            if (val === '__HAPUS__') { item.ada = false; item.masked = ''; }
            else { item.ada = true; item.masked = val.slice(0, 4) + '••••••' + val.slice(-3); }
          });
        }
        if (data.settings) Object.assign(db.settings, data.settings);
        saveDb(db);
        return { secrets: db.secrets, settings: db.settings };
      }
      if (action === 'admin.runMigration') {
        return {
          dryRun: !!data.dryRun,
          sourceName: 'Spreadsheet Lama (Simulasi Demo)',
          report: [
            { sheet: 'Users', inserted: 12, updated: 2, skipped: 4 },
            { sheet: 'Paket_Ujian', inserted: 2, updated: 0, skipped: 4 },
            { sheet: 'Bank_Soal', inserted: 55, updated: 0, skipped: 6 },
            { sheet: 'Riwayat_Hasil', inserted: 28, updated: 0, skipped: 3 }
          ]
        };
      }

      throw new Error('Action demo tidak dikenal: ' + action);
    }

    return { handle: handle };
  })();

  return {
    call: call,
    isDemoMode: isDemoMode,
    getToken: getToken,
    setSession: setSession,
    getSavedUser: getSavedUser,
    clearSession: clearSession,
    invalidateCache: invalidateCache
  };
})();
