import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const books = pgTable('books', {
  id: serial('id').primaryKey(),
  judul: text('judul').notNull(),
  penulis: text('penulis').notNull(),
  kategori: text('kategori').notNull(),
  genre: text('genre'),
  sinopsis: text('sinopsis').notNull(),
  tahun: integer('tahun').default(2024),
  isbn: text('isbn'),
  halaman: integer('halaman').default(200),
  penerbit: text('penerbit'),
  gradient: text('gradient'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const bookmarks = pgTable('bookmarks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  bookId: integer('book_id')
    .references(() => books.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  bookmarks: many(bookmarks),
}));

export const booksRelations = relations(books, ({ many }) => ({
  bookmarks: many(bookmarks),
}));

export const bookmarksRelations = relations(bookmarks, ({ one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  book: one(books, {
    fields: [bookmarks.bookId],
    references: [books.id],
  }),
}));
