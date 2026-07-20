"use client";

import React, { useState, useEffect } from 'react';
import { 
    X, Calendar, User, Download, Search, Image as ImageIcon, 
    ChevronLeft, ChevronRight, Loader2, ArrowLeft, Trash2, Folder 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchUsers } from '@/lib/actions';
import { SessionUser } from '@/lib/auth';

interface Photo {
    id: string;
    job_id: number;
    cntr_no: string;
    photo_path: string;
    remark: string;
    uploaded_at: string;
    uploaded_by: string;
    uploader_name: string;
    uploader_username: string;
    job_name: string;
}

interface UserOption {
    id: string;
    name: string;
    username: string;
}

interface PhotoGalleryProps {
    isOpen: boolean;
    onClose: () => void;
    user: SessionUser;
}

export default function PhotoGallery({ isOpen, onClose, user }: PhotoGalleryProps) {
    const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'MANAGER');

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Folder State
    const [selectedContainerFolder, setSelectedContainerFolder] = useState<string | null>(null);
    
    // Group photos by container number
    const folders = React.useMemo(() => {
        const group: { [cntrNo: string]: Photo[] } = {};
        photos.forEach(photo => {
            if (!photo.cntr_no) return;
            const key = photo.cntr_no.toUpperCase().trim();
            if (!group[key]) {
                group[key] = [];
            }
            group[key].push(photo);
        });
        
        return Object.entries(group).map(([cntrNo, list]) => ({
            cntrNo,
            photos: list,
            lastUploadedAt: new Date(Math.max(...list.map(p => new Date(p.uploaded_at).getTime()))),
            uploaderNames: Array.from(new Set(list.map(p => p.uploader_name || p.uploader_username))).join(', ')
        })).sort((a, b) => b.lastUploadedAt.getTime() - a.lastUploadedAt.getTime());
    }, [photos]);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    
    // Lightbox State
    const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);

    // Load users (uploaders) once on mount
    useEffect(() => {
        const loadUsers = async () => {
            if (isAdmin) {
                try {
                    const data = await fetchUsers();
                    setUsers(data);
                } catch (error) {
                    console.error("Error loading users:", error);
                }
            }
        };
        loadUsers();
        
        // Initialize filters with current week
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        
        setEndDate(today.toISOString().split('T')[0]);
        setStartDate(lastWeek.toISOString().split('T')[0]);
    }, [user, isAdmin]);

    // Force non-admins to only see their own uploads
    useEffect(() => {
        if (isOpen && user) {
            if (!isAdmin) {
                setSelectedUserId(user.id);
            }
        }
    }, [isOpen, user, isAdmin]);

    // Load photos
    const loadPhotos = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserId) params.append('userId', selectedUserId);
            
            const res = await fetch(`/api/photos?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setPhotos(data.photos);
            } else {
                console.error("Error fetching photos:", data.error);
            }
        } catch (error) {
            console.error("Error loading photos:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Reload photos when filters change or dialog opens
    useEffect(() => {
        if (isOpen) {
            loadPhotos();
        } else {
            setSelectedContainerFolder(null);
        }
    }, [isOpen, startDate, endDate, selectedUserId]);

    const handleDelete = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        if (!confirm("정말 이 사진을 삭제하시겠습니까?\n삭제된 사진은 복구할 수 없습니다.")) {
            return;
        }

        try {
            const res = await fetch(`/api/photos?id=${photo.id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                alert("사진이 성공적으로 삭제되었습니다.");
                setActivePhotoIdx(null);
                loadPhotos();
            } else {
                alert(`삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("사진 삭제 중 오류가 발생했습니다.");
        }
    };

    const handleBulkDelete = async () => {
        if (!startDate && !endDate && !selectedUserId) {
            alert("일괄 삭제를 위해 최소 하나 이상의 필터 조건(시작일, 종료일 또는 업로드자)을 입력해 주세요.");
            return;
        }

        const uploaderText = selectedUserId 
            ? users.find(u => u.id === selectedUserId)?.name || "특정 작업자"
            : "전체 작업자";
            
        const dateText = `${startDate || '시작일 미지정'} ~ ${endDate || '종료일 미지정'}`;

        const confirmMsg = `[일괄 삭제 경고]\n\n다음 조건에 해당되는 사진 총 ${photos.length}장을 서버에서 영구히 삭제하시겠습니까?\n\n- 기간: ${dateText}\n- 대상: ${uploaderText}\n\n이 작업은 복구할 수 없으며 디스크 파일과 DB 정보가 모두 삭제됩니다.`;
        
        if (!confirm(confirmMsg)) {
            return;
        }

        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserId) params.append('userId', selectedUserId);

            const res = await fetch(`/api/photos?${params.toString()}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (data.success) {
                alert(data.message);
                loadPhotos();
            } else {
                alert(`일괄 삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Bulk delete error:", error);
            alert("일괄 삭제 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteFolder = async (cntrNo: string, count: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        const confirmMsg = `[폴더 삭제 경고]\n\n컨테이너 '${cntrNo}' 폴더와 그 안의 사진 총 ${count}장을 모두 삭제하시겠습니까?\n\n이 작업은 복구할 수 없으며 서버 디스크 폴더와 DB 내역이 일괄 삭제됩니다.`;
        if (!confirm(confirmMsg)) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                if (selectedContainerFolder === cntrNo) {
                    setSelectedContainerFolder(null);
                }
                loadPhotos();
            } else {
                alert(`폴더 삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete folder error:", error);
            alert("폴더 삭제 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            const response = await fetch(`/api/photos/view?filename=${encodeURIComponent(photo.photo_path)}`);
            if (!response.ok) throw new Error("File not found");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Format: CNTR_NO_DATE_TIME.jpg
            const cleanCntr = (photo.cntr_no || "CNTR").replace(/[^a-zA-Z0-9]/g, '_');
            const dateObj = new Date(photo.uploaded_at);
            const dateStr = dateObj.toISOString().slice(0, 10).replace(/-/g, '');
            const timeStr = dateObj.toTimeString().slice(0, 8).replace(/:/g, '');
            a.download = `${cleanCntr}_${dateStr}_${timeStr}.jpg`;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            alert('사진 다운로드 중 오류가 발생했습니다.');
        }
    };

    const handlePrevPhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (activePhotoIdx === null || photos.length === 0) return;
        
        if (selectedContainerFolder) {
            const folderPhotos = photos.map((p, i) => ({ p, i })).filter(item => item.p.cntr_no === selectedContainerFolder);
            const currentItemIdx = folderPhotos.findIndex(item => item.i === activePhotoIdx);
            if (currentItemIdx !== -1) {
                const prevItemIdx = currentItemIdx > 0 ? currentItemIdx - 1 : folderPhotos.length - 1;
                setActivePhotoIdx(folderPhotos[prevItemIdx].i);
            }
        } else {
            setActivePhotoIdx(prev => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1));
        }
    };

    const handleNextPhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (activePhotoIdx === null || photos.length === 0) return;
        
        if (selectedContainerFolder) {
            const folderPhotos = photos.map((p, i) => ({ p, i })).filter(item => item.p.cntr_no === selectedContainerFolder);
            const currentItemIdx = folderPhotos.findIndex(item => item.i === activePhotoIdx);
            if (currentItemIdx !== -1) {
                const nextItemIdx = currentItemIdx < folderPhotos.length - 1 ? currentItemIdx + 1 : 0;
                setActivePhotoIdx(folderPhotos[nextItemIdx].i);
            }
        } else {
            setActivePhotoIdx(prev => (prev !== null && prev < photos.length - 1 ? prev + 1 : 0));
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-[#07070d]/90 backdrop-blur-md flex flex-col w-full h-full text-slate-100"
            >
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 md:px-8 border-b border-white/5 bg-black/20 shrink-0">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all md:hidden"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-lg md:text-xl font-black text-sky-400 tracking-tight flex items-center gap-2">
                                <ImageIcon className="w-5 h-5" /> 작업 완료 사진 보관함
                            </h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5 hidden md:block">현장에서 업로드된 컨테이너 적재 사진을 조회하고 관리합니다.</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2.5 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10 transition-all hidden md:flex items-center justify-center"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </header>

                {/* Filter Panel */}
                <section className="px-6 py-4 md:px-8 border-b border-white/5 bg-black/10 shrink-0">
                    <div className="flex flex-col md:flex-row gap-3 md:items-end">
                        <div className="grid grid-cols-2 md:flex gap-3 flex-1">
                            {/* Start Date */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-sky-400" /> 시작일
                                </label>
                                <input 
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-[#12121a]/80 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-sky-500/50 transition-colors"
                                />
                            </div>

                            {/* End Date */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-sky-400" /> 종료일
                                </label>
                                <input 
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-[#12121a]/80 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-sky-500/50 transition-colors"
                                />
                            </div>

                            {/* Uploader (User) - Admin Only */}
                            {isAdmin && (
                                <div className="space-y-1 col-span-2 md:w-48">
                                    <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                        <User className="w-3 h-3 text-sky-400" /> 업로드 작업자
                                    </label>
                                    <select 
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className="w-full bg-[#12121a]/80 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-sky-500/50 transition-colors appearance-none"
                                    >
                                        <option value="">전체 작업자</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Reset / Search Buttons */}
                        <div className="flex gap-2 items-center shrink-0">
                            {isAdmin && photos.length > 0 && (
                                <button 
                                    onClick={handleBulkDelete}
                                    className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-400 hover:text-white font-black text-xs transition-all cursor-pointer flex items-center gap-1.5"
                                    title="필터링된 결과 일괄 삭제"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> 일괄 삭제 ({photos.length}장)
                                </button>
                            )}
                            <button 
                                onClick={loadPhotos}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 border border-sky-600 hover:bg-sky-400 text-white font-black text-xs transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                            >
                                <Search className="w-3.5 h-3.5" /> 검색
                            </button>
                        </div>
                    </div>
                </section>

                {/* Photo Grid Area */}
                <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
                            <p className="text-xs font-bold text-slate-500">사진 데이터를 불러오는 중...</p>
                        </div>
                    ) : photos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/5 rounded-3xl bg-white/[0.01]">
                            <ImageIcon className="w-10 h-10 text-slate-600 mb-3" />
                            <p className="text-sm font-bold text-slate-400">조회된 사진이 없습니다.</p>
                            <p className="text-xs text-slate-600 mt-1">다른 날짜나 작업자로 검색해 보세요.</p>
                        </div>
                    ) : selectedContainerFolder === null ? (
                        /* FOLDER GRID VIEW */
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                            {folders.map(folder => (
                                <motion.div
                                    key={folder.cntrNo}
                                    whileHover={{ y: -4, scale: 1.02 }}
                                    onClick={() => setSelectedContainerFolder(folder.cntrNo)}
                                    className="group relative flex flex-col bg-[#121422]/80 border border-white/5 rounded-3xl p-5 cursor-pointer shadow-lg hover:shadow-2xl hover:border-sky-500/30 hover:bg-[#15182e]/90 transition-all duration-300"
                                >
                                    {/* Folder Shape Icon Container */}
                                    <div className="relative aspect-[4/3] w-full flex items-center justify-center bg-sky-950/20 border border-sky-500/10 rounded-2xl mb-4 group-hover:bg-sky-500/10 transition-colors">
                                        <div className="text-sky-400 group-hover:scale-110 transition-transform duration-300">
                                            <Folder className="w-16 h-16" />
                                        </div>
                                        
                                        {/* Floating Photo Count Badge */}
                                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-xl bg-sky-500 text-white text-[10px] font-black tracking-wider">
                                            {folder.photos.length}장
                                        </div>
                                    </div>

                                    {/* Folder Details */}
                                    <div className="space-y-1 flex-1 flex flex-col justify-between">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-100 tracking-tight truncate uppercase group-hover:text-sky-400 transition-colors">
                                                {folder.cntrNo}
                                            </h4>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1 line-clamp-1">
                                                작업자: {folder.uploaderNames}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-3">
                                            <span className="text-[9px] text-slate-600 font-bold">
                                                {folder.lastUploadedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                            </span>
                                            
                                            {/* Folder Delete Button (Admin Only) */}
                                            {isAdmin && (
                                                <button
                                                    onClick={(e) => handleDeleteFolder(folder.cntrNo, folder.photos.length, e)}
                                                    className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 hover:border-rose-600 transition-all shrink-0"
                                                    title="폴더 및 내부 사진 전체 삭제"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        /* PHOTO GRID VIEW (INSIDE SELECTED FOLDER) */
                        <div>
                            {/* Back Header */}
                            <div className="mb-6 flex items-center justify-between">
                                <button 
                                    onClick={() => setSelectedContainerFolder(null)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black cursor-pointer"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" /> 폴더 목록
                                </button>
                                <div className="text-xs font-black text-sky-400 uppercase tracking-widest bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-xl">
                                    폴더: {selectedContainerFolder} ({photos.filter(p => p.cntr_no === selectedContainerFolder).length}장)
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {photos
                                    .map((photo, idx) => ({ photo, originalIdx: idx }))
                                    .filter(item => item.photo.cntr_no === selectedContainerFolder)
                                    .map(({ photo, originalIdx }) => (
                                        <motion.div 
                                            key={photo.id}
                                            whileHover={{ y: -3, scale: 1.02 }}
                                            onClick={() => setActivePhotoIdx(originalIdx)}
                                            className="group relative flex flex-col bg-[#11111a] border border-white/5 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl hover:border-white/10 transition-all duration-300"
                                        >
                                            {/* Aspect Ratio container for Image */}
                                            <div className="relative aspect-[4/3] bg-black overflow-hidden border-b border-white/5">
                                                <img 
                                                    src={`/api/photos/view?filename=${encodeURIComponent(photo.photo_path)}`}
                                                    alt={photo.cntr_no}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                                                
                                                {/* Download trigger overlay - Admin Only */}
                                                {isAdmin && (
                                                    <button 
                                                        onClick={(e) => handleDownload(photo, e)}
                                                        className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100"
                                                        title="다운로드"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Description */}
                                            <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-black text-sky-400 tracking-tight truncate uppercase">
                                                        {photo.cntr_no}
                                                    </p>
                                                    {photo.remark && (
                                                        <p className="text-[10px] text-slate-400 font-bold line-clamp-1">
                                                            {photo.remark}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between pt-1.5 border-t border-white/5 text-[9px] text-slate-500 font-bold">
                                                    <span className="flex items-center gap-1 truncate max-w-[60px]">
                                                        <User className="w-2.5 h-2.5 text-slate-600" /> {photo.uploader_name || photo.uploader_username}
                                                    </span>
                                                    <span>
                                                        {new Date(photo.uploaded_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(' ', '')} {new Date(photo.uploaded_at).toTimeString().slice(0, 5)}
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                            </div>
                        </div>
                    )}
                </main>

                {/* Lightbox / Slider Modal */}
                <AnimatePresence>
                    {activePhotoIdx !== null && photos[activePhotoIdx] && (
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            onClick={() => setActivePhotoIdx(null)}
                            className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex flex-col justify-between p-4"
                        >
                            {/* Lightbox Topbar */}
                            <div className="flex items-center justify-between px-4 py-2 shrink-0 z-10">
                                <div className="text-left">
                                    <h3 className="text-base md:text-lg font-black text-sky-400 uppercase tracking-wide">
                                        {photos[activePhotoIdx].cntr_no}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-bold mt-0.5">
                                        {photos[activePhotoIdx].job_name || "작업"} | 업로드: {photos[activePhotoIdx].uploader_name} ({photos[activePhotoIdx].uploader_username})
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isAdmin && (
                                        <>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(photos[activePhotoIdx], e); }}
                                                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="사진 삭제"
                                            >
                                                <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">삭제</span>
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDownload(photos[activePhotoIdx]); }}
                                                className="p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="다운로드"
                                            >
                                                <Download className="w-4 h-4" /> <span className="hidden sm:inline">다운로드</span>
                                            </button>
                                        </>
                                    )}
                                    <button 
                                        onClick={() => setActivePhotoIdx(null)}
                                        className="p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                                        title="닫기"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Lightbox Image & Navigation */}
                            <div className="flex-1 flex items-center justify-center relative w-full my-4">
                                {/* Left arrow */}
                                <button 
                                    onClick={handlePrevPhoto}
                                    className="absolute left-2 md:left-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10"
                                >
                                    <ChevronLeft className="w-6 h-6" />
                                </button>

                                {/* Image */}
                                <div className="max-w-[90%] max-h-[80vh] flex items-center justify-center relative select-none">
                                    <motion.img 
                                        key={photos[activePhotoIdx].id}
                                        initial={{ scale: 0.95, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.95, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                        src={`/api/photos/view?filename=${encodeURIComponent(photos[activePhotoIdx].photo_path)}`}
                                        alt={photos[activePhotoIdx].cntr_no}
                                        className="max-w-full max-h-[75vh] object-contain rounded-2xl border border-white/10 shadow-2xl"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>

                                {/* Right arrow */}
                                <button 
                                    onClick={handleNextPhoto}
                                    className="absolute right-2 md:right-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10"
                                >
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Lightbox Info Panel */}
                            <div className="text-center px-4 py-2 shrink-0 z-10 bg-black/20 rounded-2xl max-w-xl mx-auto w-full border border-white/5 mb-4">
                                <p className="text-xs text-slate-300 font-bold mb-1">
                                    {photos[activePhotoIdx].remark ? `"${photos[activePhotoIdx].remark}"` : "메모가 없습니다."}
                                </p>
                                <p className="text-[10px] text-slate-500 font-bold">
                                    등록 일시: {new Date(photos[activePhotoIdx].uploaded_at).toLocaleString('ko-KR')}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
