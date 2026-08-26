/**
 * ==============================================================================
 * SISTEM PRETEST MATEMATIKA MULTI-VARIAN (SKALA ±9000 MAHASISWA)
 * TELKOM UNIVERSITY - MATH CENTER
 * File Utama: Code.gs (All-in-One Google Apps Script)
 * 
 * Modul Terpadu:
 * 1. Konfigurasi Terpusat & Helper Global
 * 2. Generator Google Form Multi-Varian dari Bank Soal (Bebas Login & Auto-Prefill)
 * 3. Portal Web App 1 Link Tunggal & Redirection Engine
 * 4. Agregasi & Rekapitulasi Nilai Otomatis Terpadu (Quiz Native)
 * 5. Menu Kustom Google Sheets & Trigger Otomatis
 * ==============================================================================
 */

// ==============================================================================
// MODUL 1: KONFIGURASI TERPUSAT & HELPER GLOBAL
// ==============================================================================

const CONFIG = {
  // Nama-nama Sheet di Google Spreadsheet Pusat
  SHEET_BANK_SOAL: 'BankSoal',
  SHEET_KONFIG_SECTION: 'KonfigSection',
  SHEET_DAFTAR_VARIAN: 'DaftarVarianForm',
  SHEET_REKAP_NILAI: 'RekapNilai',
  
  // Konfigurasi Form Pretest
  JUDUL_PRETEST: 'Pretest Matematika',
  DESKRIPSI_FORM: 'Kerjakan seluruh soal dengan teliti dan mandiri. ' +
                  'Data identitas Anda telah terisi otomatis pada lembar soal.',
  PESAN_KONFIRMASI: 'Terima kasih! Jawaban pretest Anda telah berhasil direkam ke sistem. ' +
                    'Nilai Anda akan otomatis diproses dan direkapitulasi.',
  
  // Pengaturan Varian & Poin
  JUMLAH_VARIAN_DEFAULT: 8,      // Rekomendasi 8-12 varian untuk ±9000 mahasiswa
  DEFAULT_POIN_SOAL: 1,          // Poin per butir soal jika kolom Poin kosong
  KKM_KELULUSAN: 60,             // Standar KKM skala 100 untuk status kelulusan
  
  // Pengaturan Redirection Portal
  DURASI_REDIRECT_DETIK: 3,      // Hitung mundur sebelum auto-redirect di portal
  VALIDASI_DOMAIN_EMAIL: '',     // Kosongkan agar menerima email valid (@gmail.com / @student), atau isi '@student.telkomuniversity.ac.id' jika dibatasi
  
  // Pengaturan Keamanan Google Form (Anti Submit Ganda & Anti Joki)
  // Set true: Wajib login akun Google Workspace kampus (@telkomuniversity.ac.id) dan kunci 1 respon per akun.
  // Set false: Akses publik bebas tanpa login Google akun manapun (disarankan untuk mahasiswa baru yang belum tentu punya SSO/email institusi).
  // Catatan: field email TETAP hanya satu (input manual "Email Mahasiswa" di bawah) berapa pun nilai flag ini,
  // karena kolom "Collect Email" bawaan Google Form sengaja dimatikan agar tidak dobel dengan field manual.
  BATASI_LOGIN_DOMAIN_TELKOM: false,
  
  // Kebijakan Deduplikasi Nilai (jika ada input ganda)
  // 'LATEST': Ambil respon terakhir, 'EARLIEST': Ambil respon pertama
  DEDUP_POLICY: 'LATEST',

  // Pengaturan Render Soal Berbasis LaTeX (Opsi B)
  CODECOGS_DPI: 200,                    // Resolusi gambar hasil render LaTeX
  JEDA_ANTAR_RENDER_MS: 250,            // Jeda antar hit ke CodeCogs saat generate (hindari throttle)
  FOLDER_CACHE_GAMBAR_LATEX: 'Cache Gambar Soal LaTeX - Pretest Matematika', // Folder Drive penyimpanan cache gambar

  // Default estimasi durasi per section (menit) jika kolom DurasiMenit di KonfigSection kosong
  DEFAULT_DURASI_SECTION_MENIT: 10
};

/**
 * Mendapatkan referensi Spreadsheet aktif dengan fallback ScriptProperties.
 * Memastikan Web App dapat membaca spreadsheet meskipun diakses anonim/eksternal.
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      // Simpan ID spreadsheet ke ScriptProperties untuk keandalan Web App
      try {
        PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', active.getId());
      } catch (e) {}
      return active;
    }
  } catch (err) {}

  // Fallback membaca dari ScriptProperties
  try {
    const savedId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (savedId) {
      return SpreadsheetApp.openById(savedId);
    }
  } catch (err) {
    Logger.log(`Gagal openById: ${err.message}`);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Mengambil atau membuat sheet baru jika belum ada.
 * @param {string} sheetName
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * Mengacak array secara in-place / copy menggunakan algoritma Fisher-Yates shuffle.
 * @param {Array} arr
 * @return {Array}
 */
function acakArray(arr) {
  const hasil = arr.slice();
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

/**
 * Format tanggal Indonesia ramah baca.
 * @param {Date} date
 * @return {string}
 */
function formatTanggal(date) {
  if (!date) return '-';
  const d = new Date(date);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
}


// ==============================================================================
// MODUL 2: GENERATOR GOOGLE FORM MULTI-VARIAN DARI BANK SOAL
// ==============================================================================

/**
 * Mengambil daftar konfigurasi section dari sheet "KonfigSection".
 * @return {Array<Object>}
 */
function ambilDaftarSection() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_KONFIG_SECTION);
  if (!sheet) {
    throw new Error(`Sheet "${CONFIG.SHEET_KONFIG_SECTION}" tidak ditemukan.`);
  }

  // PENTING: getDisplayValues() membaca teks persis apa adanya di sheet
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    throw new Error(`Sheet "${CONFIG.SHEET_KONFIG_SECTION}" masih kosong.`);
  }

  data.shift(); // Buang header
  
  return data
    .filter(row => row[0] && String(row[0]).trim() !== '')
    .map(row => ({
      id: String(row[0]).trim(),
      nama: String(row[1] || `Section ${row[0]}`).trim(),
      urutan: Number(row[2]) || 1,
      jumlahSoal: Number(row[3]) || 5,
      durasiMenit: Number(row[5]) || CONFIG.DEFAULT_DURASI_SECTION_MENIT
    }))
    .sort((a, b) => a.urutan - b.urutan);
}

/**
 * Membersihkan nilai opsi jawaban agar tidak terkonversi menjadi objek Date oleh Google Sheets
 * Menjamin pecahan seperti "1/4", "3/6 (1/2)", "1/6", dll. tetap dalam bentuk teks aslinya.
 * 
 * @param {any} val
 * @return {string}
 */
