/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environmental parameters
dotenv.config();

import { BOOKS_DATABASE } from './src/data/books.ts';
import { TFIDFRecommendationEngine } from './src/utils/nlp.ts';
import { Book } from './src/types.ts';
import { generateLibraryDataset } from './src/data/generator.ts';
import { db } from './src/db/index.ts';
import { books as booksTable } from './src/db/schema.ts';

// Storage file path for user-imported book datasets
const STORE_PATH = path.join(process.cwd(), 'src', 'data', 'books_store.json');

let BOOKS_COLLECTION: Book[] = [];

// Helper function to sync books collection to Cloud SQL PostgreSQL database
async function syncBooksToCloudSQL(booksList: Book[]) {
  if (!process.env.SQL_HOST) {
    console.log('SQL_HOST not configured, skipping Cloud SQL sync.');
    return;
  }
  try {
    console.log(`Syncing ${booksList.length} books to Cloud SQL PostgreSQL database...`);
    const batchSize = 200;
    for (let i = 0; i < booksList.length; i += batchSize) {
      const batch = booksList.slice(i, i + batchSize);
      await db.insert(booksTable).values(
        batch.map(b => ({
          judul: b.judul,
          penulis: b.penulis,
          kategori: b.kategori,
          genre: b.genre || 'Umum',
          sinopsis: b.sinopsis,
          tahun: b.tahun || 2024,
          isbn: b.isbn || '',
          halaman: b.halaman || 200,
          penerbit: b.penerbit || 'Umum',
          gradient: b.gradient || 'from-blue-600 to-indigo-700'
        }))
      ).onConflictDoNothing();
    }
    console.log('Cloud SQL database synchronization successful.');
  } catch (err) {
    console.warn('Cloud SQL sync warning:', err);
  }
}

try {
  if (fs.existsSync(STORE_PATH)) {
    const rawData = fs.readFileSync(STORE_PATH, 'utf8');
    BOOKS_COLLECTION = JSON.parse(rawData);
    console.log(`Loaded ${BOOKS_COLLECTION.length} books from books_store.json`);
  }
} catch (e) {
  console.error('Failed to load books_store.json, using default seed database', e);
}

// Ensure the dataset contains at least 1000 books AND includes all requested genres (e.g. Horor)
const hasHorrorCategory = BOOKS_COLLECTION.some(b => b.kategori === 'Horor & Supernatural');
if (BOOKS_COLLECTION.length < 1000 || !hasHorrorCategory) {
  console.log('Dataset is outdated or lacks requested genres. Activating updated Libra dataset generator...');
  try {
    const generatedBooks = generateLibraryDataset();
    BOOKS_COLLECTION = generatedBooks;
    fs.writeFileSync(STORE_PATH, JSON.stringify(BOOKS_COLLECTION, null, 2), 'utf8');
    console.log(`Successfully persisted and updated database with ${BOOKS_COLLECTION.length} structured book collection items across all genres.`);
  } catch (err) {
    console.error('Failed to pre-generate books store:', err);
    if (BOOKS_COLLECTION.length === 0) {
      BOOKS_COLLECTION = [...BOOKS_DATABASE];
    }
  }
}

// Instantiate the TF-IDF Recommendation Engine once at startup
let recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);

