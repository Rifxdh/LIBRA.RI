# -*- coding: utf-8 -*-
"""
Hitung ulang statistik preprocessing dan metrik akurasi (Precision, Recall, F1) untuk pipeline dua bahasa:
  Dokumen : sinopsis Inggris -> case folding -> tokenisasi -> stopword Inggris -> stemming Snowball
  Kueri   : teks Indonesia -> (Sastrawi: stopword + ECS) -> diterjemahkan LLM -> pipeline Inggris yang sama dengan dokumen

Pemakaian:
  pip install pandas scikit-learn nltk PySastrawi
  python hitung_ulang.py --data books.csv --id-col isbn --text-col synopsis --queries queries.csv --k 5

queries.csv (satu baris per kueri uji, pakai delimiter koma):
  query_id, query_id_text, query_en, relevant_ids
  - query_id_text : kueri asli berbahasa Indonesia (opsional, hanya untuk dicatat)
  - query_en      : terjemahan Inggris dari LLM sistem (ambil dari log; JANGAN diterjemahkan ulang agar hasil sama dengan sistem)
  - relevant_ids  : id buku relevan hasil penilaian, dipisah titik koma, contoh: 0345339681;0618260307
Keluaran: hasil.json dan tabel di layar.
"""
import argparse, json, re
import numpy as np, pandas as pd
import nltk
from nltk.corpus import stopwords
from nltk.stem.snowball import SnowballStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

nltk.download('stopwords', quiet=True)
STOP = set(stopwords.words('english')); STEM = SnowballStemmer('english')
tok = lambda s: re.findall(r"[a-z]+", str(s).lower())

def stats(texts):
    n_tok = n_stop = 0; vocab_before = set(); vocab_after = set(); docs = []
    for t in texts:
        toks = tok(t); n_tok += len(toks)
        kept = [w for w in toks if w not in STOP]; n_stop += len(toks) - len(kept)
        vocab_before.update(kept); stems = [STEM.stem(w) for w in kept]
        vocab_after.update(stems); docs.append(" ".join(stems))
    return docs, dict(
        total_token=n_tok,
        stopword_dibuang_persen=round(100*n_stop/max(n_tok,1), 1),
        kosakata_sebelum_stemming=len(vocab_before),
        kosakata_setelah_stemming=len(vocab_after),
        pengurangan_variasi_persen=round(100*(len(vocab_before)-len(vocab_after))/max(len(vocab_before),1), 1))

def clean_query_en(q):
    return " ".join(STEM.stem(w) for w in tok(q) if w not in STOP)

ap = argparse.ArgumentParser()
ap.add_argument('--data', required=True); ap.add_argument('--id-col', required=True)
ap.add_argument('--text-col', required=True); ap.add_argument('--queries', required=True)
ap.add_argument('--k', type=int, default=5)
ap.add_argument('--thresholds', default='0.05,0.10,0.15,0.20,0.25')
a = ap.parse_args()

df = pd.read_csv(a.data).dropna(subset=[a.text_col]).drop_duplicates(subset=[a.id_col])
docs, prep = stats(df[a.text_col].tolist())
prep['jumlah_dokumen'] = len(df)
prep['rata_rata_kata_per_sinopsis'] = round(float(np.mean([len(tok(t)) for t in df[a.text_col]])), 1)
vec = TfidfVectorizer(); X = vec.fit_transform(docs)
ids = df[a.id_col].astype(str).tolist()

Q = pd.read_csv(a.queries, dtype=str)
Qv = vec.transform([clean_query_en(q) for q in Q['query_en']])
S = cosine_similarity(Qv, X)
rel = [set(str(r).split(';')) for r in Q['relevant_ids']]

rows = []
for T in [float(x) for x in a.thresholds.split(',')]:
    P, R = [], []
    for i in range(len(Q)):
        order = np.argsort(-S[i])[:a.k]
        got = [ids[j] for j in order if S[i, j] >= T]
        tp = len(set(got) & rel[i])
        P.append(tp/len(got) if got else 0.0)      # kueri tanpa hasil dihitung presisi 0
        R.append(tp/len(rel[i]) if rel[i] else 0.0)
    p, r = float(np.mean(P)), float(np.mean(R)); f = 2*p*r/(p+r) if p+r else 0.0
    rows.append(dict(threshold=T, precision=round(p,2), recall=round(r,2), f1=round(f,2),
                     kueri_tanpa_hasil=int(sum(1 for i in range(len(Q)) if not (S[i] >= T).any()))))
out = dict(preprocessing=prep, metrik=rows, k=a.k, n_kueri=len(Q))
json.dump(out, open('hasil.json', 'w'), ensure_ascii=False, indent=2)
print(json.dumps(prep, ensure_ascii=False, indent=2)); print(pd.DataFrame(rows).to_string(index=False))