function formatOpsiPilihan(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    const d = val.getDate();
    const m = val.getMonth() + 1;
    return `${d}/${m}`;
  }
  let str = String(val).trim();
  // Deteksi string representasi Date seperti "Sun Jan 04 2026 00:00:00 GMT+0700 ..."
  if (/^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}\s\d{4}/.test(str) && (str.includes('GMT') || str.includes('Western Indonesia Time') || str.includes('WIB'))) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getDate()}/${parsed.getMonth() + 1}`;
    }
  }
  return str;
}

/**
 * Mengambil soal aktif per Section dari sheet "BankSoal",
 * mengacak nomor soal, dan memilih 1 versi acak per nomor soal terpilih.
 * Menggunakan getDisplayValues() untuk mencegah konversi pecahan menjadi Date.
 * 
 * @param {string} sectionId
 * @param {number} jumlahSoalTarget
 * @return {Array<Object>}
 */
function ambilSoalAktifPerSection(sectionId, jumlahSoalTarget) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_BANK_SOAL);
  if (!sheet) {
    throw new Error(`Sheet "${CONFIG.SHEET_BANK_SOAL}" tidak ditemukan.`);
  }

  // PENTING: getDisplayValues() mengembalikan teks literal persis seperti yang tampil di spreadsheet
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) {
    throw new Error(`Sheet "${CONFIG.SHEET_BANK_SOAL}" masih kosong.`);
  }

  data.shift(); // Buang header

  const byNomor = {};

  data.forEach((row, idx) => {
    const sid = String(row[0] || '').trim();
    if (sid !== sectionId) return;

    // Kolom status (kolom 11 / index 10)
    const statusCol = row[10] !== undefined ? String(row[10]).trim().toLowerCase() : (String(row[9] || '').trim().toLowerCase());
    const isAktif = statusCol === '' || statusCol === 'aktif' || statusCol === 'active';
    if (!isAktif) return;

    const nomorSoal = String(row[1] || `soal_${idx}`).trim();
    const versiId = String(row[2] || 'V1').trim();
    const teksSoal = String(row[3] || '').trim();
    
    // Opsi pilihan dibersihkan dari format Date
    const opsiA = formatOpsiPilihan(row[4]);
    const opsiB = formatOpsiPilihan(row[5]);
    const opsiC = formatOpsiPilihan(row[6]);
    const opsiD = formatOpsiPilihan(row[7]);
    
    let opsiE = '';
    let jawabanBenar = '';
    let poin = CONFIG.DEFAULT_POIN_SOAL;

    if (row.length >= 11 && String(row[8] || '').trim().length > 1 && !['A','B','C','D','E'].includes(String(row[8]).trim().toUpperCase())) {
      opsiE = formatOpsiPilihan(row[8]);
      jawabanBenar = String(row[9] || 'A').trim().toUpperCase();
      poin = Number(row[10]) || CONFIG.DEFAULT_POIN_SOAL;
    } else {
      jawabanBenar = String(row[8] || 'A').trim().toUpperCase();
      poin = Number(row[9]) || CONFIG.DEFAULT_POIN_SOAL;
    }

    if (!teksSoal) return;

    // Kolom ke-12 & ke-13 (index 11 & 12): TeksSoalLatex & URLGambarCache
    const teksSoalLatex = String(row[11] || '').trim();
    const cacheGambarUrlOrId = String(row[12] || '').trim();

    if (!byNomor[nomorSoal]) {
      byNomor[nomorSoal] = [];
    }

    byNomor[nomorSoal].push({
      nomorSoal,
      versiId,
      teksSoal,
      teksSoalLatex,
      cacheGambarId: cacheGambarUrlOrId,
      sheetRow: idx + 2, // +2: kompensasi header (baris 1) & index 0-based data.shift()
      opsi: { A: opsiA, B: opsiB, C: opsiC, D: opsiD, E: opsiE },
      jawabanBenar,
      poin
    });
  });

  let daftarNomor = Object.keys(byNomor);
  if (daftarNomor.length === 0) {
    Logger.log(`[Peringatan] Tidak ada soal aktif ditemukan untuk Section ID: ${sectionId}`);
    return [];
  }

  daftarNomor = acakArray(daftarNomor).slice(0, jumlahSoalTarget || daftarNomor.length);

  return daftarNomor.map(nomor => {
    const listVersi = byNomor[nomor];
    return listVersi[Math.floor(Math.random() * listVersi.length)];
  });
}

/**
 * ==============================================================================
 * MODUL 2B: RENDER SOAL BERBASIS LATEX (CODECOGS) + PENGISIAN KE KOLOM URLGambarCache
 * ==============================================================================
 */

/**
 * Mengambil blob gambar PNG dari ekspresi LaTeX via endpoint CodeCogs.
 * Mengembalikan Blob image/png siap pakai untuk form.addImageItem().
 * 
 * @param {string} teksLatex Ekspresi LaTeX
 * @return {GoogleAppsScript.Base.Blob|null}
 */
function dapatkanBlobLatex(teksLatex) {
  if (!teksLatex) return null;
  const raw = String(teksLatex).trim();
  if (!raw) return null;

  try {
    const url = 'https://latex.codecogs.com/png.latex?' + encodeURIComponent('\\large ' + raw);
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (resp.getResponseCode() === 200) {
      const ct = (resp.getHeaders()['Content-Type'] || resp.getHeaders()['content-type'] || '').toLowerCase();
      if (ct.includes('image') || ct.includes('png') || ct.includes('gif')) {
        return resp.getBlob()
          .setContentType('image/png')
          .setName('latex_' + Utilities.getUuid().substring(0, 8) + '.png');
      }
    } else {
      Logger.log(`[LaTeX Fetch] HTTP ${resp.getResponseCode()} untuk: ${raw}`);
    }
  } catch (err) {
    Logger.log(`[LaTeX Fetch] Error: "${raw}": ${err.message}`);
  }

  return null;
}

/**
 * Menulis URL ke kolom 13 (URLGambarCache) di sheet BankSoal jika diperlukan.
 * @param {number} sheetRow Nomor baris 1-indexed
 * @param {string} nilai URL CodeCogs
 */
function tulisCacheGambarKeBankSoal(sheetRow, nilai) {
  try {
    const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_BANK_SOAL);
    if (!sheet) return;
    sheet.getRange(sheetRow, 13).setValue(nilai);
  } catch (e) {
    Logger.log('Gagal tulis cache baris ' + sheetRow + ': ' + e.message);
  }
}

/**
 * Membaca secara dinamis seluruh ID kolom (entry.xxxx) dari form 
 * dan menyusun URL Prefill Template publik (/d/e/.../viewform?usp=pp_url&entry...=__PLACEHOLDER__)
 * 
 * @param {GoogleAppsScript.Forms.Form} form Objek Google Form
 * @return {string} URL template prefill lengkap
 */
function buatPrefillTemplateDariForm(form) {
  try {
    const publishedUrl = form.getPublishedUrl();
    const formResp = form.createResponse();
    const items = form.getItems();

    let countPrefill = 0;
    items.forEach(item => {
      if (item.getType() !== FormApp.ItemType.TEXT) return;

      const title = item.getTitle().toLowerCase().trim();
      const textItem = item.asTextItem();

      if (title.includes('npm') || title.includes('nim')) {
        formResp.withItemResponse(textItem.createResponse('__NPM__'));
        countPrefill++;
      } else if (title.includes('nama')) {
        formResp.withItemResponse(textItem.createResponse('__NAMA__'));
        countPrefill++;
      } else if (title.includes('fakultas')) {
        formResp.withItemResponse(textItem.createResponse('__FAKULTAS__'));
        countPrefill++;
      } else if (title.includes('prodi') || title.includes('program studi')) {
        formResp.withItemResponse(textItem.createResponse('__PRODI__'));
        countPrefill++;
      } else if (title.includes('email')) {
        formResp.withItemResponse(textItem.createResponse('__EMAIL__'));
        countPrefill++;
      }
    });

    if (countPrefill === 0) {
      return publishedUrl;
    }

    const rawPrefilledUrl = formResp.toPrefilledUrl();
    
    // Jika sudah dalam format /d/e/, gunakan langsung
    if (rawPrefilledUrl.startsWith('https://docs.google.com/forms/d/e/')) {
      return rawPrefilledUrl;
    }

    // Jika berupa /d/{id}/, gabungkan query parameter ke publishedUrl (/d/e/...)
    const queryIdx = rawPrefilledUrl.indexOf('?');
    if (queryIdx !== -1) {
      const qs = rawPrefilledUrl.substring(queryIdx);
      return publishedUrl.includes('?') 
        ? (publishedUrl + '&' + qs.substring(1)) 
        : (publishedUrl + qs);
    }

    return publishedUrl;
  } catch (err) {
    Logger.log(`Gagal buatPrefillTemplateDariForm: ${err.message}`);
    return form.getPublishedUrl();
  }
}

/**
 * Membuat 1 Google Form Varian baru dengan pengaturan Quiz dan destinasi Spreadsheet pusat.
 * Bebas login akun Google & siap prefill data identitas peserta.
 * 
 * @param {number} nomorVarian
 * @return {Object} Metadata form yang dibuat
 */
function buatSatuVarianForm(nomorVarian) {
  // Nama file di Google Drive dosen tetap diberi penanda agar mudah dikelola
  const namaFileDrive = `${CONFIG.JUDUL_PRETEST} (Varian ${nomorVarian})`;
  const form = FormApp.create(namaFileDrive);

  // Judul publik yang dilihat mahasiswa di lembar ujian (Bebas label varian)
  form.setTitle(CONFIG.JUDUL_PRETEST);

  // Konfigurasi Umum Form
  form.setDescription(CONFIG.DESKRIPSI_FORM);
  form.setIsQuiz(true); // Penilaian otomatis aktif

  // Email mahasiswa HANYA dikumpulkan lewat field manual "Email Mahasiswa" di bagian Identitas Peserta
  // (dipakai untuk prefill dari portal). Kolom "Collect Email" bawaan Google Form sengaja dimatikan
  // permanen agar tidak muncul input email dobel di awal form.
  form.setCollectEmail(false);

  // Konfigurasi Batas 1 Respon (Anti Submit Ganda) - opsional, tergantung CONFIG
  if (CONFIG.BATASI_LOGIN_DOMAIN_TELKOM) {
    form.setLimitOneResponsePerUser(true);   // Kunci 1 akun Google = 1 respon
    try {
      form.setRequireLogin(true);            // Wajib login akun Google (tidak spesifik domain kampus)
    } catch (e) {
      Logger.log(`Info setRequireLogin: ${e.message}`);
    }
  } else {
    form.setLimitOneResponsePerUser(false);
    try {
      form.setRequireLogin(false);
    } catch (e) {
      Logger.log(`Info setRequireLogin: ${e.message}`);
    }
  }

  form.setShuffleQuestions(false);          // Urutan bab/section tetap teratur
  form.setAllowResponseEdits(false);        // Tidak boleh edit jawaban setelah submit
  form.setPublishingSummary(false);         // Jangan tampilkan ringkasan jawaban ke mahasiswa
  form.setConfirmationMessage(CONFIG.PESAN_KONFIRMASI);

  // Tautkan sheet respons ke Spreadsheet pusat
  const ssId = getSpreadsheet().getId();
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);

  // Atur izin berbagi file Google Form di Google Drive
  try {
    const file = DriveApp.getFileById(form.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log(`Info Izin Drive: ${e.message}`);
  }

  // Section 1: Identitas Mahasiswa (Terisi Otomatis via Prefill Portal)
  form.addSectionHeaderItem()
    .setTitle('Identitas Peserta')
    .setHelpText('Data identitas terisi otomatis dari portal pretest. Mohon tidak mengubah data ini.');

  // Validasi NPM: Hanya Angka / Bilangan Bulat
  const npmValidation = FormApp.createTextValidation()
    .setHelpText('NPM / NIM harus berupa angka (digit numerik).')
    .requireWholeNumber()
    .build();

  const itemNpm = form.addTextItem().setTitle('NPM / NIM').setRequired(true);
  itemNpm.setValidation(npmValidation);

  form.addTextItem().setTitle('Nama Lengkap').setRequired(true);
  form.addTextItem().setTitle('Fakultas').setRequired(true);
  form.addTextItem().setTitle('Program Studi').setRequired(true);
  form.addTextItem().setTitle('Email Mahasiswa').setRequired(true);

  // Susun Prefill Template dinamis dari ID kolom form
  const prefillTemplate = buatPrefillTemplateDariForm(form);

  // Section 2: Minat & Komitmen Program Pendampingan Literasi Numerik (non-graded, bukan bagian BankSoal)
  form.addPageBreakItem()
    .setTitle('Minat & Komitmen Program Pendampingan')
    .setHelpText('Bagian ini tidak dinilai. Jawaban Anda membantu kami merancang program pendampingan literasi numerik yang tepat sasaran.');

  const itemMinat = form.addMultipleChoiceItem();
  itemMinat.setTitle('Menurut Anda, seberapa penting program pendampingan literasi numerik bagi mahasiswa baru?')
    .setRequired(true);
  itemMinat.setChoices([
    itemMinat.createChoice('Sangat penting'),
    itemMinat.createChoice('Penting'),
    itemMinat.createChoice('Cukup penting'),
    itemMinat.createChoice('Kurang penting'),
    itemMinat.createChoice('Tidak penting')
  ]);

  const itemKomitmen = form.addMultipleChoiceItem();
  itemKomitmen.setTitle('Jika program pendampingan literasi numerik tersedia, apakah Anda berkomitmen untuk mengikutinya secara rutin?')
    .setRequired(true);
  itemKomitmen.setChoices([
    itemKomitmen.createChoice('Ya, saya berkomitmen mengikuti'),
    itemKomitmen.createChoice('Mungkin, tergantung jadwal'),
    itemKomitmen.createChoice('Tidak berkomitmen')
  ]);

  const daftarSection = ambilDaftarSection();
  let totalSoalForm = 0;
  let totalPoinForm = 0;

  daftarSection.forEach((section, sIdx) => {
    form.addPageBreakItem()
      .setTitle(section.nama)
      .setHelpText(
        `Bagian ${sIdx + 3}: ${section.nama}\n` +
        `Jumlah soal: ${section.jumlahSoal} butir | Estimasi waktu pengerjaan: ${section.durasiMenit} menit.`
      );

    const soalTerpilih = ambilSoalAktifPerSection(section.id, section.jumlahSoal);

    soalTerpilih.forEach((soal, qIdx) => {
      totalSoalForm++;
      totalPoinForm += soal.poin;

      // Label unik: [S1-1], [S1-2], [S2-1], dst.
      const labelSoal = `[${section.id}-${qIdx + 1}]`;

      // 1. Jika ada formula LaTeX, buat kartu gambar soal dengan judul soal di atasnya
      let hasImage = false;
      if (soal.teksSoalLatex) {
        const blob = dapatkanBlobLatex(soal.teksSoalLatex);
        if (blob) {
          try {
            const imgItem = form.addImageItem();
            imgItem.setTitle(`${labelSoal} ${soal.teksSoal}`)
              .setImage(blob)
              .setAlignment(FormApp.Alignment.LEFT);
            hasImage = true;
          } catch (eImg) {
            Logger.log(`[Form] Gagal pasang gambar ${labelSoal}: ${eImg.message}`);
          }
        }
        Utilities.sleep(200); // jeda singkat untuk stabilitas request CodeCogs
      }

      // 2. Butir Pilihan Ganda (Opsi Jawaban A, B, C, D, E)
      const mcItem = form.addMultipleChoiceItem();
      if (hasImage) {
        // Jika sudah ada kartu gambar soal berlabel [S1-1] di atasnya:
        mcItem.setTitle(`Pilihan Jawaban ${labelSoal}:`)
          .setRequired(true)
          .setPoints(soal.poin);
      } else {
        // Jika soal teks murni tanpa gambar formula:
        mcItem.setTitle(`${labelSoal} ${soal.teksSoal}`)
          .setRequired(true)
          .setPoints(soal.poin);
      }

      const choices = [];
      if (soal.opsi.A) choices.push(mcItem.createChoice(soal.opsi.A, soal.jawabanBenar === 'A'));
      if (soal.opsi.B) choices.push(mcItem.createChoice(soal.opsi.B, soal.jawabanBenar === 'B'));
      if (soal.opsi.C) choices.push(mcItem.createChoice(soal.opsi.C, soal.jawabanBenar === 'C'));
      if (soal.opsi.D) choices.push(mcItem.createChoice(soal.opsi.D, soal.jawabanBenar === 'D'));
      if (soal.opsi.E) choices.push(mcItem.createChoice(soal.opsi.E, soal.jawabanBenar === 'E'));

      if (choices.length > 0) mcItem.setChoices(choices);
    });
  });

  return {
    varianKe: nomorVarian,
    namaVarian: `Varian ${nomorVarian}`,
    formId: form.getId(),
    formUrl: form.getPublishedUrl(),
    prefillTemplate: prefillTemplate,
    editUrl: form.getEditUrl(),
    totalSoal: totalSoalForm,
    totalPoin: totalPoinForm,
    tanggalDibuat: formatTanggal(new Date())
  };
}

/**
 * Membuat Batch Varian Google Form secara sekaligus dan mencatat hasilnya ke sheet "DaftarVarianForm".
 * Secara otomatis membersihkan sheet lama agar rapi dan seluruh 10 header selalu sinkron.
 * 
 * @param {number} [jumlahVarian] Jumlah varian yang ingin dibuat (opsional, default dari CONFIG)
 * @return {Array<Object>}
 */
function generateSemuaVarian(jumlahVarian) {
  const totalVarian = jumlahVarian || CONFIG.JUMLAH_VARIAN_DEFAULT;
  const ss = getSpreadsheet();
  
  let shDaftar = ss.getSheetByName(CONFIG.SHEET_DAFTAR_VARIAN);
  if (!shDaftar) {
    shDaftar = ss.insertSheet(CONFIG.SHEET_DAFTAR_VARIAN);
  } else {
    shDaftar.clear(); // Bersihkan isi sheet lama agar struktur tabel selalu bersih & sinkron
  }

  // Setup Header 10 Kolom Lengkap Resmi
  const headers = [
    'VarianKe', 'NamaVarian', 'FormId', 'FormURL (Link Mahasiswa)', 
    'EditURL (Editor Dosen)', 'TotalSoal', 'TotalPoin', 'TanggalDibuat', 'Status', 'PrefillTemplate'
  ];
  shDaftar.appendRow(headers);
  shDaftar.getRange(1, 1, 1, headers.length)
    .setBackground('#1A73E8')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  const hasilList = [];
  
  for (let i = 1; i <= totalVarian; i++) {
    Logger.log(`Sedang membuat Varian ${i} dari ${totalVarian}...`);
    const hasil = buatSatuVarianForm(i);
    hasilList.push(hasil);

    shDaftar.appendRow([
      hasil.varianKe,
      hasil.namaVarian,
      hasil.formId,
      hasil.formUrl,
      hasil.editUrl,
      hasil.totalSoal,
      hasil.totalPoin,
      hasil.tanggalDibuat,
      'Aktif',
      hasil.prefillTemplate
    ]);

    Utilities.sleep(600); // jeda API Google
  }

  shDaftar.autoResizeColumns(1, 10);
  SpreadsheetApp.flush();
  Logger.log(`SUKSES: ${totalVarian} varian form berhasil digenerate.`);
  return hasilList;
}

/**
 * Utilitas untuk memperbaiki pengaturan izin & menonaktifkan syarat login 
 * pada semua Google Form yang sudah pernah dibuat sebelumnya.
 * Sekaligus merapikan header kolom ke-10 (PrefillTemplate).
 * 
 * @return {{sukses: number, gagal: number}}
 */
function perbaikiPengaturanIzinSemuaForm() {
  const ss = getSpreadsheet();
  const shDaftar = ss.getSheetByName(CONFIG.SHEET_DAFTAR_VARIAN);
  if (!shDaftar || shDaftar.getLastRow() <= 1) {
    throw new Error(`Sheet "${CONFIG.SHEET_DAFTAR_VARIAN}" tidak ditemukan atau masih kosong.`);
  }

  const rawData = shDaftar.getDataRange().getValues();
  
  // Pastikan struktur 10 header selalu lengkap dan rapi
  const expectedHeaders = [
    'VarianKe', 'NamaVarian', 'FormId', 'FormURL (Link Mahasiswa)', 
    'EditURL (Editor Dosen)', 'TotalSoal', 'TotalPoin', 'TanggalDibuat', 'Status', 'PrefillTemplate'
  ];

  shDaftar.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders])
    .setBackground('#1A73E8').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  let sukses = 0;
  let gagal = 0;

  for (let r = 1; r < rawData.length; r++) {
    const row = rawData[r];
    
    // Cari FormId di baris ini (bisa di kolom index 2, atau ekstrak dari URL)
    let formId = '';
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      if (!val) continue;

      if (val.includes('/forms/d/')) {
        const match = val.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
        if (match && !val.includes('/d/e/')) {
          formId = match[1];
          break;
        }
      } else if (val.length >= 20 && !val.includes(' ') && !val.includes('/') && !val.includes(':')) {
        formId = val;
        break;
      }
    }

    if (!formId) {
      gagal++;
      continue;
    }

    try {
      const form = FormApp.openById(formId);
      
      // 1. Pengaturan Keamanan Form & Judul Publik
      form.setTitle(CONFIG.JUDUL_PRETEST);

      // Selalu matikan Collect Email bawaan agar tidak dobel dengan field manual "Email Mahasiswa"
      form.setCollectEmail(false);

      if (CONFIG.BATASI_LOGIN_DOMAIN_TELKOM) {
        form.setLimitOneResponsePerUser(true);
        try {
          form.setRequireLogin(true);
        } catch (err) {
          Logger.log(`Info setRequireLogin form ${formId}: ${err.message}`);
        }
      } else {
        form.setLimitOneResponsePerUser(false);
        try {
          form.setRequireLogin(false);
        } catch (err) {
          Logger.log(`Info setRequireLogin form ${formId}: ${err.message}`);
        }
      }

      // 2. Beri validasi hanya angka pada pertanyaan NPM/NIM
      try {
        const npmValidation = FormApp.createTextValidation()
          .setHelpText('NPM / NIM harus berupa angka (digit numerik).')
          .requireWholeNumber()
          .build();

        form.getItems(FormApp.ItemType.TEXT).forEach(item => {
          const t = item.getTitle().toLowerCase();
          if (t.includes('npm') || t.includes('nim')) {
            item.asTextItem().setValidation(npmValidation);
          }
        });
      } catch (errVal) {
        Logger.log(`Info validasi NPM form ${formId}: ${errVal.message}`);
      }

      // 3. Berbagi file publik (Anyone with link)
      try {
        const file = DriveApp.getFileById(formId);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (err) {
        Logger.log(`Info Drive sharing form ${formId}: ${err.message}`);
      }

      // 3. Susun prefill template resmi secara dinamis dari form ID
      const publishedUrl = form.getPublishedUrl();
      const prefillTemplate = buatPrefillTemplateDariForm(form);

      // Update FormURL (kolom 4) dan PrefillTemplate (kolom 10)
      shDaftar.getRange(r + 1, 3).setValue(formId);
      shDaftar.getRange(r + 1, 4).setValue(publishedUrl);
      shDaftar.getRange(r + 1, 10).setValue(prefillTemplate);
      sukses++;
    } catch (e) {
      Logger.log(`Gagal perbaiki form baris ${r + 1} (${formId}): ${e.message}`);
      gagal++;
    }
  }

  shDaftar.autoResizeColumns(1, 10);
  SpreadsheetApp.flush();
  return { sukses, gagal };
}


// ==============================================================================
// MODUL 3: PORTAL WEB APP 1 LINK TUNGGAL & REDIRECTION ENGINE
// ==============================================================================

/**
 * Endpoint Web App (doGet) untuk melayani halaman portal 1 link tunggal mahasiswa.
 * 
 * @param {Object} e Event parameter dari Apps Script Web App
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  // Jika dipanggil oleh frontend eksternal (Vercel / Netlify / REST API)
  if (e && e.parameter && (e.parameter.format === 'json' || e.parameter.action === 'getVariants')) {
    const responseData = {
      status: 'success',
      judulPretest: CONFIG.JUDUL_PRETEST,
      deskripsiForm: CONFIG.DESKRIPSI_FORM,
      validasiDomain: CONFIG.VALIDASI_DOMAIN_EMAIL || '',
      durasiRedirect: CONFIG.DURASI_REDIRECT_DETIK || 3,
      variants: ambilVarianAktif()
    };
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const varianAktif = ambilVarianAktif();
  const template = HtmlService.createTemplateFromFile('Portal');
  
  template.judulPretest = CONFIG.JUDUL_PRETEST;
  template.deskripsiForm = CONFIG.DESKRIPSI_FORM;
  template.validasiDomain = CONFIG.VALIDASI_DOMAIN_EMAIL || '';
  template.durasiRedirect = CONFIG.DURASI_REDIRECT_DETIK || 3;
  template.varianDataJson = JSON.stringify(varianAktif);
  
  let emailAktifSesi = '';
  try {
    emailAktifSesi = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    emailAktifSesi = '';
  }
  template.emailAktifSesi = emailAktifSesi;

  template.prefilledEmail = (e && e.parameter && e.parameter.email) 
    ? String(e.parameter.email).trim() 
    : emailAktifSesi;

  return template.evaluate()
    .setTitle(`${CONFIG.JUDUL_PRETEST} - Portal Akses`)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Mengambil daftar varian yang berstatus 'Aktif' dari sheet "DaftarVarianForm".
 * Otomatis mendeteksi kolom URL form publik, ID Form, dan prefill template secara cerdas,
 * bahkan jika header kolom ke-10 belum diberi label atau bergeser.
 * 
 * @return {Array<{varianKe: number, namaVarian: string, formId: string, formUrl: string, prefillTemplate: string}>}
 */
function ambilVarianAktif() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_DAFTAR_VARIAN);
  
  if (!sheet) {
    const allSheets = ss.getSheets();
    sheet = allSheets.find(s => /varian/i.test(s.getName()));
  }
  
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('[Peringatan] Sheet varian tidak ditemukan atau kosong.');
    return [];
  }

  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return [];

  const headers = rawData[0].map(h => String(h).toLowerCase().trim());
  const rows = rawData.slice(1);

  let idxVarianKe = headers.findIndex(h => h.includes('varianke') || h === 'varian' || h.includes('no'));
  let idxNama = headers.findIndex(h => h.includes('namavarian') || h.includes('nama varian') || h === 'nama');
  let idxFormId = headers.findIndex(h => h.includes('formid') || h === 'id' || h.includes('id form'));
  let idxFormUrl = headers.findIndex(h => h.includes('formurl') || h.includes('link mahasiswa') || h.includes('link form') || (h.includes('url') && !h.includes('edit')));
  let idxPrefill = headers.findIndex(h => h.includes('prefill'));
  let idxStatus = headers.findIndex(h => h.includes('status'));

  const hasil = [];

  rows.forEach((row, rIdx) => {
    let varianKe = (idxVarianKe !== -1 && Number(row[idxVarianKe])) ? Number(row[idxVarianKe]) : (rIdx + 1);
    let namaVarian = (idxNama !== -1 && row[idxNama]) ? String(row[idxNama]).trim() : `Varian ${varianKe}`;

    let status = (idxStatus !== -1 && row[idxStatus] !== undefined) ? String(row[idxStatus]).trim().toLowerCase() : 'aktif';
    if (status !== '' && status !== 'aktif' && status !== 'active') {
      return;
    }

    let formId = (idxFormId !== -1) ? String(row[idxFormId] || '').trim() : '';
    let formUrl = (idxFormUrl !== -1) ? String(row[idxFormUrl] || '').trim() : '';
    let prefillTemplate = (idxPrefill !== -1) ? String(row[idxPrefill] || '').trim() : '';

    // Auto-detect dari isi baris (misal jika header ke-10 kosong atau tidak bernama)
    row.forEach((cell, cIdx) => {
      const val = String(cell || '').trim();
      if (!val) return;

      if (val.startsWith('https://docs.google.com/forms/') || val.startsWith('http://docs.google.com/forms/')) {
        if (val.includes('__NPM__') || val.includes('entry.') || val.includes('usp=pp_url')) {
          if (!prefillTemplate) prefillTemplate = val;
        } else if (val.includes('/viewform') || val.includes('/forms/d/e/')) {
          if (!formUrl) formUrl = val;
        } else if (val.includes('/edit') && !formId) {
          const match = val.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
          if (match) formId = match[1];
        }
      } else if (!formId && val.length >= 20 && !val.includes(' ') && !val.includes('/') && !val.includes(':')) {
        formId = val;
      }
    });

    // Jika kolom 10 (index 9) ada isinya dan berupa URL, gunakan sebagai prefillTemplate
    if (row[9] && String(row[9]).trim().startsWith('http')) {
      prefillTemplate = String(row[9]).trim();
    }

    if (!formUrl && row[3] && String(row[3]).trim().startsWith('http')) {
      formUrl = String(row[3]).trim();
    }

    if (!prefillTemplate && formUrl) {
      prefillTemplate = formUrl;
    }

    if ((formUrl && formUrl.startsWith('http')) || (prefillTemplate && prefillTemplate.startsWith('http'))) {
      hasil.push({
        varianKe,
        namaVarian,
        formId: formId || (row[2] ? String(row[2]).trim() : ''),
        formUrl: formUrl || prefillTemplate,
        prefillTemplate: prefillTemplate || formUrl
      });
    }
  });

  return hasil;
}

/**
 * Helper API untuk mengecek URL Web App saat ini.
 * @return {string} URL Web App aktif
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl() || 'Belum di-deploy sebagai Web App.';
}

/**
 * Menyusun URL Google Form Publik (/d/e/...) dengan data identitas ter-prefill secara otomatis.
 * Format /d/e/... dapat diakses secara publik tanpa meminta credential login akun Google/Drive.
 * 
 * @param {string} formId ID Google Form
 * @param {string} email Email Mahasiswa
 * @param {string} nama Nama Lengkap
 * @param {string} prodi Program Studi
 * @param {string} npm NPM / NIM
 * @param {string} fakultas Fakultas
 * @return {string} Prefilled Public Google Form URL (/d/e/...)
 */
function dapatkanUrlPrefillForm(formId, email, nama, prodi, npm, fakultas) {
  try {
    const form = FormApp.openById(formId);
    const publishedUrl = form.getPublishedUrl();
    const formResponse = form.createResponse();
    const items = form.getItems();

    items.forEach(item => {
      const title = item.getTitle().toLowerCase().trim();
      if (title.includes('npm') || title.includes('nim')) {
        formResponse.withItemResponse(item.asTextItem().createResponse(npm || '-'));
      } else if (title.includes('nama')) {
        formResponse.withItemResponse(item.asTextItem().createResponse(nama || '-'));
      } else if (title === 'fakultas' || title.includes('fakultas')) {
        formResponse.withItemResponse(item.asTextItem().createResponse(fakultas || '-'));
      } else if (title.includes('program studi') || title.includes('prodi')) {
        formResponse.withItemResponse(item.asTextItem().createResponse(prodi || '-'));
      } else if (title.includes('email')) {
        formResponse.withItemResponse(item.asTextItem().createResponse(email || '-'));
      }
    });

    const draftPrefilledUrl = formResponse.toPrefilledUrl();
    
    if (draftPrefilledUrl.startsWith('https://docs.google.com/forms/d/e/')) {
      return draftPrefilledUrl;
    }

    const queryIndex = draftPrefilledUrl.indexOf('?');
    if (queryIndex !== -1) {
      const queryString = draftPrefilledUrl.substring(queryIndex);
      return publishedUrl.includes('?') ? (publishedUrl + '&' + queryString.substring(1)) : (publishedUrl + queryString);
    }

    return publishedUrl;
  } catch (e) {
    Logger.log(`Gagal prefill URL: ${e.message}`);
    return `https://docs.google.com/forms/d/${formId}/viewform`;
  }
}


