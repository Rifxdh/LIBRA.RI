/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book } from '../types.js';

// Seed lists to generate highly realistic academic, research, and popular science books
const AUTHORS_POOL = [
  "Prof. Dr. Ir. Budi Santoso", "Dr. Eng. Ahmad Syarif", "Prof. Sri Utami M.Si.", "Rian Hidayat S.Kom.",
  "Dr. Maria Elizabeth", "Prof. Alan Turing", "Ir. Megawati Wijaya", "Dr. Jessica Henderson",
  "Prof. John Nash", "Dr. Richard Feynman", "Sarah Jenkins Ph.D.", "Dr. Michael O'Connor",
  "Prof. Donald Knuth", "Grace Hopper M.Sc.", "Dr. Elizabeth Vance", "Prof. Stephen Hawking",
  "Dr. Robert Oppenheimer", "Ada Lovelace", "Dr. Alan Kay", "Prof. Claude Shannon",
  "Dr. Thomas H. Cormen", "Prof. John W. Creswell", "Dr. Judith Bell", "Prof. Don Norman",
  "Dr. Jakob Nielsen", "Rachel Andrews B.Sc.", "Dr. Timothy Berners-Lee", "Prof. Mary L. Boas",
  "Dr. Noam Chomsky", "Walter Isaacson", "Mitch Albom", "Dan Brown", "Alice Sebold", "Ray Bradbury",
  "Feri Sulianta", "Eko Prasetyo", "Bambang Hariyanto", "Rinaldi Munir", "Jogianto Hartono",
  "Suharsimi Arikunto", "Sugiyono M.Pd.", "Lexy J. Moleong", "Burhan Bungin", "Andi Pramono",
  "Tere Liye", "Dee Lestari", "Ahmad Fuadi", "Leila S. Chudori", "Eka Kurniawan", "Pramoedya Ananta Toer",
  "Haruki Murakami", "George R.R. Martin", "J.K. Rowling", "Agatha Christie", "Stephen King", "Brandon Sanderson"
];

const PUBLISHERS_POOL = [
  "Gramedia Pustaka Utama", "Mizan Pustaka", "Bentang Pustaka", "Republika Penerbit", "Penerbit Inari",
  "UPJ Press", "Erlangga Academic", "Andi Offset", "Aksara Pustaka Utama", "Penerbit Informatika",
  "Salemba Teknika", "MIT Press", "O'Reilly Media", "Springer-Verlag", "Cambridge University Press",
  "Oxford Academic", "Wiley & Sons", "SAGE Publications", "Pearson Education", "HarperCollins", "Penguin Random House"
];

const GRADIENTS_POOL = [
  "from-blue-600 to-indigo-750",
  "from-purple-600 to-indigo-750",
  "from-emerald-600 to-teal-750",
  "from-amber-600 to-orange-750",
  "from-red-600 to-rose-750",
  "from-sky-600 to-indigo-750",
  "from-teal-600 to-emerald-750",
  "from-violet-600 to-fuchsia-750",
  "from-rose-600 to-pink-750",
  "from-slate-700 to-stone-900",
  "from-amber-700 to-yellow-900"
];

// Helper to get random element
function randOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to generate consistent ISBN
function generateISBN(idx: number): string {
  const code1 = 978;
  const code2 = 602;
  const code3 = Math.floor(1000 + (idx * 7) % 8999);
  const code4 = Math.floor(10 + (idx * 3) % 89);
  const code5 = idx % 10;
  return `${code1}-${code2}-${code3}-${code4}-${code5}`;
}

