# 📘 Panduan Lengkap Sistem Pretest Matematika (±9000 Mahasiswa)

Dokumen ini memuat panduan langkah demi langkah dalam menyiapkan, meng-generate Google Form multi-varian, men-deploy portal 1 link tunggal mahasiswa, dan mengelola rekapitulasi nilai secara otomatis.

---

## 🏗️ Arsitektur Sistem

```mermaid
flowchart LR
    A["Sheet BankSoal & KonfigSection"] -->|Apps Script Generator| B["Google Form (Varian 1..N)"]
    B -->|FormApp.DestinationType| C[("Spreadsheet Pusat (Tab Per Varian)")]
    B -->|Catat Link & ID| D["Sheet DaftarVarianForm"]
    
    E["9000+ Mahasiswa"] -->|1 Link Portal| F["Portal Web App (Apps Script)"]
    F -->|Deterministic Hash (Email)| G["Redirect ke Varian Mahasiswa"]
    G -->|Pengerjaan & Submit| B
    
    C -->|Sinkronisasi Otomatis / Trigger| H["Sheet RekapNilai Terpadu"]
    H --> I["Dashboard Statistik & Nilai"]
```

---

## 🚀 Langkah 1: Persiapan Google Spreadsheet

1. Buat **Google Spreadsheet Baru** di Google Drive Anda (misal beri nama: `Pretest Matematika 2026`).
2. Buat tab sheet dengan nama:
   - **`KonfigSection`**: Mengatur bab soal dan jumlah soal per bab.
   - **`BankSoal`**: Bank soal lengkap dengan variasi nomor dan versi.
3. *Atau cukup impor file CSV:*
   - Buka menu **File > Import > Upload**, lalu pilih file [`contoh-KonfigSection.csv`](contoh-KonfigSection.csv) dan [`contoh-BankSoal.csv`](contoh-BankSoal.csv).

---

## 💻 Langkah 2: Pasang Kode di Apps Script

1. Di Google Spreadsheet Anda, klik menu **Extensions (Ekstensi) > Apps Script**.
2. Anda hanya perlu menyiapkan **2 file** sederhana di Apps Script:
   - **`Code.gs`** (File Script): Salin dan tempel seluruh isi file [`Code.gs`](Code.gs).
   - **`Portal.html`** (File HTML): Klik tombol **+ (Add a file)** > pilih **HTML** > beri nama `Portal` (menjadi `Portal.html`), lalu salin seluruh isi file [`Portal.html`](Portal.html) ke dalamnya.
3. Klik tombol **Save 💾 (Simpan project)**.
4. Muat ulang (Refresh / F5) halaman Google Spreadsheet Anda. Menu baru **`📐 Sistem Pretest`** akan muncul di bar atas spreadsheet.

---

## 📝 Langkah 3: Generate Multi-Varian Google Form (Bebas Login & Auto-Prefill)

1. Pastikan data pada sheet `KonfigSection` dan `BankSoal` sudah terisi dengan benar.
2. Klik menu **`📐 Sistem Pretest` > `📝 2. Generate Varian Form Baru`**.
3. Masukkan jumlah varian yang diinginkan (misal `8` atau `10` varian).
4. Klik **OK**. Script akan:
   - Membuat Form kuis otomatis (`Pretest Matematika - Varian 1`, `Varian 2`, dst.).
   - Menonaktifkan syarat login Google / batasan domain (`setCollectEmail(false)`, `setLimitOneResponsePerUser(false)`, `setRequireLogin(false)`).
   - Mengatur izin file Google Drive menjadi publik (`Anyone with link`).
   - Menyusun URL Prefill resmi dengan parameter `entry.xxxx` untuk NPM, Nama, Fakultas, Prodi, dan Email.
   - Menautkan seluruh respon form ke Spreadsheet pusat ini secara otomatis.
   - Mencatat semua ID, Link Form, dan PrefillTemplate ke sheet `DaftarVarianForm`.

> [!TIP]
> Jika Anda sudah pernah membuat varian form sebelumnya dan ingin menghapus batasan login serta memperbarui link prefill, cukup klik menu **`📐 Sistem Pretest` > `🔓 3. Perbaiki Izin & Prefill Form (Bebas Login)`**.

---

## 🌐 Langkah 4: Deploy Web App (1 Link Portal Mahasiswa)

Agar mahasiswa cukup mengakses **1 link tunggal**:

1. Di editor Apps Script, klik tombol **Deploy** (biru di kanan atas) > **New deployment**.
2. Klik ikon gerigi ⚙️ (Select type) > pilih **Web app**.
3. Isi konfigurasi:
   - **Description**: `Portal Pretest Matematika v1.0`
   - **Execute as**: `Me (email Anda)`
   - **Who has access**: `Anyone` *(Penting: pilih Anyone agar semua mahasiswa dapat membuka portal tanpa login Google)*.
4. Klik **Deploy**.
5. Salin **Web app URL** yang muncul (misal: `https://script.google.com/macros/s/.../exec`).
6. **Bagikan 1 URL ini kepada seluruh 9000 mahasiswa!**

---

## 🔄 Langkah 5: Otomasi Rekapitulasi Nilai (`RekapNilai`)

1. Untuk mengaktifkan sinkronisasi nilai otomatis:
   - Klik menu **`📐 Sistem Pretest` > `⏰ 5. Pasang Auto-Sync Nilai (Tiap 15 Menit)`**.
2. Sistem akan secara otomatis:
   - Membaca seluruh tab respon dari semua varian (`Tanggapan Formulir 1..N`).
   - Melakukan parsing skor kuis (misal `18 / 20` -> `90.00`).
   - Mencegah duplikasi data mahasiswa (Deduplikasi cerdas berbasis NPM / Email).
   - Menghitung status kelulusan berdasarkan KKM (`LULUS` vs `REMEDIAL`).
   - Menampilkan ringkasan statistik (Rata-rata, Nilai Tertinggi, Terendah, dan Distribusi per Varian).
3. Anda juga dapat memperbarui rekap nilai kapan saja secara manual dengan klik **`🔄 4. Perbarui Rekap Nilai Sekarang`**.

---

## 🛡️ Analisis Ketahanan untuk 9000 Mahasiswa

| Aspek | Tantangan | Solusi yang Diterapkan |
| :--- | :--- | :--- |
| **Beban Pengerjaan (Concurrency)** | Ratusan mahasiswa submit bersamaan | Respon ditangani oleh server native Google Form (tanpa kuota Apps Script). |
| **Beban Portal 1 Link** | Ribuan akses bersamaan saat jam mulai | Redirection dihitung di sisi client (browser) menggunakan *FNV-1a + Murmur3 bit mixer*. Server Apps Script hanya mengirim 1 file HTML ringan (<50ms). |
| **Keadilan & Distribusi Varian** | Pembagian paket soal merata | Algoritma hashing terbukti mendistribusikan 9000 mahasiswa ke 8-12 varian dengan deviasi sangat rendah (<6%). |
| **Konsistensi Mahasiswa** | Mahasiswa logout / reload browser | Email yang sama 100% selalu dialokasikan ke varian yang sama persis (`hash(email) % N`). |
| **Kecurangan Antar Mahasiswa** | Menyontek teman sekelas | Soal tiap nomor memiliki varian versi berbeda dan urutan teracak. |
| **Batas Respon Google Sheet** | Kapasitas baris data | Google Sheets menampung hingga 10 juta sel data (9000 baris hanya memakai <0.1% kapasitas). |