// ==============================================================================
// MODUL 4: AGREGASI & REKAPITULASI NILAI OTOMATIS TERPADU
// ==============================================================================

/**
 * Parsing nilai kuis dari format Google Form Quiz (misal: "15 / 20", "18.00 / 20.00", atau angka murni).
 * 
 * @param {any} rawScore
 * @return {{mentah: number, maksimal: number}}
 */
function parseSkorQuiz(rawScore) {
  if (typeof rawScore === 'number') {
    return { mentah: rawScore, maksimal: 100 };
  }

  const str = String(rawScore || '').trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    const mentah = parseFloat(parts[0].replace(',', '.').trim()) || 0;
    const maksimal = parseFloat(parts[1].replace(',', '.').trim()) || 1;
    return { mentah, maksimal };
  }

  const num = parseFloat(str.replace(',', '.')) || 0;
  return { mentah: num, maksimal: 100 };
}

/**
 * Mencari seluruh sheet respon Google Form di spreadsheet aktif.
 * @return {Array<{sheet: GoogleAppsScript.Spreadsheet.Sheet, varianLabel: string}>}
 */
function cariDaftarSheetRespon() {
  const ss = getSpreadsheet();
  const allSheets = ss.getSheets();
  const listSheetRespon = [];

  allSheets.forEach(sheet => {
    const name = sheet.getName();
    
    // Abaikan sheet internal sistem
    if ([CONFIG.SHEET_BANK_SOAL, CONFIG.SHEET_KONFIG_SECTION, CONFIG.SHEET_DAFTAR_VARIAN, CONFIG.SHEET_REKAP_NILAI].includes(name)) {
      return;
    }

    const isFormSheetName = /^(tanggapan formulir|form responses|respon formulir)/i.test(name);
    
    if (sheet.getLastRow() >= 1) {
      const headerRow = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 10)).getValues()[0];
      const headerLower = headerRow.map(h => String(h).toLowerCase().trim());
      
      const hasTimestamp = headerLower.some(h => h.includes('timestamp') || h.includes('waktu') || h.includes('tanggal'));
      const hasEmail = headerLower.some(h => h.includes('email') || h.includes('surel'));
      const hasScore = headerLower.some(h => h.includes('score') || h.includes('skor') || h.includes('nilai'));

      if (isFormSheetName || (hasTimestamp && (hasEmail || hasScore))) {
        let varianLabel = name;
        const matchNum = name.match(/\d+/);
        if (matchNum) {
          varianLabel = `Varian ${matchNum[0]}`;
        }

        listSheetRespon.push({
          sheet: sheet,
          varianLabel: varianLabel
        });
      }
    }
  });

  return listSheetRespon;
}

