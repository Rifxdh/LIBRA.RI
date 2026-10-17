/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load local secrets first (the documented .env.local file), then shared .env.
dotenv.config({ path: ['.env.local', '.env'] });

import { BOOKS_DATABASE } from './src/data/books.ts';
import { TFIDFRecommendationEngine } from './src/utils/nlp.ts';
import { Book } from './src/types.ts';
import { generateLibraryDataset } from './src/data/generator.ts';
import { db } from './src/db/index.ts';
import { books as booksTable } from './src/db/schema.ts';

// Prefer the writable, cleaned catalog; compressed and legacy files are recovery sources.
const DATASET_PATH = path.join(process.cwd(), 'src', 'data', 'books_store.json.gz');
const LEGACY_DATASET_PATH = path.join(process.cwd(), 'books_store-copy.json');
const STORE_PATH = path.join(process.cwd(), 'src', 'data', 'books_store.json');
const MAX_CLEAN_BOOKS = 52000;

let BOOKS_COLLECTION: Book[] = [];
let categoryCountsCache: Record<string, number> | null = null;

function getCategoryCounts(): Record<string, number> {
  if (categoryCountsCache) return categoryCountsCache;

  categoryCountsCache = {};
  for (const book of BOOKS_COLLECTION) {
    if (book.kategori) {
      categoryCountsCache[book.kategori] = (categoryCountsCache[book.kategori] || 0) + 1;
    }
  }
  return categoryCountsCache;
}

function invalidateCatalogCache() {
  categoryCountsCache = null;
}

