import { useState, FormEvent, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, Copy, Printer, CheckCircle, Plus, Trash2, Download, LayoutList, X, LogIn, LogOut, Clock, FileText } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { db, auth, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
ANDA ADALAH AI GENERATOR SOAL KHUSUS GURU BAHASA INDONESIA KURIKULUM MERDEKA.

TUGAS UTAMA:
Membantu guru membuat soal otomatis yang:
- Profesional
- Variatif
- Sesuai Kurikulum Merdeka
- Siap pakai
- Memiliki kisi-kisi
- Memiliki kunci jawaban
- Memiliki pembahasan
- Memiliki rubrik penilaian

==================================================
ATURAN UTAMA
==================================================

1. Semua soal harus:
- Sesuai materi
- Sesuai fase kelas
- Menggunakan bahasa Indonesia yang baik
- Tidak ambigu
- Jelas
- Variatif
- Tidak monoton

2. Soal harus mendukung:
- Literasi
- HOTS
- Analisis teks
- Pemahaman bacaan
- Kreativitas siswa

3. Tingkat soal:
- LOTS
- MOTS
- HOTS

4. Gunakan konteks:
- Kehidupan sehari-hari
- Lingkungan sekolah
- Media sosial
- Budaya Indonesia
- Literasi digital

==================================================
FORMAT OUTPUT WAJIB
==================================================

Setiap pembuatan soal wajib menghasilkan:

1. Kisi-kisi soal
2. Soal
3. Kunci jawaban
4. Pembahasan
5. Rubrik penilaian

==================================================
FORMAT KISI-KISI
==================================================

Gunakan tabel:

| No | CP | Materi | Indikator Soal | Bentuk Soal | Level Kognitif | Nomor |

==================================================
ATURAN PEMBUATAN PILIHAN GANDA
==================================================

1. Setiap soal harus memiliki:
- 1 jawaban benar
- 4 atau 5 opsi jawaban
- Distraktor yang logis
- Setiap opsi jawaban (A, B, C, D, E) HARUS ditulis pada baris baru (tersusun secara vertikal ke bawah). Lebih baik jika disajikan dalam bentuk list Markdown.

Contoh Format:
1. Pertanyaan...
   - A. Pilihan A
   - B. Pilihan B
   - C. Pilihan C
   - D. Pilihan D

2. Hindari:
- Jawaban terlalu mudah ditebak
- Opsi terlalu panjang berbeda sendiri
- Kata yang ambigu

3. Soal HOTS wajib:
- Analisis
- Evaluasi
- Interpretasi
- Studi kasus

==================================================
ATURAN PEMBUATAN ESSAY
==================================================

1. Essay harus:
- Memancing analisis
- Mengembangkan argumen
- Mengukur pemahaman siswa

2. Sertakan:
- Kunci jawaban
- Poin penilaian
- Rubrik skor

==================================================
ATURAN PEMBUATAN SOAL HOTS
==================================================

Untuk HOTS:
- Gunakan stimulus
- Gunakan teks
- Gunakan kasus
- Gunakan interpretasi
- Gunakan evaluasi

Stimulus dapat berupa:
- Berita
- Cerpen
- Puisi
- Iklan
- Poster
- Dialog
- Fenomena sosial

==================================================
FORMAT OUTPUT SOAL (Harus Persis Seperti Ini)
==================================================

# KISI-KISI SOAL

(tampilkan tabel)

# SOAL

1.
2.
3.
dst.

# KUNCI JAWABAN

1.
2.
3.
dst.

# PEMBAHASAN

1.
2.
3.
dst.

# RUBRIK PENILAIAN

(tampilkan tabel penilaian)

==================================================
ATURAN KHUSUS KURIKULUM MERDEKA
==================================================

Soal wajib:
- Sesuai CP
- Sesuai TP
- Mendukung pembelajaran mendalam
- Mendukung literasi
- Mendukung HOTS
- Sesuai fase peserta didik
`;

export default function App() {
  const [tingkatan, setTingkatan] = useState("SMP/MTs");
  const [kelas, setKelas] = useState("7");
  const [semester, setSemester] = useState("Ganjil");
  const [materi, setMateri] = useState("");
  const [jumlah, setJumlah] = useState(10);
  const [jenisSoal, setJenisSoal] = useState("Pilihan Ganda");
  const [level, setLevel] = useState("Proporsional (LOTS, MOTS, HOTS)");
  const [tambahan, setTambahan] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const [compilation, setCompilation] = useState<{id: string, materi: string, content: string}[]>([]);
  const [isCompilationOpen, setIsCompilationOpen] = useState(false);

  const [currentView, setCurrentView] = useState('generator');
  const [user, setUser] = useState<User | null>(null);
  const [archive, setArchive] = useState<any[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentView === 'arsip' && user) {
      fetchArchive();
    }
  }, [currentView, user]);

  const fetchArchive = async () => {
    if (!user) return;
    setIsLoadingArchive(true);
    try {
      const q = query(
        collection(db, `users/${user.uid}/quizHistory`),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const historyData: any[] = [];
      querySnapshot.forEach((doc) => {
        historyData.push({ id: doc.id, ...doc.data() });
      });
      setArchive(historyData);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/quizHistory`);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const deleteArchiveDoc = async (docId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!user) return;
    if (!window.confirm('Yakin ingin menghapus arsip ini?')) return;
    
    try {
      await deleteDoc(doc(db, `users/${user.uid}/quizHistory`, docId));
      setArchive(archive.filter(item => item.id !== docId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/quizHistory/${docId}`);
    }
  };

  const getIntegratedCompilation = () => {
    const merged: { [key: string]: string[] } = {
      '# KISI-KISI SOAL': [],
      '# SOAL': [],
      '# KUNCI JAWABAN': [],
      '# PEMBAHASAN': [],
      '# RUBRIK PENILAIAN': []
    };

    const sectionsRegex = /(# KISI-KISI SOAL|# SOAL|# KUNCI JAWABAN|# PEMBAHASAN|# RUBRIK PENILAIAN)/g;

    compilation.forEach((item, i) => {
      const parsed: { [key: string]: string } = {};
      let match;
      let lastIndex = 0;
      let currentHeader = '';

      // Reset regex state since it's global inside a loop (though we recreate it out of the loop, wait it's not safe. Better recreate it inside or use reset)
      const regex = new RegExp(sectionsRegex);

      while ((match = regex.exec(item.content)) !== null) {
        if (currentHeader) {
          parsed[currentHeader] = item.content.substring(lastIndex, match.index).trim();
        }
        currentHeader = match[0];
        lastIndex = match.index;
      }
      if (currentHeader) {
        parsed[currentHeader] = item.content.substring(lastIndex).trim();
      }

      const title = `### Paket ${i + 1} - ${item.materi}`;
      
      const hasAnyHeader = Object.keys(parsed).length > 0;
      if (!hasAnyHeader) {
        // Fallback if no sections found
        merged['# SOAL'].push(`${title}\n\n${item.content}`);
      } else {
        Object.keys(merged).forEach(key => {
          if (parsed[key]) {
            // Remove the header string from the beginning if it matched
            let sectionContent = parsed[key].replace(new RegExp(`^${key}\\s*\n?`), '').trim();
            merged[key].push(`${title}\n\n${sectionContent}`);
          }
        });
      }
    });

    let finalContent = "";
    Object.keys(merged).forEach((key, index) => {
      if (merged[key].length > 0) {
        // Add a page break marker or just a thematic break. We'll use CSS page break for h1 level.
        finalContent += `${key}\n\n${merged[key].join('\n\n---\n\n')}\n\n`;
      }
    });

    return finalContent;
  };

  const addToCompilation = () => {
    if (!result) return;
    setCompilation(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        materi: materi || `Paket Soal ${prev.length + 1}`,
        content: result
      }
    ]);
    setIsCompilationOpen(true);
  };

  const removeCompilation = (id: string) => {
    setCompilation(prev => prev.filter(c => c.id !== id));
  };

  const exportToWord = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Kompilasi Soal</title><style>body { font-family: 'Times New Roman', serif; } table { border-collapse: collapse; width: 100%; margin-bottom: 20px; } th, td { border: 1px solid black; padding: 8px; text-align: left; } h1 { font-size: 18pt; text-align: center; page-break-before: always; } h1:first-of-type { page-break-before: auto; } h2 { font-size: 14pt; }</style></head><body>";
    const footer = "</body></html>";
    const el = document.getElementById('hidden-compilation-render');
    if (!el) return;
    
    // Add page breaks between packages by replacing custom markers if needed, or by relying on the CSS class
    const sourceHTML = header + el.innerHTML + footer;
    
    // Create Blob
    const blob = new Blob(['\ufeff', sourceHTML], {
        type: 'application/msword'
    });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Kompilasi_Soal_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult("");
    setCopied(false);

    const userPrompt = `
Buatlah instrumen soal dengan spesifikasi sebagai berikut:
- Tingkatan: ${tingkatan}
- Kelas: ${kelas}
- Semester: ${semester}
- Materi: ${materi}
- Jumlah Soal: ${jumlah}
- Jenis Soal: ${jenisSoal}
- Level Kognitif: ${level}
${tambahan ? `- Konteks Tambahan / CP / TP: ${tambahan}` : ""}

Pastikan output sesuai dengan FORMAT OUTPUT WAJIB yang terdiri dari Kisi-kisi, Soal, Kunci Jawaban, Pembahasan, dan Rubrik Penilaian. Gunakan teks stimulus yang menarik dan relevan untuk usia peserta didik. Berikan respon langsung berupa isinya saja, jalankan sesuai prompt.
    `.trim();

    try {
      const response = await ai.models.generateContentStream({
        model: "gemini-3.1-pro-preview",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.7,
        }
      });
      
      let fullText = "";
      for await (const chunk of response) {
        if (chunk.text) {
          fullText += chunk.text;
          setResult(fullText);
        }
      }

      if (user && fullText) {
        try {
          await addDoc(collection(db, `users/${user.uid}/quizHistory`), {
            userId: user.uid,
            kelas,
            semester,
            materi: materi || 'Tanpa Judul',
            jumlah,
            jenisSoal,
            level,
            kurikulum: "Kurikulum Merdeka",
            content: fullText,
            createdAt: serverTimestamp()
          });
        } catch (dbError) {
          console.error("Gagal menyimpan ke arsip:", dbError);
          // Tidak memblokir UI jika gagal simpan
        }
      }

    } catch (error) {
      console.error("Error generating content:", error);
      setResult("Terjadi kesalahan saat menghasilkan soal. Pastikan API key sudah benar dan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getTabContent = () => {
    if (activeTab === 'all') return result;
    
    const map = {
      'kisi-kisi': '# KISI-KISI SOAL',
      'soal': '# SOAL',
      'kunci': '# KUNCI JAWABAN',
      'pembahasan': '# PEMBAHASAN',
      'rubrik': '# RUBRIK PENILAIAN'
    };

    const targetHeader = map[activeTab as keyof typeof map];
    if (!targetHeader) return result;

    const sectionsRegex = /(# KISI-KISI SOAL|# SOAL|# KUNCI JAWABAN|# PEMBAHASAN|# RUBRIK PENILAIAN)/g;
    
    const parsed: { [key: string]: string } = {};
    let match;
    let lastIndex = 0;
    let currentHeader = '';

    while ((match = sectionsRegex.exec(result)) !== null) {
      if (currentHeader) {
        parsed[currentHeader] = result.substring(lastIndex, match.index).trim();
      }
      currentHeader = match[0];
      lastIndex = match.index;
    }
    
    if (currentHeader) {
      parsed[currentHeader] = result.substring(lastIndex).trim();
    }

    return parsed[targetHeader] || (isLoading ? "*Sedang menyusun bagian ini...*" : "*Bagian ini tidak ditemukan dalam hasil generated.*");
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8f9fa] text-slate-800 font-sans overflow-hidden selection:bg-slate-200">
      {/* Top Header */}
      <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0 print:hidden relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-xs tracking-wider">AI</span>
          </div>
          <h1 className="text-[15px] font-semibold text-slate-900 hidden sm:block tracking-tight">
            GuruIndo
          </h1>
          <span className="hidden md:inline-flex px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] uppercase font-semibold tracking-widest rounded-sm border border-slate-200 ml-2">
            Kurikulum Merdeka
          </span>
        </div>
        <div className="flex items-center gap-5">
          <nav className="hidden lg:flex gap-5 text-[13px] font-medium text-slate-500">
            <button onClick={() => setCurrentView('generator')} className={`${currentView === 'generator' ? 'text-slate-900 font-semibold' : 'hover:text-slate-900 transition-colors'}`}>Generator</button>
            <button onClick={() => setCurrentView('bank')} className={`${currentView === 'bank' ? 'text-slate-900 font-semibold' : 'hover:text-slate-900 transition-colors'}`}>Bank Materi</button>
            <button onClick={() => setCurrentView('arsip')} className={`${currentView === 'arsip' ? 'text-slate-900 font-semibold' : 'hover:text-slate-900 transition-colors'}`}>Arsip</button>
          </nav>
          <div className="flex items-center gap-3 pl-5 border-l border-slate-200">
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-[13px] font-medium text-slate-800 leading-tight">{user.displayName || "Guru B. Indonesia"}</p>
                </div>
                <button onClick={logout} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity" title="Keluar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  )}
                </button>
              </>
            ) : (
              <button onClick={loginWithGoogle} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-[12px] font-medium rounded-md hover:bg-slate-800 transition-colors">
                <LogIn className="w-3.5 h-3.5" />
                Login Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      {currentView === 'generator' && (
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Panel: Configuration */}
        <aside className="w-80 bg-white border-r border-slate-200 p-5 flex flex-col gap-6 overflow-y-auto shrink-0 print:hidden z-0">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-5">Konfigurasi Asesmen</h2>
              <div className="space-y-4">
                
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">Materi Pembelajaran</label>
                  <input 
                    type="text"
                    value={materi} 
                    onChange={e => setMateri(e.target.value)}
                    placeholder="Contoh: Teks Deskripsi..."
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-slate-700">Tingkat</label>
                    <select 
                      value={tingkatan} 
                      onChange={e => {
                        const val = e.target.value;
                        setTingkatan(val);
                        if (val === "SMP/MTs") {
                          setKelas("7");
                        } else {
                          setKelas("10");
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                    >
                      <option value="SMP/MTs">SMP/MTs Sederajat</option>
                      <option value="SMA/SMK/MA">SMA/SMK/MA Sederajat</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-slate-700">Kelas</label>
                    <select 
                      value={kelas} 
                      onChange={e => setKelas(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                    >
                      {tingkatan === "SMP/MTs" ? (
                        <>
                          <option value="7">7 (Fase D)</option>
                          <option value="8">8 (Fase D)</option>
                          <option value="9">9 (Fase D)</option>
                        </>
                      ) : (
                        <>
                          <option value="10">10 (Fase E)</option>
                          <option value="11">11 (Fase F)</option>
                          <option value="12">12 (Fase F)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">Semester</label>
                  <select 
                    value={semester} 
                    onChange={e => setSemester(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">Level Kognitif</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setLevel("LOTS & MOTS (C1, C2, C3)")}
                      className={`flex-1 py-1.5 text-[12px] rounded-md transition-all ${level.includes("LOTS") && !level.includes("Proporsional") ? 'bg-slate-800 text-white font-medium shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                    >
                      Dasar
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Proporsional (LOTS, MOTS, HOTS)")}
                      className={`flex-1 py-1.5 text-[12px] rounded-md transition-all ${level.includes("Proporsional") ? 'bg-slate-800 text-white font-medium shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                    >
                      Campur
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Dominan HOTS (C4, C5, C6)")}
                      className={`flex-1 py-1.5 text-[12px] rounded-md transition-all ${level.includes("Dominan HOTS") ? 'bg-slate-800 text-white font-medium shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                    >
                      HOTS
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">Bentuk Asesmen</label>
                  <select 
                    value={jenisSoal} 
                    onChange={e => setJenisSoal(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                  >
                    <option value="Pilihan Ganda">Pilihan Ganda (PG)</option>
                    <option value="Pilihan Ganda Kompleks">Pilgan Kompleks</option>
                    <option value="Essay">Uraian (Essay)</option>
                    <option value="Isian Singkat">Isian Singkat</option>
                    <option value="Menjodohkan">Menjodohkan</option>
                    <option value="Benar Salah">Benar Salah</option>
                    <option value="Campuran">Campuran</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-slate-700">Jumlah Soal</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="50" 
                    value={jumlah}
                    onChange={e => setJumlah(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[12px] font-medium text-slate-700 block">Topik Spesifik/CP <span className="font-normal text-slate-400">(Opsional)</span></label>
                  <textarea 
                    value={tambahan}
                    onChange={e => setTambahan(e.target.value)}
                    placeholder="Misal: Elemen Membaca, teks inspiratif..."
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 h-20 resize-none focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 shadow-sm"
                  />
                </div>

              </div>
            </div>

            <div className="mt-8">
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-slate-900 text-white font-medium text-[13px] py-2.5 rounded-md shadow-sm hover:bg-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                    <span>Menyusun...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <span>Generate Soal</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </aside>

        {/* Right Panel: Output Preview */}
        <section className="flex-1 flex flex-col overflow-hidden z-0 print:p-0 print:bg-white bg-white">
          <div className="flex flex-col h-full overflow-hidden print:border-none print:shadow-none print:h-auto print:overflow-visible">
            
            {/* Toolbar Preview */}
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0 print:hidden backdrop-blur-sm">
              <div className="flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide py-3">
                <button onClick={() => setActiveTab('all')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'all' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Semua</button>
                <button onClick={() => setActiveTab('kisi-kisi')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'kisi-kisi' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Kisi-kisi</button>
                <button onClick={() => setActiveTab('soal')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'soal' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Naskah Soal</button>
                <button onClick={() => setActiveTab('kunci')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'kunci' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Kunci</button>
                <button onClick={() => setActiveTab('pembahasan')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'pembahasan' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Pembahasan</button>
                <button onClick={() => setActiveTab('rubrik')} className={`text-[12px] font-medium px-3 py-1 rounded-md transition-colors ${activeTab === 'rubrik' ? 'bg-slate-100 text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>Rubrik</button>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={addToCompilation}
                  disabled={!result || isLoading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-[12px] font-medium rounded-md shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tambah Kompilasi</span>
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <button 
                  onClick={handleCopy}
                  disabled={!result || isLoading}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-medium rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-slate-900" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden xl:inline">{copied ? "Tersalin" : "Salin Cepat"}</span>
                </button>
                <button 
                  onClick={handlePrint}
                  disabled={!result || isLoading}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-medium rounded-md hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden xl:inline">Cetak Dokumen</span>
                </button>
                <button
                  onClick={() => setIsCompilationOpen(!isCompilationOpen)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 ml-1 border rounded-md text-[12px] font-medium transition-colors shadow-sm ${isCompilationOpen ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 p-8 sm:p-12 overflow-y-auto relative print:p-0 print:overflow-visible" ref={resultRef}>
              {(isLoading && !result) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center print:hidden bg-white/90 backdrop-blur-sm z-10">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                    <span className="text-sm font-medium text-slate-600">Menyusun struktur asesmen...</span>
                  </div>
                </div>
              ) : !result ? (
                <div className="max-w-xl mx-auto h-full flex flex-col items-center justify-center text-center px-4 print:hidden opacity-70">
                   <div className="w-12 h-12 border border-slate-200 text-slate-400 rounded-full flex items-center justify-center mb-4 shadow-sm bg-slate-50">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-8v4h8v-4zM6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                   </div>
                   <h3 className="text-[15px] font-semibold text-slate-800 mb-2 tracking-tight">Area Kerja</h3>
                   <p className="text-[13px] text-slate-500 max-w-sm leading-relaxed">Tentukan parameter instrumen asesmen di panel navigasi kiri, kemudian klik tombol <strong>Generate Soal</strong>.</p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto min-h-full print:p-0 mb-8">
                  <div className="prose prose-slate prose-sm max-w-none 
                    prose-headings:text-slate-900 prose-headings:font-bold prose-headings:tracking-tight 
                    prose-h1:text-[1.3rem] prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-3 prose-h1:mb-6 prose-h1:mt-10 first:prose-h1:mt-0 prose-h1:uppercase prose-h1:text-center
                    prose-h2:text-[1.15rem] prose-h2:mt-8 prose-h2:mb-4
                    prose-h3:text-[1.05rem] prose-h3:mt-6
                    prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-3
                    prose-strong:text-slate-900
                    prose-li:text-slate-700 prose-li:my-1
                    prose-table:w-full prose-table:text-[13px] prose-table:border-collapse prose-table:my-6
                    prose-th:bg-slate-50 items-center prose-th:px-4 prose-th:py-2.5 prose-th:border-b prose-th:border-slate-200 prose-th:font-semibold prose-th:text-slate-700 prose-th:text-left
                    prose-td:px-4 prose-td:py-3 prose-td:border-b prose-td:border-slate-100 prose-td:align-top
                    print:prose-p:text-[11pt] print:text-[11pt] print:prose-h1:text-[14pt] print:prose-h2:text-[12pt]
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {getTabContent()}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Compilation Panel */}
        {isCompilationOpen && (
          <aside className="w-[340px] bg-white border-l border-slate-200 flex flex-col shrink-0 print:hidden z-10 transition-all shadow-[-4px_0_15px_rgba(0,0,0,0.03)]">
             {/* Header */}
             <div className="h-14 border-b border-slate-200 flex items-center justify-between px-5 bg-white shrink-0">
               <div className="flex items-center gap-2">
                 <h3 className="text-[13px] font-semibold text-slate-900">Kompilasi Dokumen</h3>
                 <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">{compilation.length} Item</span>
               </div>
               <button onClick={() => setIsCompilationOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-50 rounded-md">
                 <X className="w-4 h-4" />
               </button>
             </div>
             
             {/* List of items */}
             <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 bg-[#f8f9fa]">
               {compilation.length === 0 ? (
                 <div className="text-center py-10 text-slate-400">
                   <div className="mx-auto w-10 h-10 bg-white shadow-sm border border-slate-200 rounded-full flex items-center justify-center mb-3">
                     <LayoutList className="w-4 h-4 text-slate-300" />
                   </div>
                   <p className="text-[12px] font-medium text-slate-500 mb-1">Belum ada kompilasi</p>
                   <p className="text-[11px] px-4 font-normal leading-relaxed text-slate-400">Pilih "Tambah Kompilasi" untuk menggabungkan beberapa file naskah soal.</p>
                 </div>
               ) : (
                 compilation.map((item, i) => (
                   <div key={item.id} className="bg-white p-4 rounded-md shadow-sm border border-slate-200 hover:border-slate-300 transition-colors group">
                     <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                       <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Paket {i + 1}</span>
                       <button onClick={() => removeCompilation(item.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                     <p className="text-[13px] font-medium text-slate-800 line-clamp-2 leading-relaxed">{item.materi || "Soal tanpa judul materi"}</p>
                   </div>
                 ))
               )}
             </div>

             {/* Export Button */}
             <div className="p-5 border-t border-slate-200 bg-white shrink-0">
               <button 
                 onClick={exportToWord}
                 disabled={compilation.length === 0}
                 className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-medium text-[13px] py-2.5 rounded-md shadow-sm hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Download className="w-4 h-4" />
                 <span>Ekspor Word ({compilation.length})</span>
               </button>
             </div>
          </aside>
        )}
      </main>
      )}

      {currentView === 'bank' && (
        <main className="flex-1 overflow-y-auto p-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bank Materi</h2>
              <p className="text-slate-500 mt-2 text-sm">Akses referensi materi dan Capaian Pembelajaran (CP) Kurikulum Merdeka.</p>
            </div>
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-4 shadow-sm text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Fitur Dalam Pengembangan</h3>
              <p className="text-sm text-slate-500 max-w-sm">Nantinya Anda dapat memilih CP dan Materi secara otomatis tanpa perlu mengetik manual.</p>
            </div>
          </div>
        </main>
      )}

      {currentView === 'arsip' && (
        <main className="flex-1 overflow-y-auto p-8 bg-[#f8f9fa] z-0">
          <div className="max-w-5xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Arsip Soal</h2>
                <p className="text-slate-500 mt-2 text-sm">Histori instrumen asesmen yang pernah Anda buat tersimpan di cloud.</p>
              </div>
              {user && (
                <button onClick={fetchArchive} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors shadow-sm">
                  <Loader2 className={`w-4 h-4 ${isLoadingArchive ? 'animate-spin' : ''}`} />
                  Segarkan
                </button>
              )}
            </div>

            {!user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-slate-200 rounded-xl bg-white shadow-sm">
                <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                  <LogIn className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Silakan Login</h3>
                <p className="text-sm text-slate-500 max-w-sm mb-6">Login menggunakan akun Google untuk menyimpan dan melihat riwayat soal yang telah di-generate.</p>
                <button onClick={loginWithGoogle} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors shadow-sm">
                  <LogIn className="w-4 h-4" />
                  Login Google
                </button>
              </div>
            ) : isLoadingArchive && archive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
                <p className="text-sm text-slate-500">Memuat arsip Anda...</p>
              </div>
            ) : archive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-4 shadow-sm text-slate-400">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Belum ada riwayat</h3>
                <p className="text-sm text-slate-500 max-w-sm">Soal yang Anda generate akan otomatis tersimpan di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {archive.map((item) => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group" onClick={() => {
                    setResult(item.content);
                    setCurrentView('generator');
                  }}>
                    <div className="flex items-start justify-between mb-3 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wide group-hover:text-blue-600 transition-colors truncate pr-4">{item.materi || "Tanpa Judul Materi"}</h4>
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          Kelas {item.kelas} / Semester {item.semester}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-sm border border-slate-100 whitespace-nowrap">
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </span>
                        <button 
                          onClick={(e) => deleteArchiveDoc(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all focus:outline-none p-1"
                          title="Hapus Arsip"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">{item.jenisSoal} ({item.jumlah} soal)</span>
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[150px]">{item.level}</span>
                    </div>
                    <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed bg-[#f8f9fa] p-2 rounded border border-slate-100">
                      {item.content?.replace(/[#*]/g, '').substring(0, 150)}...
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Hidden compilation render for Word Export */}
      <div id="hidden-compilation-render" className="hidden">
        <div className="paket-soal-terintegrasi">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {getIntegratedCompilation()}
          </ReactMarkdown>
        </div>
      </div>

      {/* Status Footer */}
      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 print:hidden z-10 relative">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
            <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">AI Engine Ready</span>
          </div>
          <div className="h-3 w-px bg-slate-200"></div>
          <span className="text-[10px] text-slate-500 font-medium tracking-wide">Model: Gemini 1.5 Pro</span>
        </div>
      </footer>
      
      <style>{`
        @media print {
          body { background-color: white !important; }
          body * { visibility: hidden; }
          .prose, .prose * { visibility: visible; }
          .prose {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            color: black !important;
          }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          h1 { page-break-before: always; }
          h1:first-of-type { page-break-before: auto; }
        }
      `}</style>
    </div>
  );
}