/**
 * Menarik semua data respon dari seluruh sheet varian, melakukan deduplikasi,
 * menghitung nilai akhir skala 100, dan menuliskan ke sheet "RekapNilai".
 * 
 * @return {Object} Statistik rekapitulasi
 */
function sinkronisasiRekapNilai() {
  const ss = getSpreadsheet();
  const daftarSheet = cariDaftarSheetRespon();

  if (daftarSheet.length === 0) {
    Logger.log('[Info] Belum ada sheet respons formulir yang terhubung.');
    return { status: 'EMPTY', totalPeserta: 0 };
  }

  const dataPerMahasiswa = new Map();
  const distribusiVarian = {};

  daftarSheet.forEach(item => {
    const sheet = item.sheet;
    const varianNama = item.varianLabel;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) return;

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = values[0].map(h => String(h).toLowerCase().trim());

    let colTimestamp = headers.findIndex(h => h.includes('timestamp') || h.includes('waktu') || h.includes('tanggal'));
    let colScore = headers.findIndex(h => h.includes('score') || h.includes('skor') || h.includes('nilai'));
    let colEmail = headers.findIndex(h => h.includes('email') || h.includes('surel'));
    let colNpm = headers.findIndex(h => h.includes('npm') || h.includes('nim'));
    let colNama = headers.findIndex(h => h.includes('nama'));
    let colFakultas = headers.findIndex(h => h.includes('fakultas'));
    let colProdi = headers.findIndex(h => h.includes('program studi') || h.includes('prodi'));

    if (colTimestamp === -1) colTimestamp = 0;
    if (colScore === -1) colScore = 1;

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const rawTimestamp = row[colTimestamp];
      const rawScore = row[colScore];
      const npm = colNpm !== -1 ? String(row[colNpm] || '').trim() : '-';
      const nama = colNama !== -1 ? String(row[colNama] || '').trim() : '-';
      const fakultas = colFakultas !== -1 ? String(row[colFakultas] || '').trim() : '-';
      const prodi = colProdi !== -1 ? String(row[colProdi] || '').trim() : '-';
      const rawEmail = colEmail !== -1 ? String(row[colEmail] || '').trim().toLowerCase() : '';

      if (!rawEmail || !rawEmail.includes('@')) continue;

      const parsedScore = parseSkorQuiz(rawScore);
      const skorMentah = parsedScore.mentah;
      const skorMaksimal = parsedScore.maksimal;
      const nilaiAkhir = skorMaksimal > 0 ? Math.round((skorMentah / skorMaksimal) * 10000) / 100 : 0;
      const timestampObj = rawTimestamp ? new Date(rawTimestamp) : new Date();

      const entry = {
        timestamp: timestampObj,
        timestampStr: formatTanggal(timestampObj),
        npm: npm,
        nama: nama,
        fakultas: fakultas,
        prodi: prodi,
        email: rawEmail,
        varian: varianNama,
        skorMentah: skorMentah,
        skorMaksimal: skorMaksimal,
        nilaiAkhir: nilaiAkhir,
        status: nilaiAkhir >= CONFIG.KKM_KELULUSAN ? 'LULUS' : 'REMEDIAL',
        keterangan: `KKM: ${CONFIG.KKM_KELULUSAN}`
      };

      const dedupKey = (npm && npm !== '-') ? npm.toLowerCase() : rawEmail;
      if (!dataPerMahasiswa.has(dedupKey)) {
        dataPerMahasiswa.set(dedupKey, entry);
      } else {
        const existing = dataPerMahasiswa.get(dedupKey);
        if (CONFIG.DEDUP_POLICY === 'LATEST' && timestampObj > existing.timestamp) {
          dataPerMahasiswa.set(dedupKey, entry);
        } else if (CONFIG.DEDUP_POLICY === 'EARLIEST' && timestampObj < existing.timestamp) {
          dataPerMahasiswa.set(dedupKey, entry);
        }
      }
    }
  });

  const hasilRekap = Array.from(dataPerMahasiswa.values()).sort((a, b) => b.nilaiAkhir - a.nilaiAkhir || a.email.localeCompare(b.email));

  const shRekap = getOrCreateSheet(CONFIG.SHEET_REKAP_NILAI);
  shRekap.clear();

  const headers = [
    'No', 'Waktu Submit', 'NPM / NIM', 'Nama Lengkap', 'Fakultas', 'Program Studi', 
    'Email Mahasiswa', 'Varian Form', 'Skor Mentah', 'Skor Maksimal', 'Nilai Akhir (0-100)', 'Status Kelulusan', 'Keterangan'
  ];

  shRekap.getRange(1, 1, 1, headers.length).setValues([headers]);
  shRekap.getRange(1, 1, 1, headers.length)
    .setBackground('#0D47A1')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (hasilRekap.length > 0) {
    const rowsData = hasilRekap.map((d, idx) => [
      idx + 1,
      d.timestampStr,
      d.npm,
      d.nama,
      d.fakultas,
      d.prodi,
      d.email,
      d.varian,
      d.skorMentah,
      d.skorMaksimal,
      d.nilaiAkhir,
      d.status,
      d.keterangan
    ]);

    shRekap.getRange(2, 1, rowsData.length, headers.length).setValues(rowsData);

    shRekap.getRange(2, 1, rowsData.length, 1).setHorizontalAlignment('center');
    shRekap.getRange(2, 2, rowsData.length, 1).setHorizontalAlignment('center');
    shRekap.getRange(2, 3, rowsData.length, 1).setHorizontalAlignment('center');
    shRekap.getRange(2, 8, rowsData.length, 1).setHorizontalAlignment('center');
    shRekap.getRange(2, 9, rowsData.length, 3).setHorizontalAlignment('center');
    shRekap.getRange(2, 12, rowsData.length, 1).setHorizontalAlignment('center').setFontWeight('bold');

    shRekap.getRange(2, 11, rowsData.length, 1).setNumberFormat('0.00');

    let totalLulus = 0;
    let totalRemedial = 0;
    let totalSkor = 0;
    let skorTertinggi = hasilRekap[0].nilaiAkhir;
    let skorTerendah = hasilRekap[0].nilaiAkhir;

    hasilRekap.forEach(d => {
      if (d.status === 'LULUS') totalLulus++;
      else totalRemedial++;
      totalSkor += d.nilaiAkhir;
      if (d.nilaiAkhir > skorTertinggi) skorTertinggi = d.nilaiAkhir;
      if (d.nilaiAkhir < skorTerendah) skorTerendah = d.nilaiAkhir;

      distribusiVarian[d.varian] = (distribusiVarian[d.varian] || 0) + 1;
    });

    const rataRata = Math.round((totalSkor / hasilRekap.length) * 100) / 100;
    const persenLulus = Math.round((totalLulus / hasilRekap.length) * 10000) / 100;

    const statHeaders = ['METRIK STATISTIK', 'NILAI'];
    shRekap.getRange(1, 11, 1, 2).setValues([statHeaders])
      .setBackground('#2E7D32')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    const statRows = [
      ['Total Mahasiswa Mengerjakan', hasilRekap.length],
      ['Jumlah Lulus (>= KKM)', `${totalLulus} (${persenLulus}%)`],
      ['Jumlah Remedial (< KKM)', `${totalRemedial} (${(100 - persenLulus).toFixed(2)}%)`],
      ['Nilai Rata-rata', rataRata.toFixed(2)],
      ['Nilai Tertinggi', skorTertinggi.toFixed(2)],
      ['Nilai Terendah', skorTerendah.toFixed(2)],
      ['Waktu Terakhir Sinkronisasi', formatTanggal(new Date())]
    ];

    shRekap.getRange(2, 11, statRows.length, 2).setValues(statRows);
    shRekap.getRange(2, 11, statRows.length, 1).setFontWeight('bold');
    shRekap.getRange(2, 12, statRows.length, 1).setHorizontalAlignment('right');

    let currentR = statRows.length + 3;
    shRekap.getRange(currentR, 11, 1, 2).setValues([['DISTRIBUSI VARIAN', 'JUMLAH']])
      .setBackground('#E65100')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    const varRows = Object.keys(distribusiVarian).sort().map(k => [k, distribusiVarian[k]]);
    if (varRows.length > 0) {
      shRekap.getRange(currentR + 1, 11, varRows.length, 2).setValues(varRows);
      shRekap.getRange(currentR + 1, 12, varRows.length, 1).setHorizontalAlignment('right');
    }

    shRekap.autoResizeColumns(1, 12);

    Logger.log(`[Sinkronisasi Selesai] Total ${hasilRekap.length} data mahasiswa berhasil direkap.`);
    return {
      status: 'SUCCESS',
      totalPeserta: hasilRekap.length,
      rataRata,
      totalLulus,
      totalRemedial,
      persenLulus,
      distribusiVarian
    };
  } else {
    shRekap.autoResizeColumns(1, 9);
    Logger.log('[Sinkronisasi Selesai] Tidak ada data respon yang ditemukan.');
    return { status: 'EMPTY', totalPeserta: 0 };
  }
}