function cleanBookText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function normalizeBookIdentity(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getValidIsbn(value: string): string {
  const isbn = value.toUpperCase().replace(/[^0-9X]/g, '');
  if (/^\d{13}$/.test(isbn)) {
    const checksum = [...isbn.slice(0, 12)].reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return (10 - checksum % 10) % 10 === Number(isbn[12]) ? isbn : '';
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const checksum = [...isbn].reduce(
      (sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index),
      0,
    );
    return checksum % 11 === 0 ? isbn : '';
  }
  return '';
}

const curatedAuthorsByIsbn = new Map(
  BOOKS_DATABASE
    .map((book) => [getValidIsbn(book.isbn), book.penulis] as const)
    .filter(([isbn]) => Boolean(isbn)),
);
const curatedAuthorsByTitle = new Map(
  BOOKS_DATABASE.map((book) => [normalizeBookIdentity(cleanBookText(book.judul)), book.penulis] as const),
);

function recoverBookAuthor(title: string, isbn: string): string {
  return curatedAuthorsByIsbn.get(getValidIsbn(isbn))
    || curatedAuthorsByTitle.get(normalizeBookIdentity(title))
    || 'Tidak diketahui';
}

function bookQualityScore(book: Book): number {
  return (book.penulis !== 'Tidak diketahui' ? 2 : 0)
    + (getValidIsbn(book.isbn) ? 8 : 0)
    + (book.sinopsis.split(/\s+/).filter(Boolean).length >= 4 ? 4 : 0)
    + (book.penerbit ? 2 : 0)
    + (book.kategori ? 2 : 0)
    + (book.genre ? 1 : 0)
    + (book.tahun > 0 ? 1 : 0)
    + (book.halaman > 0 ? 1 : 0);
}

function cleanBookDataset(source: Book[]): { books: Book[]; duplicates: number; invalid: number; capped: number } {
  const groups: Array<{ book: Book; score: number; keys: Set<string> } | null> = [];
  const keyToGroup = new Map<string, number>();
  const titleToGroups = new Map<string, number[]>();
  let duplicates = 0;
  let invalid = 0;

  for (const [index, sourceBook] of source.entries()) {
    const judul = cleanBookText(sourceBook.judul);
    const sourceAuthor = cleanBookText(sourceBook.penulis);
    const sinopsis = cleanBookText(sourceBook.sinopsis);
    const normalizedTitle = normalizeBookIdentity(judul);
    if (
      normalizedTitle.length < 2 ||
      ['unknown', 'untitled', 'untitled book', 'no title', 'n a', 'na', 'none', 'null'].includes(normalizedTitle) ||
      sinopsis.length < 15 ||
      sinopsis.split(/\s+/).filter(Boolean).length < 4
    ) {
      invalid++;
      continue;
    }

    const sourceAuthorIdentity = normalizeBookIdentity(sourceAuthor);
    const authorMissing = !sourceAuthorIdentity
      || ['unknown', 'anonymous', 'anonim', 'tidak diketahui', 'n a', 'na', 'none', 'null'].includes(sourceAuthorIdentity);
    const penulis = authorMissing ? recoverBookAuthor(judul, sourceBook.isbn) : sourceAuthor;
    const normalizedAuthor = normalizeBookIdentity(penulis);
    const kategori = cleanBookText(sourceBook.kategori).replace(/^\[['"]?(.+?)['"]?\]$/, '$1').trim();
    const book: Book = {
      id: Number.isSafeInteger(sourceBook.id) && sourceBook.id > 0 ? sourceBook.id : index + 1,
      judul,
      penulis,
      kategori,
      genre: cleanBookText(sourceBook.genre),
      sinopsis,
      tahun: Number.isInteger(sourceBook.tahun) && sourceBook.tahun >= 1450 && sourceBook.tahun <= new Date().getFullYear()
        ? sourceBook.tahun
        : 0,
      isbn: cleanBookText(sourceBook.isbn),
      halaman: Number.isInteger(sourceBook.halaman) && sourceBook.halaman > 0 ? sourceBook.halaman : 0,
      penerbit: cleanBookText(sourceBook.penerbit),
      gradient: sourceBook.gradient || getRandomGradient(index),
    };
    const titleAuthorKey = `title:${normalizedTitle}|author:${normalizedAuthor}`;
    const validIsbn = getValidIsbn(book.isbn);
    const keys = new Set([titleAuthorKey, ...(validIsbn ? [`isbn:${validIsbn}`] : [])]);
    const matches = [...new Set([...keys]
      .map((key) => keyToGroup.get(key))
      .filter((group): group is number => group !== undefined))];
    const sameTitleGroups = (titleToGroups.get(normalizedTitle) || [])
      .filter((groupIndex) => groups[groupIndex] !== null);
    if (sameTitleGroups.length === 1) {
      const sameTitleGroup = groups[sameTitleGroups[0]]!;
      const existingAuthorMissing = sameTitleGroup.book.penulis === 'Tidak diketahui';
      if ((authorMissing || existingAuthorMissing) && !matches.includes(sameTitleGroups[0])) {
        matches.push(sameTitleGroups[0]);
      }
    }

    if (matches.length === 0) {
      const groupIndex = groups.length;
      groups.push({ book, score: bookQualityScore(book), keys });
      const titleGroups = titleToGroups.get(normalizedTitle) || [];
      titleGroups.push(groupIndex);
      titleToGroups.set(normalizedTitle, titleGroups);
      for (const key of keys) keyToGroup.set(key, groupIndex);
      continue;
    }

    duplicates++;
    const primaryIndex = matches[0];
    const primary = groups[primaryIndex]!;
    const score = bookQualityScore(book);
    if (score > primary.score) {
      primary.book = book;
      primary.score = score;
    }
    for (const key of keys) {
      primary.keys.add(key);
      keyToGroup.set(key, primaryIndex);
    }
    for (const duplicateIndex of matches.slice(1)) {
      const duplicate = groups[duplicateIndex];
      if (!duplicate) continue;
      if (duplicate.score > primary.score) {
        primary.book = duplicate.book;
        primary.score = duplicate.score;
      }
      for (const key of duplicate.keys) {
        primary.keys.add(key);
        keyToGroup.set(key, primaryIndex);
      }
      groups[duplicateIndex] = null;
    }
  }

  const uniqueBooks = groups
    .filter((group): group is NonNullable<typeof group> => group !== null)
    .sort((left, right) => right.score - left.score)
    .map((group) => group.book);
  const capped = Math.max(0, uniqueBooks.length - MAX_CLEAN_BOOKS);
  const books = uniqueBooks.slice(0, MAX_CLEAN_BOOKS);
  const usedIds = new Set<number>();
  let nextId = 1;
  for (const book of books) {
    if (usedIds.has(book.id)) {
      while (usedIds.has(nextId)) nextId++;
      book.id = nextId++;
    }
    usedIds.add(book.id);
  }
  return { books, duplicates, invalid, capped };
}

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

function isBookDataset(value: unknown): value is Book[] {
  return Array.isArray(value) && value.every((book) =>
    book && typeof book === 'object' &&
    typeof book.judul === 'string' && typeof book.penulis === 'string' &&
    typeof book.kategori === 'string' && typeof book.sinopsis === 'string'
  );
}

for (const datasetPath of [STORE_PATH, DATASET_PATH, LEGACY_DATASET_PATH]) {
  if (!fs.existsSync(datasetPath)) continue;
  try {
    const source = datasetPath.endsWith('.gz')
      ? gunzipSync(fs.readFileSync(datasetPath), { maxOutputLength: 512 * 1024 * 1024 }).toString('utf8')
      : fs.readFileSync(datasetPath, 'utf8');
    const parsed: unknown = JSON.parse(source);
    if (!isBookDataset(parsed)) throw new Error('Format dataset bukan daftar buku yang valid.');
    BOOKS_COLLECTION = parsed;
    for (let i = 0; i < BOOKS_COLLECTION.length; i++) {
      const book = BOOKS_COLLECTION[i];
      book.id = Number(book.id) || i + 1;
      book.kategori = book.kategori.replace(/^\[['"]?(.+?)['"]?\]$/, '$1').trim();
      book.genre = book.genre || 'Umum';
      book.tahun = Number(book.tahun) || 0;
      book.isbn = String(book.isbn || '');
      book.halaman = Number(book.halaman) || 0;
      book.penerbit = String(book.penerbit || 'Tidak diketahui');
      book.gradient = book.gradient || getRandomGradient(i);
    }
    console.log(`Loaded ${BOOKS_COLLECTION.length} books from ${path.basename(datasetPath)}`);
    break;
  } catch (error) {
    console.error(`Tidak dapat memuat ${path.basename(datasetPath)}; mencoba dataset berikutnya.`, error);
  }
}

if (BOOKS_COLLECTION.length === 0) BOOKS_COLLECTION = [...BOOKS_DATABASE];

const startupCleanResult = cleanBookDataset(BOOKS_COLLECTION);
BOOKS_COLLECTION = startupCleanResult.books;
if (startupCleanResult.duplicates || startupCleanResult.invalid || startupCleanResult.capped) {
  const temporaryPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(BOOKS_COLLECTION), 'utf8');
  fs.renameSync(temporaryPath, STORE_PATH);
  console.log(
    `Startup catalog cleaned: ${BOOKS_COLLECTION.length} books kept; ` +
    `${startupCleanResult.duplicates} duplicates and ${startupCleanResult.invalid} invalid records removed.`,
  );
}

// Instantiate the TF-IDF Recommendation Engine once at startup
let recommendationEngine = new TFIDFRecommendationEngine(BOOKS_COLLECTION);

function replaceCatalog(source: Book[]) {
  const result = cleanBookDataset(source);
  const nextRecommendationEngine = new TFIDFRecommendationEngine(result.books);
  const temporaryPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(result.books), 'utf8');
  fs.renameSync(temporaryPath, STORE_PATH);

  BOOKS_COLLECTION = result.books;
  recommendationEngine = nextRecommendationEngine;
  invalidateCatalogCache();
  return result;
}

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
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '12'), 10) || 12));
    const requestedPage = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLocaleLowerCase() : '';
    const category = typeof req.query.category === 'string' && req.query.category !== 'Semua'
      ? req.query.category
      : '';

    const matches = search || category
      ? BOOKS_COLLECTION.filter((book) => {
        if (category && book.kategori !== category) return false;
        if (!search) return true;
        return [
          book.judul,
          book.penulis,
          book.penerbit,
          book.isbn,
          book.genre || '',
          book.sinopsis,
        ].some((value) => value.toLocaleLowerCase().includes(search));
      })
      : BOOKS_COLLECTION;
    const total = matches.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;

    res.json({
      books: matches.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      categoryCounts: getCategoryCounts(),
    });
  });

  app.post('/api/books/lookup', (req: Request, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id))) {
      res.status(400).json({ error: 'ids must be an array of integer book IDs.' });
      return;
    }
    const requestedIds = new Set<number>(ids);
    const books = BOOKS_COLLECTION.filter((book) => requestedIds.has(book.id));
    res.json({ books, total: books.length });
  });

  app.post('/api/books/clean', (req: Request, res: Response) => {
    try {
      const result = replaceCatalog(BOOKS_COLLECTION);
      console.log(
        `Catalog cleaned: ${BOOKS_COLLECTION.length} books kept; ${result.duplicates} duplicates, ` +
        `${result.invalid} invalid records, ${result.capped} over the ${MAX_CLEAN_BOOKS} limit removed.`,
      );
      res.json({
        success: true,
        total: BOOKS_COLLECTION.length,
        maxBooks: MAX_CLEAN_BOOKS,
        duplicatesRemoved: result.duplicates,
        invalidRemoved: result.invalid,
        overLimitRemoved: result.capped,
      });
    } catch (error) {
      console.error('Catalog cleaning failed:', error);
      res.status(500).json({ error: 'Failed to clean and persist the book catalog.' });
    }
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

      const result = replaceCatalog(validatedBooks);

      console.log(`Successfully imported ${BOOKS_COLLECTION.length} books and updated NLP engine.`);
      res.json({
        success: true,
        count: BOOKS_COLLECTION.length,
        duplicatesRemoved: result.duplicates,
        overLimitRemoved: result.capped,
        books: BOOKS_COLLECTION,
      });
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
        if (importedBooks.length + (clearExisting ? 0 : BOOKS_COLLECTION.length) >= MAX_CLEAN_BOOKS) break;
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
        replaceCatalog(importedBooks);
      } else {
        replaceCatalog([...BOOKS_COLLECTION, ...importedBooks]);
      }
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
          if (BOOKS_COLLECTION.length + newBatch.length >= MAX_CLEAN_BOOKS) break;
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
        replaceCatalog(BOOKS_COLLECTION);
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
      replaceCatalog(generatedBooks);
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