function classifyBookGenre(title: string, synopsis: string = ''): { kategori: string; genre: string } {
  const text = `${title} ${synopsis}`.toLowerCase();

  if (/\b(horror|horor|ghost|hantu|haunted|vampire|zombie|dark|nightmare|curse|kutukan|blood|darah|demon|gothic|teror)\b/i.test(text)) {
    return { kategori: 'Horor & Supernatural', genre: 'Gothic Horror' };
  }
  if (/\b(fantasy|fantasi|magic|sihir|dragon|witch|wizard|kingdom|star|galaxy|space|alien|cyberpunk|dystopia|isekai|hero)\b/i.test(text)) {
    return { kategori: 'Fiksi & Fantasi', genre: 'High Fantasy' };
  }
  if (/\b(murder|mystery|detective|detektif|crime|pembunuhan|secret|conspiracy|thriller|noir|spy|agent)\b/i.test(text)) {
    return { kategori: 'Misteri & Thriller', genre: 'Psychological Thriller' };
  }
  if (/\b(love|heart|romance|romansa|cinta|bride|wedding|kiss|passion|forever|sweet|couple)\b/i.test(text)) {
    return { kategori: 'Romansa & Drama', genre: 'Contemporary Romance' };
  }
  if (/\b(history|sejarah|war|biography|biografi|memoir|life|president|king|queen|century|revolution)\b/i.test(text)) {
    return { kategori: 'Biografi & Sejarah', genre: 'History' };
  }
  if (/\b(habit|success|mind|rich|money|business|bisnis|leader|management|invest|guide|self-help)\b/i.test(text)) {
    return { kategori: 'Pengembangan Diri & Bisnis', genre: 'Self-Help' };
  }
  if (/\b(science|sains|physics|biology|chemistry|technology|computer|code|data|ai|environment|nature)\b/i.test(text)) {
    return { kategori: 'Sains & Teknologi', genre: 'Science & Technology' };
  }
  if (/\b(research|penelitian|method|statistics|calculus|mathematics|skripsi|jurnal|academic)\b/i.test(text)) {
    return { kategori: 'Metode Penelitian & Akademis', genre: 'Metode Penelitian' };
  }
  if (/\b(comic|graphic|novel|manga|poetry|puisi|story|stories|humor|art|photography)\b/i.test(text)) {
    return { kategori: 'Komik & Kepemudaan', genre: 'Graphic Novel' };
  }

  return { kategori: 'Sastra & Petualangan', genre: 'Literary Fiction' };
}

function getRandomGradient(idx: number): string {
  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-purple-600 to-pink-700',
    'from-emerald-600 to-teal-700',
    'from-amber-500 to-orange-700',
    'from-red-600 to-rose-700',
    'from-cyan-600 to-blue-700',
    'from-teal-600 to-emerald-700',
    'from-indigo-600 to-violet-700',
    'from-rose-600 to-pink-700'
  ];
  return gradients[idx % gradients.length];
}

