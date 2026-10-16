#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Implementasi Persis Algoritma Conversational Recommendation System
Berdasarkan Pseudo-code Sub-bab 2.4 & Gambar 1 pada Naskah Jurnal TIN 2026:

ALGORITMA Conversational_Recommendation_System:
INPUT: User_Query_ID (Q), Threshold_Similarity (T = 0.10), Top_N (K = 5)
OUTPUT: Recommended_Books_List, Explanation_Keywords

Tahapan:
1. Query_ID = Sastrawi_NLP_Preprocessing(Q)
   // Case folding, Stopword, ECS Stemming
2. Query_EN = LLM_Translate_To_English(Query_ID)
3. Clean_Query = English_NLP_Preprocessing(Query_EN)
   // Case folding, Stopword EN, Snowball Stemming
4. Vector_Q = TFIDF_Vectorizer.transform([Clean_Query])
5. Cosine_Scores = Cosine_Similarity(Vector_Q, Precomputed_Document_Matrix)
6. Candidate_Indices = Where(Cosine_Scores >= T)
7. Sorted_Indices = Sort_Descending(Candidate_Indices, key=Cosine_Scores)
8. FOR index IN Sorted_Indices[0:K]:
     Top_Terms = Extract_Max_TFIDF_Overlap(Clean_Query, Document_Synopsis[index], top=3)
     Explanation = Build_Explanation_String(Top_Terms)
     Append_To_Output(Book_Title[index], Cosine_Scores[index], Explanation)
9. RETURN Recommended_Books_List
"""

import os
import re
import json
import argparse
import numpy as np
import pandas as pd
import nltk
from nltk.corpus import stopwords
from nltk.stem.snowball import SnowballStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory

# Pastikan resource NLTK tersedia
nltk.download('stopwords', quiet=True)
STOP_EN = set(stopwords.words('english'))
STEM_EN = SnowballStemmer('english')

# Inisialisasi Sastrawi ECS
sastrawi_stemmer = StemmerFactory().create_stemmer()
sastrawi_stopword = StopWordRemoverFactory().create_stop_word_remover()

tok = lambda s: re.findall(r"[a-z]+", str(s).lower())

def sastrawi_nlp_preprocessing(text_id: str) -> str:
    """Jalur Kueri Tahap 1: Case folding, Stopword ID, dan Sastrawi ECS Stemming"""
    case_folded = text_id.lower()
    cleaned = re.sub(r'[^a-z0-9\s]', ' ', case_folded)
    no_stop = sastrawi_stopword.remove(cleaned)
    stemmed = sastrawi_stemmer.stem(no_stop)
    return stemmed

def llm_translate_to_english(query_id_stemmed: str) -> str:
    """
    Jalur Kueri Tahap 2: Menerjemahkan kueri ke Bahasa Inggris (deterministik, temp=0.0).
    Menggunakan Gemini API jika GEMINI_API_KEY diset, atau kamus padanan akademik deterministik.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            prompt = (
                f"Translate the following Indonesian book search terms into concise English keywords:\n"
                f"'{query_id_stemmed}'\n"
                f"Only output the English translation directly without explanation or quotation marks."
            )
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config={'temperature': 0.0}
            )
            if response.text:
                return response.text.strip().lower()
        except Exception:
            pass

    # Kamus translasi deterministik untuk domain akademik perpustakaan
    ID_TO_EN_DICT = {
        "buku": "book", "cari": "search", "tulis": "writing", "baca": "reading",
        "novel": "novel", "fantasi": "fantasy", "pemrograman": "programming", "program": "program",
        "algoritma": "algorithm", "struktur": "structure", "data": "data", "basis": "database",
        "jaringan": "network", "komputer": "computer", "aman": "security", "siber": "cyber",
        "cerdas": "intelligence", "buatan": "artificial", "mesin": "machine", "ajar": "learning",
        "rekayasa": "engineering", "lunak": "software", "sistem": "system", "arsitektur": "architecture",
        "analisis": "analysis", "statistik": "statistics", "statistika": "statistics", "metode": "method",
        "teliti": "research", "riset": "research", "hitung": "computation", "hitung": "computing",
        "matematika": "mathematics", "aljabar": "algebra", "kalkulus": "calculus", "probabilitas": "probability",
        "bisnis": "business", "manajemen": "management", "strategi": "strategy", "keuangan": "finance",
        "ekonomi": "economics", "pemasaran": "marketing", "pasar": "market", "kelola": "governance",
        "etika": "ethics", "hukum": "law", "sejarah": "history", "budaya": "culture", "filsafat": "philosophy",
        "psikologi": "psychology", "sosial": "social", "masyarakat": "society", "desain": "design",
        "antarmuka": "interface", "pustaka": "library", "literasi": "literacy", "informasi": "information",
        "sains": "science", "teknologi": "technology", "citra": "image", "visi": "vision",
        "bahasa": "language", "alam": "natural", "teks": "text", "tambang": "mining",
        "temu": "retrieval", "kembali": "retrieval", "mesin": "engine", "awan": "cloud",
        "distribusi": "distributed", "bergerak": "mobile", "kriptografi": "cryptography"
    }

    words = query_id_stemmed.split()
    translated_words = [ID_TO_EN_DICT.get(w, w) for w in words]
    return " ".join(translated_words)

