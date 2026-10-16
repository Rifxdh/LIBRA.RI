#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Otomatis: Data Cleansing & Import Dataset Buku (~430 MB)
Sesuai Metodologi Sub-bab 2.2 Naskah Jurnal TIN 2026:
1. Membaca CSV berukuran besar secara streaming chunk (hemat RAM).
2. Memfilter entri kosong/tanpa sinopsis.
3. Memperbaiki kesalahan enkoding karakter (HTML entities, quotes, mojibake).
4. Melakukan deduplikasi nomor ISBN dan judul.
5. Menghasilkan file CSV bersih (books_clean.csv).
6. Mengimpor langsung ke database & TF-IDF store Libra.

Pemakaian:
  python3 scripts/clean_and_import.py <file_mentah_430mb.csv>
"""

import sys
import os
import re
import csv
import json
import html
import time
import urllib.request

API_URL = "http://localhost:3000/api/books/import-csv-chunk"
CHUNK_UPLOAD_SIZE = 5000

def clean_text(text: str) -> str:
    """Membersihkan kesalahan enkoding, karakter HTML, dan spasi ganda."""
    if not text or not isinstance(text, str):
        return ""
    # Unescape HTML entities (&amp; -> &, &quot; -> ", dll.)
    t = html.unescape(text)
    # Hapus null bytes dan karakter non-printable aneh
    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', t)
    # Rapikan quotes ganda/tripel hasil export CSV
    t = re.sub(r'^["\']+|["\']+$', '', t.strip())
    # Normalisasi spasi
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def clean_isbn(isbn_str: str) -> str:
    """Normalisasi ISBN (buang karakter non-alfanumerik kecuali dash)."""
    if not isbn_str:
        return ""
    cleaned = re.sub(r'[^0-9X-]', '', str(isbn_str).upper().strip())
    return cleaned

def clean_and_process_csv(raw_csv_path: str, output_csv_path: str = "books_clean.csv"):
    if not os.path.exists(raw_csv_path):
        print(f"❌ [ERROR] File '{raw_csv_path}' tidak ditemukan!")
        sys.exit(1)

    file_size_mb = os.path.getsize(raw_csv_path) / (1024 * 1024)
    print("=" * 65)
    print(f"🧹 MEMULAI DATA CLEANSING DATASET BUKU ({file_size_mb:.1f} MB)")
    print("=" * 65)

    start_time = time.time()
    seen_isbns = set()
    seen_titles = set()

    total_read = 0
    total_valid = 0
    dropped_no_synopsis = 0
    dropped_duplicates = 0
    dropped_invalid_isbn = 0

    target_headers = ['isbn', 'title', 'author', 'year', 'publisher', 'category', 'genre', 'synopsis']

    with open(raw_csv_path, 'r', encoding='utf-8', errors='ignore') as infile, \
         open(output_csv_path, 'w', newline='', encoding='utf-8') as outfile:

        reader = csv.reader(infile)
        writer = csv.writer(outfile)

        # 1. Deteksi Header
        try:
            raw_header = next(reader)
        except StopIteration:
            print("❌ File CSV kosong!")
            return None

        clean_h = [h.lower().strip().replace('-', '_').replace(' ', '_') for h in raw_header]
        print(f"📋 Kolom terdeteksi pada dataset mentah: {clean_h}")

        # Pemetaan indeks kolom otomatis
        idx_isbn = next((i for i, h in enumerate(clean_h) if 'isbn' in h), -1)
        idx_title = next((i for i, h in enumerate(clean_h) if 'title' in h or 'judul' in h or 'book_title' in h), -1)
        idx_author = next((i for i, h in enumerate(clean_h) if 'author' in h or 'penulis' in h or 'book_author' in h), -1)
        idx_year = next((i for i, h in enumerate(clean_h) if 'year' in h or 'tahun' in h or 'publication' in h), -1)
        idx_pub = next((i for i, h in enumerate(clean_h) if 'publisher' in h or 'penerbit' in h), -1)
        idx_cat = next((i for i, h in enumerate(clean_h) if 'cat' in h or 'kategori' in h or 'genre' in h), -1)
        idx_syn = next((i for i, h in enumerate(clean_h) if 'synopsis' in h or 'summary' in h or 'description' in h or 'ringkasan' in h), -1)

        print(f"🔍 Pemetaan Kolom:")
        print(f"   - ISBN     : Kolom #{idx_isbn}")
        print(f"   - Title    : Kolom #{idx_title}")
        print(f"   - Author   : Kolom #{idx_author}")
        print(f"   - Synopsis : Kolom #{idx_syn}")

        writer.writerow(target_headers)

        for row in reader:
            total_read += 1
            if total_read % 25000 == 0:
                print(f"   -> Memproses {total_read:,} baris... (Valid tersaring: {total_valid:,})")

            # Ambil nilai berdasarkan mapping
            raw_isbn = row[idx_isbn] if 0 <= idx_isbn < len(row) else ""
            raw_title = row[idx_title] if 0 <= idx_title < len(row) else ""
            raw_author = row[idx_author] if 0 <= idx_author < len(row) else ""
            raw_year = row[idx_year] if 0 <= idx_year < len(row) else "2020"
            raw_pub = row[idx_pub] if 0 <= idx_pub < len(row) else "Penerbit Umum"
            raw_cat = row[idx_cat] if 0 <= idx_cat < len(row) else "Umum"
            raw_syn = row[idx_syn] if 0 <= idx_syn < len(row) else ""

            # Pembersihan teks
            isbn = clean_isbn(raw_isbn)
            title = clean_text(raw_title)
            author = clean_text(raw_author)
            synopsis = clean_text(raw_syn)
            publisher = clean_text(raw_pub) or "Penerbit Umum"
            category = clean_text(raw_cat) or "Umum"

            # Parse tahun
            year_match = re.search(r'\b(19\d\d|20\d\d)\b', str(raw_year))
            year = int(year_match.group(1)) if year_match else 2020

            # Aturan Cleansing 1: Wajib memiliki sinopsis substantif (> 15 karakter / > 3 kata)
            if not synopsis or len(synopsis) < 15 or len(synopsis.split()) < 4:
                dropped_no_synopsis += 1
                continue

            # Aturan Cleansing 2: Validitas ISBN & Judul
            if not isbn or len(isbn) < 6:
                dropped_invalid_isbn += 1
                continue
            if not title or len(title) < 2:
                continue

            # Aturan Cleansing 3: Deduplikasi ISBN & Judul+Penulis
            title_author_key = f"{title.lower()}|{author.lower()}"
            if isbn in seen_isbns or title_author_key in seen_titles:
                dropped_duplicates += 1
                continue

            seen_isbns.add(isbn)
            seen_titles.add(title_author_key)

            # Genre default
            genre = category

            writer.writerow([isbn, title, author, year, publisher, category, genre, synopsis])
            total_valid += 1

    clean_size_mb = os.path.getsize(output_csv_path) / (1024 * 1024)
    elapsed = time.time() - start_time

    print("\n" + "=" * 65)
    print("📊 LAPORAN HASIL DATA CLEANSING:")
    print("=" * 65)
    print(f"Total baris mentah terbaca  : {total_read:,}")
    print(f"Dibuang (tanpa sinopsis)    : {dropped_no_synopsis:,}")
    print(f"Dibuang (ISBN tidak valid)  : {dropped_invalid_isbn:,}")
    print(f"Dibuang (duplikasi ISBN/Jdl): {dropped_duplicates:,}")
    print(f"✅ HASIL BERSIH VALID       : {total_valid:,} buku")
    print(f"Ukuran file bersih          : {clean_size_mb:.2f} MB (Tersimpan di '{output_csv_path}')")
    print(f"Waktu proses cleansing      : {elapsed:.1f} detik")
    print("=" * 65)

    return output_csv_path

def stream_to_server(clean_csv_path: str):
    """Mengimpor hasil bersih langsung ke backend Libra via streaming batch."""
    print(f"\n🚀 Mengirim hasil bersih ke server Libra via {API_URL}...")
    with open(clean_csv_path, 'r', encoding='utf-8') as f:
        header_line = f.readline()
        current_lines = [header_line]
        chunk_count = 0
        total_in_db = 0

        while True:
            line = f.readline()
            if not line:
                if len(current_lines) > 0:
                    is_first = (chunk_count == 0)
                    payload = json.dumps({
                        "chunk": "".join(current_lines),
                        "isFirst": is_first,
                        "isLast": True,
                        "clearExisting": is_first
                    }).encode('utf-8')
                    req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                    try:
                        with urllib.request.urlopen(req) as resp:
                            data = json.loads(resp.read().decode('utf-8'))
                            total_in_db = data.get('currentTotal', 0)
                    except Exception as e:
                        print(f"Error kirim batch terakhir: {e}")
                break

            current_lines.append(line)
            if len(current_lines) >= CHUNK_UPLOAD_SIZE:
                is_first = (chunk_count == 0)
                print(f"  -> Mengunggah batch {chunk_count + 1} ({len(current_lines):,} baris)... ", end="", flush=True)
                payload = json.dumps({
                    "chunk": "".join(current_lines),
                    "isFirst": is_first,
                    "isLast": False,
                    "clearExisting": is_first
                }).encode('utf-8')
                req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                try:
                    with urllib.request.urlopen(req) as resp:
                        data = json.loads(resp.read().decode('utf-8'))
                        total_in_db = data.get('currentTotal', 0)
                        print(f"Berhasil! (Total di DB: {total_in_db:,})")
                except Exception as e:
                    print(f"Gagal: {e}")
                chunk_count += 1
                current_lines = [header_line]

    print(f"\n🎉 SUKSES! Sebanyak {total_in_db:,} buku bersih telah terindeks ke server Libra.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Penggunaan:")
        print("  python3 scripts/clean_and_import.py <nama_file_mentah_430mb.csv>")
        print("\nContoh:")
        print("  python3 scripts/clean_and_import.py Preprocessed_data.csv")
        sys.exit(1)

    raw_file = sys.argv[1]
    cleaned_file = clean_and_process_csv(raw_file)
    if cleaned_file:
        stream_to_server(cleaned_file)