// ==============================================================================
// MODUL 5: MENU KUSTOM GOOGLE SHEETS & TRIGGER OTOMATIS
// ==============================================================================

/**
 * Trigger onOpen: Menambahkan menu kustom ke Google Sheets saat spreadsheet dibuka.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📐 Sistem Pretest')
    .addItem('🚀 1. Inisialisasi Sheet Template', 'menuInisialisasiTemplate')
    .addItem('📝 2. Generate Varian Form Baru', 'menuGenerateForm')
    .addItem('🔓 3. Perbaiki Izin & Prefill Form', 'menuPerbaikiIzinForm')
    .addSeparator()
    .addItem('🔄 5. Perbarui Rekap Nilai Sekarang', 'menuUpdateRekap')
    .addItem('⏰ 6. Pasang Auto-Sync Nilai (Tiap 15 Menit)', 'pasangAutoSyncTrigger')
    .addItem('🛑 7. Hapus Auto-Sync Nilai', 'hapusAutoSyncTrigger')
    .addSeparator()
    .addItem('📤 8. Salin Data JSON untuk Netlify/Vercel (Anti-Down)', 'menuSalinJsonNetlify')
    .addItem('🔗 9. Salin Link Web App Google', 'menuSalinLinkPortal')
    .addItem('📊 10. Lihat Ringkasan Statistik', 'menuLihatStatistik')
    .addToUi();
}



/**
 * Menu 1: Inisialisasi Sheet Template (KonfigSection & BankSoal) jika belum ada.
 */
