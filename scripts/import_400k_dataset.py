#!/usr/bin/env python3
"""
Generator & Importer Dataset 400.000 Buku untuk Sistem Perpustakaan Libra
Menghasilkan atau memproses dataset berskala besar (400.000 data) dengan deduplikasi dan streaming batch.
"""

import os
import sys
import csv
import json
import random
import time
import urllib.request

API_URL = "http://localhost:3000/api/books/import-csv-chunk"
CHUNK_SIZE = 10000  # 10,000 buku per batch untuk performa optimal

PENULIS_POOL = [
    "Prof. Dr. Ir. Budi Santoso", "Dr. Eng. Ahmad Syarif", "Prof. Sri Utami M.Si.", "Rian Hidayat S.Kom.",
    "Dr. Maria Elizabeth", "Prof. Alan Turing", "Ir. Megawati Wijaya", "Dr. Jessica Henderson",
    "Prof. John Nash", "Dr. Richard Feynman", "Sarah Jenkins Ph.D.", "Dr. Michael O'Connor",
    "Prof. Donald Knuth", "Grace Hopper M.Sc.", "Dr. Elizabeth Vance", "Prof. Stephen Hawking",
    "Tere Liye", "Dee Lestari", "Ahmad Fuadi", "Leila S. Chudori", "Eka Kurniawan", "Pramoedya Ananta Toer",
    "Haruki Murakami", "George R.R. Martin", "J.K. Rowling", "Agatha Christie", "Stephen King", "Brandon Sanderson"
]

PENERBIT_POOL = [
    "Gramedia Pustaka Utama", "Mizan Pustaka", "Bentang Pustaka", "Republika Penerbit",
    "UPJ Press", "Erlangga Academic", "Andi Offset", "Aksara Pustaka Utama", "MIT Press",
    "O'Reilly Media", "Springer-Verlag", "Cambridge University Press", "Oxford Academic"
]

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

def generate_csv_file(filename="dataset_400k_books.csv", total_rows=400000):
    print(f"📦 Membuat dataset CSV {total_rows:,} data ke '{filename}'...")
    start_time = time.time()
    
    headers = ["ISBN", "Book-Title", "Book-Author", "Year-Of-Publication", "Publisher", "Category", "Genre", "Summary"]
    categories = list(GENRE_MAP.keys())
    
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for i in range(1, total_rows + 1):
            cat = categories[i % len(categories)]
            subgenres = GENRE_MAP[cat]
            subgenre = subgenres[(i // len(categories)) % len(subgenres)]
            penulis = PENULIS_POOL[i % len(PENULIS_POOL)]
            penerbit = PENERBIT_POOL[i % len(PENERBIT_POOL)]
            tahun = 1990 + (i % 35)
            isbn = f"978-{602 + (i % 300):03d}-{1000 + (i % 8999):04d}-{i % 10}"
            title = f"Koleksi Pustaka {subgenre} Seri {i:,}"
            summary = f"Buku literatur komprehensif bertajuk {title} yang ditulis oleh {penulis}, membahas secara mendalam domain {cat} dengan fokus {subgenre}."
            
            writer.writerow([isbn, title, penulis, tahun, penerbit, cat, subgenre, summary])
            
            if i % 50000 == 0 or i == total_rows:
                elapsed = time.time() - start_time
                print(f"  -> {i:,} / {total_rows:,} baris tercatat ({elapsed:.1f} detik)...")
                
    filesize_mb = os.path.getsize(filename) / (1024 * 1024)
    print(f"✅ Selesai membuat file '{filename}' ({filesize_mb:.1f} MB) dalam {time.time() - start_time:.1f} detik.\n")

def stream_csv_to_server(filename="dataset_400k_books.csv"):
    if not os.path.exists(filename):
        print(f"[ERROR] File '{filename}' tidak ditemukan.")
        return
        
    filesize_mb = os.path.getsize(filename) / (1024 * 1024)
    print(f"🚀 Memulai streaming impor dataset '{filename}' ({filesize_mb:.1f} MB) ke {API_URL}...")
    
    start_time = time.time()
    with open(filename, "r", encoding="utf-8", errors="ignore") as f:
        header_line = f.readline()
        if not header_line:
            print("[ERROR] File CSV kosong.")
            return
            
        current_lines = [header_line]
        chunk_count = 0
        total_rows_imported = 0
        
        while True:
            line = f.readline()
            if not line:
                # Last batch
                if len(current_lines) > 0:
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
                            total_rows_imported = data.get('currentTotal', 0)
                            print(f"\r✅ Batch {chunk_count + 1} Selesai! Total database: {total_rows_imported:,} buku.")
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
                
                print(f"Mengunggah Batch {chunk_count + 1} ({len(current_lines):,} baris)...", end="", flush=True)
                req = urllib.request.Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                try:
                    with urllib.request.urlopen(req) as resp:
                        data = json.loads(resp.read().decode('utf-8'))
                        total_rows_imported = data.get('currentTotal', 0)
                        print(f" [Selesai -> Total DB: {total_rows_imported:,} buku]")
                except Exception as err:
                    print(f"\n[ERROR] Batch {chunk_count + 1} gagal: {err}")
                    
                chunk_count += 1
                current_lines = [header_line]
                
    total_elapsed = time.time() - start_time
    print(f"\n🎉 SUKSES BESAR! Total {total_rows_imported:,} buku berhasil dimuat dalam {total_elapsed:.1f} detik.")

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "all"
    target_file = sys.argv[2] if len(sys.argv) > 2 else "dataset_400k_books.csv"
    
    if action == "generate":
        generate_csv_file(target_file, 400000)
    elif action == "upload":
        stream_csv_to_server(target_file)
    else:
        # Default: generate and upload
        generate_csv_file(target_file, 400000)
        stream_csv_to_server(target_file)
