/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book } from '../types.js';

export const BOOKS_DATABASE: Book[] = [
  {
    id: 1,
    judul: "The Lovely Bones",
    penulis: "Alice Sebold",
    kategori: "Bahasa",
    sinopsis: "Karya fiksi legendaris dari dataset Book-Crossing. Novel naratif emosional yang menceritakan tentang kenangan, hubungan keluarga tegar, analisis karakter psikologis mendalam, serta pemulihan dari tragedi kemanusiaan melalui kekuatan bahasa sastra.",
    tahun: 2002,
    isbn: "0316666343",
    halaman: 328,
    penerbit: "Little, Brown",
    gradient: "from-blue-600 to-indigo-700 font-sans"
  },
  {
    id: 2,
    judul: "The Da Vinci Code",
    penulis: "Dan Brown",
    kategori: "Teknologi",
    sinopsis: "Buku fiksi ilmiah terpopuler di Book-Crossing. Menggabungkan unsur kriptografi, kode rahasia, simbol sejarah kuno, pemecahan teka-teki logika tingkat tinggi, matematika golden ratio, serta teori konspirasi dengan alur cerita yang sangat cepat.",
    tahun: 2003,
    isbn: "0385504209",
    halaman: 454,
    penerbit: "Doubleday",
    gradient: "from-purple-600 to-pink-700 font-serif"
  },
  {
    id: 3,
    judul: "A Beautiful Mind",
    penulis: "Sylvia Nasar",
    kategori: "Matematika",
    sinopsis: "Biografi mendalam tentang John Nash, sang jenius matematika pemenang Hadiah Nobel. Mengurai kontribusi pentingnya dalam teori permainan (Game Theory), persamaan diferensial parsial, geometri aljabar, teori ekuilibrium, serta perjuangannya melawan skizofrenia.",
    tahun: 1998,
    isbn: "0684819066",
    halaman: 461,
    penerbit: "Simon & Schuster",
    gradient: "from-emerald-600 to-teal-700 font-sans"
  },
  {
    id: 4,
    judul: "A Brief History of Time",
    penulis: "Stephen Hawking",
    kategori: "Sains",
    sinopsis: "Buku sains kosmologi populer paling ikonik sepanjang masa. Menjelaskan tentang hukum fisika teoretis, ruang dan waktu, teori Ledakan Besar (Big Bang), dimensi lubang hitam (black holes), relativitas umum Einstein, serta pencarian Unified Theory secara lugas.",
    tahun: 1988,
    isbn: "0553109537",
    halaman: 212,
    penerbit: "Bantam Books",
    gradient: "from-amber-500 to-orange-700 font-serif"
  },
  {
    id: 5,
    judul: "The Design of Everyday Things",
    penulis: "Don Norman",
    kategori: "Desain",
    sinopsis: "Kitab suci para desainer antarmuka dan produk di seluruh dunia. Mengupas tuntas psikologi desain kognitif, konsep affordance, feedback loop, pemetaan fungsional, kegunaan praktis (usability), ergonomi visual, serta meminimalkan error pengguna.",
    tahun: 2002,
    isbn: "0465067107",
    halaman: 257,
    penerbit: "Basic Books",
    gradient: "from-red-600 to-rose-700 font-sans"
  },
  {
    id: 6,
    judul: "Doing Your Research Project",
    penulis: "Judith Bell",
    kategori: "Metode Penelitian",
    sinopsis: "Buku panduan metodologi penelitian akademik terapan yang sangat komprehensif. Menjelaskan taktik menyusun kuesioner, teknik wawancara, etika penelitian ilmiah, tinjauan pustaka, pengumpulan data empiris, pengujian reliabilitas instrumen, dan penulisan skripsi.",
    tahun: 1999,
    isbn: "0335203884",
    halaman: 256,
    penerbit: "Open University Press",
    gradient: "from-cyan-600 to-blue-700 font-serif"
  },
  {
    id: 7,
    judul: "Steve Jobs",
    penulis: "Walter Isaacson",
    kategori: "Teknologi",
    sinopsis: "Biografi komprehensif pendiri Apple Inc. yang menggabungkan revolusi teknologi dengan keindahan estetika desain produk. Mengulas proses berpikir kreatif di balik personal computer, ponsel pintar, antarmuka grafis modern, serta inovasi yang mengubah dunia.",
    tahun: 2011,
    isbn: "1451648537",
    halaman: 630,
    penerbit: "Simon & Schuster",
    gradient: "from-sky-700 to-indigo-800 font-sans"
  },
  {
    id: 8,
    judul: "Mathematical Methods in the Physical Sciences",
    penulis: "Mary L. Boas",
    kategori: "Matematika",
    sinopsis: "Buku wajib tingkat universitas untuk kalkulus tingkat lanjut, analisis deret Fourier, aljabar linear, matematika analisis matriks, kalkulus variasi, fungsi analitis variabel kompleks, serta persamaan diferensial untuk pemodelan sains komputer.",
    tahun: 1983,
    isbn: "0471044091",
    halaman: 712,
    penerbit: "John Wiley & Sons",
    gradient: "from-violet-600 to-fuchsia-700 font-mono"
  },
  {
    id: 9,
    judul: "Language and Mind",
    penulis: "Noam Chomsky",
    kategori: "Bahasa",
    sinopsis: "Tulisan revolusioner tentang teori bahasa generatif dan hubungannya dengan struktur pikiran manusia (kognisi). Menyajikan dasar sintaksis bahasa, linguistik teoretis, akuisisi bahasa alami oleh manusia, serta studi tata bahasa universal.",
    tahun: 1968,
    isbn: "0521858194",
    halaman: 242,
    penerbit: "Cambridge University Press",
    gradient: "from-teal-600 to-emerald-800 font-serif"
  },
  {
    id: 10,
    judul: "Interaction Design: Beyond Human-Computer Interaction",
    penulis: "Jenny Preece",
    kategori: "Desain",
    sinopsis: "Buku panduan desain interaksi terpopuler untuk memahami UX, prototipe aplikasi, evaluasi heuristik, interaksi sosial dalam teknologi, alur kerja wireframe, pemetaan persona pengguna, serta pengujian antarmuka dengan umpan balik pengguna asli.",
    tahun: 2002,
    isbn: "0471492787",
    halaman: 512,
    penerbit: "John Wiley & Sons",
    gradient: "from-pink-600 to-rose-600 font-sans"
  },
  {
    id: 11,
    judul: "Tuesdays with Morrie",
    penulis: "Mitch Albom",
    kategori: "Bahasa",
    sinopsis: "Karya sastra non-fiksi terlaris di Book-Crossing. Menggunakan keindahan gaya bahasa reflektif dan komunikasi verbal interpersonal untuk menceritakan persahabatan, nilai-nilai kehidupan, empati, serta kebijaksanaan hidup seorang profesor sosiologi senja.",
    tahun: 1997,
    isbn: "0385484518",
    halaman: 192,
    penerbit: "Doubleday",
    gradient: "from-blue-700 to-indigo-900 font-sans"
  },
  {
    id: 12,
    judul: "Research Design: Qualitative, Quantitative, and Mixed Methods",
    penulis: "John W. Creswell",
    kategori: "Metode Penelitian",
    sinopsis: "Standard emas metodologi riset akademik tingkat lanjut. Panduan merancang hipotesis kuantitatif, paradigma kualitatif fenomenologis, serta metode campuran (mixed methods) lengkap dengan teknik pengolahan instrumen empiris.",
    tahun: 2003,
    isbn: "0761924422",
    halaman: 292,
    penerbit: "SAGE Publications",
    gradient: "from-indigo-600 to-purple-800 font-mono"
  },
  {
    id: 13,
    judul: "Introduction to Algorithms",
    penulis: "Thomas H. Cormen",
    kategori: "Teknologi",
    sinopsis: "Buku referensi utama algoritma komputer dan pemrograman. Mengulas struktur data kompleks, algoritma pencarian biner, pengurutan cepat (sorting), pemrograman dinamis, grafis, heuristik, matematika pembuktian kompleksitas waktu O-Besar.",
    tahun: 2001,
    isbn: "0262032937",
    halaman: 1180,
    penerbit: "MIT Press",
    gradient: "from-amber-600 to-red-700 font-mono"
  },
  {
    id: 14,
    judul: "The Feynman Lectures on Physics",
    penulis: "Richard P. Feynman",
    kategori: "Sains",
    sinopsis: "Seri kuliah legendaris fisika kuantum, mekanika Newton, teori elektromagnetik, termodinamika materi, relativitas, fisika semikonduktor, hingga analisis fisika modern oleh fisikawan pemenang Nobel.",
    tahun: 1963,
    isbn: "0201021153",
    halaman: 560,
    penerbit: "Addison-Wesley",
    gradient: "from-teal-500 to-cyan-700 font-serif"
  },
  {
    id: 15,
    judul: "Fahrenheit 451",
    penulis: "Ray Bradbury",
    kategori: "Bahasa",
    sinopsis: "Novel klasik distopia yang masuk dalam daftar buku favorit Book-Crossing. Menyelami perjuangan manusia dalam melestarikan kekuatan bahasa tertulis, literatur, kesadaran berpikir kritis, kebebasan pers, serta dampak buruk sensor berlebih pada masyarakat.",
    tahun: 1953,
    isbn: "0345342968",
    halaman: 208,
    penerbit: "Ballantine Books",
    gradient: "from-rose-500 to-pink-700 font-sans"
  }
];
