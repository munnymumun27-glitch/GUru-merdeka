import { useState, FormEvent, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, Copy, Printer, CheckCircle, Plus, Trash2, Download, LayoutList, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

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
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden selection:bg-blue-200">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0 print:hidden relative z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white font-bold">AI</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800 hidden sm:block">
            GuruIndo <span className="text-blue-600">Cerdas</span>
          </h1>
          <span className="hidden md:inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-100">
            Kurikulum Merdeka
          </span>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden lg:flex gap-6 text-sm font-medium text-slate-500">
            <a href="#" className="text-blue-600">Generator Soal</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Bank Materi</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Arsip Saya</a>
          </nav>
          <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700">Guru B. Indonesia</p>
              <p className="text-[10px] text-slate-500">Guru Cerdas</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center overflow-hidden">
              <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
              </svg>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Panel: Configuration */}
        <aside className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 print:hidden z-0">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Konfigurasi Asesmen</h2>
              <div className="space-y-4">
                
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Materi Pembelajaran</label>
                  <input 
                    type="text"
                    value={materi} 
                    onChange={e => setMateri(e.target.value)}
                    placeholder="Contoh: Teks Deskripsi, Puisi Rakyat..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Tingkat</label>
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                    >
                      <option value="SMP/MTs">SMP/MTs Sederajat</option>
                      <option value="SMA/SMK/MA">SMA/SMK/MA Sederajat</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Kelas</label>
                    <select 
                      value={kelas} 
                      onChange={e => setKelas(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
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
                  <label className="text-[11px] font-bold text-slate-600">Semester</label>
                  <select 
                    value={semester} 
                    onChange={e => setSemester(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Level Kognitif</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setLevel("LOTS & MOTS (C1, C2, C3)")}
                      className={`flex-1 py-1.5 text-[11px] font-medium border rounded transition-colors ${level.includes("LOTS") && !level.includes("Proporsional") ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      Dasar
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Proporsional (LOTS, MOTS, HOTS)")}
                      className={`flex-1 py-1.5 text-[11px] font-medium border rounded transition-colors ${level.includes("Proporsional") ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      Campur
                    </button>
                    <button 
                      type="button"
                      onClick={() => setLevel("Dominan HOTS (C4, C5, C6)")}
                      className={`flex-1 py-1.5 text-[11px] font-medium border rounded transition-colors ${level.includes("Dominan HOTS") ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      HOTS
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600">Bentuk Asesmen</label>
                  <select 
                    value={jenisSoal} 
                    onChange={e => setJenisSoal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
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
                  <label className="text-[11px] font-bold text-slate-600">Jumlah Soal</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="50" 
                    value={jumlah}
                    onChange={e => setJumlah(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>

                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[11px] font-bold text-slate-600 block">Topik Spesifik/CP <span className="font-normal text-slate-400">(Opsional)</span></label>
                  <textarea 
                    value={tambahan}
                    onChange={e => setTambahan(e.target.value)}
                    placeholder="Misal: Elemen Membaca, soal tentang pemanasan global"
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>

              </div>
            </div>

            <div className="mt-8">
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-700/20 hover:bg-blue-800 transition-all focus:outline-none focus:ring-2 focus:ring-blue-800/20 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white/80" />
                    <span>Menyusun Soal...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    <span>Generate Soal</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </aside>

        {/* Right Panel: Output Preview */}
        <section className="flex-1 flex flex-col bg-slate-100 p-4 lg:p-8 overflow-hidden z-0 print:p-0 print:bg-white">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden print:border-none print:shadow-none print:h-auto print:overflow-visible">
            
            {/* Toolbar Preview */}
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-slate-50/80 shrink-0 print:hidden backdrop-blur-sm">
              <div className="flex gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button onClick={() => setActiveTab('all')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'all' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>Semua</button>
                <button onClick={() => setActiveTab('kisi-kisi')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'kisi-kisi' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>1. Kisi-kisi</button>
                <button onClick={() => setActiveTab('soal')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'soal' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>2. Naskah Soal</button>
                <button onClick={() => setActiveTab('kunci')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'kunci' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>3. Kunci</button>
                <button onClick={() => setActiveTab('pembahasan')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'pembahasan' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>4. Pembahasan</button>
                <button onClick={() => setActiveTab('rubrik')} className={`text-[11px] font-bold mt-[2px] h-[54px] px-1 transition-colors ${activeTab === 'rubrik' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>5. Rubrik</button>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={addToCompilation}
                  disabled={!result || isLoading}
                  className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tambah ke Kompilasi</span>
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button 
                  onClick={handleCopy}
                  disabled={!result || isLoading}
                  className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? "Tersalin" : "Salin Teks"}</span>
                </button>
                <button 
                  onClick={handlePrint}
                  disabled={!result || isLoading}
                  className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-800 text-white text-xs font-bold rounded shadow-sm shadow-slate-800/20 hover:bg-slate-900 transition-colors disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-white/90" />
                  <span className="hidden sm:inline">Cetak</span>
                </button>
                <button
                  onClick={() => setIsCompilationOpen(!isCompilationOpen)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-1.5 ml-2 border rounded text-xs font-bold transition-colors ${isCompilationOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Panel Kompilasi</span>
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="flex-1 p-6 sm:p-10 bg-white overflow-y-auto relative print:p-0 print:overflow-visible" ref={resultRef}>
              {(isLoading && !result) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center print:hidden bg-white/80 backdrop-blur-sm z-10">
                  <div className="w-20 h-20 mb-6 relative">
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Menganalisis Kurikulum Merdeka</h3>
                  <p className="text-xs font-medium text-slate-500 animate-pulse">Menghasilkan draf soal berkualitas...</p>
                </div>
              ) : !result ? (
                <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center px-4 print:hidden opacity-60">
                   <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                   </div>
                   <h3 className="text-sm font-bold text-slate-700 mb-2">Area Naskah Interaktif</h3>
                   <p className="text-xs text-slate-500 max-w-sm">Tentukan parameter di panel kiri dan klik <strong className="text-blue-600 font-bold">Generate Soal</strong> untuk menyusun kisi-kisi, naskah, serta rubrik penilaian otomatis.</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto border border-slate-100 shadow-sm sm:p-8 md:p-12 min-h-full print:border-none print:shadow-none print:p-0">
                  <div className="prose prose-slate prose-sm text-[0.95rem] max-w-none 
                    prose-headings:text-slate-900 prose-headings:font-bold prose-headings:tracking-tight 
                    prose-h1:text-[1.4rem] prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-3 prose-h1:mb-6 prose-h1:mt-8 first:prose-h1:mt-0 prose-h1:uppercase prose-h1:text-center
                    prose-h2:text-[1.2rem] prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-blue-800
                    prose-h3:text-[1.05rem] prose-h3:mt-6
                    prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-3
                    prose-strong:text-slate-900
                    prose-li:text-slate-700 prose-li:my-1
                    prose-table:w-full prose-table:text-[0.85em] prose-table:border-collapse prose-table:my-6 prose-table:border prose-table:border-slate-300
                    prose-th:bg-blue-50/50 prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-slate-300 prose-th:font-bold prose-th:text-slate-700 prose-th:text-center
                    prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-300 prose-td:align-top
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
          <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 print:hidden z-10 transition-all shadow-[-4px_0_15px_rgba(0,0,0,0.03)]">
             {/* Header */}
             <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-slate-50 shrink-0">
               <div className="flex items-center gap-2">
                 <h3 className="text-sm font-bold text-slate-800">Kompilasi Soal</h3>
                 <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{compilation.length} Item</span>
               </div>
               <button onClick={() => setIsCompilationOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                 <X className="w-4 h-4" />
               </button>
             </div>
             
             {/* List of items */}
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50/50">
               {compilation.length === 0 ? (
                 <div className="text-center py-10 text-slate-400">
                   <div className="mx-auto w-12 h-12 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-300">
                     <LayoutList className="w-5 h-5" />
                   </div>
                   <p className="text-xs font-semibold text-slate-500 mb-1">Kompilasi Kosong</p>
                   <p className="text-[10px] px-4">Klik "Tambah ke Kompilasi" pada hasil generate untuk menggabungkan beberapa soal.</p>
                 </div>
               ) : (
                 compilation.map((item, i) => (
                   <div key={item.id} className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 transition-colors group">
                     <div className="flex items-start justify-between mb-2">
                       <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">Paket #{i + 1}</span>
                       <button onClick={() => removeCompilation(item.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                     <p className="text-xs font-medium text-slate-600 line-clamp-2 leading-relaxed">{item.materi}</p>
                   </div>
                 ))
               )}
             </div>

             {/* Export Button */}
             <div className="p-4 border-t border-slate-200 bg-white shrink-0">
               <button 
                 onClick={exportToWord}
                 disabled={compilation.length === 0}
                 className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-2.5 rounded-lg shadow-md shadow-green-600/20 hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Download className="w-4 h-4" />
                 <span>Ekspor Word ({compilation.length})</span>
               </button>
             </div>
          </aside>
        )}
      </main>

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
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">AI Engine Aktif</span>
          </div>
          <div className="h-3 w-px bg-slate-300"></div>
          <span className="text-[10px] text-slate-500 font-medium">Model: Gemini 1.5 Pro</span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium hidden sm:block">Siap membantu guru menyukseskan Kurikulum Merdeka</p>
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

