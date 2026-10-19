import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Book } from '../src/types.ts';

dotenv.config({ path: ['.env.local', '.env'] });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Use the Supabase transaction-pooler connection string.');
}

function isBookDataset(value: unknown): value is Book[] {
  return Array.isArray(value) && value.length <= 52000 && value.every((book) =>
    book && typeof book === 'object' &&
    typeof book.judul === 'string' &&
    typeof book.penulis === 'string' &&
    typeof book.kategori === 'string' &&
    typeof book.sinopsis === 'string'
  );
}

async function migrateBooks() {
  const datasetPath = path.join(process.cwd(), 'src', 'data', 'books_store.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  if (!isBookDataset(parsed)) {
    throw new Error('The catalog is invalid or contains more than 52,000 records.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: true,
    max: 1,
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id serial PRIMARY KEY,
        judul text NOT NULL,
        penulis text NOT NULL,
        kategori text NOT NULL,
        genre text,
        sinopsis text NOT NULL,
        tahun integer DEFAULT 2024,
        isbn text,
        halaman integer DEFAULT 200,
        penerbit text,
        gradient text,
        created_at timestamp DEFAULT now()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS books_kategori_idx ON books (kategori)');
    await pool.query('CREATE INDEX IF NOT EXISTS books_judul_idx ON books (judul)');

    const existing = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM books');
    if (Number(existing.rows[0].count) !== 0) {
      throw new Error(`Target table already has ${existing.rows[0].count} rows; refusing to overwrite existing data.`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batchSize = 2000;
      const columns = ['id', 'judul', 'penulis', 'kategori', 'genre', 'sinopsis', 'tahun', 'isbn', 'halaman', 'penerbit', 'gradient'];
      for (let start = 0; start < parsed.length; start += batchSize) {
        const batch = parsed.slice(start, start + batchSize);
        const values: unknown[] = [];
        const rows = batch.map((book) => {
          const row = [
            book.id,
            book.judul,
            book.penulis,
            book.kategori,
            book.genre || null,
            book.sinopsis,
            book.tahun || null,
            book.isbn || null,
            book.halaman || null,
            book.penerbit || null,
            book.gradient || null,
          ];
          const placeholders = row.map((value) => {
            values.push(value);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        await client.query(
          `INSERT INTO books (${columns.join(', ')}) VALUES ${rows.join(', ')}`,
          values,
        );
        console.log(`Inserted ${Math.min(start + batch.length, parsed.length)} / ${parsed.length} books`);
      }

      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('books', 'id'),
          COALESCE((SELECT MAX(id) FROM books), 1),
          EXISTS (SELECT 1 FROM books)
        )
      `);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const result = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM books');
    const total = Number(result.rows[0].count);
    if (total !== parsed.length) {
      throw new Error(`Migration count mismatch: expected ${parsed.length}, found ${total}.`);
    }
    console.log(`Migration complete: ${total} books are stored in Supabase PostgreSQL.`);
  } finally {
    await pool.end();
  }
}

migrateBooks().catch((error: unknown) => {
  console.error('Book migration failed:', error);
  process.exitCode = 1;
});
