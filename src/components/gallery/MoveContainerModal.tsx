import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, X, ArrowRight, Loader2 } from 'lucide-react';
import { ContainerFolder } from './PhotoGalleryTypes';

interface MoveContainerModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCount: number;
    existingFolders: ContainerFolder[];
    onMove: (targetCntrNo: string) => Promise<void>;
}

export default function MoveContainerModal({
    isOpen,
    onClose,
    selectedCount,
    existingFolders,
    onMove
}: MoveContainerModalProps) {
    const [targetCntrNo, setTargetCntrNo] = useState('');
    const [isMoving, setIsMoving] = useState(false);

    if (!isOpen) return null;

    const handleExecute = async () => {
        const trimmed = targetCntrNo.trim().toUpperCase();
        if (!trimmed) {
            alert('이동할 컨테이너 번호를 입력해 주세요.');
            return;
        }
        setIsMoving(true);
        try {
            await onMove(trimmed);
            setTargetCntrNo('');
            onClose();
        } catch (e) {
            console.error('Move error:', e);
        } finally {
            setIsMoving(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={() => !isMoving && onClose()}
                    className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                />
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-md bg-[#0e111c] border border-indigo-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden p-7 z-10 text-slate-100"
                >
                    <div className="flex items-center justify-between gap-3 mb-5 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                                <Folder className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    📦 컨테이너 사진 이동
                                </h2>
                                <p className="text-xs text-indigo-400 font-bold">
                                    선택한 사진을 다른 컨테이너로 위치 변경
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            disabled={isMoving}
                            className="p-2 rounded-xl bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="p-3.5 bg-black/40 border border-white/5 rounded-2xl text-xs space-y-1">
                            <div className="text-slate-400 font-bold">이동 대상 사진:</div>
                            <div className="text-indigo-400 font-black text-sm font-mono">
                                총 {selectedCount}장 선택됨
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                                목표 컨테이너 번호 입력
                            </label>
                            <input
                                type="text"
                                placeholder="예: TCLU4912355"
                                value={targetCntrNo}
                                onChange={(e) => setTargetCntrNo(e.target.value.toUpperCase())}
                                className="w-full bg-black/60 border border-indigo-500/30 focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white uppercase outline-none transition-all placeholder:text-slate-600"
                                autoFocus
                            />
                        </div>

                        {/* Quick selector of existing folders */}
                        {existingFolders.length > 0 && (
                            <div className="space-y-1.5">
                                <div className="text-[11px] font-bold text-slate-400">기존 컨테이너에서 선택:</div>
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-black/30 rounded-xl border border-white/5">
                                    {existingFolders.slice(0, 15).map((f, idx) => (
                                        <button
                                            key={`${f.cntrNo}_${f.workDateStr}_${idx}`}
                                            type="button"
                                            onClick={() => setTargetCntrNo(f.cntrNo)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black transition-all cursor-pointer border ${
                                                targetCntrNo === f.cntrNo
                                                    ? "bg-indigo-600 text-white border-indigo-400"
                                                    : "bg-white/5 text-slate-300 hover:text-white border-white/10 hover:bg-white/10"
                                            }`}
                                        >
                                            {f.cntrNo}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isMoving}
                                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs transition-all cursor-pointer"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleExecute}
                                disabled={isMoving || !targetCntrNo.trim()}
                                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                {isMoving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        이동 중...
                                    </>
                                ) : (
                                    <>
                                        이동 완료
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
