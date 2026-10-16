#!/usr/bin/env python3
"""
Script Impor Dataset 40.000 Buku untuk Sistem Perpustakaan Libra
Mendukung:
1. Streaming file CSV eksternal (Kaggle, GoodReads, dll.) ke aplikasi Libra
2. Pembuatan dataset dummy otomatis 40.000 buku untuk pengujian performa

Cara Penggunaan:
  - Mengunggah file CSV Anda:
      python scripts/import_40k_dataset.py file_buku_40k.csv

  - Menghasilkan dan memuat 40.000 buku uji otomatis:
      python scripts/import_40k_dataset.py --generate
"""

import os
import sys
import csv
import json
import random
import time
import urllib.request

API_URL = "http://localhost:3000/api/books/import-csv-chunk"
CHUNK_SIZE = 5000  # 5.000 baris per batch agar pengiriman ringan dan stabil

GENRE_MAP = {
    "Sains & Teknologi": ["Sains Komputer", "Kecerdasan Buatan", "Fisika Modern", "Bioteknologi", "Robotika", "Siber"],
    "Misteri & Thriller": ["Psychological Thriller", "Cozy Mystery", "Investigasi Forensik", "Detektif Noir", "Konspirasi"],
    "Fiksi & Fantasi": ["High Fantasy", "Cyberpunk", "Space Opera", "Dystopian", "Time Travel", "Mitologi"],
    "Horor & Supernatural": ["Gothic Horror", "Supernatural", "Teror Psikologis", "Kutukan Kuno"],
    "Metode Penelitian & Akademis": ["Metodologi Penelitian", "Statistika Terapan", "Analisis Data Kuantitatif", "Riset Ilmiah"],
    "Pengembangan Diri & Bisnis": ["Manajemen Strategis", "Psikologi Kebiasaan", "Literasi Finansial", "Leadership"],
    "Biografi & Sejarah": ["Sejarah Dunia", "Memoar Tokoh", "Peradaban Nusantara", "Arkeologi"],
    "Romansa & Drama": ["Contemporary Romance", "Family Saga", "Historical Romance", "Romansa Perkotaan"],
    "Sastra & Petualangan": ["Sastra Klasik", "Petualangan Alam Liar", "Epos Puisi", "Realisme Magis"]
}

PENULIS_SAMPLE = [
    "Prof. Dr. Ir. Budi Santoso", "Dr. Eng. Ahmad Syarif", "Prof. Sri Utami M.Si.", "Rian Hidayat S.Kom.",
    "Dr. Maria Elizabeth", "Prof. Alan Turing", "Ir. Megawati Wijaya", "Dr. Jessica Henderson",
    "Prof. John Nash", "Dr. Richard Feynman", "Sarah Jenkins Ph.D.", "Dr. Michael O'Connor",
    "Tere Liye", "Dee Lestari", "Ahmad Fuadi", "Leila S. Chudori", "Eka Kurniawan", "Pramoedya Ananta Toer",
    "Haruki Murakami", "George R.R. Martin", "J.K. Rowling", "Agatha Christie", "Stephen King"
]

PENERBIT_SAMPLE = [
    "Gramedia Pustaka Utama", "Mizan Pustaka", "Bentang Pustaka", "Republika Penerbit",
    "UPJ Press", "Erlangga Academic", "Andi Offset", "Aksara Pustaka Utama", "MIT Press",
    "O'Reilly Media", "Springer-Verlag", "Cambridge University Press"
]