def english_nlp_preprocessing(text_en: str) -> str:
    """Jalur Dokumen & Kueri Tahap 3: Case folding, Stopword EN, dan Snowball Stemming"""
    words = tok(text_en)
    kept = [w for w in words if w not in STOP_EN]
    stems = [STEM_EN.stem(w) for w in kept]
    return " ".join(stems)

def extract_max_tfidf_overlap(clean_query: str, doc_synopsis_stems: str, vectorizer: TfidfVectorizer, top: int = 3):
    """
    Ekstraksi kata kunci dominan yang beririsan antara kueri dan sinopsis buku
    berdasarkan bobot TF-IDF tertinggi (Explainable Recommendation).
    """
    q_tokens = set(clean_query.split())
    doc_tokens = set(doc_synopsis_stems.split())
    overlap = list(q_tokens & doc_tokens)

    if not overlap:
        return []

    # Ambil bobot IDF dari vectorizer untuk memilih kata yang paling berbobot
    feature_names = vectorizer.get_feature_names_out()
    vocab_map = {name: idx for idx, name in enumerate(feature_names)}
    
    scored_terms = []
    for term in overlap:
        idx = vocab_map.get(term)
        weight = vectorizer.idf_[idx] if idx is not None else 1.0
        scored_terms.append((term, weight))

    scored_terms.sort(key=lambda x: x[1], reverse=True)
    return [term for term, _ in scored_terms[:top]]

def build_explanation_string(top_terms: list, score_pct: int, book_genre: str = "") -> str:
    """Membangun kalimat penjelasan yang transparan dan dapat diaudit."""
    if top_terms:
        terms_str = ", ".join(f"'{t}'" for t in top_terms)
        return f"Kecocokan {score_pct}% berdasarkan kata kunci dominan {terms_str} pada sinopsis buku."
    return f"Kecocokan {score_pct}% berdasarkan keselarasan topik dan konteks sinopsis."

