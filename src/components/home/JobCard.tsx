'use client';

import React from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { Job } from '@/lib/types';
import { getCarrierColor } from '@/lib/utils/colorUtils';

export interface JobCardProps {
    job: Job;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onOpenGallery: (cntrNo: string) => void;
    onOpenUploadModal: (job: Job, type: 'normal' | 'seal') => void;
    compact?: boolean;
}

export default function JobCard({
    job,
    isSelected,
    onSelect,
    onOpenGallery,
    onOpenUploadModal,
    compact = false
}: JobCardProps) {
    const transporterLabel = job.transporter
        ? (job.transporter.includes("천마") ? "천마" : (job.transporter.includes("BNI") || job.transporter.includes("비엔아이") ? "BNI" : job.transporter.split('(')[0]))
        : "미정";

    if (compact) {
        return (
            <div 
                onClick={() => onSelect(job.id)}
                className={`w-full px-3 py-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                    isSelected ? "bg-sky-500/10 border-sky-500" : "bg-black/20 border-white/5 hover:border-white/10"
                }`}
            >
                <div className={`text-xs font-black truncate uppercase ${getCarrierColor(job.transporter)}`}>
                    {job.cntr_no || "번호없음"}
                    <span className="ml-1.5 text-[10px] text-slate-500 font-normal">
                        [{transporterLabel}]
                        {(job.model_count && job.total_qty) ? ` (${job.model_count}모델 / ${job.total_qty}개)` : ''}
                    </span>
                </div>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenUploadModal(job, 'normal');
                    }}
                    className="p-1 hover:bg-white/10 rounded-lg text-slate-500 hover:text-sky-400 transition-all shrink-0"
                >
                    <Camera className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <div 
            onClick={() => onSelect(job.id)}
            className={`w-full px-3.5 py-3 md:px-4 md:py-3 rounded-2xl text-left border transition-all duration-300 flex items-center justify-between group cursor-pointer select-none ${
                isSelected
                    ? "bg-sky-500/10 border-sky-500 shadow-[0_0_25px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/30"
                    : "bg-[#11111a] border-white/5 text-slate-400 hover:border-white/10 hover:bg-white/[0.07]"
            }`}
        >
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`text-[15px] md:text-sm font-black truncate uppercase tracking-tight ${getCarrierColor(job.transporter)}`}>
                    {job.cntr_no || "번호없음"}
                    <span className="ml-2 text-[10px] font-bold text-slate-600 normal-case tracking-normal">
                        [{transporterLabel}]
                        {(job.model_count && job.total_qty) ? ` (${job.model_count}모델 / ${job.total_qty}개)` : ''}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <div className="text-[11px] md:text-[10px] font-bold text-slate-600 shrink-0 tabular-nums mr-0.5">{job.work_date}</div>
                {job.photo_count && job.photo_count > 0 ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (job.cntr_no) {
                                onOpenGallery(job.cntr_no);
                            }
                        }}
                        className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs md:text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>({job.photo_count})</span>
                    </button>
                ) : null}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenUploadModal(job, 'normal');
                    }}
                    className={`p-1.5 hover:bg-white/10 rounded-lg transition-all flex items-center gap-1 ${
                        job.photo_count && job.photo_count > 0 
                            ? "text-sky-400 bg-sky-500/10 border border-sky-500/20" 
                            : "text-slate-500 hover:text-sky-400 border border-transparent"
                    }`}
                >
                    <Camera className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </button>
                {/* 씰사진 전용 빨간 카메라: photo_count > 0 이고 seal_photo_count가 0일 때만 표시 */}
                {((job.photo_count || 0) > 0) && (job.seal_photo_count === undefined || job.seal_photo_count === 0) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenUploadModal(job, 'seal');
                        }}
                        className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-500 hover:text-rose-400 transition-all animate-pulse border border-transparent"
                        title="씰(Seal) 사진 등록 — 반드시 등록해 주세요!"
                    >
                        <Camera className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
