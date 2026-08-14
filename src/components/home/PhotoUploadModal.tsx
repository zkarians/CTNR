'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Job } from '@/lib/types';

export interface PhotoUploadModalProps {
    uploadJob: Job | null;
    uploadPhotoType: 'normal' | 'seal';
    onClose: () => void;
    uploadFiles: File[];
    setUploadFiles: React.Dispatch<React.SetStateAction<File[]>>;
    uploadCntrNo: string;
    setUploadCntrNo: (val: string) => void;
    uploadDurationMinutes: number | '';
    setUploadDurationMinutes: React.Dispatch<React.SetStateAction<number | ''>>;
    uploadEmptyBoxes: { name: string; qty: number }[];
    setUploadEmptyBoxes: React.Dispatch<React.SetStateAction<{ name: string; qty: number }[]>>;
    uploadRemark: string;
    setUploadRemark: (val: string) => void;
    isUploading: boolean;
    uploadProgressText: string;
    handlePhotoUpload: () => void;
    onOpenGalleryForCntr: (cntrNo: string) => void;
}

export default function PhotoUploadModal({
    uploadJob,
    uploadPhotoType,
    onClose,
    uploadFiles,
    setUploadFiles,
    uploadCntrNo,
    setUploadCntrNo,
    uploadDurationMinutes,
    setUploadDurationMinutes,
    uploadEmptyBoxes,
    setUploadEmptyBoxes,
    uploadRemark,
    setUploadRemark,
    isUploading,
    uploadProgressText,
    handlePhotoUpload,
    onOpenGalleryForCntr
}: PhotoUploadModalProps) {
    if (!uploadJob) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }} 
                    onClick={() => { if (!isUploading) onClose(); }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 max-h-[90vh] flex flex-col"
                >
                    <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`p-3 rounded-2xl shrink-0 ${uploadPhotoType === 'seal' ? 'bg-rose-500/10' : 'bg-sky-500/10'}`}>
                                <Camera className={`w-6 h-6 ${uploadPhotoType === 'seal' ? 'text-rose-500' : 'text-sky-500'}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h2 className={`text-lg font-black truncate ${uploadPhotoType === 'seal' ? 'text-rose-400' : 'text-white'}`}>
                                        {uploadPhotoType === 'seal' ? '🔴 씰(Seal) 사진 등록' : '사진 완료 등록'}
                                    </h2>
                                    {uploadJob.photo_count && uploadJob.photo_count > 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const targetCntr = uploadJob.cntr_no;
                                                onClose();
                                                if (targetCntr) {
                                                    onOpenGalleryForCntr(targetCntr);
                                                }
                                            }}
                                            className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                            title="이 컨테이너의 사진함으로 직접 이동"
                                        >
                                            <ImageIcon className="w-3 h-3" />
                                            <span>사진함 보기 ({uploadJob.photo_count})</span>
                                        </button>
                                    ) : null}
                                </div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">
                                    {uploadJob.cntr_no || "번호없음"} ({uploadJob.transporter ? (uploadJob.transporter.includes("천마") ? "천마" : (uploadJob.transporter.includes("BNI") || uploadJob.transporter.includes("비엔아이") ? "BNI" : uploadJob.transporter.split('(')[0])) : "미정"})
                                    {(uploadJob.model_count && uploadJob.total_qty) ? ` (${uploadJob.model_count}모델 / ${uploadJob.total_qty}개)` : ''}
                                </p>
                            </div>
                        </div>
                        <button 
                            disabled={isUploading}
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-rose-500 transition-colors shrink-0 disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-5 pb-2">
                        <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            id="photo-upload-modal-input" 
                            multiple
                            disabled={isUploading}
                            onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                    setUploadFiles(Array.from(e.target.files));
                                }
                            }} 
                        />
                        
                        <label htmlFor="photo-upload-modal-input" className={`flex items-center justify-center gap-3 border-2 border-dashed border-white/10 rounded-2xl py-3.5 px-4 transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-500 hover:bg-sky-500/5 cursor-pointer'}`}>
                            {uploadFiles.length > 0 ? (
                                <div className="flex items-center gap-2 text-center">
                                    <ImageIcon className="w-5 h-5 text-sky-400 shrink-0 animate-pulse" />
                                    <p className="text-xs font-bold text-slate-200 truncate max-w-[200px]">선택된 사진: {uploadFiles.length}장</p>
                                    <span className="text-[10px] text-slate-500">({(uploadFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB)</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Camera className="w-5 h-5 text-sky-400 shrink-0" />
                                    <span className="text-xs font-bold text-slate-200">사진 촬영 또는 파일 선택</span>
                                    <span className="text-[10px] text-slate-500">(터치하여 선택)</span>
                                </div>
                            )}
                        </label>

                        {/* 씰사진 모드 안내 배너 */}
                        {uploadPhotoType === 'seal' && (
                            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 text-xs font-bold text-rose-400">
                                <span className="text-base">⚠️</span>
                                <span>컨테이너 작업 완료 후 <strong>씰(Seal) 사진</strong>을 찍어 등록해 주세요. 등록 완료 시 이 버튼은 자동으로 사라집니다.</span>
                            </div>
                        )}

                        <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs text-slate-500 font-bold ml-1 block">컨테이너 번호</label>
                                    <input 
                                        value={uploadCntrNo} 
                                        onChange={e => setUploadCntrNo(e.target.value)}
                                        disabled={isUploading}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors uppercase font-bold text-slate-200 disabled:opacity-50"
                                        placeholder="컨테이너 번호 입력"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-slate-500 font-bold ml-1 block">작업 소요시간 (분)</label>
                                    <input 
                                        type="number"
                                        min={1}
                                        max={300}
                                        value={uploadDurationMinutes} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setUploadDurationMinutes('');
                                            } else {
                                                const num = parseInt(val, 10);
                                                setUploadDurationMinutes(isNaN(num) ? '' : num);
                                            }
                                        }}
                                        disabled={isUploading}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 transition-colors font-bold text-emerald-400 disabled:opacity-50"
                                        placeholder="소요 분 (기본 45분)"
                                    />
                                </div>
                            </div>

                            {/* Empty Boxes UI */}
                            <div className="space-y-1.5 pt-2 border-t border-white/5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-amber-500 font-bold ml-1 flex items-center gap-1">
                                        <span>📦</span> 공박스 내역
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setUploadEmptyBoxes(prev => [...prev, { name: 'MAY', qty: 0 }])}
                                        className="text-[10px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-2 py-0.5 rounded font-bold transition-colors"
                                    >
                                        + 추가
                                    </button>
                                </div>
                                {uploadEmptyBoxes.length > 0 ? (
                                    <div className="space-y-2">
                                        {uploadEmptyBoxes.map((eb, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={eb.name}
                                                    onChange={e => {
                                                        const val = e.target.value.toUpperCase();
                                                        setUploadEmptyBoxes(prev => {
                                                            const next = [...prev];
                                                            next[idx].name = val;
                                                            return next;
                                                        });
                                                    }}
                                                    placeholder="MAY..."
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500 transition-colors uppercase font-bold text-slate-200"
                                                />
                                                <div className="relative w-24 shrink-0">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={eb.qty || ''}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value, 10) || 0;
                                                            setUploadEmptyBoxes(prev => {
                                                                const next = [...prev];
                                                                next[idx].qty = val;
                                                                return next;
                                                            });
                                                        }}
                                                        placeholder="0"
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-3 pr-6 py-2 text-xs outline-none focus:border-amber-500 transition-colors font-black text-amber-400"
                                                    />
                                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">장</span>
                                                </div>
                                                <button
                                                    onClick={() => setUploadEmptyBoxes(prev => prev.filter((_, i) => i !== idx))}
                                                    className="w-8 flex items-center justify-center shrink-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl transition-colors"
                                                    title="삭제"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-slate-500 px-1">등록된 공박스가 없습니다. 누락 시 추가 버튼을 눌러주세요.</div>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs text-slate-500 font-bold ml-1 block">작업자 메모 (작업시간 지연사유 등)</label>
                                <textarea 
                                    rows={2}
                                    value={uploadRemark} 
                                    onChange={e => setUploadRemark(e.target.value)}
                                    disabled={isUploading}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-3 text-xs outline-none focus:border-sky-500 transition-colors disabled:opacity-50 text-slate-200 resize-none"
                                    placeholder="작업시간 지연사유 기재바람"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 mt-4 shrink-0">
                        <button 
                            disabled={isUploading}
                            onClick={onClose} 
                            className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all disabled:opacity-50"
                        >
                            취소
                        </button>
                        <button 
                            onClick={handlePhotoUpload} 
                            disabled={isUploading || (uploadFiles.length === 0 && (!uploadJob?.photo_count || uploadJob.photo_count === 0))}
                            className="flex-2 py-4 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:hover:bg-sky-500"
                        >
                            {isUploading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {uploadProgressText || "처리 중..."}
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    {uploadFiles.length > 0 ? "사진 저장하기" : (uploadJob?.photo_count && uploadJob.photo_count > 0 ? "작업시간/메모 수정 저장" : "사진 저장하기")}
                                </span>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