function menuInisialisasiTemplate() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet();

  // 1. Setup Sheet KonfigSection
  let shKonfig = ss.getSheetByName(CONFIG.SHEET_KONFIG_SECTION);
  if (!shKonfig) {
    shKonfig = ss.insertSheet(CONFIG.SHEET_KONFIG_SECTION);
    const headers = ['SectionID', 'NamaSection', 'Urutan', 'JumlahSoal', 'Keterangan', 'DurasiMenit'];
    shKonfig.appendRow(headers);
    shKonfig.getRange(1, 1, 1, headers.length)
      .setBackground('#1A73E8').setFontColor('#FFFFFF').setFontWeight('bold');
    
    shKonfig.appendRow(['S1', 'Aljabar Dasar', 1, 5, 'Persamaan linear, kuadrat, dan fungsi', 10]);
    shKonfig.appendRow(['S2', 'Geometri & Trigonometri', 2, 4, 'Bangun datar, ruang, phytagoras', 8]);
    shKonfig.appendRow(['S3', 'Statistika Dasar', 3, 3, 'Mean, median, modus, peluang', 7]);
    shKonfig.autoResizeColumns(1, headers.length);
  }

  // 2. Setup Sheet BankSoal
  let shBank = ss.getSheetByName(CONFIG.SHEET_BANK_SOAL);
  if (!shBank) {
    shBank = ss.insertSheet(CONFIG.SHEET_BANK_SOAL);
    const headers = [
      'SectionID', 'NomorSoal', 'VersiID', 'TeksSoal', 
      'A', 'B', 'C', 'D', 'JawabanBenar', 'Poin', 'Status',
      'TeksSoalLatex', 'URLGambarCache'
    ];
    shBank.appendRow(headers);
    shBank.getRange(1, 1, 1, headers.length)
      .setBackground('#0D47A1').setFontColor('#FFFFFF').setFontWeight('bold');
    
    shBank.appendRow(['S1', '1', 'V1', 'Tentukan nilai x dari: 2x + 6 = 14', '4', '5', '6', '7', 'A', 1, 'Aktif', '', '']);
    shBank.appendRow(['S1', '1', 'V2', 'Tentukan nilai x dari: 3x - 9 = 12', '7', '8', '6', '9', 'A', 1, 'Aktif', '', '']);
    shBank.appendRow(['S1', '2', 'V1', 'Jika f(x) = x^2 + 2, nilai f(3) adalah...', '11', '9', '7', '13', 'A', 1, 'Aktif', 'f(x) = x^2 + 2,\\ \\text{hitung } f(3)', '']);
    shBank.autoResizeColumns(1, headers.length);
  }

  ui.alert('Sukses', 'Sheet template "KonfigSection" dan "BankSoal" siap digunakan!', ui.ButtonSet.OK);
}

