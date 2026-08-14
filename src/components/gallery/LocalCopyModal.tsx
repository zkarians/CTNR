import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, X, Loader2, RefreshCw, SkipForward } from 'lucide-react';
import { ContainerFolder } from './PhotoGalleryTypes';

interface LocalCopyModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedFolders: ContainerFolder[];
}

export default function LocalCopyModal({
    isOpen,
    onClose,
    selectedFolders
}: LocalCopyModalProps) {
    const [localCopyPath, setLocalCopyPath] = useState('');
    const [isCopying, setIsCopying] = useState(false);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [copyProgress, setCopyProgress] = useState({
        current: 0,
        total: 0,
        percent: 0,
        currentFile: '',
        copiedCount: 0,
        skippedCount: 0
    });
    const abortControllerRef = useRef<AbortController | null>(null);

    if (!isOpen) return null;

    const handleBrowseFolder = async () => {
        try {
            const res = await fetch('/api/photos/select-local-folder');
            const data = await res.json();
            if (data.folderPath) {
                setLocalCopyPath(data.folderPath);
            }
        } catch (e) {
            console.error('Select folder error:', e);
        }
    };

    const handleStartCopy = () => {
        if (!localCopyPath.trim()) {
            alert('복사 대상 로컬 폴더 경로를 입력하거나 선택해 주세요.');
            return;
        }
        setIsConflictModalOpen(true);
    };

    const executeLocalCopy = async (conflictAction: 'overwrite' | 'skip') => {
        setIsConflictModalOpen(false);
        setIsCopying(true);
        setCopyProgress({ current: 0, total: 0, percent: 0, currentFile: '', copiedCount: 0, skippedCount: 0 });

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const photoIds = selectedFolders.flatMap(f => f.photos.map(p => p.id));
            const response = await fetch('/api/photos/local-copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: photoIds,
                    targetPath: localCopyPath.trim(),
                    conflictAction
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errData = await response.json();
                alert(`로컬 복사 실패: ${errData.error || '알 수 없는 오류'}`);
                setIsCopying(false);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);
                        if (event.type === 'progress') {
                            setCopyProgress({
                                current: event.current,
                                total: event.total,
                                percent: event.percent,
                                currentFile: event.currentFile,
                                copiedCount: event.copiedCount,
                                skippedCount: event.skippedCount
                            });
                        } else if (event.type === 'done') {
                            alert(event.message || '로컬 폴더 복사가 완료되었습니다.');
                            setIsCopying(false);
                            onClose();
                            return;
                        } else if (event.type === 'aborted') {
                            alert('로컬 복사가 중지되었습니다.');
                            setIsCopying(false);
                            return;
                        }
                    } catch (err) {
                        console.error('Parse event error:', err);
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error('Local copy error:', error);
                alert(`로컬 복사 중 오류: ${error.message}`);
            }
        } finally {
            setIsCopying(false);
        }
    };

    const handleStopCopy = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={() => !isCopying && onClose()} 
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                />
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl">
                            <Folder className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">로컬 폴더로 복사</h2>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Direct Local File Copy</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 leading-relaxed">
                            선택한 <strong className="text-emerald-400">{selectedFolders.length}개</strong> 컨테이너 폴더를 지정한 로컬 디렉토리로 압축 없이 즉시 복사합니다.
                        </p>
                        
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-500 ml-1">대상 폴더 경로 (PC 경로)</label>
                            <div className="flex gap-2">
                                <input 
                                    value={localCopyPath} 
                                    onChange={e => setLocalCopyPath(e.target.value)}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-emerald-500 outline-none text-slate-200 transition-all placeholder:text-slate-600 font-mono" 
                                    placeholder="예: D:\MyDownloads 또는 C:\Users\Downloads" 
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleStartCopy();
                                    }}
                                />
                                <button
                                    onClick={handleBrowseFolder}
                                    className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-xs transition-all flex items-center justify-center shrink-0 cursor-pointer"
                                    title="폴더 선택"
                                    disabled={isCopying}
                                >
                                    찾아보기...
                                </button>
                            </div>
                        </div>

                        {/* Progress Bar Display */}
                        {isCopying && (
                            <div className="space-y-2 p-3 bg-black/40 border border-emerald-500/30 rounded-2xl">
                                <div className="flex items-center justify-between text-xs font-bold">
                                    <span className="text-emerald-400 flex items-center gap-1.5">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        복사 진행 중 ({copyProgress.percent}%)
                                    </span>
                                    <span className="text-slate-400 font-mono">
                                        {copyProgress.current} / {copyProgress.total} 파일
                                    </span>
                                </div>
                                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-200 rounded-full shadow-lg shadow-emerald-500/50"
                                        style={{ width: `${copyProgress.percent}%` }}
                                    />
                                </div>
                                {copyProgress.currentFile && (
                                    <div className="text-[11px] text-slate-400 truncate font-mono">
                                        현재 파일: {copyProgress.currentFile}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 mt-6">
                        {isCopying ? (
                            <button 
                                onClick={handleStopCopy} 
                                className="flex-1 py-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500 text-rose-400 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/10 cursor-pointer"
                            >
                                <X className="w-4 h-4" /> 복사 중지
                            </button>
                        ) : (
                            <button 
                                onClick={onClose} 
                                className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all cursor-pointer"
                            >
                                취소
                            </button>
                        )}

                        <button 
                            onClick={handleStartCopy} 
                            disabled={isCopying || !localCopyPath.trim()}
                            className={`flex-2 py-4 px-8 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                                isCopying || !localCopyPath.trim()
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none' 
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20 cursor-pointer'
                            }`}
                        >
                            {isCopying ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                    복사 중... ({copyProgress.percent}%)
                                </>
                            ) : (
                                '복사 시작'
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>

            {/* Duplicate Conflict Selection Sub-Modal */}
            {isConflictModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        onClick={() => setIsConflictModalOpen(false)} 
                        className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                    />
                    <motion.div 
                        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                        animate={{ scale: 1, opacity: 1, y: 0 }} 
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10 text-slate-100"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                                <RefreshCw className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white">중복 파일 처리 방식 선택</h2>
                                <p className="text-xs text-slate-500 font-bold">복사 위치에 동일한 파일이 존재하는 경우</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed mb-6">
                            지정한 로컬 폴더에 이미 동일한 이름의 파일이나 폴더가 존재할 때 어떻게 처리할까요?
                        </p>

                        <div className="space-y-3">
                            <button 
                                onClick={() => executeLocalCopy('overwrite')}
                                className="w-full p-4 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
                            >
                                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 mt-0.5 group-hover:scale-110 transition-transform">
                                    <RefreshCw className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-sky-400 mb-0.5">🔄 덮어쓰기 (Overwrite)</div>
                                    <div className="text-[11px] text-slate-400">기존 파일이 있으면 최신 파일로 자동 교체합니다.</div>
                                </div>
                            </button>

                            <button 
                                onClick={() => executeLocalCopy('skip')}
                                className="w-full p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
                            >
                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5 group-hover:scale-110 transition-transform">
                                    <SkipForward className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-amber-400 mb-0.5">⏭️ 건너뛰기 (Skip)</div>
                                    <div className="text-[11px] text-slate-400">이미 복사된 파일은 건너뛰고 누락된 파일만 복사합니다.</div>
                                </div>
                            </button>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
                            <button 
                                onClick={() => setIsConflictModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs transition-all cursor-pointer"
                            >
                                닫기
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