class LibraConversationalRecommender:
    def __init__(self, books_csv_path: str = "books.csv"):
        print(f"📖 Memuat katalog buku dari '{books_csv_path}'...")
        self.df = pd.read_csv(books_csv_path).dropna(subset=['synopsis']).drop_duplicates(subset=['isbn'])
        print(f"✅ Total {len(self.df):,} buku valid terindeks.")

        print("⚙️ Melakukan preprocessing sinopsis dokumen (Snowball Stemmer + Stopwords EN)...")
        self.doc_stems = [english_nlp_preprocessing(syn) for syn in self.df['synopsis']]

        print("📐 Menghitung matriks TF-IDF dokumen (Precomputed Document Matrix)...")
        self.vectorizer = TfidfVectorizer()
        self.doc_matrix = self.vectorizer.fit_transform(self.doc_stems)
        self.isbns = self.df['isbn'].astype(str).tolist()
        self.titles = self.df['title'].tolist() if 'title' in self.df.columns else self.df['judul'].tolist()
        self.authors = self.df['author'].tolist() if 'author' in self.df.columns else self.df['penulis'].tolist()
        self.categories = self.df['category'].tolist() if 'category' in self.df.columns else self.df['kategori'].tolist()
        print("🚀 Model siap melayani rekomendasi percakapan!")

    def recommend(self, query_id: str, threshold: float = 0.10, k: int = 5):
        """
        Eksekusi penuh algoritma dari Sub-bab 2.4 PDF
        """
        # 1. Query_ID = Sastrawi_NLP_Preprocessing(Q)
        stemmed_id = sastrawi_nlp_preprocessing(query_id)

        # 2. Query_EN = LLM_Translate_To_English(Query_ID)
        translated_en = llm_translate_to_english(stemmed_id)

        # 3. Clean_Query = English_NLP_Preprocessing(Query_EN)
        clean_query = english_nlp_preprocessing(translated_en)

        # 4. Vector_Q = TFIDF_Vectorizer.transform([Clean_Query])
        vector_q = self.vectorizer.transform([clean_query])

        # 5. Cosine_Scores = Cosine_Similarity(Vector_Q, Precomputed_Document_Matrix)
        cosine_scores = cosine_similarity(vector_q, self.doc_matrix)[0]

        # 6. Candidate_Indices = Where(Cosine_Scores >= T)
        candidate_indices = np.where(cosine_scores >= threshold)[0]

        # 7. Sorted_Indices = Sort_Descending(Candidate_Indices, key=Cosine_Scores)
        sorted_indices = candidate_indices[np.argsort(-cosine_scores[candidate_indices])]

        # 8. Loop Top-K dan bentuk penjelasan kata kunci
        recommended_books = []
        for idx in sorted_indices[:k]:
            score = float(cosine_scores[idx])
            score_pct = int(round(score * 100))
            top_terms = extract_max_tfidf_overlap(clean_query, self.doc_stems[idx], self.vectorizer, top=3)
            explanation = build_explanation_string(top_terms, score_pct)

            recommended_books.append({
                "isbn": self.isbns[idx],
                "title": self.titles[idx],
                "author": self.authors[idx],
                "category": self.categories[idx],
                "cosine_score": round(score, 4),
                "similarity_pct": score_pct,
                "dominant_keywords": top_terms,
                "explanation": explanation
            })

        return {
            "query_original": query_id,
            "query_sastrawi_ecs": stemmed_id,
            "query_translated_en": translated_en,
            "query_clean_snowball": clean_query,
            "threshold": threshold,
            "top_k": k,
            "total_candidates_passed_threshold": len(candidate_indices),
            "recommendations": recommended_books
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Algoritma Rekomendasi Chatbot Libra Sesuai PDF TIN 2026")
    parser.add_argument("--query", type=str, default="buku pemrograman python dasar dan lanjutan", help="Kueri Bahasa Indonesia")
    parser.add_argument("--threshold", type=float, default=0.10, help="Ambang kemiripan kosinus T (default 0.10)")
    parser.add_argument("--k", type=int, default=5, help="Jumlah rekomendasi Top-N (default 5)")
    args = parser.parse_args()

    recommender = LibraConversationalRecommender("books.csv")
    result = recommender.recommend(args.query, threshold=args.threshold, k=args.k)

    print("\n" + "=" * 60)
    print("HASIL EKSEKUSI ALGORITMA SISTEM REKOMENDASI CHATBOT:")
    print("=" * 60)
    print(f"Kueri Asli (ID)        : {result['query_original']}")
    print(f"Jalur 1 - Sastrawi ECS : {result['query_sastrawi_ecs']}")
    print(f"Jalur 2 - Terjemahan EN: {result['query_translated_en']}")
    print(f"Jalur 3 - Snowball EN  : {result['query_clean_snowball']}")
    print(f"Threshold (T)          : {result['threshold']}")
    print(f"Lolos Ambang Batas     : {result['total_candidates_passed_threshold']} buku")
    print("-" * 60)
    print("DAFTAR REKOMENDASI TERPILIH (TOP-K):")
    for i, book in enumerate(result['recommendations'], 1):
        print(f"\n{i}. [{book['similarity_pct']}%] {book['title']} oleh {book['author']}")
        print(f"   ISBN        : {book['isbn']}")
        print(f"   Kategori    : {book['category']}")
        print(f"   Kata Kunci  : {', '.join(book['dominant_keywords'])}")
        print(f"   Penjelasan  : {book['explanation']}")
    print("=" * 60)