/**
 * Menu 2: Dialog untuk menjalankan pembuatan varian Form.
 */
function menuGenerateForm() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Generate Varian Form',
    `Berapa jumlah varian Form yang ingin dibuat? (Rekomendasi: 8-12 varian)\nDefault: ${CONFIG.JUMLAH_VARIAN_DEFAULT}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  let inputVal = parseInt(response.getResponseText().trim());
  if (isNaN(inputVal) || inputVal <= 0) {
    inputVal = CONFIG.JUMLAH_VARIAN_DEFAULT;
  }

  try {
    const hasil = generateSemuaVarian(inputVal);
    ui.alert(
      'Proses Selesai',
      `Berhasil membuat ${hasil.length} varian Google Form!\nSemua link telah dicatat di sheet "${CONFIG.SHEET_DAFTAR_VARIAN}".`,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Terjadi Kesalahan', err.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu 3: Memperbaiki izin form & template prefill agar bebas login akun Google.
 */
function menuPerbaikiIzinForm() {
  const ui = SpreadsheetApp.getUi();
  const konfirmasi = ui.alert(
    'Perbaiki Izin & Pengaturan Form',
    'Fungsi ini akan menonaktifkan pembatasan login (collect email & limit response) ' +
    'dan menyusun link prefill resmi untuk seluruh varian form yang ada.\n\nLanjutkan?',
    ui.ButtonSet.YES_NO
  );

  if (konfirmasi !== ui.Button.YES) return;

  try {
    const hasil = perbaikiPengaturanIzinSemuaForm();
    ui.alert(
      'Selesai',
      `Berhasil memperbarui ${hasil.sukses} varian Google Form!\n` +
      `Seluruh form kini dapat dibuka tanpa login Google dan data identitas portal akan terisi otomatis.`,
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert('Terjadi Kesalahan', err.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu 4: Sinkronisasi manual rekapitulasi nilai.
 */
function menuUpdateRekap() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = sinkronisasiRekapNilai();
    if (res.status === 'SUCCESS') {
      ui.alert(
        'Sinkronisasi Berhasil',
        `Data ${res.totalPeserta} mahasiswa berhasil diperbarui ke sheet "${CONFIG.SHEET_REKAP_NILAI}".\n` +
        `Rata-rata: ${res.rataRata} | Lulus: ${res.totalLulus} (${res.persenLulus}%)`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('Info', 'Belum ada data respon baru yang dapat direkap.', ui.ButtonSet.OK);
    }
  } catch (err) {
    ui.alert('Gagal Sinkronisasi', err.message, ui.ButtonSet.OK);
  }
}

/**
 * Menu 5: Memasang Time-Driven Trigger Otomatis setiap 15 menit.
 */
function pasangAutoSyncTrigger() {
  const ui = SpreadsheetApp.getUi();
  hapusTriggerByName('sinkronisasiRekapNilai');

  ScriptApp.newTrigger('sinkronisasiRekapNilai')
    .timeBased()
    .everyMinutes(15)
    .create();

  ui.alert(
    'Auto-Sync Aktif',
    'Sistem akan otomatis memperbarui tabel "RekapNilai" setiap 15 menit.',
    ui.ButtonSet.OK
  );
}

/**
 * Menu 6: Menghapus Trigger Auto-Sync.
 */
function hapusAutoSyncTrigger() {
  const ui = SpreadsheetApp.getUi();
  hapusTriggerByName('sinkronisasiRekapNilai');
  ui.alert('Info', 'Trigger Auto-Sync berhasil dinonaktifkan.', ui.ButtonSet.OK);
}

/**
 * Helper untuk menghapus trigger berdasarkan nama fungsi.
 * @param {string} functionName
 */
function hapusTriggerByName(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/**
 * Menu 7: Menampilkan Dialog Salin Data JSON untuk Netlify / Vercel (100% Anti-Down).
 */
function menuSalinJsonNetlify() {
  const varianList = ambilVarianAktif();
  if (!varianList || varianList.length === 0) {
    SpreadsheetApp.getUi().alert(
      'Varian Belum Siap',
      'Belum ada varian form yang berstatus Aktif. Silakan generate varian terlebih dahulu.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const jsonStr = JSON.stringify(varianList, null, 2);
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css">
    </head>
    <body class="p-4 font-sans text-xs bg-slate-50 text-slate-800">
      <p class="font-bold text-sm text-slate-900 mb-1">Data JSON Varian untuk Netlify / Vercel (Anti-Down):</p>
      <p class="text-slate-500 mb-3 leading-relaxed">
        Salin kode di bawah ini, lalu tempel ke dalam variabel <code>VARIAN_LIST</code> pada file <code>index.html</code> Anda. Dengan ini, 9.000 mahasiswa dapat mengakses portal tanpa menyentuh server Google Apps Script sama sekali.
      </p>
      <textarea id="jsonArea" readonly class="w-full h-56 p-2.5 font-mono text-[11px] bg-white border border-slate-300 rounded-lg select-all focus:outline-none mb-3">${jsonStr}</textarea>
      <button onclick="salinJson()" id="btnCopy" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-1">
        <span>📋 Salin Kode JSON ke Clipboard</span>
      </button>
      <p id="msgSukses" class="hidden text-emerald-600 font-semibold text-center mt-2">✓ Berhasil disalin ke clipboard!</p>
      <script>
        function salinJson() {
          const area = document.getElementById('jsonArea');
          area.select();
          document.execCommand('copy');
          document.getElementById('msgSukses').classList.remove('hidden');
          document.getElementById('btnCopy').textContent = '✓ Tersalin!';
        }
      </script>
    </body>
    </html>
  `;

  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(580)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Export JSON Netlify / Vercel');
}

