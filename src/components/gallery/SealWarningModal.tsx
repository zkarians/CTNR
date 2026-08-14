import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { ActionType } from './PhotoGalleryTypes';

interface SealWarningModalProps {
    isOpen: boolean;
    missingCntrs: string[];
    onClose: () => void;
    onProceed: () => void;
}

export default function SealWarningModal({
    isOpen,
    missingCntrs,
    onClose,
    onProceed
}: SealWarningModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={onClose}
                    className="absolute inset-0 bg-black/75 backdrop-blur-md" 
                />
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-md bg-[#13111c] border border-amber-500/40 rounded-[2.5rem] shadow-2xl overflow-hidden p-7 z-10 text-slate-100"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">봉인(Seal) 사진 누락 경고</h2>
                            <p className="text-xs text-amber-400 font-bold">확인 후 작업을 계속 진행할 수 있습니다.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs text-slate-300 leading-relaxed">
                            선택하신 폴더 중 아래 <strong className="text-amber-400">{missingCntrs.length}개</strong> 컨테이너에 <strong>봉인(Seal) 사진</strong>이 등록되지 않았습니다:
                        </p>

                        <div className="max-h-36 overflow-y-auto p-3 bg-black/40 border border-white/5 rounded-2xl space-y-1.5 font-mono text-xs text-slate-300 font-bold">
                            {missingCntrs.map((cntr, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-amber-300">
                                    <span>•</span>
                                    <span>{cntr}</span>
                                </div>
                            ))}
                        </div>

                        <p className="text-[11px] text-slate-400">
                            봉인 사진이 없어도 작업을 계속 진행하시겠습니까?
                        </p>

                        <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs transition-all cursor-pointer"
                            >
                                취소 (사진 확인하기)
                            </button>
                            <button
                                type="button"
                                onClick={onProceed}
                                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#07070d] font-black text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                            >
                                계속 진행
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
