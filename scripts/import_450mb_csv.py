#!/usr/bin/env python3
"""
Script Impor Dataset CSV Besar (misal 450 MB Kaggle Book-Crossing Dataset)
Mengunggah & Mengklasifikasi data buku dalam potongan (batch) secara efisien ke server Libra.
"""

import sys
import os
import csv
import json
import urllib.request
import urllib.parse

API_URL = "http://localhost:3000/api/books/import-csv-chunk"
CHUNK_LINES = 10000  # 10,000 baris per batch chunk

def upload_chunk(csv_lines, is_first, is_last, clear_existing=False):
    chunk_text = "".join(csv_lines)
    payload = {
        "chunk": chunk_text,
        "isFirst": is_first,
        "isLast": is_last,
        "clearExisting": clear_existing
    }
    
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        API_URL, 
        data=data_bytes, 
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            return res_data
    except Exception as e:
        print(f"\n[ERROR] Gagal mengunggah batch: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print("Penggunaan: python3 scripts/import_450mb_csv.py <path_ke_file_450mb.csv>")
        sys.exit(1)
        
    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print(f"[ERROR] File '{csv_path}' tidak ditemukan.")
        sys.exit(1)
        
    file_size_mb = os.path.getsize(csv_path) / (1024 * 1024)
    print(f"🚀 Memulai impor dataset '{csv_path}' ({file_size_mb:.1f} MB)...")
    
    with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
        header_line = f.readline()
        if not header_line:
            print("[ERROR] File CSV kosong.")
            sys.exit(1)
            
        current_lines = [header_line]
        chunk_count = 0
        total_rows_imported = 0
        
        while True:
            line = f.readline()
            if not line:
                # Last chunk
                if len(current_lines) > 0:
                    is_first = (chunk_count == 0)
                    res = upload_chunk(current_lines, is_first=is_first, is_last=True, clear_existing=is_first)
                    if res:
                        total_rows_imported = res.get('currentTotal', 0)
                        print(f"\r✅ Batch {chunk_count + 1} Selesai! Total Katalog Terproses: {total_rows_imported:,} buku.")
                break
                
            current_lines.append(line)
            
            if len(current_lines) >= CHUNK_LINES:
                is_first = (chunk_count == 0)
                print(f"Mengunggah Batch {chunk_count + 1} ({len(current_lines):,} baris)...", end="", flush=True)
                res = upload_chunk(current_lines, is_first=is_first, is_last=False, clear_existing=is_first)
                if res:
                    total_rows_imported = res.get('currentTotal', 0)
                    print(f" [Selesai -> Total: {total_rows_imported:,} buku]")
                chunk_count += 1
                current_lines = [header_line]  # re-include header for safety
                
    print(f"\n🎉 SUKSES Sempurna! Total {total_rows_imported:,} buku berhasil dimuat ke sistem Libra.")

if __name__ == "__main__":
    main()
