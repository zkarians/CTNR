import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Loader2, RotateCw } from 'lucide-react';

export interface GDriveProgress {
    current: number;
    total: number;
    percent: number;
    currentFile: string;
    status: string;
    uploadedCount: number;
    skippedCount: number;
    cleanedCount: number;
    freedMB: string;
    alreadyDoneCount: number;
}

interface GDriveSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    isUploading: boolean;
    progress: GDriveProgress;
    onStopUpload: () => void;
    onResumeUpload: () => void;
}

export default function GDriveSyncModal({
    isOpen,
    onClose,
    isUploading,
    progress,
    onStopUpload,
    onResumeUpload
}: GDriveSyncModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                />
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-lg bg-[#0e111c] border border-sky-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10 text-slate-100"
                >
                    <div className="flex items-center justify-between gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-sky-500/10 rounded-2xl text-sky-400 border border-sky-500/20">
                                <Upload className={`w-6 h-6 ${isUploading ? "animate-bounce" : ""}`} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    ☁️ 구글 드라이브 실시간 백업
                                </h2>
                                <p className="text-xs text-sky-400 font-bold">
                                    {isUploading ? "안전하게 업로드 및 디스크 정리 중..." : "작업 완료됨"}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            disabled={isUploading}
                            className={`p-2 rounded-xl border transition-all ${
                                isUploading 
                                    ? "bg-white/5 border-white/5 text-slate-600 cursor-not-allowed" 
                                    : "bg-white/10 border-white/10 text-slate-300 hover:text-white hover:bg-white/20 cursor-pointer"
                            }`}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Main Progress Display */}
                    <div className="space-y-5">
                        {/* Percentage & Status Badge */}
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-3xl font-black text-white tracking-tight font-mono">
                                    {progress.percent}%
                                </div>
                                <div className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                                    <span>처리 진행:</span>
                                    <strong className="text-sky-400 font-mono text-sm">{progress.current}</strong>
                                    <span>/</span>
                                    <span className="font-mono text-slate-300">{progress.total} 장</span>
                                    {progress.alreadyDoneCount > 0 && (
                                        <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md ml-1" title="전체 대상 중 백업을 시작하기 전 이미 구글드라이브에 완비되어 있던 사진 수량입니다.">
                                            기존 보관 완료 (총 {progress.alreadyDoneCount}장 스킵)
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl inline-block font-mono">
                                    💾 {progress.freedMB} MB 확보
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar Track */}
                        <div className="w-full h-3.5 bg-black/60 border border-white/10 rounded-full overflow-hidden p-0.5">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 rounded-full shadow-lg shadow-sky-500/50"
                                initial={{ width: "0%" }}
                                animate={{ width: `${progress.percent}%` }}
                                transition={{ duration: 0.2 }}
                            />
                        </div>

                        {/* Current File Banner */}
                        <div className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-1">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Loader2 className={`w-3.5 h-3.5 text-sky-400 ${isUploading ? "animate-spin" : ""}`} />
                                현재 작업 대상:
                            </div>
                            <div className="text-xs font-mono text-slate-200 truncate font-semibold">
                                {progress.currentFile || "대기 중..."}
                            </div>
                        </div>

                        {/* Summary Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                            <div className="p-2.5 bg-sky-500/5 border border-sky-500/10 rounded-xl">
                                <div className="text-[10px] font-bold text-slate-500">신규 백업</div>
                                <div className="text-sm font-black text-sky-400 font-mono mt-0.5">{progress.uploadedCount}장</div>
                            </div>
                            <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                <div className="text-[10px] font-bold text-slate-500">기존 보관 스킵</div>
                                <div className="text-sm font-black text-amber-400 font-mono mt-0.5">{progress.skippedCount}장</div>
                            </div>
                            <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                <div className="text-[10px] font-bold text-slate-500">로컬 삭제 정리</div>
                                <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">{progress.cleanedCount}장</div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-end gap-2">
                            {isUploading ? (
                                <button 
                                    onClick={onStopUpload}
                                    className="w-full py-3 rounded-xl bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/10"
                                >
                                    <X className="w-4 h-4" /> 백업 중단 (Cancel)
                                </button>
                            ) : (
                                <>
                                    {progress.percent < 100 && (
                                        <button 
                                            onClick={onResumeUpload}
                                            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 border border-sky-400 text-white font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-sky-500/30 animate-pulse"
                                            title="폴더 재선택 없이 끊긴 미완료 사진만 자동으로 이어서 백업"
                                        >
                                            <RotateCw className="w-4 h-4" /> 🔄 끊긴 사진 자동 이어서 재전송
                                        </button>
                                    )}
                                    <button 
                                        onClick={onClose}
                                        className={`py-3 rounded-xl text-white font-black text-xs transition-all cursor-pointer shadow-lg ${
                                            progress.percent < 100 
                                                ? "px-5 bg-white/10 hover:bg-white/20 border border-white/10 shrink-0" 
                                                : "w-full bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20"
                                        }`}
                                    >
                                        닫기 (Close)
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