// Safe Lazy-loaded GoogleGenAI client builder
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        aiClient = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.error('Failed to initialize GoogleGenAI client:', err);
      }
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON parsing with high limit for massive datasets (e.g. 450 MB Kaggle CSVs)
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // API 1: Health status
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API 2: Books Database List
  app.get('/api/books', (req: Request, res: Response) => {
    res.json(BOOKS_COLLECTION);
  });

  // API 2.5: Import/Overwrite Books List via JSON upload
  app.post('/api/books/import', (req: Request, res: Response) => {
    const { books } = req.body;
    if (!Array.isArray(books)) {
      res.status(400).json({ error: 'Payload must be an array of books.' });
      return;
    }

    try {
      // Validate and assign structured values
      const validatedBooks: Book[] = books.map((b: any, index: number) => {
        const { kategori, genre } = classifyBookGenre(b.judul || '', b.sinopsis || '');
        return {
          id: index + 1,
          judul: String(b.judul || 'Untitled Book').trim(),
          penulis: String(b.penulis || 'Anonim').trim(),
          kategori: b.kategori || kategori,
          genre: b.genre || genre,
          sinopsis: String(b.sinopsis || 'Tidak ada deskripsi.').trim(),
          tahun: Number(b.tahun) || 2025,
          isbn: String(b.isbn || '000-000-000-0').trim(),
          halaman: Number(b.halaman) || 120,
          penerbit: String(b.penerbit || 'Penerbit Mandiri').trim(),
          gradient: b.gradient || getRandomGradient(index),
        };
      });

      BOOKS_COLLECTION = validatedBooks;

      // Persist to json file
      fs.writeFileSync(STORE_PATH, JSON.stringify(BOOKS_COLLECTION, null, 2), 'utf8');

      // Reinitialize the Recommendation Engine with the new books
      recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);

      console.log(`Successfully imported ${BOOKS_COLLECTION.length} books and updated NLP engine.`);
      res.json({ success: true, count: BOOKS_COLLECTION.length, books: BOOKS_COLLECTION });
    } catch (e: any) {
      console.error('Failed to import books:', e);
      res.status(500).json({ error: 'Failed to process and store book dataset on the server.' });
    }
  });

  // Helper for CSV line parsing with quotes support and delimiter auto-detection
  function parseCSVLine(line: string, explicitDelimiter?: string): string[] {
    let delimiter = explicitDelimiter;
    if (!delimiter) {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;
      if (tabCount > semicolonCount && tabCount > commaCount) delimiter = '\t';
      else if (semicolonCount > commaCount) delimiter = ';';
      else delimiter = ',';
    }

    const result: string[] = [];
    let startCell = 0;
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === delimiter && !inQuotes) {
        let cell = line.substring(startCell, i).trim();
        if (cell.startsWith('"') && cell.endsWith('"')) {
          cell = cell.substring(1, cell.length - 1).replace(/""/g, '"');
        }
        result.push(cell);
        startCell = i + 1;
      }
    }
    let lastCell = line.substring(startCell).trim();
    if (lastCell.startsWith('"') && lastCell.endsWith('"')) {
      lastCell = lastCell.substring(1, lastCell.length - 1).replace(/""/g, '"');
    }
    result.push(lastCell);
    return result;
  }

  // Active deduplication tracking set for chunked CSV upload session
  const existingKeysSet = new Set<string>();

  // API 2.6: Import CSV Endpoint with Deduplication
  app.post('/api/books/import-csv', (req: Request, res: Response) => {
    const { csvText, clearExisting = false } = req.body;
    if (!csvText || typeof csvText !== 'string') {
      res.status(400).json({ error: 'csvText parameter is required.' });
      return;
    }

    try {
      const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        res.status(400).json({ error: 'CSV file contains no data lines.' });
        return;
      }

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

      let titleIdx = headers.findIndex(h => h.includes('title') || h.includes('judul') || h.includes('book-title'));
      let authorIdx = headers.findIndex(h => h.includes('author') || h.includes('penulis') || h.includes('book-author'));
      let yearIdx = headers.findIndex(h => h.includes('year') || h.includes('tahun') || h.includes('publication'));
      let publisherIdx = headers.findIndex(h => h.includes('penerbit') || h.includes('publisher'));
      let isbnIdx = headers.findIndex(h => h.includes('isbn'));
      let categoryIdx = headers.findIndex(h => h.includes('kategori') || h.includes('category') || h.includes('genre'));
      let synopsisIdx = headers.findIndex(h => h.includes('sinopsis') || h.includes('summary') || h.includes('description'));

      if (titleIdx === -1) titleIdx = 0;
      if (authorIdx === -1) authorIdx = 1;

      const dedupeSet = new Set<string>();
      if (!clearExisting) {
        BOOKS_COLLECTION.forEach(b => {
          if (b.isbn && b.isbn.trim().length > 5) dedupeSet.add(`isbn:${b.isbn.trim().toLowerCase()}`);
          dedupeSet.add(`${b.judul.trim().toLowerCase()}|${b.penulis.trim().toLowerCase()}`);
        });
      }

      const importedBooks: Book[] = [];
      const startId = clearExisting ? 1 : BOOKS_COLLECTION.length + 1;

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length === 0 || !row[titleIdx]) continue;

        const title = row[titleIdx] ? row[titleIdx].trim() : 'Untitled';
        const author = authorIdx !== -1 && row[authorIdx] ? row[authorIdx].trim() : 'Anonim';
        const year = yearIdx !== -1 && row[yearIdx] ? parseInt(row[yearIdx]) || 2024 : 2024;
        const publisher = publisherIdx !== -1 && row[publisherIdx] ? row[publisherIdx].trim() : 'Penerbit Umum';
        const isbn = isbnIdx !== -1 && row[isbnIdx] ? row[isbnIdx].trim() : `978-602-${Math.floor(1000 + Math.random() * 8999)}-0`;
        const rawSynopsis = synopsisIdx !== -1 && row[synopsisIdx] ? row[synopsisIdx].trim() : '';

        // DEDUPLICATION CHECK (Avoid duplicates based on Title+Author or ISBN)
        const titleKey = `${title.toLowerCase()}|${author.toLowerCase()}`;
        const isbnKey = isbn && isbn.length > 5 ? `isbn:${isbn.toLowerCase()}` : '';

        if (dedupeSet.has(titleKey) || (isbnKey && dedupeSet.has(isbnKey))) {
          continue; // Skip duplicate record!
        }
        dedupeSet.add(titleKey);
        if (isbnKey) dedupeSet.add(isbnKey);

        let userCat = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].trim() : '';
        let { kategori, genre } = classifyBookGenre(title, rawSynopsis || userCat);

        if (userCat && userCat.length > 2) {
          kategori = userCat;
        }

        const synopsis = rawSynopsis || `Buku ${title} karya ${author}. Merupakan koleksi literatur berkualitas dengan pembahasan tema ${genre || kategori} yang mendalam.`;

        importedBooks.push({
          id: startId + importedBooks.length,
          judul: title,
          penulis: author,
          kategori: kategori,
          genre: genre,
          sinopsis: synopsis,
          tahun: year,
          isbn: isbn,
          halaman: Math.floor(120 + Math.random() * 450),
          penerbit: publisher,
          gradient: getRandomGradient(i)
        });
      }

      if (clearExisting) {
        BOOKS_COLLECTION = importedBooks;
      } else {
        BOOKS_COLLECTION = [...BOOKS_COLLECTION, ...importedBooks];
      }

      fs.writeFileSync(STORE_PATH, JSON.stringify(BOOKS_COLLECTION, null, 2), 'utf8');
      recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);
      syncBooksToCloudSQL(BOOKS_COLLECTION);

      console.log(`Successfully imported ${importedBooks.length} new non-duplicate books via CSV. Total catalog count: ${BOOKS_COLLECTION.length}`);
      res.json({ success: true, count: importedBooks.length, total: BOOKS_COLLECTION.length });
    } catch (err: any) {
      console.error('CSV Import Error:', err);
      res.status(500).json({ error: 'Failed to process CSV file.' });
    }
  });

  // Global buffer for chunked CSV upload session
  let chunkHeader: string[] | null = null;

  // API 2.65: Chunked Stream CSV Upload Endpoint (for 450 MB datasets) with Deduplication & DB Sync
  app.post('/api/books/import-csv-chunk', (req: Request, res: Response) => {
    const { chunk, isFirst = false, isLast = false, clearExisting = false } = req.body;

    if (typeof chunk !== 'string') {
      res.status(400).json({ error: 'chunk parameter must be string.' });
      return;
    }

    try {
      if (isFirst) {
        chunkHeader = null;
        existingKeysSet.clear();

        if (clearExisting) {
          BOOKS_COLLECTION = [];
        } else {
          BOOKS_COLLECTION.forEach(b => {
            if (b.isbn && b.isbn.trim().length > 5) existingKeysSet.add(`isbn:${b.isbn.trim().toLowerCase()}`);
            existingKeysSet.add(`${b.judul.trim().toLowerCase()}|${b.penulis.trim().toLowerCase()}`);
          });
        }
      }

      const lines = chunk.split(/\r?\n/).filter(line => line.trim().length > 0);
      let startIndex = 0;

      if ((isFirst || !chunkHeader) && lines.length > 0) {
        const candidate = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        const hasHeaderMarkers = candidate.some(h => 
          h.includes('title') || h.includes('judul') || h.includes('author') || 
          h.includes('penulis') || h.includes('isbn') || h.includes('book')
        );
        if (hasHeaderMarkers) {
          chunkHeader = candidate;
          startIndex = 1;
        } else if (!chunkHeader) {
          chunkHeader = ['isbn', 'title', 'author', 'year', 'publisher', 'category', 'genre', 'synopsis'];
          startIndex = 0;
        }
      } else if (chunkHeader && lines.length > 0) {
        const candidateHeader = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        if (candidateHeader.join(',') === chunkHeader.join(',')) {
          startIndex = 1; // skip prepended header line
        }
      }

      if (chunkHeader && lines.length > startIndex) {
        let titleIdx = chunkHeader.findIndex(h => h.includes('title') || h.includes('judul') || h.includes('book-title'));
        let authorIdx = chunkHeader.findIndex(h => h.includes('author') || h.includes('penulis') || h.includes('book-author'));
        let yearIdx = chunkHeader.findIndex(h => h.includes('year') || h.includes('tahun') || h.includes('publication'));
        let publisherIdx = chunkHeader.findIndex(h => h.includes('penerbit') || h.includes('publisher'));
        let isbnIdx = chunkHeader.findIndex(h => h.includes('isbn'));
        let categoryIdx = chunkHeader.findIndex(h => h.includes('kategori') || h.includes('category') || h.includes('genre'));
        let synopsisIdx = chunkHeader.findIndex(h => h.includes('sinopsis') || h.includes('summary') || h.includes('description'));

        if (titleIdx === -1) titleIdx = 0;
        if (authorIdx === -1) authorIdx = 1;

        const startId = BOOKS_COLLECTION.length + 1;
        const newBatch: Book[] = [];

        for (let i = startIndex; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          if (row.length === 0 || !row[titleIdx]) continue;

          const title = row[titleIdx] ? row[titleIdx].trim() : 'Untitled';
          const author = authorIdx !== -1 && row[authorIdx] ? row[authorIdx].trim() : 'Anonim';
          const year = yearIdx !== -1 && row[yearIdx] ? parseInt(row[yearIdx]) || 2024 : 2024;
          const publisher = publisherIdx !== -1 && row[publisherIdx] ? row[publisherIdx].trim() : 'Penerbit Umum';
          const isbn = isbnIdx !== -1 && row[isbnIdx] ? row[isbnIdx].trim() : `978-602-${Math.floor(1000 + Math.random() * 8999)}-0`;
          const rawSynopsis = synopsisIdx !== -1 && row[synopsisIdx] ? row[synopsisIdx].trim() : '';

          // STRICT DEDUPLICATION CHECK
          const titleKey = `${title.toLowerCase()}|${author.toLowerCase()}`;
          const isbnKey = isbn && isbn.length > 5 ? `isbn:${isbn.toLowerCase()}` : '';

          if (existingKeysSet.has(titleKey) || (isbnKey && existingKeysSet.has(isbnKey))) {
            continue; // Skip duplicate to ensure clean single entry in database
          }
          existingKeysSet.add(titleKey);
          if (isbnKey) existingKeysSet.add(isbnKey);

          let userCat = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].trim() : '';
          let { kategori, genre } = classifyBookGenre(title, rawSynopsis || userCat);

          if (userCat && userCat.length > 2) {
            kategori = userCat;
          }

          const synopsis = rawSynopsis || `Buku ${title} karya ${author}. Merupakan koleksi literatur berkualitas dengan pembahasan tema ${genre || kategori} yang mendalam.`;

          newBatch.push({
            id: startId + newBatch.length,
            judul: title,
            penulis: author,
            kategori: kategori,
            genre: genre,
            sinopsis: synopsis,
            tahun: year,
            isbn: isbn,
            halaman: Math.floor(120 + Math.random() * 450),
            penerbit: publisher,
            gradient: getRandomGradient(i)
          });
        }

        for (let b = 0; b < newBatch.length; b++) {
          BOOKS_COLLECTION.push(newBatch[b]);
        }
      }

      if (isLast) {
        fs.writeFileSync(STORE_PATH, JSON.stringify(BOOKS_COLLECTION), 'utf8');
        recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);
        syncBooksToCloudSQL(BOOKS_COLLECTION);
        console.log(`Finished chunked CSV import with deduplication. Total non-duplicate catalog count: ${BOOKS_COLLECTION.length}`);
      }

      res.json({
        success: true,
        currentTotal: BOOKS_COLLECTION.length,
        isFinished: isLast
      });
    } catch (err: any) {
      console.error('Chunked CSV Import Error:', err);
      res.status(500).json({ error: 'Failed to process CSV chunk.' });
    }
  });

  // API 2.7: Reset Dataset to Fresh Default Generator
  app.post('/api/books/reset', (req: Request, res: Response) => {
    try {
      const generatedBooks = generateLibraryDataset();
      BOOKS_COLLECTION = generatedBooks;
      fs.writeFileSync(STORE_PATH, JSON.stringify(BOOKS_COLLECTION, null, 2), 'utf8');
      recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);
      console.log(`Reset dataset to default ${BOOKS_COLLECTION.length} generated books.`);
      res.json({ success: true, count: BOOKS_COLLECTION.length, books: BOOKS_COLLECTION });
    } catch (err) {
      console.error('Reset error:', err);
      res.status(500).json({ error: 'Failed to reset books store.' });
    }
  });


  // API 3: Conversational Recommendation & Chatbot
  app.post('/api/chat', async (req: Request, res: Response) => {
    const { message, history, excludeBookIds } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message payload is required and must be a string.' });
      return;
    }

    try {
      // Collect book IDs that were previously recommended in this session
      let previousIds: number[] = Array.isArray(excludeBookIds) ? excludeBookIds : [];
      if (Array.isArray(history)) {
        history.forEach((h: any) => {
          if (Array.isArray(h.recommendations)) {
            h.recommendations.forEach((r: any) => {
              if (typeof r.id === 'number') previousIds.push(r.id);
            });
          }
        });
      }

      // 1. Calculate Content-Based Recommendations with deterministic Top-5 and T=0.10 (as defined in PDF Sub-bab 2.4)
      const recommendations = recommendationEngine.getRecommendations(message, 5, 0.10, {
        shuffleTop: false,
        excludeIds: previousIds
      });

      // 2. Prepare concise context summaries for LLM prompt
      const hasRecommendations = recommendations.length > 0;
      const recsContextText = recommendations
        .map((r, i) => `${i + 1}. [ID: ${r.id}] "${r.judul}" oleh ${r.penulis} (Kategori: ${r.kategori}${r.genre ? ', Genre: ' + r.genre : ''}) - Kecocokan: ${r.percentage}%. Alasan: ${r.explanation}. Sinopsis: "${r.sinopsis}"`)
        .join('\n');

      const totalCatalogCount = BOOKS_COLLECTION.length;
      let catalogSummaryText = `Total Koleksi Katalog: ${totalCatalogCount.toLocaleString('id-ID')} buku.\n`;
      
      // Select a random sample slice of 30 books to expose varied catalog items to LLM on each turn
      const randomStart = Math.floor(Math.random() * Math.max(1, totalCatalogCount - 30));
      const sampleSlice = BOOKS_COLLECTION.slice(randomStart, randomStart + 30);
      catalogSummaryText += `Sampel variatif koleksi:\n` + sampleSlice.map((b) => `- "${b.judul}" (${b.kategori}${b.genre ? ' - ' + b.genre : ''}) oleh ${b.penulis}`).join('\n') + `\n... serta ribuan koleksi judul buku fiksi dan non-fiksi lainnya di database perpustakaan.`;

      // 3. Attempt to generate conversational response via low-latency Gemini model
      const gemini = getGeminiClient();
      let responseText = '';

      if (gemini) {
        try {
          const systemInstruction = `Anda adalah "Libra", asisten kurasi dan rekomendasi buku cerdas yang berkelas, elegan, dan to the point.

ATURAN UTAMA & GAYA BAHASA:
1. REKOMENDASI TERPILIH (MUTLAK):
   Fokuskan rekomendasi HANYA pada daftar buku dari algoritma berikut:
${recsContextText}

2. GAYA RINGKAS & ELEGAN:
   - Gunakan gaya bahasa minimalis modern: langsung ke intinya, padat, dan puitis/elegan.
   - Hindari basa-basi panjang, salam berulang, atau pengantar yang bertele-tele.
   - Sebutkan **Judul Buku**, Penulis, Kategori, dan persentase keselarasan (misal: 85% Cocok).
   - Jelaskan dalam 1-2 kalimat mengapa buku tersebut relevan dengan minat pembaca.

3. TANPA ISTILAH TEKNIS:
   - Jangan sebutkan istilah komputasi seperti "TF-IDF", "Cosine Similarity", atau "Vector Space". Sebutkan sebagai "keselarasan tema" atau "relevansi minat".

4. FORMAT:
   - Gunakan Markdown rapi (**bold** pada judul buku, bullet points ringkas).
`;

          // Format history according to Gemini standards
          const apiContents: any[] = [];
          
          // Add context history (limit to last 6 chat turns to minimize token load)
          const recentHistory = (history || []).slice(-6);
          recentHistory.forEach((h: any) => {
            apiContents.push({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }]
            });
          });

          // Append current user message
          apiContents.push({
            role: 'user',
            parts: [{ text: message }]
          });

          let modelOutput: any = null;
          
          // Primary low-latency model execution using gemini-3.1-flash-lite
          try {
            modelOutput = await gemini.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: apiContents,
              config: {
                systemInstruction: systemInstruction,
                temperature: 0.85,
              }
            });
          } catch (liteErr: any) {
            console.warn('gemini-3.1-flash-lite error, attempting gemini-3.5-flash fallback:', liteErr.message || liteErr);
            try {
              modelOutput = await gemini.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: apiContents,
                config: {
                  systemInstruction: systemInstruction,
                  temperature: 0.85,
                }
              });
            } catch (flashErr: any) {
              console.error('Gemini fallback model also failed:', flashErr.message || flashErr);
              throw flashErr;
            }
          }

          responseText = modelOutput?.text || '';
        } catch (geminiError) {
          console.error('Error with Gemini API, falling back to local recommendation NLP:', geminiError);
          responseText = ''; // Force local fallback
        }
      }

      // If Gemini is not set, returned empty, or encountered an error, trigger the elegant deterministic fallback matching
      if (!responseText) {
        if (hasRecommendations) {
          const titlesList = recommendations.map((r, i) => `\n${i + 1}. **${r.judul}** oleh ${r.penulis} (${r.kategori}${r.genre ? ' - Genre ' + r.genre : ''})\n   *Buku ini memiliki tingkat relevansi sekitar ${r.percentage}% dengan pencarian Anda. ${r.explanation}*`).join('\n');
          
          responseText = `Halo! Senang bisa menyapa Anda kembali di Perpustakaan Universitas Pembangunan Jaya. 

Berdasarkan topik yang Anda cari, saya telah menelusuri katalog internal kami dan menemukan beberapa pilihan buku yang bervariasi dan sangat selaras untuk Anda:
${titlesList}

Apakah ada genre atau topik lain yang ingin Anda eksplorasi lebih lanjut? Saya selalu siap membantu memandu koleksi terbaik untuk Anda!`;
        } else {
          responseText = `Halo! Senang bisa menyapa Anda kembali di Perpustakaan Universitas Pembangunan Jaya. 

Saat ini saya belum menemukan buku di katalog kami yang memiliki kecocokan langsung dengan kata kunci tersebut. 

Namun, Anda bisa mencoba mencari dengan kata kunci genre fiksi seperti **Fantasy**, **Cyberpunk**, **Mystery**, **Romance**, **Horror**, atau genre non-fiksi seperti **Biografi**, **Pengembangan Diri**, **Sejarah**, dan **Sains**. Silakan beri tahu saya topik atau genre yang ingin Anda eksplorasi!`;
        }
      }

      // Respond directly to the client
      res.json({
        reply: responseText,
        recommendations: recommendations,
      });

    } catch (error) {
      console.error('Error handling chatbot request:', error);
      res.status(500).json({
        reply: 'Maaf, terjadi kesalahan internal sistem saat memproses kalkulasi similarity. Silakan ulangi sesaat lagi.',
        recommendations: [],
      });
    }
  });

  // Vite development integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted for development.');
  } else {
    // Serve production static files in dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production static files from dist.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Libra backend running on port ${PORT}`);
  });
}

startServer();
