/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Markdown from 'react-markdown';
import { 
  BookOpen, 
  Search, 
  Send, 
  RefreshCw, 
  Bot, 
  User, 
  Bookmark, 
  Sparkles, 
  Grid, 
  Filter, 
  ArrowRight, 
  Info, 
  Calendar, 
  Hash, 
  BookmarkCheck, 
  Download, 
  ChevronRight, 
  ChevronLeft,
  X,
  FileText,
  BadgePercent,
  CheckCircle,
  HelpCircle,
  BookMarked,
  Code,
  Terminal,
  Copy,
  Check,
  Database,
  Layers,
  BarChart2,
  Trash2,
  AlertTriangle,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Book, RecommendationExtended, Message } from './types.ts';

export default function App() {
  // Application State
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationExtended[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [savedBookIds, setSavedBookIds] = useState<number[]>([]);
  const [bookmarkedBooks, setBookmarkedBooks] = useState<Book[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  
  // UI States
  const [chatStarted, setChatStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [isReadingListOpen, setIsReadingListOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<{ open: boolean; cause: 'pdf_downloaded' | 'manual' }>({
    open: false,
    cause: 'manual',
  });
  
  // Large Dataset Catalog Pagination & Search States
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [showKaggleGuide, setShowKaggleGuide] = useState(false);
  const [isCopiedPython, setIsCopiedPython] = useState(false);
  const itemsPerPage = 12;
  
  // Ref for auto scrolling chat
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load only the current catalog page so large datasets do not overwhelm the browser.
  useEffect(() => {
    const controller = new AbortController();
    const searchTimer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(catalogPage),
        limit: String(itemsPerPage),
        search: catalogSearch.trim(),
        category: selectedCategory,
      });

      fetch(`/api/books?${params}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Catalog request failed (HTTP ${res.status})`);
          return res.json();
        })
        .then((data) => {
          setAllBooks(data.books);
          setCatalogTotal(data.total);
          setCatalogPage(data.page);
          setCategoryCounts(data.categoryCounts);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.error('Failed to load catalog:', err);
          import('./data/books.ts').then((mod) => {
            const fallbackBooks = mod.BOOKS_DATABASE;
            const normalizedSearch = catalogSearch.trim().toLocaleLowerCase();
            const filteredBooks = fallbackBooks.filter((book) =>
              (selectedCategory === 'Semua' || book.kategori === selectedCategory) &&
              (!normalizedSearch || [
                book.judul, book.penulis, book.penerbit, book.isbn, book.genre || '', book.sinopsis,
              ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
            );
            setAllBooks(filteredBooks.slice((catalogPage - 1) * itemsPerPage, catalogPage * itemsPerPage));
            setCatalogTotal(filteredBooks.length);
            setCategoryCounts(fallbackBooks.reduce<Record<string, number>>((counts, book) => {
              counts[book.kategori] = (counts[book.kategori] || 0) + 1;
              return counts;
            }, {}));
          });
        });
    }, catalogSearch ? 250 : 0);

    return () => {
      window.clearTimeout(searchTimer);
      controller.abort();
    };
  }, [catalogPage, catalogSearch, catalogRefreshKey, selectedCategory]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ruang_aksara_saved');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id))) {
          throw new Error('Saved bookmarks must be an array of integer book IDs.');
        }
        setSavedBookIds(parsed);
      }
    } catch (e) {
      console.error('Failed to parse localStorage bookmarks', e);
    }
  }, []);

  useEffect(() => {
    if (savedBookIds.length === 0) {
      setBookmarkedBooks([]);
      return;
    }

    const controller = new AbortController();
    fetch('/api/books/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: savedBookIds }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Bookmark lookup failed (HTTP ${res.status})`);
        return res.json();
      })
      .then((data) => setBookmarkedBooks(data.books))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Failed to load saved books:', error);
          setBookmarkedBooks([]);
        }
      });

    return () => controller.abort();
  }, [savedBookIds]);

  // Sync saved bookmarks with Local Storage
  const toggleBookmark = (id: number) => {
    let updated;
    if (savedBookIds.includes(id)) {
      updated = savedBookIds.filter((bid) => bid !== id);
    } else {
      updated = [...savedBookIds, id];
    }
    setSavedBookIds(updated);
    try {
      localStorage.setItem('ruang_aksara_saved', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save bookmarks to localStorage:', error);
    }
  };

  // Auto-scroll chat window when new message arrives
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Handle message sending
  const handleSendMessage = async (textOverride?: string) => {
    const queryText = (textOverride || input).trim();
    if (!queryText || isLoading) return;

    if (!chatStarted) {
      setChatStarted(true);
    }

    // Capture User input Message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          history: messages.map((m) => ({ 
            role: m.role, 
            content: m.content, 
            recommendations: m.recommendations 
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('API server returned error status');
      }

      const data = await response.json();

      // Extend recommendations with structural defaults
      const responseRecs: RecommendationExtended[] = (data.recommendations || []).map((r: any) => ({
        ...r,
        gradient: r.gradient || 'from-slate-600 to-slate-800'
      }));

      // Append chatbot answer to state
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          recommendations: responseRecs,
        },
      ]);

      setRecommendations(responseRecs);
    } catch (error) {
      console.error('Failed to get CRS recommendation:', error);
      
      // Perform an elegant client-side keyword fallback matching from loaded catalog
      const words = queryText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const matchedLocalBooks = allBooks.filter(book => {
        const text = `${book.judul} ${book.penulis} ${book.kategori} ${book.sinopsis}`.toLowerCase();
        return words.length > 0 ? words.some(word => text.includes(word)) : false;
      }).slice(0, 3);

      let fallbackReply = '';
      if (matchedLocalBooks.length > 0) {
        const listText = matchedLocalBooks.map((b, i) => `${i + 1}. **${b.judul}** — ${b.penulis}`).join('\n');
        fallbackReply = `Berikut rekomendasi buku yang sesuai:\n\n${listText}`;
      } else {
        fallbackReply = `Belum ditemukan judul yang cocok. Coba kata kunci genre seperti **Horor**, **Fiksi**, **Sains**, atau **Teknologi**.`;
      }

      // Extend matched local books to match the RecommendationExtended interface
      const offlineRecs: RecommendationExtended[] = matchedLocalBooks.map(b => ({
        ...b,
        similarity: 0.85,
        percentage: 85,
        explanation: `Sesuai dengan topik pencarian.`,
        matchingTerms: words,
        gradient: b.gradient || 'from-slate-600 to-slate-800'
      }));

      // Fallback response inside the client UI
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fallbackReply,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          recommendations: offlineRecs,
        },
      ]);

      setRecommendations(offlineRecs);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset conversational recommendations
  const handleReset = () => {
    setMessages([]);
    setRecommendations([]);
    setChatStarted(false);
    setInput('');
    setSelectedCategory('Semua');
  };

  // Sample prompt chips
  const samplePrompts = [
    {
      title: "Belajar Python & AI",
      query: "Saya butuh belajar coding pemrograman python dasar, kecerdasan buatan, dan NLP"
    },
    {
      title: "Riset Skripsi Statistika",
      query: "Saya ingin menyusun metodologi penelitian skripsi kualitatif / kuantitatif serta belajar olah statistik"
    },
    {
      title: "Desain UI/UX & SQL",
      query: "Buku belajar desain antarmuka pengguna digital UI/UX dan basis data relasional serta query SQL"
    },
    {
      title: "Tata Bahasa Indonesia",
      query: "Mencari pedoman penulisan karya tulis ilmiah dan tata bahasa baku bahasa Indonesia"
    }
  ];

  // Select top 5-8 popular genres that have > 10 entries (plus 'Semua')
  const categories = useMemo(() => {
    let popularCats = Object.entries(categoryCounts)
      .filter(([_, count]) => count > 10)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    // Fallback if fewer than 5 genres pass > 10 threshold
    if (popularCats.length < 5) {
      const fallbackSorted = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat);
      popularCats = Array.from(new Set([...popularCats, ...fallbackSorted]));
    }

    // Limit to top 8 max popular genres
    return ['Semua', ...popularCats.slice(0, 8)];
  }, [categoryCounts]);
  
  const totalCatalogPages = Math.ceil(catalogTotal / itemsPerPage) || 1;
  const currentPaginatedBooks = allBooks;

  // Export bookmark reading list to formatted PDF document
  const handleExportPDF = () => {
    if (bookmarkedBooks.length === 0) return;

    try {
      const doc = new jsPDF();

      // Header Banner
      doc.setFillColor(24, 24, 27); // Dark banner
      doc.rect(0, 0, 210, 28, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('DAFTAR BACAAN PERPUSTAKAAN LIBRA', 14, 18);

      // Subtitle Meta Information
      doc.setTextColor(70, 70, 70);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const dateStr = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      doc.text(`Tanggal Cetak: ${dateStr}`, 14, 35);
      doc.text(`Total Koleksi Disimpan: ${bookmarkedBooks.length} Buku`, 14, 41);

      // AutoTable columns & rows mapping
      const tableColumn = ['No', 'Judul Buku', 'Penulis', 'Kategori', 'Tahun', 'ISBN', 'Penerbit'];
      const tableRows = bookmarkedBooks.map((book, idx) => [
        idx + 1,
        book.judul,
        book.penulis,
        book.kategori,
        book.tahun || '-',
        book.isbn || '-',
        book.penerbit || '-'
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 46,
        styles: {
          fontSize: 8,
          cellPadding: 3,
          font: 'helvetica',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [30, 30, 30],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left'
        },
        alternateRowStyles: {
          fillColor: [248, 248, 245]
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: 35 },
          3: { cellWidth: 30 },
          4: { cellWidth: 15, halign: 'center' },
          5: { cellWidth: 25 },
          6: { cellWidth: 20 }
        }
      });

      // Page numbering footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Libra AI Studio - Halaman ${i} dari ${totalPages}`,
          105,
          290,
          { align: 'center' }
        );
      }

      const filename = `Daftar_Bacaan_Libra_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      // Trigger clear session proceed dialog after PDF export
      setShowClearConfirmModal({ open: true, cause: 'pdf_downloaded' });
    } catch (err) {
      console.error('Gagal membuat PDF:', err);
      alert('Terjadi kesalahan saat memproses pembuatan dokumen PDF.');
    }
  };

  // Clear saved bookmarks collection
  const handleClearCollection = () => {
    setSavedBookIds([]);
    localStorage.removeItem('ruang_aksara_saved');
    setShowClearConfirmModal({ open: false, cause: 'manual' });
  };

  // Export current list to clipboard or simple file format
  const exportReadingSummary = () => {
    if (bookmarkedBooks.length === 0) return;
    const text = bookmarkedBooks.map((b, i) => `${i + 1}. [${b.kategori}] ${b.judul} - ${b.penulis} (Penerbit: ${b.penerbit}, ISBN: ${b.isbn})`).join('\n');
    navigator.clipboard.writeText(text);
    alert('Daftar Bacaan Anda berhasil disalin ke papan klip (clipboard)!');
  };

  // Robust client-side CSV string parser optimized for Kaggle datasets (ruchi798/bookcrossing-dataset)
  const parseCSV = (text: string): any[] => {
    const lines = [];
    let row = [""];
    let insideQuote = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip duplicated quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if ((char === ',' || char === ';') && !insideQuote) {
        row.push("");
      } else if (char === '\r' || char === '\n') {
        if (insideQuote) {
          row[row.length - 1] += char;
        } else {
          if (char === '\r' && nextChar === '\n') {
            i++; // skip carriage return pair
          }
          lines.push(row);
          row = [""];
        }
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    
    if (lines.length < 2) return [];
    
    // Normalize headers
    const headers = lines[0].map(h => h.trim().toLowerCase());
    
    // Auto map index for Kaggle Book-Crossing Preprocessed_data.csv & custom CSVs
    const indexMap = {
      judul: headers.findIndex(h => h.includes('book_title') || h.includes('book-title') || h.includes('judul') || h.includes('title') || h.includes('nama') || h.includes('name')),
      penulis: headers.findIndex(h => h.includes('book_author') || h.includes('book-author') || h.includes('penulis') || h.includes('author') || h.includes('writer')),
      kategori: headers.findIndex(h => h.includes('category') || h.includes('kategori') || h.includes('genre') || h.includes('language')),
      sinopsis: headers.findIndex(h => h.includes('summary') || h.includes('sinopsis') || h.includes('synopsis') || h.includes('desc') || h.includes('deskripsi') || h.includes('location')),
      tahun: headers.findIndex(h => h.includes('year_of_publication') || h.includes('year-of-publication') || h.includes('pub_year') || h.includes('tahun') || h.includes('year') || h.includes('date')),
      isbn: headers.findIndex(h => h.includes('isbn')),
      halaman: headers.findIndex(h => h.includes('halaman') || h.includes('page') || h.includes('pages') || h.includes('rating') || h.includes('age')),
      penerbit: headers.findIndex(h => h.includes('publisher') || h.includes('penerbit') || h.includes('location') || h.includes('city') || h.includes('country'))
    };

    const parsedBooks = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 1 && line[0].trim() === "") continue; 
      
      const getValue = (idx: number, fallback = "") => {
        return idx >= 0 && idx < line.length ? line[idx].trim() : fallback;
      };
      
      const categoryRaw = getValue(indexMap.kategori, 'Sains');
      let category = 'Sains';
      const catLower = categoryRaw.toLowerCase();
      if (catLower.includes('tekno') || catLower.includes('comp') || catLower.includes('it') || catLower.includes('web') || catLower.includes('prog')) category = 'Teknologi';
      else if (catLower.includes('mat') || catLower.includes('hitung') || catLower.includes('aljabar') || catLower.includes('stat')) category = 'Matematika';
      else if (catLower.includes('meto') || catLower.includes('penelit') || catLower.includes('skripsi') || catLower.includes('riset') || catLower.includes('edu') || catLower.includes('social') || catLower.includes('hist')) category = 'Metode Penelitian';
      else if (catLower.includes('bahasa') || catLower.includes('lang') || catLower.includes('fict') || catLower.includes('lit') || catLower.includes('indo') || catLower.includes('ingg')) category = 'Bahasa';
      else if (catLower.includes('desain') || catLower.includes('design') || catLower.includes('ui') || catLower.includes('art')) category = 'Desain';
      else if (catLower.includes('sains') || catLower.includes('sci') || catLower.includes('fisika') || catLower.includes('kimia') || catLower.includes('biologi')) category = 'Sains';

      const title = getValue(indexMap.judul, 'Buku Tanpa Judul');
      const author = getValue(indexMap.penulis, 'Anonim');
      const publisher = getValue(indexMap.penerbit, 'Penerbit Mandiri');
      const year = parseInt(getValue(indexMap.tahun, '2025')) || 2025;
      const isbnVal = getValue(indexMap.isbn, '000-000-000-0');
      let synopsis = getValue(indexMap.sinopsis, '');
      if (!synopsis || synopsis.length < 5) {
        synopsis = `Koleksi literatur bertajuk "${title}" karya ${author}, diterbitkan oleh ${publisher} pada tahun ${year}. Memiliki kode ISBN ${isbnVal}. Tersedia sebagai referensi akademis unggulan di database perpustakaan.`;
      }

      parsedBooks.push({
        judul: title,
        penulis: author,
        kategori: category,
        sinopsis: synopsis,
        tahun: year,
        isbn: isbnVal,
        halaman: parseInt(getValue(indexMap.halaman, '180')) || 180,
        penerbit: publisher
      });
    }
    
    return parsedBooks;
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileSizeMB = file.size / (1024 * 1024);
    setImportStatus({ 
      success: true, 
      message: `Mempersiapkan pengunggahan dataset '${file.name}' (${fileSizeMB.toFixed(1)} MB)...` 
    });

    const TARGET_CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB per chunk (safe for HTTP proxies & UTF-8)
    let offset = 0;
    let chunkIndex = 0;
    let headerLine = '';

    try {
      while (offset < file.size) {
        let endOffset = Math.min(offset + TARGET_CHUNK_SIZE, file.size);
        const slice = file.slice(offset, endOffset);
        let chunkText = await slice.text();

        // If not at end of file, trim to the last newline to ensure clean line boundaries and valid UTF-8
        if (endOffset < file.size) {
          const lastNewline = chunkText.lastIndexOf('\n');
          if (lastNewline !== -1) {
            chunkText = chunkText.slice(0, lastNewline);
            endOffset = offset + lastNewline + 1;
          }
        }

        const isFirst = chunkIndex === 0;
        const isLast = endOffset >= file.size;

        if (isFirst) {
          const firstNewline = chunkText.indexOf('\n');
          if (firstNewline !== -1) {
            headerLine = chunkText.slice(0, firstNewline).trim();
          } else {
            headerLine = chunkText.trim();
          }
        } else if (headerLine) {
          // Prepend header to subsequent chunks so backend can identify CSV column indices
          chunkText = headerLine + '\n' + chunkText;
        }

        const progressPct = Math.min(100, Math.round((endOffset / file.size) * 100));
        setImportStatus({
          success: true,
          message: `Mengunggah & mengklasifikasi dataset (${fileSizeMB.toFixed(1)} MB): ${progressPct}% selesai (Bagian ${chunkIndex + 1})...`
        });

        const response = await fetch('/api/books/import-csv-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunk: chunkText,
            isFirst,
            isLast,
            clearExisting: isFirst
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Gagal mengunggah potongan CSV ke-${chunkIndex + 1} (HTTP ${response.status})`);
        }

        const data = await response.json();
        if (isLast) {
          setCatalogPage(1);
          setCatalogRefreshKey((key) => key + 1);
          setImportStatus({
            success: true,
            message: `Selesai! Berhasil mengimpor dan mengklasifikasikan ${data.currentTotal?.toLocaleString('id-ID') || 0} buku dari file dataset ${file.name} (${fileSizeMB.toFixed(1)} MB)!`
          });
        }

        offset = endOffset;
        chunkIndex++;
      }
    } catch (err: any) {
      console.error('Import chunk error:', err);
      setImportStatus({
        success: false,
        message: `Gagal mengunggah dataset CSV: ${err.message || 'Pastikan format file sesuai.'}`
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleResetDefaultDataset = async () => {
    try {
      setImportStatus({ success: true, message: 'Mereset dataset ke katalog standar (1.080 Buku Multi-Genre)...' });
      const response = await fetch('/api/books/reset', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setCatalogPage(1);
        setCatalogRefreshKey((key) => key + 1);
        setImportStatus({ success: true, message: `Dataset berhasil direset ke katalog utama (${data.count} buku multi-genre terstruktur).` });
      }
    } catch (e) {
      console.error('Failed to reset dataset:', e);
      setImportStatus({ success: false, message: 'Gagal mereset database buku.' });
    }
  };

  const exportCurrentDatasetCSV = () => {
    if (allBooks.length === 0) return;
    
    const headers = ['judul', 'penulis', 'kategori', 'sinopsis', 'tahun', 'isbn', 'halaman', 'penerbit'];
    
    const rows = allBooks.map((b) => [
      b.judul.replace(/"/g, '""'),
      b.penulis.replace(/"/g, '""'),
      b.kategori,
      b.sinopsis.replace(/"/g, '""'),
      b.tahun.toString(),
      b.isbn,
      b.halaman.toString(),
      b.penerbit.replace(/"/g, '""')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'libra_books_dataset.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSVTemplate = () => {
    const headers = ['judul', 'penulis', 'kategori', 'sinopsis', 'tahun', 'isbn', 'halaman', 'penerbit'];
    const sampleRows = [
      [
        'Pemrograman Web Komprehensif',
        'Imam Azhari',
        'Teknologi',
        'Buku ini membahas pengembangan website modern menggunakan React, Node.js, Express, Tailwind CSS, dan basis data PostgreSQL.',
        '2024',
        '978-602-9999-01-2',
        '290',
        'Erlangga Pustaka'
      ],
      [
        'Fisika Kuantum Dasar',
        'Siti Nurhaliza',
        'Sains',
        'Memaparkan konsep dasar mekanika kuantum, fungsi gelombang Schrodinger, partikel dalam kotak, dan prinsip ketidakpastian Heisenberg.',
        '2023',
        '978-623-2222-33-4',
        '210',
        'Aksara Pustaka'
      ]
    ];
    
    const csvContent = [
      headers.join(','),
      ...sampleRows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'libra_csv_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 text-stone-900 font-sans antialiased selection:bg-stone-800 selection:text-white" id="main_wrapper">
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 lg:px-8 py-3.5 flex items-center justify-between" id="app_header">
        <div className="flex items-center gap-3">
          <div className="bg-stone-900 hover:bg-stone-800 text-stone-100 p-2 rounded-lg transition shadow-xs cursor-pointer flex items-center justify-center" onClick={handleReset}>
            <BookOpen className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-serif italic tracking-tight text-stone-900 leading-tight">Libra</h1>
            <p className="text-[11px] text-stone-400 font-sans">Katalog & Rekomendasi</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* User local Saved Books Toggle button */}
          <button 
            onClick={() => setIsReadingListOpen(!isReadingListOpen)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
              savedBookIds.length > 0 
                ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100' 
                : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
            id="saved_books_toggle"
          >
            <BookMarked className={`w-4 h-4 ${savedBookIds.length > 0 ? 'text-amber-700' : 'text-stone-400'}`} />
            <span className="hidden sm:inline">Daftar Bacaan</span>
            <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
              savedBookIds.length > 0 ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-500'
            }`}>
              {savedBookIds.length}
            </span>
          </button>

          {/* Quick Clear Conversation link */}
          {chatStarted && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 bg-white hover:bg-stone-50 rounded-lg transition"
              id="reset_btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body Grid Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 flex flex-col justify-between" id="canvas_container">
        
        <AnimatePresence mode="wait">
          {!chatStarted ? (
            
            /* LANDING VIEW: Minimalist Editorial Search Mode */
            <motion.div 
              key="landing_view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col justify-center items-center py-6 lg:py-10 max-w-2xl mx-auto w-full"
              id="landing_content_view"
            >
              
              {/* Branding Visual Logo / Icon */}
              <div className="mb-4">
                <div className="w-12 h-12 rounded-xl bg-stone-900 flex items-center justify-center shadow-xs text-white">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
              </div>

              {/* Title & Concise Subtitle */}
              <div className="text-center mb-6">
                <h2 className="text-3xl lg:text-4xl font-bold font-serif italic text-stone-900 tracking-tight leading-tight">
                  Temukan Bacaan Terbaik
                </h2>
                <p className="mt-2 text-stone-500 text-sm leading-relaxed font-sans">
                  Cari topik, judul, atau tanyakan rekomendasi bacaan Anda.
                </p>
              </div>

              {/* Prominent Center Search Bar in Landing View */}
              <div className="w-full bg-white border border-stone-300 shadow-xs rounded-xl p-2 mb-8 focus-within:ring-2 focus-within:ring-stone-800 focus-within:border-transparent transition" id="landing_sandbox_input_container">
                <div className="flex gap-2 items-center">
                  <div className="text-stone-400 pl-2">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Cari topik, judul, atau tanyakan rekomendasi..."
                    className="flex-1 bg-transparent text-stone-900 placeholder-stone-400 text-sm focus:outline-none py-1"
                    id="landing_search_bar_input"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white px-4 py-2 font-medium text-xs rounded-lg transition shrink-0 flex items-center gap-1.5"
                    id="landing_search_bar_submit"
                  >
                    <span>Cari</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                </div>
              </div>



              {/* Beautiful Book Catalog Browser Section inside Landing View */}
              <div className="w-full border-t border-stone-300 pt-8 mt-4">
                


                {importStatus && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`mb-6 p-4 rounded-xl border text-xs leading-relaxed font-semibold flex items-center justify-between ${
                      importStatus.success 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{importStatus.success ? '✅' : '⚠️'}</span>
                      <span>{importStatus.message}</span>
                    </div>
                    <button 
                      onClick={() => setImportStatus(null)} 
                      className="text-[10px] uppercase font-bold border border-current rounded px-1.5 py-0.5 hover:bg-black/5"
                    >
                      Tutup
                    </button>
                  </motion.div>
                )}

                {/* Catalog Filter Controls & Search Input */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-2">
                    <Grid className="w-4 h-4 text-stone-500" />
                    <h3 className="text-xs font-bold text-stone-700 tracking-wide font-sans">
                      Katalog ({catalogTotal.toLocaleString('id-ID')})
                    </h3>
                  </div>

                  {/* Search box for catalog */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input 
                      type="text"
                      placeholder="Cari judul, penulis, atau ISBN..."
                      value={catalogSearch}
                      onChange={(e) => {
                        setCatalogSearch(e.target.value);
                        setCatalogPage(1);
                      }}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs placeholder:text-stone-400 focus:outline-none focus:border-stone-400 shadow-3xs"
                    />
                    {catalogSearch && (
                      <button 
                        onClick={() => { setCatalogSearch(''); setCatalogPage(1); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  
                  {/* Category scrollable badging - Top 5-8 Popular Genres (>10 entries) */}
                  <div className="flex flex-wrap gap-1.5" id="category_scroll_p">
                    {categories.map((cat) => {
                      const count = cat === 'Semua' ? Object.values(categoryCounts).reduce((sum, value) => sum + value, 0) : (categoryCounts[cat] || 0);
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setCatalogPage(1);
                          }}
                          className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition inline-flex items-center gap-1.5 ${
                            selectedCategory === cat 
                              ? 'bg-stone-900 text-white shadow-xs' 
                              : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200 shadow-3xs'
                          }`}
                        >
                          <span>{cat}</span>
                          {count > 0 && (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              selectedCategory === cat
                                ? 'bg-amber-400 text-stone-950 font-bold'
                                : 'bg-stone-100 text-stone-500'
                            }`}>
                              {count > 9999 ? `${(count / 1000).toFixed(0)}k` : count.toLocaleString('id-ID')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid Books list item scroll preview */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" id="catalog_books_preview_g">
                  {currentPaginatedBooks.map((book) => (
                    <div 
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                      className="bg-white border border-stone-200 rounded-xl p-4 shadow-3xs hover:shadow-sm hover:border-stone-400 transition-all duration-200 cursor-pointer group flex flex-col justify-between h-[210px]"
                    >
                      <div>
                        {/* Minimalist top accent bar */}
                        <div className={`w-full h-1 rounded bg-gradient-to-r ${book.gradient} mb-3 opacity-80`}></div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] bg-stone-100 border border-stone-200 text-stone-600 px-2 py-0.5 rounded font-medium">
                            {book.kategori}
                          </span>
                          {book.genre && (
                            <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-medium">
                              {book.genre}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold font-serif italic text-stone-900 text-sm mt-2 leading-snug line-clamp-2 group-hover:text-amber-800 transition">
                          {book.judul}
                        </h4>
                        <p className="text-[11px] text-stone-500 mt-1 line-clamp-1 font-sans">
                          {book.penulis}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-stone-400 border-t border-stone-100 pt-2 mt-2 pointer-events-none font-sans">
                        <span className="font-mono text-[10px] line-clamp-1 max-w-[110px]">{book.penerbit}</span>
                        <Info className="w-3.5 h-3.5 text-stone-300 shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>

                {catalogTotal === 0 && (
                  <div className="text-center py-10 bg-white border border-dashed border-stone-200 rounded-xl p-6">
                    <BookOpen className="w-7 h-7 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs text-stone-600 font-medium">Tidak ada buku yang cocok</p>
                    <button 
                      onClick={() => { setSelectedCategory('Semua'); setCatalogSearch(''); setCatalogPage(1); }}
                      className="mt-2 text-xs text-amber-700 font-semibold hover:underline"
                    >
                      Reset Filter
                    </button>
                  </div>
                )}

                {/* Catalog Pagination Controls */}
                {totalCatalogPages > 1 && (
                  <div className="flex items-center justify-between mt-5 pt-3.5 border-t border-stone-200 text-xs">
                    <p className="text-stone-500 font-mono text-[11px]">
                      {((catalogPage - 1) * itemsPerPage) + 1}–{Math.min(catalogPage * itemsPerPage, catalogTotal)} dari {catalogTotal.toLocaleString('id-ID')}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={catalogPage <= 1}
                        onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 bg-white border border-stone-200 text-stone-700 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50 flex items-center gap-1 text-[11px]"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Sebelumnya</span>
                      </button>
                      <span className="px-2 font-mono text-[11px] text-stone-600">
                        {catalogPage} / {totalCatalogPages}
                      </span>
                      <button
                        disabled={catalogPage >= totalCatalogPages}
                        onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
                        className="px-2.5 py-1 bg-white border border-stone-200 text-stone-700 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50 flex items-center gap-1 text-[11px]"
                      >
                        <span>Selanjutnya</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                {catalogTotal === 0 && (
                  <div className="text-center py-10 bg-white border border-dashed border-stone-200 rounded-xl p-4">
                    <BookOpen className="w-8 h-8 text-stone-300 mx-auto mb-2.5" />
                    <p className="text-xs text-stone-500 font-semibold">Tidak ada buku dalam kategori {selectedCategory}</p>
                  </div>
                )}
              </div>
              
            </motion.div>

          ) : (
            
            /* ACTIVE WORKSPACE: Dynamic Split Area for chat-turn dialogue and calculations visualizer with Editorial theme */
            <motion.div 
              key="workspace_view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mb-6"
              id="workspace_content_view"
            >
              
              {/* Left Column: Chat Panel */}
              <div className="lg:col-span-7 flex flex-col bg-white border border-stone-200 rounded-xl overflow-hidden h-[580px] lg:h-[620px]" id="chat_panel_container">
                {/* Chat header */}
                <div className="px-5 py-3.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs font-semibold text-stone-800">Obrolan</span>
                  </div>
                  <span className="text-[11px] text-stone-400 font-mono">{messages.filter(m => m.role === 'user').length} pesan</span>
                </div>

                {/* Messages dialog feeds */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin" id="messages_feed">
                  
                  {/* Onboarding message */}
                  <div className="flex gap-3 max-w-[85%] mr-auto">
                    <div className="w-7 h-7 rounded-lg bg-stone-100 border border-stone-200 text-stone-900 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-stone-600" />
                    </div>
                    <div className="bg-stone-50 border border-stone-200 text-stone-800 p-3.5 rounded-xl rounded-tl-none text-xs leading-relaxed" id="welcome_bubble_syst">
                      Halo! Ceritakan topik atau genre yang Anda cari, saya akan pilihkan rekomendasi buku terbaik.
                    </div>
                  </div>

                  {/* Render conversation array */}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-[85%] ${
                        msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 border ${
                          msg.role === 'user'
                            ? 'bg-stone-900 border-stone-900 text-white'
                            : 'bg-stone-100 border-stone-200 text-stone-600'
                        }`}
                      >
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-stone-600" />}
                      </div>

                      <div className="flex flex-col gap-1 max-w-full">
                        <div
                          className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                            msg.role === 'user'
                              ? 'bg-stone-900 border-stone-950 text-stone-100 rounded-tr-none'
                              : 'bg-stone-50 border-stone-200 text-stone-800 rounded-tl-none font-sans'
                          }`}
                        >
                          <div className="markdown-body">
                            <Markdown
                              components={{
                                h1: ({ node, ...props }) => <h1 className={`text-base font-bold mt-2 mb-1 font-serif italic ${msg.role === 'user' ? 'text-white' : 'text-stone-900'}`} {...props} />,
                                h2: ({ node, ...props }) => <h2 className={`text-sm font-bold mt-1.5 mb-1 ${msg.role === 'user' ? 'text-white' : 'text-stone-900'}`} {...props} />,
                                h3: ({ node, ...props }) => <h3 className={`text-xs font-bold mt-1 mb-0.5 ${msg.role === 'user' ? 'text-stone-200' : 'text-stone-800'}`} {...props} />,
                                p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0 leading-relaxed" {...props} />,
                                ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5" {...props} />,
                                li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                                strong: ({ node, ...props }) => <strong className={`font-semibold ${msg.role === 'user' ? 'text-white' : 'text-stone-950'}`} {...props} />,
                                em: ({ node, ...props }) => <em className="italic" {...props} />,
                              }}
                            >
                              {msg.content}
                            </Markdown>
                          </div>

                          {/* Inline recommendation tag pills */}
                          {msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-stone-200/60 flex flex-col gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-medium text-stone-500">Rekomendasi:</span>
                                <button
                                  onClick={() => setRecommendations(msg.recommendations || [])}
                                  className="text-[10px] text-amber-800 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  <span>Lihat Semua</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.recommendations.map((rec) => (
                                  <button
                                    key={rec.id}
                                    onClick={() => {
                                      setSelectedBook(rec);
                                      setRecommendations(msg.recommendations || []);
                                    }}
                                    className="text-[10.5px] bg-white hover:bg-stone-100 text-stone-800 px-2 py-0.5 rounded border border-stone-200 transition inline-flex items-center gap-1.5"
                                  >
                                    <span className="font-serif italic font-medium">"{rec.judul}"</span>
                                    <span className="text-[9px] font-mono text-amber-800 font-bold bg-amber-50 px-1 rounded">
                                      {rec.percentage}%
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <span className={`text-[9px] text-stone-400 px-1 font-mono ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                          {msg.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 border border-stone-200 text-stone-600 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      </div>
                      <div className="bg-stone-50 border border-stone-200 text-stone-600 px-3.5 py-2 rounded-xl rounded-tl-none text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-stone-600 animate-ping"></span>
                        <span>Mencari rekomendasi...</span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input box */}
                <div className="p-3.5 border-t border-stone-200 bg-white">
                  <div className="flex gap-2 items-center bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-stone-800 focus-within:border-transparent focus-within:bg-white transition">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Tulis pesan atau topik buku..."
                      className="flex-1 bg-transparent text-stone-900 placeholder-stone-400 text-xs focus:outline-none py-1"
                      id="workspace_chat_input"
                    />
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!input.trim() || isLoading}
                      className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-stone-100 p-1.5 rounded-md transition shrink-0 flex items-center justify-center"
                      id="workspace_chat_submit"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>


              {/* Right Column: Recommendation Cards Panel */}
              <div className="lg:col-span-5 flex flex-col bg-stone-50 border border-stone-200 rounded-xl p-4 overflow-y-auto h-[580px] lg:h-[620px] scrollbar-thin" id="similarity_dashboard_panel">
                
                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b border-stone-200 pb-2.5">
                  <h2 className="text-xs font-bold text-stone-700 tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Rekomendasi</span>
                  </h2>
                  <span className="text-[11px] font-mono text-stone-500">
                    {recommendations.length} Buku
                  </span>
                </div>

                {/* Recommendation cards */}
                <div className="space-y-3">
                  {recommendations.length > 0 ? (
                    recommendations.map((book) => {
                      const isSaved = savedBookIds.includes(book.id);
                      return (
                        <motion.div
                          key={book.id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2 }}
                          className="bg-white border border-stone-200 hover:border-stone-400 rounded-xl p-4 shadow-3xs transition-all relative group flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <span className="bg-stone-100 border border-stone-200 text-stone-700 text-[9px] font-medium px-2 py-0.5 rounded">
                                {book.kategori}
                              </span>
                              
                              <div className="flex items-center gap-1 bg-stone-900 text-stone-100 px-2 py-0.5 rounded text-[10px] font-medium font-sans">
                                <span>{book.percentage}% Cocok</span>
                              </div>
                            </div>

                            <h3 className="font-bold font-serif italic text-stone-950 text-sm leading-snug group-hover:text-amber-800 transition cursor-pointer" onClick={() => setSelectedBook(book)}>
                              {book.judul}
                            </h3>
                            <p className="text-[11px] text-stone-500 mt-1 font-sans">{book.penulis} &bull; {book.tahun}</p>

                            <p className="text-[11px] text-stone-600 mt-2 leading-relaxed line-clamp-2">
                              {book.sinopsis}
                            </p>

                            <div className="mt-3 text-[11px] bg-stone-50 border-l-2 border-stone-800 p-2.5 text-stone-700 rounded-r-md leading-relaxed font-sans">
                              {book.explanation}
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                            <button
                              onClick={() => setSelectedBook(book)}
                              className="text-[11px] font-medium text-stone-600 hover:text-stone-900 transition inline-flex items-center gap-1 bg-stone-50 hover:bg-stone-100 px-2.5 py-1.5 rounded border border-stone-200"
                            >
                              <Info className="w-3 h-3 text-stone-400" />
                              <span>Detail</span>
                            </button>

                            <button
                              onClick={() => toggleBookmark(book.id)}
                              className={`text-[11px] font-medium px-2.5 py-1.5 rounded border transition inline-flex items-center gap-1 ${
                                isSaved 
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100' 
                                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                              }`}
                            >
                              {isSaved ? (
                                <>
                                  <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Tersimpan</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-3.5 h-3.5 text-stone-400" />
                                  <span>Simpan</span>
                                </>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 bg-white border border-dashed border-stone-200 rounded-xl min-h-[260px]">
                      <BookOpen className="w-7 h-7 text-stone-300 mb-2.5" />
                      <p className="text-xs font-semibold text-stone-700">Belum Ada Rekomendasi</p>
                      <p className="text-[11px] text-stone-400 mt-1 max-w-[200px] leading-relaxed">
                        Tanyakan topik buku di obrolan untuk melihat rekomendasi di sini.
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Details Popup Modal overlay when checking particular publication */}
        <AnimatePresence>
          {selectedBook && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs" id="detail_modal_overlay">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-lg border-2 border-stone-300"
                id="detail_modal_card"
              >
                {/* Book structural banner style */}
                <div className={`p-5 bg-gradient-to-r ${selectedBook.gradient} text-white relative`}>
                  <button
                    onClick={() => setSelectedBook(null)}
                    className="absolute top-4 right-4 bg-black/30 hover:bg-black/50 p-1.5 rounded-full transition text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <span className="text-[9px] bg-white/20 text-white font-medium px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                    {selectedBook.kategori}
                  </span>
                  <h3 className="text-xl font-bold font-serif italic mt-2.5 leading-snug tracking-tight">
                    {selectedBook.judul}
                  </h3>
                  <p className="text-xs text-stone-200 mt-1 font-sans">{selectedBook.penulis}</p>
                </div>

                {/* Technical detailed indices layout */}
                <div className="p-5">
                  {/* Meta indices grid */}
                  <div className="grid grid-cols-2 gap-3.5 border-b border-stone-200 pb-3.5 mb-3.5 text-xs font-medium">
                    <div className="flex items-center gap-2 text-stone-600">
                      <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wider">Tahun</p>
                        <p className="text-stone-900 font-semibold">{selectedBook.tahun}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-stone-600">
                      <Hash className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wider">ISBN</p>
                        <p className="text-stone-900 font-mono text-[11px]">{selectedBook.isbn}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-stone-600">
                      <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wider">Halaman</p>
                        <p className="text-stone-900 font-semibold">{selectedBook.halaman}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-stone-600">
                      <BookOpen className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <div>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wider">Penerbit</p>
                        <p className="text-stone-900 font-semibold">{selectedBook.penerbit}</p>
                      </div>
                    </div>
                  </div>

                  {/* Synopsis block */}
                  <div>
                    <h4 className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Sinopsis</h4>
                    <p className="text-xs text-stone-600 leading-relaxed max-h-[140px] overflow-y-auto pr-1 font-sans">
                      {selectedBook.sinopsis}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 pt-4 border-t border-stone-200 flex items-center justify-between gap-2.5">
                    <button
                      onClick={() => toggleBookmark(selectedBook.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3.5 rounded-lg text-xs font-medium transition ${
                        savedBookIds.includes(selectedBook.id)
                          ? 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100'
                          : 'bg-stone-900 hover:bg-stone-800 text-white'
                      }`}
                    >
                      {savedBookIds.includes(selectedBook.id) ? (
                        <>
                          <BookmarkCheck className="w-4 h-4 text-amber-700" />
                          <span>Hapus dari Daftar Bacaan</span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-4 h-4" />
                          <span>Simpan ke Daftar Bacaan</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedBook(null)}
                      className="border border-stone-300 hover:bg-stone-100 text-stone-700 font-medium px-4 py-2 rounded-lg text-xs transition"
                    >
                      Tutup
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Slide Drawer panel for Saved Bookmarks */}
        <AnimatePresence>
          {isReadingListOpen && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-3xs" id="bookmarks_canvas_overlay" onClick={() => setIsReadingListOpen(false)}>
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-stone-50 w-full max-w-sm h-full shadow-lg flex flex-col justify-between border-l border-stone-200"
                id="bookmarks_drawer"
              >
                {/* Header */}
                <div className="p-4 border-b border-stone-200 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookMarked className="w-4.5 h-4.5 text-amber-600" />
                    <div>
                      <h3 className="font-serif italic font-bold text-stone-900 text-sm">Daftar Bacaan</h3>
                      <p className="text-[10px] text-stone-400 mt-0.5">{bookmarkedBooks.length} buku disimpan</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsReadingListOpen(false)}
                    className="p-1 hover:bg-stone-100 text-stone-400 hover:text-stone-700 rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Bookmarks scrolling content list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {bookmarkedBooks.length > 0 ? (
                    bookmarkedBooks.map((book) => (
                      <div 
                        key={book.id}
                        className="bg-white border border-stone-200 hover:border-stone-400 rounded-xl p-3 shadow-3xs transition flex items-start justify-between gap-2.5"
                      >
                        <div className="flex-1 cursor-pointer" onClick={() => { setSelectedBook(book); setIsReadingListOpen(false); }}>
                          <span className="text-[8px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-medium">
                            {book.kategori}
                          </span>
                          <h4 className="font-bold font-serif italic text-stone-900 text-xs mt-1 line-clamp-2 hover:text-amber-800 transition">
                            {book.judul}
                          </h4>
                          <p className="text-[10px] text-stone-400 mt-0.5 font-sans">{book.penulis}</p>
                        </div>
                        
                        <button
                          onClick={() => toggleBookmark(book.id)}
                          className="text-stone-300 hover:text-rose-600 p-1 rounded transition shrink-0"
                          title="Hapus"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-20 px-4">
                      <Bookmark className="w-7 h-7 text-stone-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-stone-700">Daftar Bacaan Kosong</p>
                      <p className="text-[11px] text-stone-400 mt-1 leading-relaxed max-w-[180px] mx-auto font-sans">
                        Simpan buku dari katalog atau obrolan untuk dibaca nanti.
                      </p>
                    </div>
                  )}
                </div>

                {/* Drawer Footer interactive controls */}
                {bookmarkedBooks.length > 0 && (
                  <div className="p-4 border-t border-stone-200 bg-white gap-2 flex flex-col">
                    <button
                      onClick={handleExportPDF}
                      id="export_reading_pdf_btn"
                      className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2.5 px-3 rounded-lg text-xs font-medium transition inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Unduh PDF</span>
                    </button>

                    <button
                      onClick={exportReadingSummary}
                      className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 py-2 px-3 rounded-lg text-xs font-medium transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-stone-500" />
                      <span>Salin Daftar</span>
                    </button>

                    <button
                      onClick={() => setShowClearConfirmModal({ open: true, cause: 'manual' })}
                      className="w-full hover:bg-rose-50 text-rose-600 border border-stone-200 hover:border-rose-200 py-2 px-3 rounded-lg text-xs font-medium transition inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Kosongkan Daftar</span>
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Kaggle Python Integration Guide Modal */}
        <AnimatePresence>
          {showKaggleGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white border border-stone-300 rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="font-serif italic font-bold text-base text-white">Kelola & Impor Dataset Buku</h3>
                      <p className="text-[10px] text-stone-400 font-mono">Dukungan CSV Lokal, Kaggle, & CLI Backend Streaming</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowKaggleGuide(false)}
                    className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-white/10 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto space-y-4 font-sans text-xs text-stone-700 leading-relaxed">
                  
                  {/* Quick Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pb-2 border-b border-stone-200">
                    <label className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 font-semibold text-stone-800 cursor-pointer transition shadow-3xs text-center">
                      <Upload className="w-3.5 h-3.5 text-stone-600" />
                      <span>Pilih File CSV</span>
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={(e) => {
                          setShowKaggleGuide(false);
                          handleCSVUpload(e);
                        }} 
                        className="hidden" 
                      />
                    </label>

                    <button
                      onClick={downloadCSVTemplate}
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 font-semibold text-stone-800 transition shadow-3xs cursor-pointer text-center"
                    >
                      <Download className="w-3.5 h-3.5 text-stone-600" />
                      <span>Unduh Template</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowKaggleGuide(false);
                        handleResetDefaultDataset();
                      }}
                      className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg border border-stone-300 bg-white hover:bg-rose-50 text-stone-700 hover:text-rose-700 font-semibold transition shadow-3xs cursor-pointer text-center"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset Katalog</span>
                    </button>
                  </div>

                  {/* Method 1: Browser Upload */}
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-stone-850 text-[11px]">
                    <p className="font-bold flex items-center gap-1.5 mb-1 text-stone-900">
                      <Upload className="w-3.5 h-3.5 text-amber-600" />
                      <span>Metode 1: Unggah Langsung di Web (Auto-Chunking)</span>
                    </p>
                    <p>
                      Tekan tombol <strong>"Impor CSV"</strong> di bilah atas atau tombol di atas. File CSV Anda akan dipotong secara otomatis menjadi bagian 1 MB dan dikirim bertahap ke backend, lengkap dengan auto-klasifikasi genre dan deduplikasi data.
                    </p>
                  </div>

                  {/* Method 2: CLI Backend for large datasets */}
                  <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 text-amber-950 text-[11px]">
                    <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                      <Terminal className="w-3.5 h-3.5 text-amber-600" />
                      <span>Metode 2: Script Backend CLI (Untuk File Besar 450 MB+)</span>
                    </p>
                    <p className="mb-2">
                      Untuk dataset raksasa (ratusan ribu buku), jalankan script streaming yang sudah disediakan di folder terminal project:
                    </p>
                    <div className="bg-stone-950 text-amber-200 p-2.5 rounded-lg font-mono text-[10.5px] flex items-center justify-between">
                      <code>python3 scripts/import_450mb_csv.py /path/ke/file_dataset.csv</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText("python3 scripts/import_450mb_csv.py /path/ke/file_dataset.csv");
                          alert("Perintah terminal disalin ke clipboard!");
                        }}
                        className="text-stone-400 hover:text-white p-1 rounded"
                        title="Salin perintah"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-stone-800 mb-2 flex items-center gap-1.5">
                      <Code className="w-4 h-4 text-stone-600" />
                      <span>Metode 3: Script Python Kagglehub (ruchi798/bookcrossing-dataset)</span>
                    </h4>
                    <p className="text-stone-500 mb-2.5">
                      Jalankan script Python berikut di Google Colab, Jupyter Notebook, atau terminal lokal Anda untuk mengirim dataset langsung ke endpoint API Libra:
                    </p>

                    {/* Python Code Snippet Container */}
                    <div className="relative rounded-xl overflow-hidden border border-stone-800 bg-stone-950 text-stone-100 font-mono text-[11px]">
                      <div className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-800 text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                        <span>import_kaggle_dataset.py</span>
                        <button
                          onClick={() => {
                            const pythonScript = `import kagglehub\nimport requests\nfrom kagglehub import KaggleDatasetAdapter\n\n# 1. Load dataset Kaggle ruchi798/bookcrossing-dataset\nprint("Mengunduh Preprocessed_data.csv...")\ndf = kagglehub.load_dataset(\n  KaggleDatasetAdapter.PANDAS,\n  "ruchi798/bookcrossing-dataset",\n  "Preprocessed_data.csv",\n)\n\nprint("Dataset dimuat!", df.shape)\nprint("5 record pertama:", df.head())\n\n# 2. Kirim dataset ke API Libra\nAPI_URL = "${window.location.origin}/api/books/import"\nrecords = df.head(10000).to_dict(orient='records')\n\nprint(f"Mengirim {len(records)} baris data...")\nres = requests.post(API_URL, json={"books": records})\nprint("Respons API:", res.json())`;
                            navigator.clipboard.writeText(pythonScript);
                            setIsCopiedPython(true);
                            setTimeout(() => setIsCopiedPython(false), 2000);
                          }}
                          className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-sans text-[10px]"
                        >
                          {isCopiedPython ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopiedPython ? 'Tersalin!' : 'Salin Kode'}</span>
                        </button>
                      </div>
                      <pre className="p-4 overflow-x-auto text-amber-200/90 leading-relaxed text-[10.5px]">
{`# Install kagglehub jika belum tersedia:
# pip install kagglehub[pandas-datasets] requests

import kagglehub
import requests
from kagglehub import KaggleDatasetAdapter

# 1. Load dataset Kaggle ruchi798/bookcrossing-dataset
print("Mengunduh Preprocessed_data.csv...")
df = kagglehub.load_dataset(
  KaggleDatasetAdapter.PANDAS,
  "ruchi798/bookcrossing-dataset",
  "Preprocessed_data.csv",
)

print("Dataset dimuat!", df.shape)
print("5 record pertama:", df.head())

# 2. Kirim dataset ke API Perpustakaan Libra
API_URL = "${window.location.origin}/api/books/import"

# Konversi dataframe ke format dictionary
records = df.head(10000).to_dict(orient='records')

print(f"Mengirim {len(records)} baris data ke Libra API...")
response = requests.post(API_URL, json={"books": records})
print("Respons API:", response.json())`}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
                  <span className="text-[10px] text-stone-500 font-mono">Status Server API: Ready (Limit 100MB)</span>
                  <button
                    onClick={() => setShowKaggleGuide(false)}
                    className="px-4 py-2 bg-stone-900 text-white rounded-lg font-bold text-xs hover:bg-stone-800 transition cursor-pointer"
                  >
                    Tutup Panduan
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmation Modal for Clearing Collection */}
        <AnimatePresence>
          {showClearConfirmModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white border border-stone-200 rounded-xl shadow-xl max-w-sm w-full p-5 text-stone-900"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    showClearConfirmModal.cause === 'pdf_downloaded'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}>
                    {showClearConfirmModal.cause === 'pdf_downloaded' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-serif italic font-bold text-base text-stone-950">
                      {showClearConfirmModal.cause === 'pdf_downloaded'
                        ? 'PDF Berhasil Diunduh'
                        : 'Kosongkan Daftar Bacaan?'}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1.5 leading-relaxed font-sans">
                      {showClearConfirmModal.cause === 'pdf_downloaded'
                        ? 'Kosongkan daftar bacaan sekarang?'
                        : `Hapus semua ${bookmarkedBooks.length} buku dari daftar bacaan?`}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2 border-t border-stone-100 pt-3.5">
                  <button
                    onClick={() => setShowClearConfirmModal({ open: false, cause: 'manual' })}
                    className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    {showClearConfirmModal.cause === 'pdf_downloaded' ? 'Simpan' : 'Batal'}
                  </button>
                  <button
                    onClick={handleClearCollection}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{showClearConfirmModal.cause === 'pdf_downloaded' ? 'Kosongkan' : 'Hapus'}</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>

      {/* Minimalist Footer */}
      <footer className="text-center text-xs text-stone-400 py-4 border-t border-stone-200 bg-white font-sans" id="app_footer_claim">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <span>Libra &copy; {new Date().getFullYear()} — Katalog & Rekomendasi Buku</span>
          <span className="text-[11px] text-stone-400 font-serif italic">Perpustakaan Digital</span>
        </div>
      </footer>
      
    </div>
  );
}
