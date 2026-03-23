"use client";

import React, { useState, useEffect } from 'react';
import {
    Search,
    Box,
    Package,
    Truck,
    RotateCw,
    Plus,
    Trash2,
    Settings2,
    Play,
    Info,
    Maximize,
    ChevronRight,
    Filter,
    Calendar,
    Briefcase,
    Move3d,
    Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ContainerViewer from '@/components/ContainerViewer';
import {
    Product,
    PackingResult,
    ContainerType,
    CONTAINER_DATA,
    Job,
    JobFilters
} from '@/lib/types';
import { packContainer } from '@/lib/packer';
import { fetchJobs, fetchProductsByJob, searchProducts } from '@/lib/actions';

export default function Home() {
    const [selectedContainer, setSelectedContainer] = useState<ContainerType>('40hc');
    const [products, setProducts] = useState<Product[]>([]);
    const [result, setResult] = useState<PackingResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [highlightedProduct, setHighlightedProduct] = useState<string | null>(null);

    // Job Selection State
    const [jobs, setJobs] = useState<Job[]>([]);
    const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(true);
    const [filters, setFilters] = useState<JobFilters>({
        startDate: '',
        endDate: '',
        productName: '',
        containerNo: ''
    });

    // Manual Input State
    const [manualProduct, setManualProduct] = useState({
        model_name: '',
        width: 1000,
        length: 800,
        height: 1200,
        quantity: 10,
        allow_rotate: true,
        allow_lay_down: false
    });
    const [searchResults, setSearchResults] = useState<Product[]>([]);

    useEffect(() => {
        loadJobs();
    }, []);

    const loadJobs = async () => {
        setIsLoading(true);
        const data = await fetchJobs(filters);
        setJobs(data);
        setIsLoading(false);
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const applyFilters = () => {
        loadJobs();
    };

    const handleSearch = async (query: string) => {
        setManualProduct(prev => ({ ...prev, model_name: query }));
        if (query.length >= 2) {
            const results = await searchProducts(query);
            setSearchResults(results);
        } else {
            setSearchResults([]);
        }
    };

    const selectSearchResult = (p: Product) => {
        setManualProduct({
            model_name: p.model_name,
            width: p.width,
            length: p.length,
            height: p.height,
            quantity: 10,
            allow_rotate: p.allow_rotate,
            allow_lay_down: p.allow_lay_down
        });
        setSearchResults([]);
    };

    const [numPasses, setNumPasses] = useState(10);

    const handlePassesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = parseInt(e.target.value);
        if (isNaN(val)) val = 1;
        if (val > 50) {
            val = 50;
            alert("최대 50회까지 입력 가능합니다.");
        }
        setNumPasses(val);
    };

    const runSimulation = () => {
        if (products.length === 0) return;
        setIsLoading(true);
        setTimeout(() => {
            const container = CONTAINER_DATA[selectedContainer];
            const result = packContainer(container, products, numPasses);
            setResult(result);
            setIsLoading(false);
        }, 100);
    };

    const handleJobSelect = async (jobId: number) => {
        setSelectedJobId(jobId);
        setIsFilterOpen(false); // 컨테이너 클릭 시 조회화면(필터) 닫기
        setIsLoading(true);
        const data = await fetchProductsByJob(jobId);
        setProducts(data);
        setResult(null); // 신규 조회 시 결과 초기화
        setIsLoading(false);
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            setSelectedContainer(job.container_type);
        }
    };

    const addManualProduct = () => {
        const newProd: Product = {
            id: `manual_${Date.now()}`,
            model_name: manualProduct.model_name,
            width: manualProduct.width,
            length: manualProduct.length,
            height: manualProduct.height,
            quantity: manualProduct.quantity,
            allow_rotate: manualProduct.allow_rotate,
            allow_lay_down: manualProduct.allow_lay_down
        };
        setProducts(prev => [...prev, newProd]);
        setResult(null);
    };

    const toggleProductFlag = (id: string, field: 'allow_rotate' | 'allow_lay_down') => {
        setProducts(prev => prev.map(p =>
            p.id === id ? { ...p, [field]: !p[field] } : p
        ));
        setResult(null);
    };

    const removeProduct = (id: string) => {
        setProducts(prev => prev.filter(p => p.id !== id));
        setResult(null);
    };

    const getCarrierColor = (transporter: string | undefined) => {
        if (!transporter) return "text-slate-300";
        if (transporter.includes("천마")) return "text-rose-500 font-black";
        if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-sky-500 font-black";
        return "text-slate-300";
    };

    const [activeProduct, setActiveProduct] = useState<string | null>(null);

    const [isManualAddOpen, setIsManualAddOpen] = useState(false);

    return (
        <main className="flex h-screen bg-[#030712] text-slate-100 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[460px] h-full flex flex-col border-r border-white/5 bg-[#0a0a0f] px-5 py-6 gap-6 z-20 overflow-hidden">
                <div className="flex items-center gap-3 mb-2 shrink-0">
                    <Package className="w-8 h-8 text-sky-500" />
                    <h1 className="text-xl font-black tracking-tight uppercase">CTNR <span className="text-sky-500">Optimizer</span></h1>
                </div>

                {/* Job Selection with Search */}
                <section className="space-y-4 shrink-0">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <Briefcase className="w-4 h-4" />
                            작업 데이터 조회
                        </div>
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors"
                        >
                            <Filter className={`w-4 h-4 ${isFilterOpen ? "text-sky-500" : ""}`} />
                        </button>
                    </div>

                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden space-y-3"
                            >
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-bold ml-1">시작일</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                                            <input
                                                type="date"
                                                name="startDate"
                                                value={filters.startDate}
                                                onChange={handleFilterChange}
                                                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-bold ml-1">종료일</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                                            <input
                                                type="date"
                                                name="endDate"
                                                value={filters.endDate}
                                                onChange={handleFilterChange}
                                                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Package className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            placeholder="제품명 검색..."
                                            name="productName"
                                            value={filters.productName}
                                            onChange={handleFilterChange}
                                            className="w-full bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Truck className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            placeholder="컨테이너 번호 검색..."
                                            name="containerNo"
                                            value={filters.containerNo}
                                            onChange={handleFilterChange}
                                            className="w-full bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={applyFilters}
                                        className="w-full py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500 hover:text-white transition-all flex items-center justify-center gap-2"
                                    >
                                        <Search className="w-3.5 h-3.5" />
                                        조회하기
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-2 overflow-y-auto max-h-[160px] custom-scrollbar pr-1">
                        {jobs.length === 0 && !isLoading ? (
                            <div className="flex flex-col items-center justify-center p-6 bg-white/5 border border-white/5 rounded-2xl opacity-40">
                                <Search className="w-6 h-6 mb-2" />
                                <p className="text-[10px] font-medium italic">조회 결과가 없습니다.</p>
                            </div>
                        ) : (
                            jobs.map((job) => (
                                <button
                                    key={job.id}
                                    onClick={() => handleJobSelect(job.id)}
                                    className={`w-full px-4 py-3 rounded-2xl text-left border transition-all duration-300 flex items-center justify-between group ${selectedJobId === job.id
                                        ? "bg-sky-500/10 border-sky-500 shadow-[0_0_20px_rgba(56,189,248,0.1)]"
                                        : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.07]"
                                        }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`text-sm font-black truncate ${getCarrierColor(job.transporter)}`}>
                                            {job.cntr_no || "번호없음"}
                                        </div>
                                        <span className={`text-[10px] font-bold shrink-0 opacity-40 group-hover:opacity-60 transition-opacity`}>
                                            [{job.transporter ? (job.transporter.includes("천마") ? "천마" : (job.transporter.includes("BNI") || job.transporter.includes("비엔아이") ? "BNI" : job.transporter.split('(')[0])) : "미정"}]
                                        </span>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-600 shrink-0 tabular-nums">
                                        {job.work_date}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </section>

                {/* Container Selection & Manual Add */}
                <section className="space-y-4 shrink-0">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <Settings2 className="w-4 h-4" />
                            컨테이너 및 제품 등록
                        </div>
                        <button
                            onClick={() => setIsManualAddOpen(!isManualAddOpen)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black hover:bg-sky-500 hover:text-white transition-all"
                        >
                            <Plus className={`w-3 h-3 transition-transform duration-300 ${isManualAddOpen ? "rotate-45" : ""}`} />
                            제품추가
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(CONTAINER_DATA) as ContainerType[]).map((key) => (
                            <button
                                key={key}
                                onClick={() => setSelectedContainer(key)}
                                className={`p-2 rounded-xl text-left border transition-all duration-300 ${selectedContainer === key
                                    ? "bg-sky-500/10 border-sky-500 text-sky-400"
                                    : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                                    }`}
                            >
                                <p className="text-[10px] font-bold truncate">{CONTAINER_DATA[key].name}</p>
                            </button>
                        ))}
                    </div>

                    <AnimatePresence>
                        {isManualAddOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-2 relative">
                                    <div className="flex justify-between items-center">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">개별 제품 추가</p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setManualProduct({ ...manualProduct, allow_rotate: !manualProduct.allow_rotate })}
                                                className={`flex items-center gap-1 text-[9px] font-bold transition-colors ${manualProduct.allow_rotate ? "text-sky-400" : "text-slate-600"}`}
                                                title="가로/세로 회전 허용"
                                            >
                                                <RotateCw className="w-3 h-3" /> 돌리기
                                            </button>
                                            <button
                                                onClick={() => setManualProduct({ ...manualProduct, allow_lay_down: !manualProduct.allow_lay_down })}
                                                className={`flex items-center gap-1 text-[9px] font-bold transition-colors ${manualProduct.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}
                                                title="눕히기 (가로x높이 등) 허용"
                                            >
                                                <Move3d className="w-3 h-3" /> 눕히기
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <label className="text-[9px] text-slate-500 font-bold ml-1">모델명 검색</label>
                                            <input
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] outline-none focus:border-sky-500"
                                                placeholder="모델명 입력 (예: sk)"
                                                value={manualProduct.model_name}
                                                onChange={e => handleSearch(e.target.value)}
                                            />
                                            {searchResults.length > 0 && (
                                                <div className="absolute z-30 bottom-full left-0 w-full mb-1 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">
                                                    {searchResults.map((p, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => selectSearchResult(p)}
                                                            className="w-full px-4 py-2.5 text-left text-[11px] hover:bg-sky-500/20 border-b border-white/5 last:border-0 transition-colors"
                                                        >
                                                            <div className="font-bold text-slate-200">{p.model_name}</div>
                                                            <div className="text-[10px] text-slate-500">{p.width}x{p.length}x{p.height}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-slate-500 font-bold ml-1 text-center block">가로(W)</label>
                                                <input
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-sky-500 text-center"
                                                    type="number"
                                                    value={manualProduct.width}
                                                    onChange={e => setManualProduct({ ...manualProduct, width: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-slate-500 font-bold ml-1 text-center block">세로(L)</label>
                                                <input
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-sky-500 text-center"
                                                    type="number"
                                                    value={manualProduct.length}
                                                    onChange={e => setManualProduct({ ...manualProduct, length: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-slate-500 font-bold ml-1 text-center block">높이(H)</label>
                                                <input
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-sky-500 text-center"
                                                    type="number"
                                                    value={manualProduct.height}
                                                    onChange={e => setManualProduct({ ...manualProduct, height: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] text-slate-500 font-bold ml-1 text-center block">수량</label>
                                                <input
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none focus:border-sky-500 text-center font-bold text-sky-400"
                                                    type="number"
                                                    value={manualProduct.quantity}
                                                    onChange={e => setManualProduct({ ...manualProduct, quantity: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={addManualProduct}
                                        className="w-full py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-white text-[11px] font-black transition-all border border-sky-500/20 shadow-lg mt-1"
                                    >
                                        리스트에 아이템 추가
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                <section className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between px-1 mb-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            <Box className="w-4 h-4" />
                            적재 리스트
                            {products.length > 0 && (
                                <span className="ml-1 text-sky-500/80 font-black tracking-normal normal-case animate-in fade-in slide-in-from-left-1 duration-500">
                                    총 {products.reduce((acc, p) => acc + p.quantity, 0).toLocaleString()} pkgs
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => { setProducts([]); setResult(null); }}
                            className="text-[10px] font-black text-rose-500 hover:text-rose-400 transition-colors uppercase"
                        >
                            전체 초기화
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {products.length === 0 ? (
                            <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl opacity-20">
                                <Box className="w-8 h-8 mb-2" />
                                <p className="text-[10px] font-bold">비어 있음</p>
                            </div>
                        ) : (
                            products.map((p, i) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    key={p.id}
                                    onMouseEnter={() => setActiveProduct(p.model_name)}
                                    onMouseLeave={() => setActiveProduct(null)}
                                    className={`group relative px-3 py-2 rounded-2xl border transition-all duration-300 ${activeProduct === p.model_name
                                        ? "bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-500/5 scale-[1.01]"
                                        : (result?.unpacked.some(u => u.id === p.id)
                                            ? "bg-rose-500/5 border-rose-500/30"
                                            : "bg-white/5 border-white/5 hover:border-white/20")
                                        }`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <h5 className={`text-[11px] font-bold truncate flex-1 min-w-0 pr-2 ${activeProduct === p.model_name ? "text-sky-400" : (result?.unpacked.some(u => u.id === p.id) ? "text-rose-400" : "text-slate-200")}`}>
                                            {p.model_name}
                                        </h5>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {result && (
                                                <div className="text-[9px] font-bold uppercase tracking-tighter text-right">
                                                    <span className="text-sky-500">OK {p.quantity - (result.unpacked.find(u => u.id === p.id)?.quantity || 0)}</span>
                                                    {result.unpacked.find(u => u.id === p.id) && (
                                                        <span className="text-rose-500 ml-1.5">FAIL {result.unpacked.find(u => u.id === p.id)?.quantity}</span>
                                                    )}
                                                </div>
                                            )}
                                            <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black border ${result?.unpacked.some(u => u.id === p.id) ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-sky-500/10 text-sky-400 border-sky-500/20"}`}>
                                                x{p.quantity}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{p.width}x{p.length}x{p.height}</span>
                                            <div className="flex gap-1 border-l border-white/10 pl-3">
                                                <button
                                                    onClick={() => toggleProductFlag(p.id, 'allow_rotate')}
                                                    className={`p-1 rounded hover:bg-white/10 transition-colors ${p.allow_rotate ? "text-sky-400" : "text-slate-600"}`}
                                                    title="회전 허용"
                                                >
                                                    <RotateCw className="w-2.5 h-2.5" />
                                                </button>
                                                <button
                                                    onClick={() => toggleProductFlag(p.id, 'allow_lay_down')}
                                                    className={`p-1 rounded hover:bg-white/10 transition-colors ${p.allow_lay_down ? "text-indigo-400" : "text-slate-600"}`}
                                                    title="눕히기 허용"
                                                >
                                                    <Move3d className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => removeProduct(p.id)}
                                            className="p-1 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </section>

                {/* Simulation Control */}
                <div className="flex gap-2 shrink-0">
                    <div className="flex flex-col items-center justify-center bg-white/5 border border-white/5 rounded-2xl px-3 min-w-[100px] group hover:border-sky-500/50 transition-colors">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1 select-none">시도횟수(MAX 50)</span>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={numPasses}
                            onChange={handlePassesChange}
                            className="bg-transparent text-sky-400 font-bold text-center w-full outline-none text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    </div>
                    <button
                        disabled={products.length === 0 || isLoading}
                        onClick={runSimulation}
                        className="flex-1 py-4 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:hover:bg-sky-500 text-white font-black transition-all flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(56,189,248,0.2)] group"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <div className="flex items-center gap-2">
                                시뮬레이션 실행
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </div>
                        )}
                    </button>
                </div>
            </aside>

            {/* Viewer Area */}
            <div className="flex-1 relative p-6 bg-[#030712]">
                <ContainerViewer highlightedProduct={activeProduct} result={result} />
            </div>
        </main>
    );
}
