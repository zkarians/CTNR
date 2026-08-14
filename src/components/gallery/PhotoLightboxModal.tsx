import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, ChevronLeft, ChevronRight, Download, ExternalLink, 
    RotateCw, RotateCcw, Trash2, Calendar, Clock, User, Shield, Info, Edit3
} from 'lucide-react';
import { Photo } from './PhotoGalleryTypes';

interface PhotoLightboxModalProps {
    photos: Photo[];
    activePhotoIdx: number | null;
    onClose: () => void;
    onSelectIndex: (idx: number) => void;
    isAdmin: boolean;
    isTrashView: boolean;
    onDownload: (photo: Photo) => void;
    onDelete: (photo: Photo) => void;
    onRestore: (photo: Photo) => void;
    onDeletePermanently: (photo: Photo) => void;
    onRotate: (degrees: number, photoId: string) => Promise<void>;
    isRotating?: boolean;
}

export default function PhotoLightboxModal({
    photos,
    activePhotoIdx,
    onClose,
    onSelectIndex,
    isAdmin,
    isTrashView,
    onDownload,
    onDelete,
    onRestore,
    onDeletePermanently,
    onRotate,
    isRotating
}: PhotoLightboxModalProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const dragStartPosRef = useRef({ x: 0, y: 0 });
    const hasDraggedRef = useRef(false);

    const resetZoom = useCallback(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setIsDragging(false);
    }, []);

    const handlePrev = useCallback(() => {
        if (activePhotoIdx === null) return;
        resetZoom();
        onSelectIndex((activePhotoIdx - 1 + photos.length) % photos.length);
    }, [activePhotoIdx, photos.length, onSelectIndex, resetZoom]);

    const handleNext = useCallback(() => {
        if (activePhotoIdx === null) return;
        resetZoom();
        onSelectIndex((activePhotoIdx + 1) % photos.length);
    }, [activePhotoIdx, photos.length, onSelectIndex, resetZoom]);

    // Keyboard navigation
    useEffect(() => {
        if (activePhotoIdx === null) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft') handlePrev();
            else if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activePhotoIdx, handlePrev, handleNext, onClose]);

    if (activePhotoIdx === null || !photos[activePhotoIdx]) return null;

    const currentPhoto = photos[activePhotoIdx];
    const rawPhotoPath = currentPhoto.photo_path.split('?')[0];
    const cacheQuery = currentPhoto.photo_path.includes('?t=') ? '&t=' + currentPhoto.photo_path.split('?t=')[1] : '';
    const imageUrl = `/api/photos/view?filename=${encodeURIComponent(rawPhotoPath)}${cacheQuery}`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-[#07070d]/95 backdrop-blur-xl flex flex-col md:flex-row items-stretch justify-between overflow-hidden"
                onClick={onClose}
            >
                {/* Left Sidebar (Photo Info & Metadata) */}
                <div 
                    className="w-full md:w-80 lg:w-96 bg-[#0c0c14]/90 border-b md:border-b-0 md:border-r border-white/5 p-6 flex flex-col justify-between overflow-y-auto shrink-0 z-20"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="space-y-6">
                        {/* Header Title */}
                        <div className="flex items-center justify-between">
                            <span className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-black tracking-wider uppercase">
                                {currentPhoto.cntr_no}
                            </span>
                            <span className="text-xs font-bold text-slate-500">
                                {activePhotoIdx + 1} / {photos.length}
                            </span>
                        </div>

                        {/* Metadata List */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-xs text-slate-300">
                                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 font-bold">업로드 일시</div>
                                    <div className="font-bold">{new Date(currentPhoto.uploaded_at).toLocaleString('ko-KR')}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-300">
                                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                                    <User className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 font-bold">작업자 (업로더)</div>
                                    <div className="font-bold">{currentPhoto.uploader_name || currentPhoto.uploader_username || '알 수 없음'}</div>
                                </div>
                            </div>

                            {currentPhoto.team_name && (
                                <div className="flex items-center gap-3 text-xs text-slate-300">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                                        <Shield className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold">소속 조</div>
                                        <div className="font-bold">{currentPhoto.team_name}</div>
                                    </div>
                                </div>
                            )}

                            {currentPhoto.work_duration_minutes !== undefined && (
                                <div className="flex items-center gap-3 text-xs text-slate-300">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold">공수 시간</div>
                                        <div className="font-bold">{currentPhoto.work_duration_minutes}분</div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2">
                                <div className="text-[10px] text-slate-500 font-bold mb-1 flex items-center gap-1">
                                    <Info className="w-3 h-3" /> 비고 (메모)
                                </div>
                                <div className="text-xs font-bold text-slate-200 leading-relaxed bg-[#07070d]/60 border border-white/5 rounded-xl p-3 min-h-[60px]">
                                    {currentPhoto.remark || "등록된 메모가 없습니다."}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons Panel at bottom of sidebar */}
                    <div className="space-y-2 pt-6 border-t border-white/5">
                        {/* Rotate Actions */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                disabled={isRotating}
                                onClick={() => onRotate(-90, currentPhoto.id)}
                                className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 text-xs font-black disabled:opacity-50"
                                title="왼쪽으로 90도 회전"
                            >
                                <RotateCcw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} /> 좌회전
                            </button>
                            <button
                                disabled={isRotating}
                                onClick={() => onRotate(90, currentPhoto.id)}
                                className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 text-xs font-black disabled:opacity-50"
                                title="오른쪽으로 90도 회전"
                            >
                                <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} /> 우회전
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <a 
                                href={imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 rounded-xl bg-[#12121a] border border-white/5 hover:border-white/10 text-sky-400 hover:bg-sky-500 hover:text-white transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                title="새 탭에서 원본 보기"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> 원본 보기
                            </a>
                            <button 
                                onClick={() => onDownload(currentPhoto)}
                                className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                title="다운로드"
                            >
                                <Download className="w-3.5 h-3.5" /> 다운로드
                            </button>
                        </div>

                        {isAdmin && (
                            isTrashView ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => onRestore(currentPhoto)}
                                        className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:text-white hover:bg-sky-500 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                        title="사진 복구"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" /> 복구
                                    </button>
                                    <button 
                                        onClick={() => onDeletePermanently(currentPhoto)}
                                        className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                        title="사진 영구 삭제"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> 영구 삭제
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => onDelete(currentPhoto)}
                                    className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                    title="사진 삭제 (휴지통으로 이동)"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> 사진 삭제 (휴지통 이동)
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Right Main Image Canvas View */}
                <div 
                    className="flex-1 flex flex-col justify-between p-2 md:p-4 relative h-[70vh] md:h-full"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Desktop Close Button */}
                    <button 
                        onClick={() => { onClose(); resetZoom(); }}
                        className="hidden md:flex absolute top-6 right-6 p-3 rounded-2xl bg-black/40 border border-white/10 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-20 cursor-pointer"
                        title="닫기"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Main Image display & navigation */}
                    <div className="flex-1 flex items-center justify-center relative w-full my-2">
                        {/* Left Arrow */}
                        <button 
                            onClick={handlePrev}
                            className="absolute left-2 md:left-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10 cursor-pointer"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>

                        {/* Image Wrapper */}
                        <div className="max-w-full max-h-[92vh] flex items-center justify-center relative overflow-hidden select-none">
                            <motion.div
                                key={currentPhoto.id}
                                initial={{ scale: 0.98, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.98, opacity: 0 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="w-full h-full flex items-center justify-center"
                            >
                                <img 
                                    src={imageUrl}
                                    alt={currentPhoto.cntr_no}
                                    className="max-w-full max-h-[90vh] object-contain rounded-2xl border border-white/10 shadow-2xl select-none"
                                    style={{
                                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                        transformOrigin: 'center center',
                                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasDraggedRef.current) return;
                                        if (scale > 1) {
                                            resetZoom();
                                        } else {
                                            setScale(2.5);
                                        }
                                    }}
                                    onMouseDown={(e) => {
                                        if (scale > 1) {
                                            e.preventDefault();
                                            setIsDragging(true);
                                            dragStartPosRef.current = { x: e.clientX, y: e.clientY };
                                            hasDraggedRef.current = false;
                                            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
                                        }
                                    }}
                                    onMouseMove={(e) => {
                                        if (isDragging && scale > 1) {
                                            e.preventDefault();
                                            const dx = e.clientX - dragStartPosRef.current.x;
                                            const dy = e.clientY - dragStartPosRef.current.y;
                                            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                                                hasDraggedRef.current = true;
                                            }
                                            setPosition({
                                                x: e.clientX - dragStart.x,
                                                y: e.clientY - dragStart.y
                                            });
                                        }
                                    }}
                                    onMouseUp={() => setIsDragging(false)}
                                    onMouseLeave={() => setIsDragging(false)}
                                />
                            </motion.div>
                        </div>

                        {/* Right Arrow */}
                        <button 
                            onClick={handleNext}
                            className="absolute right-2 md:right-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10 cursor-pointer"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
