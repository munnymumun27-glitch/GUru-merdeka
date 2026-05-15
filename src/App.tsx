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
        model: "gemini-2.5-flash",
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

    } catch (error: any) {
      console.error("Error generating content:", error);
      const errorMessage = error?.message || error?.toString() || "";
      if (errorMessage.includes("429") || errorMessage.includes("Quota exceeded") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        setResult("Terjadi kesalahan: Kuota API Gemini Anda telah habis (429 Resource Exhausted). Silakan cek billing atau tunggu beberapa saat sebelum mencoba lagi.");
      } else {
        setResult("Terjadi kesalahan saat menghasilkan soal. Pastikan koneksi internet stabil dan coba lagi.");
      }
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
    <div className="flex flex-col h-screen w-full bg-[#FDFBF7] text-stone-800 font-sans overflow-hidden selection:bg-rose-100 selection:text-rose-900">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-stone-200 shrink-0 print:hidden relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center border border-rose-100 shadow-sm">
            <span className="font-serif font-bold text-sm tracking-wider">AI</span>
          </div>
          <h1 className="text-[18px] font-serif font-semibold text-stone-800 hidden sm:block tracking-tight">
            GuruIndo
          </h1>
          <span className="hidden md:inline-flex px-2.5 py-0.5 bg-stone-50 text-stone-500 text-[10px] font-semibold tracking-widest rounded-full border border-stone-200 ml-1">
            Kurikulum Merdeka
          </span>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden lg:flex gap-6 text-[13px] font-medium text-stone-500">
            <button onClick={() => setCurrentView('generator')} className={`${currentView === 'generator' ? 'text-rose-700 font-semibold border-b-2 border-rose-700 pb-1 -mb-1' : 'hover:text-stone-800 transition-colors'}`}>Generator</button>
            <button onClick={() => setCurrentView('bank')} className={`${currentView === 'bank' ? 'text-rose-700 font-semibold border-b-2 border-rose-700 pb-1 -mb-1' : 'hover:text-stone-800 transition-colors'}`}>Bank Materi</button>
            <button onClick={() => setCurrentView('arsip')} className={`${currentView === 'arsip' ? 'text-rose-700 font-semibold border-b-2 border-rose-700 pb-1 -mb-1' : 'hover:text-stone-800 transition-colors'}`}>Arsip</button>
          </nav>
          <div className="flex items-center gap-4 pl-6 border-l border-stone-200">
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-[13px] font-medium text-stone-800 leading-tight">{user.displayName || "Guru B. Indonesia"}</p>
                </div>
                <button onClick={logout} className="w-9 h-9 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center overflow-hidden hover:opacity-80 transition-opacity ring-2 ring-transparent hover:ring-rose-200" title="Keluar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-5 h-5 text-stone-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  )}
                </button>
              </>
            ) : (
              <button onClick={loginWithGoogle} className="flex items-center gap-2 px-4 py-2 bg-rose-700 text-white text-[13px] font-medium rounded-full hover:bg-rose-800 shadow-sm hover:shadow transition-all">
                <LogIn className="w-4 h-4" />
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
        <aside className="w-[340px] bg-white border-r border-stone-200 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 print:hidden z-0 shadow-[4px_0_15px_rgba(0,0,0,0.02)]">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-stone-400 mb-6 flex items-center justify-between">
                Konfigurasi Asesmen
                <div className="w-8 h-px bg-stone-200"></div>
              </h2>
              <div className="space-y-5">
                
                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-stone-700">Materi Pembelajaran</label>
                  <input 
                    type="text"
                    value={materi} 
                    onChange={e => setMateri(e.target.value)}
                    placeholder="Contoh: Teks Deskripsi..."
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2.5 text-[14px] text-stone-800 placeholder-stone-400 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-stone-700">Tingkat</label>
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
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2.5 text-[14px] text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
                    >
                      <option value="SMP/MTs">SMP/MTs</option>
                      <option value="SMA/SMK/MA">SMA/SMK/MA</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-stone-700">Kelas</label>
                    <select 
                      value={kelas} 
                      onChange={e => setKelas(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2.5 text-[14px] text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
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

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-stone-700">Semester</label>
                  <select 
                    value={semester} 
                    onChange={e => setSemester(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-[14px] text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-stone-700">Level Kognitif</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setLevel("LOTS & MOTS (C1, C2, C3)")}
                      className={`flex-1 py-2 text-[12px] rounded-lg transition-all ${level.includes("LOTS") && !level.includes("Proporsional") ? 'bg-rose-700 text-white font-medium shadow-sm' : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'}`}
                    >
                      Dasar
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Proporsional (LOTS, MOTS, HOTS)")}
                      className={`flex-1 py-2 text-[12px] rounded-lg transition-all ${level.includes("Proporsional") ? 'bg-rose-700 text-white font-medium shadow-sm' : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'}`}
                    >
                      Campur
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Dominan HOTS (C4, C5, C6)")}
                      className={`flex-1 py-2 text-[12px] rounded-lg transition-all ${level.includes("Dominan HOTS") ? 'bg-rose-700 text-white font-medium shadow-sm' : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200'}`}
                    >
                      HOTS
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-stone-700">Bentuk Asesmen</label>
                  <select 
                    value={jenisSoal} 
                    onChange={e => setJenisSoal(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-[14px] text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
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

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-stone-700">Jumlah Soal</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="50" 
                    value={jumlah}
                    onChange={e => setJumlah(parseInt(e.target.value) || 1)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-[14px] text-stone-800 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
                  />
                </div>

                <div className="space-y-2 flex flex-col">
                  <label className="text-[13px] font-medium text-stone-700 block">Topik Spesifik/CP <span className="font-normal text-stone-400">(Opsional)</span></label>
                  <textarea 
                    value={tambahan}
                    onChange={e => setTambahan(e.target.value)}
                    placeholder="Misal: Elemen Membaca, teks inspiratif..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-[14px] text-stone-800 placeholder-stone-400 h-24 resize-none focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 shadow-sm transition-all hover:bg-white"
                  />
                </div>

              </div>
            </div>

            <div className="mt-8">
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-rose-700 text-white font-medium text-[14px] py-3 rounded-full shadow-sm shadow-rose-900/10 hover:shadow-md hover:bg-rose-800 transition-all focus:outline-none focus:ring-2 focus:ring-rose-700/20 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 transform active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                    <span>Menyusun...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <span>Generate Soal</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </aside>

        {/* Right Panel: Output Preview */}
        <section className="flex-1 flex flex-col overflow-hidden z-0 print:p-0 print:bg-white bg-[#FDFBF7]">
          <div className="flex flex-col h-full overflow-hidden print:border-none print:shadow-none print:h-auto print:overflow-visible">
            
            {/* Toolbar Preview */}
            <div className="h-16 border-b border-stone-200 flex items-center justify-between px-8 bg-white/60 backdrop-blur-md shrink-0 print:hidden relative z-10">
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide py-3">
                <button onClick={() => setActiveTab('all')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'all' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Semua</button>
                <button onClick={() => setActiveTab('kisi-kisi')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'kisi-kisi' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Kisi-kisi</button>
                <button onClick={() => setActiveTab('soal')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'soal' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Naskah Soal</button>
                <button onClick={() => setActiveTab('kunci')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'kunci' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Kunci</button>
                <button onClick={() => setActiveTab('pembahasan')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'pembahasan' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Pembahasan</button>
                <button onClick={() => setActiveTab('rubrik')} className={`text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm ${activeTab === 'rubrik' ? 'bg-rose-700 text-white border border-rose-800' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900 hover:bg-stone-50'}`}>Rubrik</button>
              </div>
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={addToCompilation}
                  disabled={!result || isLoading}
                  className="flex items-center gap-2 px-4 py-1.5 bg-stone-900 text-white text-[13px] font-medium rounded-full shadow-sm hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Kompilasi</span>
                </button>
                <div className="w-px h-6 bg-stone-200 mx-1"></div>
                <button 
                  onClick={handleCopy}
                  disabled={!result || isLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-white border border-stone-200 text-stone-700 text-[13px] font-medium rounded-full hover:bg-stone-50 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-rose-600" /> : <Copy className="w-4 h-4 text-stone-400" />}
                  <span className="hidden xl:inline">{copied ? "Tersalin" : "Salin"}</span>
                </button>
                <button 
                  onClick={handlePrint}
                  disabled={!result || isLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-white border border-stone-200 text-stone-700 text-[13px] font-medium rounded-full hover:bg-stone-50 shadow-sm transition-colors disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 text-stone-400" />
                  <span className="hidden xl:inline">Cetak</span>
                </button>
                <button
                  onClick={() => setIsCompilationOpen(!isCompilationOpen)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 ml-1 border rounded-full text-[13px] font-medium transition-colors shadow-sm ${isCompilationOpen ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 p-8 sm:p-12 overflow-y-auto relative print:p-0 print:overflow-visible" ref={resultRef}>
              {(isLoading && !result) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center print:hidden bg-[#FDFBF7]/80 backdrop-blur-sm z-10">
                  <div className="flex items-center gap-4 bg-white px-6 py-4 rounded-full shadow-sm border border-stone-200">
                    <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
                    <span className="text-sm font-medium text-stone-600 tracking-wide">Menyusun struktur asesmen...</span>
                  </div>
                </div>
              ) : !result ? (
                <div className="max-w-xl mx-auto h-full flex flex-col items-center justify-center text-center px-4 print:hidden opacity-80">
                   <div className="w-16 h-16 border-2 border-stone-100/80 text-stone-300 rounded-full flex items-center justify-center mb-6 shadow-sm bg-white/50">
                     <FileText className="w-7 h-7" />
                   </div>
                   <h3 className="text-[18px] font-serif font-semibold text-stone-800 mb-2 tracking-tight">Ruang Kerja Kosong</h3>
                   <p className="text-[14px] text-stone-500 max-w-md leading-relaxed">Pilih parameter asesmen di panel sebelah kiri, lalu tekan <strong className="text-stone-700">Generate Soal</strong> untuk menyusun instrumen otomatis.</p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto min-h-full print:p-0 mb-8 bg-white border border-stone-200 shadow-sm rounded-xl p-8 sm:p-12">
                  <div className="prose prose-stone prose-sm max-w-none 
                    prose-headings:font-serif prose-headings:text-stone-900 prose-headings:font-bold prose-headings:tracking-tight 
                    prose-h1:text-[1.5rem] prose-h1:border-b-2 prose-h1:border-stone-100 prose-h1:pb-4 prose-h1:mb-8 prose-h1:mt-12 first:prose-h1:mt-0 prose-h1:uppercase prose-h1:text-center
                    prose-h2:text-[1.25rem] prose-h2:mt-10 prose-h2:mb-5 prose-h2:text-rose-900
                    prose-h3:text-[1.1rem] prose-h3:mt-8
                    prose-p:text-stone-700 prose-p:leading-relaxed prose-p:my-4
                    prose-strong:text-stone-900
                    prose-li:text-stone-700 prose-li:my-1.5
                    prose-table:w-full prose-table:text-[13.5px] prose-table:border-collapse prose-table:my-8
                    prose-th:bg-stone-50 items-center prose-th:px-5 prose-th:py-3 prose-th:border-b prose-th:border-stone-200 prose-th:font-semibold prose-th:text-stone-800 prose-th:text-left
                    prose-td:px-5 prose-td:py-3.5 prose-td:border-b prose-td:border-stone-100 prose-td:align-top
                    print:prose-p:text-[12pt] print:text-[12pt] print:prose-h1:text-[16pt] print:prose-h2:text-[14pt] print:shadow-none print:border-none print:p-0
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
          <aside className="w-[360px] bg-white border-l border-stone-200 flex flex-col shrink-0 print:hidden z-10 transition-all shadow-[-4px_0_15px_rgba(0,0,0,0.03)]">
             {/* Header */}
             <div className="h-16 border-b border-stone-200 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md shrink-0">
               <div className="flex items-center gap-2">
                 <h3 className="text-[14px] font-serif font-semibold text-stone-800">Kompilasi Dokumen</h3>
                 <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full">{compilation.length} Item</span>
               </div>
               <button onClick={() => setIsCompilationOpen(false)} className="text-stone-400 hover:text-rose-600 transition-colors p-1 hover:bg-rose-50 rounded-full">
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             {/* List of items */}
             <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-[#FDFBF7]">
               {compilation.length === 0 ? (
                 <div className="text-center py-12 text-stone-400">
                   <div className="mx-auto w-12 h-12 bg-white shadow-sm border border-stone-200 rounded-full flex items-center justify-center mb-4">
                     <LayoutList className="w-5 h-5 text-stone-300" />
                   </div>
                   <p className="text-[13px] font-medium text-stone-500 mb-1">Daftar Kompilasi Kosong</p>
                   <p className="text-[12px] px-6 font-normal leading-relaxed text-stone-400">Tekan "Kompilasi" pada toolbar untuk menambahkan soal ke daftar ini.</p>
                 </div>
               ) : (
                 compilation.map((item, i) => (
                   <div key={item.id} className="bg-white p-5 rounded-xl shadow-sm border border-stone-200 hover:border-rose-300 transition-all group">
                     <div className="flex items-center justify-between mb-3 pb-3 border-b border-stone-100">
                       <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-full">Paket {i + 1}</span>
                       <button onClick={() => removeCompilation(item.id)} className="text-stone-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                     <p className="text-[14px] font-medium text-stone-800 line-clamp-2 leading-relaxed">{item.materi || "Soal tanpa judul materi"}</p>
                   </div>
                 ))
               )}
             </div>

             {/* Export Button */}
             <div className="p-6 border-t border-stone-200 bg-white shrink-0">
               <button 
                 onClick={exportToWord}
                 disabled={compilation.length === 0}
                 className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white font-medium text-[14px] py-3 rounded-full shadow-sm hover:shadow-md hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
               >
                 <Download className="w-4 h-4" />
                 <span>Unduh Format Word</span>
               </button>
             </div>
          </aside>
        )}
      </main>
      )}

      {currentView === 'bank' && (
        <main className="flex-1 overflow-y-auto p-8 sm:p-12 bg-[#FDFBF7]">
          <div className="max-w-4xl mx-auto">
            <div className="mb-10 text-center sm:text-left">
              <h2 className="text-[28px] font-serif font-bold text-stone-900 tracking-tight">Bank Materi</h2>
              <p className="text-stone-500 mt-3 text-[15px] max-w-2xl">Akses referensi materi dan Capaian Pembelajaran (CP) Kurikulum Merdeka yang siap pakai untuk mempercepat penyusunan asesmen.</p>
            </div>
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-white shadow-sm">
              <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center mb-6 text-rose-500">
                <FileText className="w-10 h-10" />
              </div>
              <h3 className="text-[18px] font-serif font-semibold text-stone-800 mb-2">Modul Dalam Pengembanan</h3>
              <p className="text-[14px] text-stone-500 max-w-md mx-auto leading-relaxed">Nantinya Anda tidak perlu mengetik indikator dan capaian secara manual, cukup pilih dari pustaka yang tersedia.</p>
            </div>
          </div>
        </main>
      )}

      {currentView === 'arsip' && (
        <main className="flex-1 overflow-y-auto p-8 sm:p-12 bg-[#FDFBF7] z-0">
          <div className="max-w-5xl mx-auto">
            <div className="mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
               <div className="text-center sm:text-left">
                <h2 className="text-[28px] font-serif font-bold text-stone-900 tracking-tight">Arsip Soal</h2>
                <p className="text-stone-500 mt-2 text-[15px]">Riwayat instrumen asesmen yang pernah Anda buat tersimpan otomatis.</p>
              </div>
              {user && (
                <button onClick={fetchArchive} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-600 text-[13px] font-medium rounded-full hover:bg-stone-50 focus:ring-2 focus:ring-rose-100 transition-all shadow-sm">
                  <Loader2 className={`w-4 h-4 text-stone-400 ${isLoadingArchive ? 'animate-spin' : ''}`} />
                  Segarkan
                </button>
              )}
            </div>

            {!user ? (
              <div className="flex flex-col items-center justify-center py-24 text-center border border-stone-200 rounded-2xl bg-white shadow-sm">
                <div className="w-20 h-20 bg-stone-50 border border-stone-100 rounded-full flex items-center justify-center mb-6 text-stone-400">
                  <LogIn className="w-10 h-10" />
                </div>
                <h3 className="text-[18px] font-serif font-semibold text-stone-800 mb-2">Login Diperlukan</h3>
                <p className="text-[14px] text-stone-500 max-w-sm mb-8 leading-relaxed">Gabung menggunakan akun Google untuk membuka fitur penyimpanan riwayat soal otomatis di cloud.</p>
                <button onClick={loginWithGoogle} className="flex items-center gap-2 px-6 py-3 bg-rose-700 text-white text-[14px] font-medium rounded-full hover:bg-rose-800 transition-all shadow hover:shadow-md transform active:scale-95">
                  <LogIn className="w-4 h-4" />
                  Mulai Login Google
                </button>
              </div>
            ) : isLoadingArchive && archive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="w-8 h-8 text-rose-400 animate-spin mb-4" />
                <p className="text-[14px] text-stone-500 font-medium">Memuat arsip dokumen Anda...</p>
              </div>
            ) : archive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-white/50">
                <div className="w-16 h-16 bg-white border border-stone-200 rounded-full flex items-center justify-center mb-4 shadow-sm text-stone-300">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-[16px] font-semibold text-stone-800 mb-2">Riwayat Kosong</h3>
                <p className="text-[14px] text-stone-500 max-w-sm">Soal perdana yang Anda generate akan otomatis tersimpan di halaman ini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {archive.map((item) => (
                  <div key={item.id} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-rose-300 transition-all cursor-pointer group" onClick={() => {
                    setResult(item.content);
                    setCurrentView('generator');
                  }}>
                    <div className="flex items-start justify-between mb-4 border-b border-stone-100 pb-4 relative">
                      <div className="pr-12">
                        <h4 className="text-[15px] font-bold text-stone-800 group-hover:text-rose-700 transition-colors line-clamp-1">{item.materi || "Tanpa Judul Materi"}</h4>
                        <p className="text-[12px] text-stone-500 mt-2 flex items-center gap-2">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Kelas {item.kelas} / Semester {item.semester}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 absolute top-0 right-0">
                        <span className="text-[11px] font-medium text-stone-500 bg-stone-50 px-2 py-1 rounded border border-stone-100 whitespace-nowrap">
                          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </span>
                        <button 
                          onClick={(e) => deleteArchiveDoc(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-500 transition-all focus:outline-none p-1.5 hover:bg-red-50 rounded-full"
                          title="Hapus Arsip"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-5">
                      <span className="text-[11px] font-medium bg-stone-50 text-stone-600 px-2.5 py-1 rounded-md border border-stone-200">{item.jenisSoal} ({item.jumlah} Butir)</span>
                      <span className="text-[11px] font-medium bg-rose-50 text-rose-700 px-2.5 py-1 rounded-md border border-rose-100 truncate max-w-[150px]">{item.level}</span>
                    </div>
                    <p className="text-[13px] text-stone-500 line-clamp-2 leading-relaxed bg-[#FDFBF7] p-3 rounded-lg border border-stone-100">
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
      <footer className="h-10 bg-white/80 backdrop-blur-md border-t border-stone-200 px-6 flex items-center justify-between shrink-0 print:hidden z-10 relative">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-[11px] text-stone-500 font-medium tracking-wide">AI Engine Online</span>
          </div>
          <div className="h-3 w-px bg-stone-200"></div>
          <span className="text-[11px] text-stone-400 font-medium">Model: Gemini 2.5 Flash</span>
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

