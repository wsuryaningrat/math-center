# 📐 Sistem Pretest Matematika Skala Besar (Google Form Multi-Varian)

Sistem otomatisasi Pretest Matematika berbasis **Google Apps Script**, **Google Form (Quiz Native)**, dan **Google Sheets** yang dirancang khusus untuk menangani **±9000 mahasiswa** dengan pengerjaan tersebar atau serentak ratusan peserta.

---

## 📁 Struktur File & Modul

| File | Deskripsi |
| :--- | :--- |
| [`Code.gs`](Code.gs) | File utama Google Apps Script (All-in-One: Konfigurasi, Generator Form, Portal Backend, Rekap Nilai, & Menu). |
| [`Portal.html`](Portal.html) | Antarmuka Portal Mahasiswa modern (Tailwind CSS) dengan *Deterministic Hashing* FNV-1a & Auto-Prefill. |
| [`contoh-BankSoal.csv`](contoh-BankSoal.csv) | Contoh data bank soal matematika (S1 Aljabar, S2 Geometri, S3 Statistika) multi-versi. |
| [`contoh-KonfigSection.csv`](contoh-KonfigSection.csv) | Contoh konfigurasi bab/section dan kuota soal per bab. |
| [`logo-telkom.png`](logo-telkom.png) | Aset logo resmi unit Telkom University. |
| [`PANDUAN_SETUP.md`](PANDUAN_SETUP.md) | Panduan langkah demi langkah penggunaan dan deployment sistem. |
| [`README.md`](README.md) | Ringkasan dan dokumentasi utama proyek. |

---

## ⚡ Fitur Utama

1. **🎲 Pengacakan Bertingkat Adil**:
   - Membagi soal ke dalam Section/Bab yang teratur.
   - Mengambil sampel nomor soal secara acak sesuai kuota per section.
   - Memilih 1 versi acak (`V1`, `V2`, `V3`) untuk setiap nomor soal terpilih.

2. **🔗 1 Link Tunggal untuk 9000 Mahasiswa**:
   - Mahasiswa hanya diberikan 1 URL Web App.
   - Mahasiswa memasukkan email -> Algoritma FNV-1a + Murmur3 avalanche bit mixer mengalokasikan varian secara deterministik dan merata.
   - Email yang sama akan **selalu diarahkan ke varian yang sama**, bahkan jika membuka berulang kali atau dari perangkat berbeda.
   - *Client-side execution*: Tahan lonjakan ratusan mahasiswa masuk serentak tanpa membebani server.

3. **📝 Penilaian Otomatis Google Form (Quiz Native)**:
   - Setiap form otomatis diatur sebagai kuis dengan kunci jawaban dan bobot poin.
   - Hasil submit otomatis dinilai langsung oleh Google dan dicatat ke spreadsheet.

4. **📊 Rekap Nilai Terpadu & Statistik Real-Time**:
   - Menggabungkan semua respon varian (`Tanggapan Formulir 1..N`) ke sheet master `RekapNilai`.
   - Mengonversi skor ke skala 100 dan menentukan status `LULUS` / `REMEDIAL` (berdasarkan KKM).
   - Menghasilkan ringkasan metrik statistik (Rata-rata, Tertinggi, Terendah, dan Distribusi Varian).
   - Auto-sync otomatis setiap 15 menit via Apps Script Trigger.
