/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MainCategory = 
  | 'Fiksi & Fantasi' 
  | 'Misteri & Thriller' 
  | 'Romansa & Drama' 
  | 'Horor & Supernatural' 
  | 'Sastra & Petualangan' 
  | 'Komik & Kepemudaan' 
  | 'Biografi & Sejarah' 
  | 'Pengembangan Diri & Bisnis' 
  | 'Sains & Teknologi' 
  | 'Metode Penelitian & Akademis';

export interface Book {
  id: number;
  judul: string;
  penulis: string;
  kategori: string;
  genre?: string;
  sinopsis: string;
  tahun: number;
  isbn: string;
  halaman: number;
  penerbit: string;
  gradient: string; // Tailwind gradient for book card cover
}

export interface RecommendationExtended extends Book {
  similarity: number;
  percentage: number;
  explanation: string;
  matchingTerms: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  recommendations?: RecommendationExtended[];
}