def stream_csv_file(filepath):
    if not os.path.exists(filepath):
        print(f"[ERROR] File '{filepath}' tidak ditemukan.")
        return

    filesize_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"\n📂 Memulai proses impor dataset: '{filepath}' ({filesize_mb:.2f} MB)")
    print(f"🔗 Target Endpoint: {API_URL}")
    print("-" * 55)

    start_time = time.time()
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        header_line = f.readline()
        if not header_line:
            print("[ERROR] File CSV kosong.")
            return

        current_lines = [header_line]
        chunk_count = 0
        total_in_db = 0

        while True:
            line = f.readline()
            if not line:
                # Kirim batch terakhir
                if len(current_lines) > 1:
                    is_first = (chunk_count == 0)
                    chunk_text = "".join(current_lines)
                    payload = json.dumps({
                        "chunk": chunk_text,
                        "isFirst": is_first,
                        "isLast": True,
                        "clearExisting": is_first
                    }).encode('utf-8')

                    req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                    try:
                        with urllib.request.urlopen(req) as resp:
                            data = json.loads(resp.read().decode('utf-8'))
                            total_in_db = data.get('currentTotal', 0)
                            print(f"\r✅ Batch {chunk_count + 1} Selesai! Total buku di database: {total_in_db:,} buku.")
                    except Exception as err:
                        print(f"\n[ERROR] Batch terakhir gagal: {err}")
                break

            current_lines.append(line)

            if len(current_lines) >= CHUNK_SIZE:
                is_first = (chunk_count == 0)
                chunk_text = "".join(current_lines)
                payload = json.dumps({
                    "chunk": chunk_text,
                    "isFirst": is_first,
                    "isLast": False,
                    "clearExisting": is_first
                }).encode('utf-8')

                print(f"Mengirim Batch {chunk_count + 1} ({len(current_lines):,} baris)... ", end="", flush=True)
                req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                try:
                    with urllib.request.urlopen(req) as resp:
                        data = json.loads(resp.read().decode('utf-8'))
                        total_in_db = data.get('currentTotal', 0)
                        print(f"Berhasil! (Total di DB: {total_in_db:,})")
                except Exception as err:
                    print(f"Gagal: {err}")

                chunk_count += 1
                current_lines = [header_line]

    elapsed = time.time() - start_time
    print("-" * 55)
    print(f"🎉 SUKSES! Sebanyak {total_in_db:,} buku berhasil diimpor & terindeks TF-IDF.")
    print(f"⏱️ Waktu eksekusi: {elapsed:.1f} detik.")

def generate_sample_40k(filename="dataset_40k_books.csv", total=40000):
    print(f"📦 Membuat file CSV 40.000 buku ke '{filename}'...")
    start = time.time()
    headers = ["ISBN", "Book-Title", "Book-Author", "Year-Of-Publication", "Publisher", "Category", "Genre", "Summary"]
    categories = list(GENRE_MAP.keys())

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)

        for i in range(1, total + 1):
            cat = categories[i % len(categories)]
            subgenres = GENRE_MAP[cat]
            subgenre = subgenres[(i // len(categories)) % len(subgenres)]
            penulis = PENULIS_SAMPLE[i % len(PENULIS_SAMPLE)]
            penerbit = PENERBIT_SAMPLE[i % len(PENERBIT_SAMPLE)]
            tahun = 1995 + (i % 30)
            isbn = f"978-{602 + (i % 250):03d}-{1000 + (i % 8999):04d}-{i % 10}"
            title = f"Koleksi Pustaka {subgenre} Edisi {i:,}"
            summary = f"Buku literatur komprehensif bertajuk {title} karya {penulis}, mengupas tuntas domain {cat} dengan fokus studi {subgenre}."

            writer.writerow([isbn, title, penulis, tahun, penerbit, cat, subgenre, summary])

            if i % 10000 == 0 or i == total:
                print(f"  -> {i:,} / {total:,} baris dibuat ({time.time() - start:.1f} detik)...")

    print(f"✅ File '{filename}' berhasil dibuat ({os.path.getsize(filename)/(1024*1024):.1f} MB).\n")
    stream_csv_file(filename)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == "--generate":
            generate_sample_40k()
        else:
            stream_csv_file(arg)
    else:
        print("Penggunaan:")
        print("  1. python scripts/import_40k_dataset.py <nama_file.csv>")
        print("  2. python scripts/import_40k_dataset.py --generate")