/**
 * Menu 8: Dialog informasi link Web App Google.
 */
function menuSalinLinkPortal() {
  const ui = SpreadsheetApp.getUi();
  const webAppUrl = getWebAppUrl();

  const msg = (webAppUrl && !webAppUrl.includes('Belum')) 
    ? `Link Web App Google Apps Script:\n\n🔗 ${webAppUrl}\n\n` +
      `Catatan: Untuk lonjakan 9.000 mahasiswa serentak, sangat disarankan menggunakan link Netlify/Vercel agar anti-down.`
    : `Web App belum di-deploy.\n\n` +
      `Langkah Deploy Web App:\n` +
      `1. Di Apps Script, klik tombol 'Deploy' (kanan atas) -> 'New deployment'\n` +
      `2. Pilih tipe: 'Web app'\n` +
      `3. Execute as: 'Me' | Who has access: 'Anyone'\n` +
      `4. Klik 'Deploy' lalu salin Web App URL.`;

  ui.alert('Link Web App Google', msg, ui.ButtonSet.OK);
}

/**
 * Menu 8: Menampilkan ringkasan statistik terkini.
 */
function menuLihatStatistik() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet();
  const shRekap = ss.getSheetByName(CONFIG.SHEET_REKAP_NILAI);

  if (!shRekap || shRekap.getLastRow() <= 1) {
    ui.alert('Info', 'Belum ada data rekapitulasi. Silakan klik "Perbarui Rekap Nilai Sekarang".', ui.ButtonSet.OK);
    return;
  }

  const statValues = shRekap.getRange(2, 11, 6, 2).getValues();
  let ringkasan = '📊 RINGKASAN PRETEST MATEMATIKA\n=================================\n';
  statValues.forEach(row => {
    ringkasan += `${row[0]}: ${row[1]}\n`;
  });

  ui.alert('Statistik Pretest', ringkasan, ui.ButtonSet.OK);
}
