"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Search, Box, Package, Truck, RotateCw, Plus, Trash2,
    Settings2, ChevronRight, Filter, Calendar, Briefcase, Move3d,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ContainerViewer from '@/components/ContainerViewer';
import LogoutButton from '@/components/LogoutButton';
import {
    Product, PackingResult, ContainerType, CONTAINER_DATA, Job, JobFilters
} from '@/lib/types';
import { packContainer } from '@/lib/packer';
import { fetchJobs, fetchProductsByJob, searchProducts, getDbConfig, updateDbConfig } from '@/lib/actions';
import { SessionUser } from '@/lib/auth';
import { DbConfig } from '@/lib/types';

export default function Home({ user }: { user: SessionUser }) {
    const [selectedContainer, setSelectedContainer] = useState<ContainerType>('40hc');
    const [products, setProducts] = useState<Product[]>([]);
    const [result, setResult] = useState<PackingResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(true);
    const [filters, setFilters] = useState<JobFilters>({ startDate: '', endDate: '', productName: '', containerNo: '' });
    const [manualProduct, setManualProduct] = useState({ model_name: '', width: 1000, length: 800, height: 1200, quantity: 10, allow_rotate: true, allow_lay_down: false });
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [numPasses, setNumPasses] = useState(10);
    const [activeProduct, setActiveProduct] = useState<string | null>(null);
    const [isManualAddOpen, setIsManualAddOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [dbConfig, setDbConfig] = useState<DbConfig>({ host: '', database: '', user: '', password: '', port: 5432 });
    const controlPanelRef = useRef<HTMLDivElement>(null);

    // V4.22: Auto Real-time Search with Debounce
    useEffect(() => {
        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const data = await fetchJobs(filters);
                setJobs(data);
            } catch (error) {
                console.error("Error loading jobs:", error);
            } finally {
                setIsLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [filters]);

    useEffect(() => {
        const loadDbConfig = async () => {
            const config = await getDbConfig();
            setDbConfig(config);
        };
        loadDbConfig();
    }, []);

    const handleDbSave = async () => {
        setIsLoading(true);
        const res = await updateDbConfig(dbConfig);
        alert(res.message);
        setIsLoading(false);
        if (res.success) {
            setIsSettingsOpen(false);
            const data = await fetchJobs(filters);
            setJobs(data);
        }
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSearch = async (query: string) => {
        setManualProduct(prev => ({ ...prev, model_name: query }));
        if (query.length >= 2) setSearchResults(await searchProducts(query));
        else setSearchResults([]);
    };

    const selectSearchResult = (p: Product) => {
        setManualProduct({ model_name: p.model_name, width: p.width, length: p.length, height: p.height, quantity: 10, allow_rotate: p.allow_rotate, allow_lay_down: p.allow_lay_down });
        setSearchResults([]);
    };

    const handlePassesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;
        if (valStr === '') {
            setNumPasses('' as any);
            return;
        }
        let val = parseInt(valStr);
        if (isNaN(val)) return;
        if (val > 50) { val = 50; alert("최대 50회까지 입력 가능합니다."); }
        setNumPasses(val);
    };

    const runSimulation = () => {
        if (products.length === 0) return;
        setIsLoading(true);
        setTimeout(() => {
            const container = CONTAINER_DATA[selectedContainer];
            const res = packContainer(container, products, numPasses);
            setResult(res);
            setIsLoading(false);
            // 모바일: 시뮬레이션 후 컨트롤 패널 최상단으로 스크롤
            setTimeout(() => {
                const mobileScroll = document.getElementById('mobile-scroll-container');
                if (mobileScroll) {
                    mobileScroll.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 100);
        }, 100);
    };

    const handleJobSelect = async (jobId: number) => {
        setSelectedJobId(jobId);
        setIsFilterOpen(false);
        setIsLoading(true);
        // Reset results and products immediately for UI responsiveness
        setResult(null);
        setProducts([]);

        try {
            const data = await fetchProductsByJob(jobId);
            setProducts(data);
            const job = jobs.find(j => j.id === jobId);
            if (job) setSelectedContainer(job.container_type);
        } catch (error) {
            console.error("Error selecting job:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const addManualProduct = () => {
        const newProd: Product = {
            id: `manual_${Date.now()}`,
            model_name: manualProduct.model_name,
            width: manualProduct.width, length: manualProduct.length,
            height: manualProduct.height, quantity: manualProduct.quantity,
            allow_rotate: manualProduct.allow_rotate, allow_lay_down: manualProduct.allow_lay_down
        };
        setProducts(prev => [...prev, newProd]);
        setResult(null);
    };

    const toggleProductFlag = (id: string, field: 'allow_rotate' | 'allow_lay_down') => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: !p[field] } : p));
        setResult(null);
    };

    const removeProduct = (id: string) => {
        setProducts(prev => prev.filter(p => p.id !== id));
        setResult(null);
    };

    const getCarrierColor = (transporter: string | undefined) => {
        if (!transporter) return "text-slate-300";
        if (transporter.includes("천마")) return "text-rose-500 font-black";
        if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-indigo-500 font-bold";
        return "text-emerald-500 font-bold";
    };

    // ────────────────────────────────
    // 공통 컨트롤 패널 JSX (데스크탑 aside + 모바일 section 공용)
    // ────────────────────────────────
    const controlPanel = (
        <>
            {/* Header - Desktop Only (Mobile has its own fixed header for better feel) */}
            <div className="hidden md:flex items-center gap-3 mb-2 shrink-0">
                <Package className="w-8 h-8 text-sky-500" />
                <h1 className="text-xl font-black tracking-tight uppercase pr-4">
                    CTNR <span className="text-sky-500">Optimizer</span>
                </h1>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-sky-400 transition-all">
                        <Settings2 className="w-5 h-5" />
                    </button>
                    <LogoutButton username={user.username} name={user.name} role={user.role} />
                </div>
            </div>

            {/* Job Selection */}
            <section className="space-y-4 shrink-0">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Briefcase className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        작업 데이터 조회
                    </div>
                    <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
                        <Filter className={`w-5 h-5 md:w-4 md:h-4 ${isFilterOpen ? "text-sky-500" : ""}`} />
                    </button>
                </div>

                <AnimatePresence>
                    {isFilterOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="space-y-4 pb-1">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] md:text-[10px] text-slate-500 font-bold ml-1">시작일</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-3.5 md:h-3.5 text-slate-500" />
                                            <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange}
                                                className="w-full bg-[#11111a] border border-white/5 rounded-2xl py-3 md:py-2 pl-10 md:pl-9 pr-3 text-sm md:text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] md:text-[10px] text-slate-500 font-bold ml-1">종료일</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 md:w-3.5 md:h-3.5 text-slate-500" />
                                            <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange}
                                                className="w-full bg-[#11111a] border border-white/5 rounded-2xl py-3 md:py-2 pl-10 md:pl-9 pr-3 text-sm md:text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input placeholder="제품명 검색..." name="productName" value={filters.productName} onChange={handleFilterChange}
                                            className="w-full bg-[#11111a] border border-white/5 rounded-2xl py-3.5 md:py-2.5 pl-10 pr-4 text-sm md:text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" />
                                    </div>
                                    <div className="relative">
                                        <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input placeholder="컨테이너 번호 검색..." name="containerNo" value={filters.containerNo} onChange={handleFilterChange}
                                            className="w-full bg-[#11111a] border border-white/5 rounded-2xl py-3.5 md:py-2.5 pl-10 pr-4 text-sm md:text-xs focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="space-y-2 overflow-y-auto max-h-[220px] md:max-h-[160px] custom-scrollbar pr-1 pb-2">
                    {jobs.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center p-8 md:p-6 bg-white/5 border border-white/5 rounded-3xl opacity-40">
                            <Search className="w-6 h-6 mb-2" />
                            <p className="text-xs md:text-[10px] font-medium italic">조회 결과가 없습니다.</p>
                        </div>
                    ) : (
                        jobs.map((job, idx) => (
                            <button key={idx} onClick={() => handleJobSelect(job.id)}
                                className={`w-full px-3.5 py-3 md:px-4 md:py-3 rounded-2xl text-left border transition-all duration-300 flex items-center justify-between group ${selectedJobId === job.id
                                    ? "bg-sky-500/10 border-sky-500 shadow-[0_0_25px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30"
                                    : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.07]"}`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`text-[15px] md:text-sm font-black truncate uppercase tracking-tight ${getCarrierColor(job.transporter)}`}>
                                        {job.cntr_no || "번호없음"}
                                        <span className="ml-2 text-[10px] font-bold text-slate-600 normal-case tracking-normal">
                                            [{job.transporter ? (job.transporter.includes("천마") ? "천마" : (job.transporter.includes("BNI") || job.transporter.includes("비엔아이") ? "BNI" : job.transporter.split('(')[0])) : "미정"}]
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[11px] md:text-[10px] font-bold text-slate-600 shrink-0 tabular-nums">{job.work_date}</div>
                            </button>
                        ))
                    )}
                </div>
            </section>

            {/* Container Selection & Manual Add */}
            <section className="space-y-4 shrink-0">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Settings2 className="w-4 h-4 md:w-3.5 md:h-3.5" />컨테이너 및 제품 등록
                    </div>
                    <button onClick={() => setIsManualAddOpen(!isManualAddOpen)}
                        className="flex items-center gap-1.5 px-3 py-1.5 md:px-2.5 md:py-1 rounded-xl md:rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs md:text-[10px] font-black hover:bg-sky-500 hover:text-white transition-all">
                        <Plus className={`w-3.5 h-3.5 md:w-3 md:h-3 transition-transform duration-300 ${isManualAddOpen ? "rotate-45" : ""}`} />제품추가
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                    {(Object.keys(CONTAINER_DATA) as ContainerType[]).map((key) => (
                        <button key={key} onClick={() => setSelectedContainer(key)}
                            className={`px-3 py-2 md:p-2 rounded-2xl md:rounded-xl text-left border transition-all duration-300 ${selectedContainer === key
                                ? "bg-sky-500/10 border-sky-500 text-sky-400 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/20"
                                : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10"}`}>
                            <p className="text-[11px] md:text-[10px] font-black truncate">{CONTAINER_DATA[key].name}</p>
                        </button>
                    ))}
                </div>

                <AnimatePresence>
                    {isManualAddOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="p-4 md:p-3 rounded-2xl md:rounded-xl bg-white/5 border border-white/5 space-y-3 relative">
                                <div className="flex justify-between items-center">
                                    <p className="text-[11px] md:text-[10px] font-black text-slate-500 uppercase tracking-tighter">개별 제품 추가</p>
                                    <div className="flex gap-4 md:gap-3">
                                        <button onClick={() => setManualProduct({ ...manualProduct, allow_rotate: !manualProduct.allow_rotate })}
                                            className={`flex items-center gap-1.5 text-[10px] md:text-[9px] font-black transition-colors ${manualProduct.allow_rotate ? "text-sky-400" : "text-slate-600"}`}>
                                            <RotateCw className="w-3.5 h-3.5 md:w-3 md:h-3" />돌리기
                                        </button>
                                        <button onClick={() => setManualProduct({ ...manualProduct, allow_lay_down: !manualProduct.allow_lay_down })}
                                            className={`flex items-center gap-1.5 text-[10px] md:text-[9px] font-black transition-colors ${manualProduct.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}>
                                            <Move3d className="w-3.5 h-3.5 md:w-3 md:h-3" />눕히기
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <label className="text-[10px] md:text-[9px] text-slate-500 font-bold ml-1 mb-1 block">모델명 검색</label>
                                        <input className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-4 py-2.5 md:px-3 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 transition-colors"
                                            placeholder="모델명 입력 (예: sk)" value={manualProduct.model_name} onChange={e => handleSearch(e.target.value)} />
                                        {searchResults.length > 0 && (
                                            <div className="absolute z-30 bottom-full left-0 w-full mb-1 bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                                                {searchResults.map((p, i) => (
                                                    <button key={i} onClick={() => selectSearchResult(p)}
                                                        className="w-full px-5 py-3 text-left text-sm md:text-[11px] hover:bg-sky-500/20 border-b border-white/5 last:border-0 transition-colors">
                                                        <div className="font-bold text-slate-200">{p.model_name}</div>
                                                        <div className="text-[11px] md:text-[10px] text-slate-500">{p.width}x{p.length}x{p.height}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(['width', 'length', 'height'] as const).map((dim, i) => (
                                            <div key={dim} className="space-y-1.5">
                                                <label className="text-[10px] md:text-[9px] text-slate-500 font-bold text-center block">{['가로(W)', '세로(L)', '높이(H)'][i]}</label>
                                                <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-2 py-2.5 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 text-center transition-colors"
                                                    value={manualProduct[dim]} onChange={e => setManualProduct({ ...manualProduct, [dim]: parseInt(e.target.value) })} />
                                            </div>
                                        ))}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] md:text-[9px] text-slate-500 font-bold text-center block">수량</label>
                                            <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-lg px-2 py-2.5 md:py-1.5 text-xs md:text-[11px] outline-none focus:border-sky-500 text-center font-black text-sky-400 transition-colors"
                                                value={manualProduct.quantity} onChange={e => setManualProduct({ ...manualProduct, quantity: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={addManualProduct} className="w-full py-3 md:py-2 rounded-2xl md:rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs md:text-[11px] font-black transition-all border border-sky-400/20 shadow-lg mt-1 active:scale-[0.98]">
                                    리스트에 아이템 추가
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            {/* Product List */}
            <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-1 mb-3">
                    <div className="flex items-center gap-2 text-[13px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <Box className="w-4 h-4 md:w-3.5 md:h-3.5" />
                        적재 리스트
                        {products.length > 0 && (
                            <span className="ml-1 text-sky-500/80 font-black tracking-normal normal-case animate-in fade-in slide-in-from-left-2 transition-all">
                                총 {products.reduce((acc, p) => acc + p.quantity, 0).toLocaleString()} pkgs
                            </span>
                        )}
                    </div>
                    <button onClick={() => { setProducts([]); setResult(null); }} className="text-[11px] md:text-[10px] font-black text-rose-500 hover:text-rose-400 transition-colors uppercase tracking-tight">
                        전체 초기화
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2.5 min-h-[120px] pb-4">
                    {products.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem] opacity-20">
                            <Box className="w-10 h-10 mb-2" /><p className="text-sm font-black">비어 있음</p>
                        </div>
                    ) : (
                        products.map((p, idx) => (
                            <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={`${p.id}-${idx}`}
                                onMouseEnter={() => setActiveProduct(p.model_name)} onMouseLeave={() => setActiveProduct(null)}
                                className={`group relative px-3 py-1.5 md:px-3 md:py-2 rounded-[1rem] md:rounded-2xl border transition-all duration-300 ${activeProduct === p.model_name
                                    ? "bg-sky-500/10 border-sky-500 shadow-xl shadow-sky-500/5 scale-[1.02] md:scale-[1.01]"
                                    : (result?.unpacked.some(u => u.id === p.id)
                                        ? "bg-rose-500/5 border-rose-500/30 shadow-none"
                                        : "bg-[#11111a] border-white/5 hover:border-white/10")}`}
                            >
                                <div className="flex justify-between items-center mb-1.5">
                                    <h5 className={`text-[12px] md:text-[11px] font-bold truncate flex-1 min-w-0 pr-2 ${activeProduct === p.model_name ? "text-sky-400" : (result?.unpacked.some(u => u.id === p.id) ? "text-rose-400" : "text-slate-200")}`}>
                                        {p.model_name}
                                    </h5>
                                    <div className="flex items-center gap-3 md:gap-2 shrink-0">
                                        {result && (
                                            <div className="text-[10px] md:text-[9px] font-black uppercase tracking-tighter text-right">
                                                <span className="text-sky-500">OK {p.quantity - (result.unpacked.find(u => u.id === p.id)?.quantity || 0)}</span>
                                                {result.unpacked.find(u => u.id === p.id) && (
                                                    <span className="text-rose-500 ml-2 md:ml-1.5">FAIL {result.unpacked.find(u => u.id === p.id)?.quantity}</span>
                                                )}
                                            </div>
                                        )}
                                        <div className={`flex items-center gap-1 md:gap-0.5 px-2.5 py-1 md:px-1.5 md:py-0.5 rounded-xl md:rounded-lg text-[11px] md:text-[10px] font-black border focus-within:ring-2 transition-all ${result?.unpacked.some(u => u.id === p.id) ? "bg-rose-500/10 text-rose-400 border-rose-500/20 focus-within:ring-rose-500" : "bg-sky-500/10 text-sky-400 border-sky-500/20 focus-within:ring-sky-500"}`}>
                                            <span className="opacity-60 font-medium">Qty</span>
                                            <input type="number" min="1" value={p.quantity === 0 ? '' : p.quantity}
                                                onChange={(e) => {
                                                    const valStr = e.target.value;
                                                    const val = valStr === '' ? 0 : parseInt(valStr);
                                                    setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, quantity: isNaN(val) ? 0 : val } : prod));
                                                    setResult(null);
                                                }}
                                                onBlur={() => { if (!p.quantity || p.quantity < 1) setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, quantity: 1 } : prod)); }}
                                                className="w-8 md:w-6 bg-transparent border-none outline-none p-0 m-0 text-center font-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 md:gap-3">
                                        <span className="text-[11px] md:text-[10px] text-slate-500 font-bold whitespace-nowrap tracking-tight">{p.width}x{p.length}x{p.height}</span>
                                        <div className="flex gap-2 md:gap-1 border-l border-white/10 pl-4 md:pl-3">
                                            <button onClick={() => toggleProductFlag(p.id, 'allow_rotate')} className={`p-1 rounded-md md:rounded hover:bg-white/10 transition-colors ${p.allow_rotate ? "text-sky-400" : "text-slate-600"}`}>
                                                <RotateCw className="w-4 h-4 md:w-2.5 md:h-2.5" />
                                            </button>
                                            <button onClick={() => toggleProductFlag(p.id, 'allow_lay_down')} className={`p-1 rounded-md md:rounded hover:bg-white/10 transition-colors ${p.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}>
                                                <Move3d className="w-4 h-4 md:w-2.5 md:h-2.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <button onClick={() => removeProduct(p.id)} className="p-1 px-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all md:opacity-0 md:group-hover:opacity-100">
                                        <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </section>

            {/* Simulation Button — Desktop Only */}
            <div className="hidden md:flex gap-2 shrink-0 pt-2 border-t border-white/5">
                <div className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-2xl px-3 min-w-[100px] group hover:border-sky-500/50 transition-colors">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1 select-none">시도횟수(MAX 50)</span>
                    <input type="number" min="1" max="50" value={numPasses} onChange={handlePassesChange}
                        className="bg-transparent text-sky-400 font-bold text-center w-full outline-none text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                <button disabled={products.length === 0 || isLoading} onClick={runSimulation}
                    className="group relative flex items-center justify-center overflow-hidden flex-1 py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50 text-white font-black text-lg transition-all shadow-lg shadow-sky-500/20">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                    {isLoading ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <div className="flex items-center gap-2">
                            시뮬레이션 실행<ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                    )}
                </button>
            </div>
        </>
    );

    return (
        <>
            <style jsx global>{`
                input[type="date"]::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                    opacity: 0.5;
                }
            `}</style>

            {/* ──────────── 데스크탑 레이아웃 (md 이상) ──────────── */}
            <main className="hidden md:flex h-screen bg-[#030712] text-slate-100 overflow-hidden font-sans antialiased">
                <aside className="w-[460px] h-full flex flex-col border-r border-white/5 bg-[#0a0a0f] px-6 py-8 gap-8 z-20 overflow-hidden shadow-2xl shadow-black/80">
                    {controlPanel}
                </aside>
                <div className="flex-1 relative p-6 bg-[#030712]">
                    <ContainerViewer highlightedProduct={activeProduct} result={result} />
                    {/* Floating HUD info if needed */}
                </div>
            </main>

            {/* ──────────── 모바일 레이아웃 (md 미만) ──────────── */}
            <div className="md:hidden flex flex-col h-screen bg-[#030712] text-slate-100 overflow-hidden">

                {/* Mobile Floating Header (Always Fixed at Top) */}
                <header className="fixed top-0 left-0 right-0 z-[60] px-4 py-4 bg-[#030712]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package className="w-6 h-6 text-sky-500" />
                        <h1 className="text-base font-black tracking-tight uppercase">
                            CTNR <span className="text-sky-400">Optimizer</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-white/5 rounded-full text-slate-400">
                            <Settings2 className="w-5 h-5" />
                        </button>
                        <LogoutButton username={user.username} name={user.name} role={user.role} />
                    </div>
                </header>

                <div id="mobile-scroll-container" className="flex-1 flex flex-col overflow-y-auto mt-[68px] pb-32">
                    {/* 시뮬레이션 결과 뷰어 — 결과 있을 때만 상단 표시 */}
                    <AnimatePresence>
                        {result && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full shrink-0 bg-[#030712] border-b border-white/5 relative"
                            >
                                <ContainerViewer highlightedProduct={activeProduct} result={result} />
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-sky-500/20 border border-sky-500/30 text-[10px] font-black text-sky-400 uppercase tracking-widest backdrop-blur-md">
                                    3D Simulation Map
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 컨트롤 패널 — 스크롤 가능 영역 */}
                    <div ref={controlPanelRef} className="flex-1 flex flex-col px-4 py-5 gap-6 md:px-5 md:py-6 md:gap-8">
                        {controlPanel}
                    </div>
                </div>

                {/* 모바일 하단 고정 시뮬레이션 버튼 — Premium Floating Bar */}
                <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3 md:px-5 md:pb-8 md:pt-4 bg-gradient-to-t from-[#030712] via-[#030712]/95 to-transparent flex flex-col gap-3 md:gap-4">
                    <div className="flex gap-2 text-xs md:gap-3 items-end">
                        {/* Passes Count UI with Circle 'N' Style */}
                        <div className="relative flex items-center gap-2 md:gap-3 flex-shrink-0 bg-[#1a1a24] border border-white/10 rounded-[1.25rem] px-3 py-1.5 md:px-4 md:py-2 mt-auto">
                            <div className="w-8 h-8 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                                <span className="text-xs font-black text-sky-500 tracking-tighter">N</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Passes</span>
                                <input type="number" min="1" max="50" value={numPasses} onChange={handlePassesChange}
                                    className="bg-transparent text-sky-400 font-black text-lg w-10 outline-none leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </div>
                        </div>

                        {/* Large Action Button */}
                        <button disabled={products.length === 0 || isLoading} onClick={runSimulation}
                            className="flex-1 py-3 md:py-[1.125rem] rounded-[1.25rem] md:rounded-3xl bg-sky-500 hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50 text-white font-black text-[15px] md:text-[17px] transition-all flex items-center justify-center gap-2 md:gap-3 shadow-[0_12px_40px_rgba(56,189,248,0.3)] shadow-sky-500/20">
                            {isLoading ? (
                                <div className="w-5 h-5 md:w-6 md:h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>시뮬레이션 실행 <ChevronRight className="w-5 h-5 bg-white/20 rounded-full p-0.5" /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {/* Database Settings Modal */}
            <AnimatePresence>
                {isSettingsOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-sky-500/10 rounded-2xl">
                                    <Settings2 className="w-6 h-6 text-sky-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">DB 연결 설정</h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Database Configuration</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">Host 주소</label>
                                    <input value={dbConfig.host} onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" placeholder="localhost 또는 IP주소" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">DB 이름</label>
                                        <input value={dbConfig.database} onChange={e => setDbConfig({ ...dbConfig, database: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">Port</label>
                                        <input type="number" value={dbConfig.port} onChange={e => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">User ID</label>
                                    <input value={dbConfig.user} onChange={e => setDbConfig({ ...dbConfig, user: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">Password</label>
                                    <input type="password" value={dbConfig.password} onChange={e => setDbConfig({ ...dbConfig, password: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all" placeholder="비밀번호 입력" />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all">취소</button>
                                <button onClick={handleDbSave} className="flex-2 py-4 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/20">설정 저장</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
