# Rencana Implementasi: Reduksi Teks & Tampilan Minimalis Elegan

Perapihan antarmuka aplikasi **Libra** secara menyeluruh dengan menghapus teks redundan, deskripsi teknis panjang, dan badge berlebihan, sehingga menghasilkan tampilan minimalis modern, berkelas (*clean editorial look*), dan hanya menampilkan judul serta aksi esensial.

---

## 1. Header & Navigasi
- **Sebelum**: Badge teknis ("100% In-Memory Fast Retrieval", "NLP-Driven", "Hybrid Recommender", info dataset panjang).
- **Perubahan**:
  - Hapus badge teknis yang berjejal.
  - Sederhanakan branding: **Libra** dengan subtitle ringkas *"Katalog & Rekomendasi Buku"*.
  - Sederhanakan tombol aksi navigasi: Tombol "Daftar Bacaan" dengan ikon dan counter ringkas.

## 2. Bagian Hero & Rekomendasi Utama (Landing View)
- **Sebelum**: Paragraf sambutan yang panjang dan repetitif ("Eksplorasi ribuan karya sastra dan literatur berkualitas...", tips teknis, subtitle promosi panjang).
- **Perubahan**:
  - Judul editorial elegan: *"Temukan Bacaan Terbaik"*
  - Subjudul 1 baris yang padat dan puitis.
  - Tombol aksi utama disederhanakan: *"Mulai Konsultasi"* (langsung menuju asisten obrolan) dan *"Jelajahi Katalog"*.

## 3. Filter Genre & Pencarian Katalog
- **Sebelum**: Penjelasan deskripsi filter, badge jumlah yang terlalu dominan, teks petunjuk panjang pada search bar.
- **Perubahan**:
  - Placeholder pencarian ringkas: *"Cari judul, penulis, atau ISBN..."*
  - Pills genre bersih tanpa teks dekoratif berlebih.
  - Sederhanakan info counter: *"Menampilkan X buku"* secara minimalis di sudut kanan.

## 4. Kartu Buku (Book Cards & Modal Detail)
- **Sebelum**: Label berulang ("Penulis:", "Tahun Rilis:", "ISBN:", "Penerbit:", "Kategori:"), teks bantuan tooltip panjang.
- **Perubahan**:
  - Tipografi hierarkis: Judul tebal, nama penulis di bawahnya tanpa label kata *"Penulis:"*.
  - Metadata tahun dan kategori disajikan dalam format mikro inline yang rapi (`2021 • Fiksi`).
  - Tombol simpan/bookmark dibuat minimalis dengan ikon intuitif.
  - Modal detail buku difokuskan pada ringkasan/sinopsis yang bersih tanpa jargon teknis.

## 5. Panel Obrolan & Rekomendasi AI
- **Sebelum**: Pesan pembuka bot yang berparagraf-paragraf dengan petunjuk panjang, disclaimer teknis ganda.
- **Perubahan**:
  - Pesan sambutan bot ringkas & hangat: *"Halo! Mau rekomendasi buku apa hari ini?"*
  - Contoh prompt / quick chips disingkat menjadi kata kunci pendek (misal: *"Sci-Fi seru"*, *"Pengembangan diri"*, *"Klasik"*, *"Misteri"*).
  - Status typing & bubble respon dibuat lebih bersih dan lega (*spacious padding*).

## 6. Drawer Daftar Bacaan & Modal Hapus / Konfirmasi
- **Sebelum**: Paragraf penjelasan panjang pada drawer dan dialog konfirmasi hapus.
- **Perubahan**:
  - Header drawer: *"Daftar Bacaan"* dan total item.
  - Tombol ekspor PDF dibuat ringkas: *"Unduh PDF"* dan *"Hapus Koleksi"*.
  - Modal konfirmasi hapus to the point: judul singkat dan pilihan aksi jelas (*"Batal"* / *"Hapus"*).

---

## Verifikasi & Pengujian
1. Menjalankan linter `lint_applet` untuk memastikan tidak ada kesalahan sintaks atau referensi terputus.
2. Memeriksa hasil build dengan `compile_applet`.
3. Memastikan semua fungsionalitas utama (pencarian, bookmark, ekspor PDF, filter genre, chat AI) tetap berfungsi normal dengan teks yang kini jauh lebih rapi dan estetis.