export function generateLibraryDataset(): Book[] {
  const books: Book[] = [];
  let currentId = 1;

  // Broad Categories mapping to all requested genres
  const categoriesData = [
    {
      kategori: "Fiksi & Fantasi",
      genres: [
        "High Fantasy", "Low Fantasy", "Urban Fantasy", "Dark Fantasy", "Steampunk", "Cyberpunk",
        "Space Opera", "Dystopian", "Utopian", "Time Travel", "Apocalyptic", "Portal Fantasy / Isekai",
        "Grimdark", "Hopepunk", "Solarpunk", "LitRPG", "Mythic Fiction"
      ],
      templates: [
        "Dunia Sihir & Legenda Kerajaan", "Ksatria Takdir & Gerbang Jiwa", "Kota Masa Depan Cyberpunk",
        "Petualangan Antariksa Galaksi", "Dunia Distopia & Penjelajah Waktu", "Dunia Paralel & Pahlawan Isekai"
      ],
      synopsisBase: "Sebuah novel fiksi spekulatif fantastis yang membawa pembaca dalam petualangan megah melintasi alam gaib, teknologi futuristik, serta pertarungan takdir moral para pahlawan."
    },
    {
      kategori: "Misteri & Thriller",
      genres: [
        "Cozy Mystery", "Hardboiled / Noir", "Psychological Thriller", "Techno-thriller",
        "Legal Thriller", "Medical Thriller", "Police Procedural", "Espionage / Spy", "True Crime"
      ],
      templates: [
        "Jejak Pembunuhan Misterius", "Teka-teki Detektif Malam", "Konspirasi Rahasia Negara",
        "Sisi Gelap Psikologis Manusia", "Investigasi Kejahatan Cyber", "Jejak Intelijen & Mata-mata"
      ],
      synopsisBase: "Kisah investigasi penuh intrik dan suspense menegangkan yang menguji daya kritis pembaca dalam memecahkan misteri, manipulasi pikiran, serta plot twist tak terduga."
    },
    {
      kategori: "Romansa & Drama",
      genres: [
        "Contemporary Romance", "Historical Romance", "Paranormal Romance", "Regency Romance",
        "Romantic Comedy", "Sports Romance", "Dark Romance", "Family Saga", "New Adult"
      ],
      templates: [
        "Ikatan Jiwa di Kota Kelabu", "Cinta Melintasi Zaman", "Komedi Romantis Perkotaan",
        "Kisah Keluarga & Takdir", "Janji Suci Perjuangan Cinta", "Romansa Pengembara Muda"
      ],
      synopsisBase: "Novel romansa emosional yang menyentuh hati tentang dinamika hubungan antarmanusia, pencarian jati diri, ujian kesetiaan, serta keindahan cinta dalam balutan drama memikat."
    },
    {
      kategori: "Horor & Supernatural",
      genres: [
        "Gothic Horror", "Supernatural / Ghost", "Body Horror", "Cosmic / Lovecraftian",
        "Zombie Apocalypse", "Splatterpunk"
      ],
      templates: [
        "Rumah Tua Bertingkat Tiga", "Misteri Mahluk Kuno Cosmic", "Wabah Mayat Hidup",
        "Teror Supranatural Kegelapan", "Ritual Kuno & Kutukan", "Mimpi Buruk Malam Jumat"
      ],
      synopsisBase: "Karya fiksi horor menegangkan yang membangkitkan suasana mencekam, teka-teki entitas gaib, teror supranatural, serta atmosfer gothic yang membuat bulu kuduk berdiri."
    },
    {
      kategori: "Sastra & Petualangan",
      genres: [
        "Historical Fiction", "Alternate History", "Literary Fiction", "Contemporary Fiction",
        "Magical Realism", "Action / Adventure", "Western", "Survival", "Military Fiction",
        "Epistolary Fiction", "Short Stories Collection"
      ],
      templates: [
        "Catatan Perjalanan Pengembara", "Epos Sejarah Nusantara", "Kumpulan Cerita Pendek Sastra",
        "Realisme Magis di Tepi Pantai", "Perjuangan Bertahan Hidup", "Surat-surat Penjelajah"
      ],
      synopsisBase: "Mahakarya fiksi sastra dan sejarah kaya permenungan nilai kemanusiaan, eksplorasi budaya lokal, aksi petualangan, serta keindahan estestis bahasa yang mendalam."
    },
    {
      kategori: "Komik & Kepemudaan",
      genres: [
        "Picture Book", "Middle Grade", "Young Adult", "Graphic Novel", "Graphic Non-Fiction",
        "Poetry", "Humor", "Satire / Parody", "Drama / Play", "Art & Photography"
      ],
      templates: [
        "Petualangan Remaja SMA", "Komik Grafis Pahlawan Lokal", "Kumpulan Puisi & Refleksi",
        "Parodi Kehidupan Kampus", "Eksplorasi Seni & Fotografi", "Pentas Drama Kehidupan"
      ],
      synopsisBase: "Buku fiksi remaja dan komik visual bergambar yang menyajikan gaya bahasa segar, humor satire, ekspresi artistik, serta bait-bait puisi menyentuh untuk pembaca muda."
    },
    {
      kategori: "Biografi & Sejarah",
      genres: [
        "Biography", "Autobiography", "Memoir", "History", "Philosophy", "Politics",
        "Sociology", "Anthropology", "Economics", "Journalism", "True War / Military History",
        "Cultural Studies", "Memoir of Food / Travel", "Mythology", "Folk Tales / Fairy Tales", "Classic Literature"
      ],
      templates: [
        "Jejak Langkah Sang Tokoh", "Sejarah Peradaban Dunia", "Memoar Catatan Perjuangan",
        "Filsafat Manusia & Etika", "Dinamika Politik & Sosial", "Mitologi & Cerita Rakyat Nusantara"
      ],
      synopsisBase: "Buku literatur biografi dan sejarah faktual yang merekam perjalanan hidup pahlawan, peradaban masa lalu, gagasan filsafat mendalam, serta ulasan sosiokultural bermakna."
    },
    {
      kategori: "Pengembangan Diri & Bisnis",
      genres: [
        "Self-Help", "Business / Finance", "Psychology", "Education", "Law",
        "Health & Wellness", "Fitness & Diet", "Parenting"
      ],
      templates: [
        "Seni Menguasai Kebiasaan Positif", "Strategi Investasi & Finansial", "Psikologi Kepemimpinan Sukses",
        "Manajemen Waktu & Produktivitas", "Panduan Pola Hidup Sehat", "Seni Pengasuhan Anak Modern"
      ],
      synopsisBase: "Buku panduan praktis pengembangan diri, kesehatan mental, kecerdasan finansial, dan psikologi terapan yang dirancang untuk meningkatkan kualitas hidup dan karier."
    },
    {
      kategori: "Sains & Teknologi",
      genres: [
        "Science & Technology", "Environmental & Nature", "Travelogue", "Cookbook",
        "Crafts & Hobbies", "Gardening", "Home Decor"
      ],
      templates: [
        "Revolusi AI & Masa Depan", "Fisika Alam Semesta", "Panduan Ekologi & Alam",
        "Jelajah Wisata Kuliner Nusantara", "Seni Desain Rumah & Kebun", "Dunia Komputer Terapan"
      ],
      synopsisBase: "Buku eksplorasi ilmiah dan sains populer yang mengupas rahasia alam semesta, inovasi teknologi mutakhir, lingkungan hidup, serta ketrampilan praktis memasak dan hobi."
    },
    {
      kategori: "Metode Penelitian & Akademis",
      genres: [
        "Metode Penelitian", "Matematika", "Teknologi Sistem", "Linguistik"
      ],
      templates: [
        "Panduan Metodologi Kualitatif", "Kalkulus & Aljabar Terapan", "Desain Sistem Terdistribusi",
        "Linguistik & Tata Bahasa Praktis", "Analisis Data Statistik SPSS", "Etika Riset Akademis"
      ],
      synopsisBase: "Buku acuan akademis dan metodologi ilmiah yang menjadi rujukan wajib mahasiswa dan peneliti dalam penyusunan karya ilmiah, riset kuantitatif, dan pemodelan matematis."
    }
  ];

  // Core Books List (Curated favorites across diverse fiction & non-fiction)
  const coreBooks = [
    {
      judul: "The Lovely Bones",
      penulis: "Alice Sebold",
      kategori: "Sastra & Petualangan",
      genre: "Literary Fiction",
      sinopsis: "Novel naratif emosional yang menceritakan tentang kenangan, hubungan keluarga tegar, analisis karakter psikologis mendalam, serta pemulihan dari tragedi kemanusiaan melalui kekuatan bahasa sastra.",
      tahun: 2002,
      isbn: "0316666343",
      halaman: 328,
      penerbit: "Little, Brown"
    },
    {
      judul: "The Da Vinci Code",
      penulis: "Dan Brown",
      kategori: "Misteri & Thriller",
      genre: "Techno-thriller",
      sinopsis: "Misteri dan thriller konspirasi kriptografi. Menggabungkan simbol sejarah kuno, teka-teki logika, matematika golden ratio, serta pembunuhan di Museum Louvre dengan plot twist cepat.",
      tahun: 2003,
      isbn: "0385504209",
      halaman: 454,
      penerbit: "Doubleday"
    },
    {
      judul: "Neuromancer",
      penulis: "William Gibson",
      kategori: "Fiksi & Fantasi",
      genre: "Cyberpunk",
      sinopsis: "Novel klasik pemicu genre Cyberpunk. Mengisahkan Case, seorang peretas matrix di masa depan terdistopia yang berhadapan dengan kecerdasan buatan super buatan korporasi gelap.",
      tahun: 1984,
      isbn: "0441569560",
      halaman: 271,
      penerbit: "Ace Books"
    },
    {
      judul: "Dune",
      penulis: "Frank Herbert",
      kategori: "Fiksi & Fantasi",
      genre: "Space Opera",
      sinopsis: "Epos fiksi ilmiah legendaris di planet gurun Arrakis. Mengupas perebutan rempah-rempah melange, politik kekaisaran antar-galaksi, ekologi ekstrem, serta ramalan pahlawan Paul Atreides.",
      tahun: 1965,
      isbn: "0441172717",
      halaman: 412,
      penerbit: "Chilton Books"
    },
    {
      judul: "The Hobbit",
      penulis: "J.R.R. Tolkien",
      kategori: "Fiksi & Fantasi",
      genre: "High Fantasy",
      sinopsis: "Kisah klasik High Fantasy tentang petualangan Bilbo Baggins bersama para kurcaci dan penyihir Gandalf menuju Gunung Sunyi untuk merebut kembali harta karun dari naga Smaug.",
      tahun: 1937,
      isbn: "0261102214",
      halaman: 310,
      penerbit: "George Allen & Unwin"
    },
    {
      judul: "Atomic Habits",
      penulis: "James Clear",
      kategori: "Pengembangan Diri & Bisnis",
      genre: "Self-Help",
      sinopsis: "Panduan praktis perbaikan diri melalui perubahan kecil 1% setiap hari. Menjelaskan sistem pembentukan kebiasaan positif, perombakan identitas diri, serta psikologi perilaku yang teruji.",
      tahun: 2018,
      isbn: "0735211299",
      halaman: 320,
      penerbit: "Avery"
    },
    {
      judul: "Sapiens: Riwayat Singkat Umat Manusia",
      penulis: "Yuval Noah Harari",
      kategori: "Biografi & Sejarah",
      genre: "History",
      sinopsis: "Eksplorasi sejarah kritis mengenai evolusi Homo sapiens dari revolusi kognitif, revolusi pertanian, hingga revolusi sains yang membentuk tatanan masyarakat global modern.",
      tahun: 2014,
      isbn: "0062316095",
      halaman: 443,
      penerbit: "Harper"
    },
    {
      judul: "Bumi Manusia",
      penulis: "Pramoedya Ananta Toer",
      kategori: "Sastra & Petualangan",
      genre: "Historical Fiction",
      sinopsis: "Karya sastra kanonik Indonesia yang menceritakan perjuangan Minke dan Annelies di masa kolonial Belanda, mengangkat isu kebangkitan kesadaran nasionalisme, perlawanan hukum, serta emansipasi.",
      tahun: 1980,
      isbn: "9799731233",
      halaman: 535,
      penerbit: "Hasta Mitra"
    },
    {
      judul: "Cantik Itu Luka",
      penulis: "Eka Kurniawan",
      kategori: "Sastra & Petualangan",
      genre: "Magical Realism",
      sinopsis: "Novel realisme magis memukau berlatar kota Halimunda. Menganyam mitos lokal, sejarah kolonialisme Indonesia, trauma perang, serta ironi kehidupan keluarga Dewi Ayu secara menawan.",
      tahun: 2002,
      isbn: "9786020312583",
      halaman: 508,
      penerbit: "Gramedia Pustaka Utama"
    },
    {
      judul: "A Beautiful Mind",
      penulis: "Sylvia Nasar",
      kategori: "Biografi & Sejarah",
      genre: "Biography",
      sinopsis: "Biografi mendalam tentang John Nash, sang jenius matematika pemenang Hadiah Nobel. Mengurai kontribusi pentingnya dalam teori permainan (Game Theory), geometri aljabar, serta perjuangannya melawan skizofrenia.",
      tahun: 1998,
      isbn: "0684819066",
      halaman: 461,
      penerbit: "Simon & Schuster"
    },
    {
      judul: "A Brief History of Time",
      penulis: "Stephen Hawking",
      kategori: "Sains & Teknologi",
      genre: "Science & Technology",
      sinopsis: "Buku sains kosmologi populer ikonik. Menjelaskan tentang hukum fisika teoretis, ruang dan waktu, teori Ledakan Besar (Big Bang), dimensi lubang hitam (black holes), dan relativitas umum.",
      tahun: 1988,
      isbn: "0553109537",
      halaman: 212,
      penerbit: "Bantam Books"
    },
    {
      judul: "The Design of Everyday Things",
      penulis: "Don Norman",
      kategori: "Komik & Kepemudaan",
      genre: "Art & Photography",
      sinopsis: "Kitab suci para desainer antarmuka dan produk di seluruh dunia. Mengupas tuntas psikologi desain kognitif, konsep affordance, feedback loop, pemetaan fungsional, dan kegunaan praktis (usability).",
      tahun: 2002,
      isbn: "0465067107",
      halaman: 257,
      penerbit: "Basic Books"
    },
    {
      judul: "Doing Your Research Project",
      penulis: "Judith Bell",
      kategori: "Metode Penelitian & Akademis",
      genre: "Metode Penelitian",
      sinopsis: "Buku panduan metodologi penelitian akademik terapan yang sangat komprehensif. Menjelaskan taktik menyusun kuesioner, teknik wawancara, etika penelitian ilmiah, tinjauan pustaka, dan penulisan skripsi.",
      tahun: 1999,
      isbn: "0335203884",
      halaman: 256,
      penerbit: "Open University Press"
    },
    {
      judul: "Laut Bercerita",
      penulis: "Leila S. Chudori",
      kategori: "Sastra & Petualangan",
      genre: "Historical Fiction",
      sinopsis: "Novel fiksi sejarah yang menyentuh jiwa tentang peristiwa penghilangan paksa aktivis mahasiswa era Orde Baru 1998. Mengisahkan perjuangan Biru Laut dan keluarganya menuntut keadilan.",
      tahun: 2017,
      isbn: "9786024246945",
      halaman: 388,
      penerbit: "Kepustakaan Populer Gramedia"
    }
  ];

  // Map core books first
  for (const b of coreBooks) {
    books.push({
      id: currentId++,
      judul: b.judul,
      penulis: b.penulis,
      kategori: b.kategori,
      genre: b.genre,
      sinopsis: b.sinopsis,
      tahun: b.tahun,
      isbn: b.isbn,
      halaman: b.halaman,
      penerbit: b.penerbit,
      gradient: randOf(GRADIENTS_POOL)
    });
  }

  // Generate books systematically until we cross 1080 records
  const targetQuantity = 1080;
  let counter = 0;

  while (books.length < targetQuantity) {
    for (const catData of categoriesData) {
      if (books.length >= targetQuantity) break;

      const genre = randOf(catData.genres);
      const titleTemplate = randOf(catData.templates);
      
      const numSuffix = Math.floor(1 + (counter / 4) % 99);
      const yearOffset = (counter * 3) % 45;
      const pagesCount = 120 + (counter * 17) % 650;
      const publicationYear = 2026 - (yearOffset % 30);
      const level = numSuffix % 3 === 0 ? "Jilid Utaranya" : (numSuffix % 3 === 1 ? "Seri Edisi Khusus" : "Bagian Terakhir");
      const subTitleIndex = `(${level} - Bagian ${numSuffix})`;

      const uniqueTitle = `${titleTemplate} ${subTitleIndex}`;
      const penulisName = randOf(AUTHORS_POOL);
      
      const fullSynopsis = `${catData.synopsisBase} Mengusung genre ${genre}, novel/buku ini berfokus pada dinamika unik dan intrik cerita yang memikat. Penulis ${penulisName} menyajikan narasi kaya makna, perwatakan kuat, dan latar suasana yang hidup. Sangat layak dikoleksi oleh pecinta literatur berkualitas.`;

      books.push({
        id: currentId++,
        judul: uniqueTitle,
        penulis: penulisName,
        kategori: catData.kategori,
        genre: genre,
        sinopsis: fullSynopsis,
        tahun: publicationYear,
        isbn: generateISBN(currentId),
        halaman: pagesCount,
        penerbit: randOf(PUBLISHERS_POOL),
        gradient: randOf(GRADIENTS_POOL)
      });

      counter++;
    }
  }

  return books;
}
