"use client";

import React, { useState, useEffect } from 'react';
import { 
    X, Calendar, User, Download, Search, Image as ImageIcon, 
    ChevronLeft, ChevronRight, Loader2, ArrowLeft, Trash2, Folder,
    ExternalLink, RotateCw, RotateCcw, Grid, LayoutGrid
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
    transporter?: string;
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
    
    // Sort State
    const [sortBy, setSortBy] = useState<'UPLOAD_DESC' | 'UPLOAD_ASC' | 'CREATION_DESC' | 'CREATION_ASC' | 'NAME_ASC' | 'NAME_DESC'>('UPLOAD_DESC');
    const [viewMode, setViewMode] = useState<'GRID' | 'LARGE'>('GRID');
    
    // Lightbox State
    const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isTrashView, setIsTrashView] = useState(false);

    // Callback ref to attach wheel listener to image with passive: false to prevent default page scrolling
    const imageRefCallback = React.useCallback((node: HTMLImageElement | null) => {
        if (!node) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomStep = 0.15;
            setScale(prev => {
                if (e.deltaY < 0) {
                    return Math.min(prev + zoomStep, 5); // Max 5x zoom
                } else {
                    const newScale = Math.max(prev - zoomStep, 1);
                    if (newScale === 1) {
                        setPosition({ x: 0, y: 0 }); // Reset position when zooming out to 1x
                    }
                    return newScale;
                }
            });
        };

        node.addEventListener('wheel', handleWheel, { passive: false });
    }, []);

    // Reset zoom and positions
    const resetZoom = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setIsDragging(false);
    };

    const getCarrierColor = (transporter: string | undefined) => {
        if (!transporter) return "text-slate-300";
        if (transporter.includes("천마")) return "text-rose-500 font-black";
        if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-indigo-500 font-bold";
        return "text-emerald-500 font-bold";
    };

    const handleResetFilters = () => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        
        setEndDate(today.toISOString().split('T')[0]);
        setStartDate(yesterday.toISOString().split('T')[0]);
        
        if (isAdmin) {
            setSelectedUserId('');
        } else {
            setSelectedUserId(user.id);
        }
        
        setSearchCntrNo('');
        setIsTrashView(false);
        setSelectedContainerFolder(null);
        setSelectedFolders([]);
        setViewMode('GRID');
    };

    
    // Folder State
    const [selectedContainerFolder, setSelectedContainerFolder] = useState<string | null>(null);
    const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
    
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
            transporter: list[0]?.transporter,
            lastUploadedAt: new Date(Math.max(...list.map(p => new Date(p.uploaded_at).getTime()))),
            uploaderNames: Array.from(new Set(list.map(p => p.uploader_name || p.uploader_username))).join(', ')
        })).sort((a, b) => b.lastUploadedAt.getTime() - a.lastUploadedAt.getTime());
    }, [photos]);

    const folderPhotos = React.useMemo(() => {
        if (!selectedContainerFolder) return [];
        const filtered = photos.filter(p => p.cntr_no === selectedContainerFolder);
        
        // Apply sorting
        return [...filtered].sort((a, b) => {
            if (sortBy === 'UPLOAD_DESC') {
                return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
            } else if (sortBy === 'UPLOAD_ASC') {
                return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
            } else if (sortBy === 'CREATION_DESC') {
                const dateA = new Date((a as any).file_created_at || a.uploaded_at).getTime();
                const dateB = new Date((b as any).file_created_at || b.uploaded_at).getTime();
                return dateB - dateA;
            } else if (sortBy === 'CREATION_ASC') {
                const dateA = new Date((a as any).file_created_at || a.uploaded_at).getTime();
                const dateB = new Date((b as any).file_created_at || b.uploaded_at).getTime();
                return dateA - dateB;
            } else if (sortBy === 'NAME_ASC') {
                return a.photo_path.localeCompare(b.photo_path);
            } else if (sortBy === 'NAME_DESC') {
                return b.photo_path.localeCompare(a.photo_path);
            }
            return 0;
        });
    }, [photos, selectedContainerFolder, sortBy]);

    const currentPhotoIndex = React.useMemo(() => {
        if (activePhotoIdx === null) return -1;
        const currentPhoto = photos[activePhotoIdx];
        if (!currentPhoto) return -1;
        return folderPhotos.findIndex(p => p.id === currentPhoto.id);
    }, [activePhotoIdx, photos, folderPhotos]);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [searchCntrNo, setSearchCntrNo] = useState('');
    
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
        
        // Initialize filters with yesterday as start date
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        
        setEndDate(today.toISOString().split('T')[0]);
        setStartDate(yesterday.toISOString().split('T')[0]);
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
            if (isTrashView) params.append('showTrash', 'true');
            if (searchCntrNo) params.append('cntrNo', searchCntrNo);
            
            const res = await fetch(`/api/photos?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setPhotos(data.photos);
                setSelectedFolders([]);
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
            setSelectedFolders([]);
            setSearchCntrNo('');
        }
    }, [isOpen, startDate, endDate, selectedUserId, isTrashView, searchCntrNo]);

    const handleDelete = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        if (!confirm("이 사진을 휴지통으로 이동하시겠습니까?")) {
            return;
        }
        if (!confirm("정말 삭제(휴지통 이동)하시겠습니까? (삭제된 사진은 15일 후 영구 삭제됩니다.)")) {
            return;
        }

        try {
            const res = await fetch(`/api/photos?id=${photo.id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                alert("사진이 휴지통으로 이동되었습니다.");
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

    const handleDeleteFolder = async (cntrNo: string, count: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        const confirmMsg = `컨테이너 '${cntrNo}' 폴더와 그 안의 사진 총 ${count}장을 모두 휴지통으로 이동하시겠습니까?`;
        if (!confirm(confirmMsg)) {
            return;
        }
        if (!confirm("정말 삭제(휴지통 이동)하시겠습니까?")) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert("폴더가 휴지통으로 이동되었습니다.");
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

    const handleDeleteFolderPermanently = async (cntrNo: string, count: number, e: React.MouseEvent) => {
        e.stopPropagation();
        
        const confirmMsg = `[영구 삭제 경고]\n\n컨테이너 '${cntrNo}' 폴더와 그 안의 사진 총 ${count}장을 완전히 영구 삭제하시겠습니까?\n이 작업은 복구할 수 없으며 서버 디스크에서 파일이 영구히 삭제됩니다.`;
        if (!confirm(confirmMsg)) {
            return;
        }
        if (!confirm("정말로 영구 삭제하시겠습니까? 이 작업은 절대 복구할 수 없습니다!")) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}&permanent=true`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert("폴더가 영구 삭제되었습니다.");
                if (selectedContainerFolder === cntrNo) {
                    setSelectedContainerFolder(null);
                }
                loadPhotos();
            } else {
                alert(`영구 삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete folder permanently error:", error);
            alert("영구 삭제 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeletePhotoPermanently = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        if (!confirm("이 사진을 완전히 영구 삭제하시겠습니까?\n이 작업은 복구할 수 없으며 서버 디스크에서 파일이 영구히 삭제됩니다.")) {
            return;
        }
        if (!confirm("정말로 영구 삭제하시겠습니까? 이 작업은 절대 복구할 수 없습니다!")) {
            return;
        }

        try {
            const res = await fetch(`/api/photos?id=${photo.id}&permanent=true`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                alert("사진이 영구 삭제되었습니다.");
                setActivePhotoIdx(null);
                loadPhotos();
            } else {
                alert(`영구 삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete permanently error:", error);
            alert("영구 삭제 중 오류가 발생했습니다.");
        }
    };

    const handleRestorePhoto = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        if (!confirm("이 사진을 복구하시겠습니까?")) {
            return;
        }

        try {
            const res = await fetch(`/api/photos?id=${photo.id}`, {
                method: 'PATCH',
            });
            const data = await res.json();
            if (data.success) {
                alert("사진이 복구되었습니다.");
                setActivePhotoIdx(null);
                loadPhotos();
            } else {
                alert(`복구 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Restore photo error:", error);
            alert("사진 복구 중 오류가 발생했습니다.");
        }
    };

    const handleRestoreFolder = async (cntrNo: string, e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!confirm(`컨테이너 '${cntrNo}' 폴더의 모든 사진을 복구하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}`, {
                method: 'PATCH'
            });
            const data = await res.json();
            if (data.success) {
                alert("폴더가 성공적으로 복구되었습니다.");
                loadPhotos();
            } else {
                alert(`폴더 복구 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Restore folder error:", error);
            alert("폴더 복구 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSelectedFolders = async () => {
        const actionText = isTrashView ? "영구 삭제" : "삭제 (휴지통으로 이동)";
        
        if (!confirm(`선택한 ${selectedFolders.length}개 폴더와 내부 사진을 ${actionText}하시겠습니까?`)) {
            return;
        }
        if (!confirm(`정말로 ${actionText}하시겠습니까?${isTrashView ? "\n이 작업은 복구할 수 없습니다." : ""}`)) {
            return;
        }
        
        setIsLoading(true);
        try {
            let successCount = 0;
            for (const cntrNo of selectedFolders) {
                const url = `/api/photos?cntrNo=${encodeURIComponent(cntrNo)}${isTrashView ? '&permanent=true' : ''}`;
                const res = await fetch(url, {
                    method: 'DELETE'
                });
                if (res.ok) successCount++;
            }
            alert(`성공적으로 ${successCount}개 폴더를 ${actionText}했습니다.`);
            setSelectedFolders([]);
            loadPhotos();
        } catch (error) {
            console.error("Error deleting selected folders:", error);
            alert("폴더 처리 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestoreSelectedFolders = async () => {
        if (!confirm(`선택한 ${selectedFolders.length}개 폴더를 복구하시겠습니까?`)) {
            return;
        }
        
        setIsLoading(true);
        try {
            let successCount = 0;
            for (const cntrNo of selectedFolders) {
                const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}`, {
                    method: 'PATCH'
                });
                if (res.ok) successCount++;
            }
            alert(`성공적으로 ${successCount}개 폴더를 복구했습니다.`);
            setSelectedFolders([]);
            loadPhotos();
        } catch (error) {
            console.error("Error restoring selected folders:", error);
            alert("폴더 복구 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectAllFolders = () => {
        if (selectedFolders.length === folders.length) {
            setSelectedFolders([]);
        } else {
            setSelectedFolders(folders.map(f => f.cntrNo));
        }
    };

    const handleDownloadSelectedFoldersZip = async () => {
        if (selectedFolders.length === 0) {
            alert("다운로드할 폴더를 하나 이상 선택해 주세요.");
            return;
        }

        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('cntrNos', selectedFolders.join(','));
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedUserId) params.append('userId', selectedUserId);

            const downloadUrl = `/api/photos/download?${params.toString()}`;
            
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            a.download = `container_photos_${todayStr}.zip`;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error) {
            console.error("ZIP download failed:", error);
            alert("압축 파일 다운로드 중 오류가 발생했습니다.");
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
        resetZoom();
        if (activePhotoIdx === null || photos.length === 0) return;
        
        if (selectedContainerFolder) {
            if (currentPhotoIndex !== -1 && folderPhotos.length > 0) {
                const prevItemIdx = currentPhotoIndex > 0 ? currentPhotoIndex - 1 : folderPhotos.length - 1;
                const globalIdx = photos.findIndex(p => p.id === folderPhotos[prevItemIdx].id);
                if (globalIdx !== -1) {
                    setActivePhotoIdx(globalIdx);
                }
            }
        } else {
            setActivePhotoIdx(prev => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1));
        }
    };

    const handleNextPhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        resetZoom();
        if (activePhotoIdx === null || photos.length === 0) return;
        
        if (selectedContainerFolder) {
            if (currentPhotoIndex !== -1 && folderPhotos.length > 0) {
                const nextItemIdx = currentPhotoIndex < folderPhotos.length - 1 ? currentPhotoIndex + 1 : 0;
                const globalIdx = photos.findIndex(p => p.id === folderPhotos[nextItemIdx].id);
                if (globalIdx !== -1) {
                    setActivePhotoIdx(globalIdx);
                }
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
                <header className={`flex items-center justify-between px-6 py-4 md:px-8 border-b border-white/5 shrink-0 transition-colors duration-300 ${isTrashView ? "bg-purple-950/20" : "bg-black/20"}`}>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all md:hidden"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className={`text-lg md:text-xl font-black tracking-tight flex items-center gap-2 transition-colors duration-300 ${isTrashView ? "text-purple-400" : "text-sky-400"}`}>
                                <ImageIcon className="w-5 h-5" /> {isTrashView ? "작업 사진 휴지통" : "작업 완료 사진 보관함"}
                            </h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5 hidden md:block">
                                {isTrashView 
                                    ? "휴지통에 임시 보관 중인 사진들을 관리하고 복구할 수 있습니다." 
                                    : "현장에서 업로드된 컨테이너 적재 사진을 조회하고 관리합니다."}
                            </p>
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

                            {/* Container Number Search + Reset + Trash buttons inline */}
                            <div className="space-y-1 col-span-2">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Folder className="w-3 h-3 text-sky-400" /> 컨테이너 번호
                                </label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text"
                                        placeholder="컨테이너 번호 입력"
                                        value={searchCntrNo}
                                        onChange={(e) => setSearchCntrNo(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                loadPhotos();
                                            }
                                        }}
                                        className="w-48 bg-[#12121a]/80 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-sky-500/50 transition-colors"
                                    />
                                    <button 
                                        onClick={handleResetFilters}
                                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10 transition-all font-black text-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap h-[38px]"
                                        title="필터 초기화"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" /> 초기화
                                    </button>
                                    {isAdmin && (
                                        <button 
                                            onClick={() => { setIsTrashView(!isTrashView); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                            className={`px-4 py-2.5 rounded-xl border font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap h-[38px] ${
                                                isTrashView 
                                                    ? "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-600 hover:text-white" 
                                                    : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                                            }`}
                                            title={isTrashView ? "일반 보관함 보기" : "휴지통 보기"}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> 
                                            {isTrashView ? "보관함 가기" : "휴지통 보기"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Back to Folder List Button (only when a folder is selected) */}
                            {selectedContainerFolder !== null && (
                                <div className="space-y-1 flex items-end">
                                    <button 
                                        onClick={() => setSelectedContainerFolder(null)}
                                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black cursor-pointer h-[38px] mb-[1px]"
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" /> 폴더 목록
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Search Button */}
                        <div className="flex gap-2 items-center shrink-0">
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
                        <div className="space-y-4">
                            {/* Selection Actions Bar */}
                            <div className={`flex flex-wrap gap-3 items-center justify-between border rounded-2xl p-4 shrink-0 transition-colors duration-300 ${isTrashView ? "bg-purple-950/5 border-purple-500/10" : "bg-white/[0.02] border-white/5"}`}>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleSelectAllFolders}
                                        className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black cursor-pointer"
                                    >
                                        {selectedFolders.length === folders.length ? "선택 전체 해제" : "전체 선택"}
                                    </button>

                                    {/* Action Buttons right next to Select All when folder(s) selected */}
                                    {isAdmin && selectedFolders.length > 0 && (
                                        <div className="flex items-center gap-2 animate-fade-in">
                                            {isTrashView ? (
                                                <>
                                                    <button
                                                        onClick={handleRestoreSelectedFolders}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all cursor-pointer shadow-lg shadow-purple-500/20"
                                                    >
                                                        <RotateCw className="w-3.5 h-3.5" /> 선택 복구 ({selectedFolders.length}개)
                                                    </button>
                                                    <button
                                                        onClick={handleDeleteSelectedFolders}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-400 hover:text-white font-black text-xs transition-all cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" /> 선택 영구 삭제 ({selectedFolders.length}개)
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={handleDeleteSelectedFolders}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-400 hover:text-white font-black text-xs transition-all cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> 선택 삭제 ({selectedFolders.length}개)
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <span className="text-xs font-bold text-slate-400">
                                        총 {folders.length}개 폴더 중 <strong className={isTrashView ? "text-purple-400" : "text-sky-400"}>{selectedFolders.length}개</strong> 선택됨
                                    </span>
                                </div>
                                
                                {!isTrashView && selectedFolders.length > 0 && (
                                    <button
                                        onClick={handleDownloadSelectedFoldersZip}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 border border-sky-600 text-white font-black text-xs transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" /> 선택 폴더 압축 다운로드 (.ZIP)
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {folders.map(folder => (
                                    <motion.div
                                        key={folder.cntrNo}
                                        whileHover={{ y: -2, scale: 1.01 }}
                                        onClick={() => setSelectedContainerFolder(folder.cntrNo)}
                                        className="group relative flex flex-col bg-[#121422]/80 border border-white/5 rounded-2xl p-3 cursor-pointer shadow-md hover:shadow-lg hover:border-sky-500/20 hover:bg-[#15182e]/90 transition-all duration-300 select-none"
                                    >
                                        {/* Top row: Checkbox, Folder icon, Title/Carrier, Count Badge */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedFolders.includes(folder.cntrNo)}
                                                        onChange={(e) => {
                                                            setSelectedFolders(prev => 
                                                                prev.includes(folder.cntrNo) 
                                                                    ? prev.filter(name => name !== folder.cntrNo)
                                                                    : [...prev, folder.cntrNo]
                                                            );
                                                        }}
                                                        className={`w-3.5 h-3.5 rounded border-white/20 bg-black/40 focus:ring-sky-500 cursor-pointer ${isTrashView ? 'text-purple-500 focus:ring-purple-500' : 'text-sky-500 focus:ring-sky-500'}`}
                                                    />
                                                </div>
                                                <Folder className={`w-4 h-4 shrink-0 ${isTrashView ? 'text-purple-400' : 'text-sky-400'}`} />
                                                <h4 className={`text-xs font-black truncate uppercase tracking-tight ${getCarrierColor(folder.transporter)}`}>
                                                    {folder.cntrNo}
                                                    {folder.transporter && (
                                                        <span className="ml-1 text-[9px] font-bold text-slate-600 normal-case tracking-normal">
                                                            [{folder.transporter.includes("천마") ? "천마" : (folder.transporter.includes("BNI") || folder.transporter.includes("비엔아이") ? "BNI" : folder.transporter.split('(')[0])}]
                                                        </span>
                                                    )}
                                                </h4>
                                            </div>
                                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-lg shrink-0 ${isTrashView ? 'bg-purple-500/10 text-purple-400' : 'bg-sky-500/10 text-sky-400'}`}>
                                                {folder.photos.length}장
                                            </span>
                                        </div>

                                        {/* Bottom row: Uploader, Date and Actions */}
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[9px] text-slate-500 font-bold">
                                            <span className="truncate max-w-[120px]">
                                                작업자: {folder.uploaderNames}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span>
                                                    {folder.lastUploadedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                                </span>
                                                {/* Folder Actions (Admin Only) */}
                                                {isAdmin && (
                                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {isTrashView ? (
                                                            <>
                                                                <button
                                                                    onClick={(e) => handleRestoreFolder(folder.cntrNo, e)}
                                                                    className="p-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:text-white hover:bg-sky-500 transition-all cursor-pointer"
                                                                    title="폴더 복구"
                                                                >
                                                                    <RotateCw className="w-2.5 h-2.5" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleDeleteFolderPermanently(folder.cntrNo, folder.photos.length, e)}
                                                                    className="p-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 transition-all cursor-pointer"
                                                                    title="폴더 영구 삭제"
                                                                >
                                                                    <Trash2 className="w-2.5 h-2.5" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleDeleteFolder(folder.cntrNo, folder.photos.length, e)}
                                                                className="p-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 hover:border-rose-600 transition-all shrink-0 cursor-pointer"
                                                                title="폴더 삭제 (휴지통으로 이동)"
                                                            >
                                                                <Trash2 className="w-2.5 h-2.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                    </div>
                    ) : (
                        /* PHOTO GRID VIEW (INSIDE SELECTED FOLDER) */
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="text-xs font-black text-sky-400 uppercase tracking-widest bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-xl">
                                        폴더: {selectedContainerFolder} ({folderPhotos.length}장)
                                    </div>
                                </div>

                                {/* Sort & View Mode Options */}
                                <div className="flex items-center gap-4">
                                    {/* View Mode Toggle */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold text-slate-500">보기:</span>
                                        <div className="flex bg-[#11111a] border border-white/5 p-0.5 rounded-lg gap-0.5">
                                            <button
                                                onClick={() => setViewMode('GRID')}
                                                className={`p-1 rounded transition-all flex items-center gap-1 text-[11px] font-bold cursor-pointer ${
                                                    viewMode === 'GRID' 
                                                        ? 'bg-sky-500 text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-white'
                                                }`}
                                                title="일반 바둑판 보기 (5열)"
                                            >
                                                <LayoutGrid className="w-3 h-3" />
                                                <span className="hidden sm:inline">바둑판</span>
                                            </button>
                                            <button
                                                onClick={() => setViewMode('LARGE')}
                                                className={`p-1 rounded transition-all flex items-center gap-1 text-[11px] font-bold cursor-pointer ${
                                                    viewMode === 'LARGE' 
                                                        ? 'bg-sky-500 text-white shadow-sm' 
                                                        : 'text-slate-400 hover:text-white'
                                                }`}
                                                title="크게 보기 (원본 비율, 3-4열)"
                                            >
                                                <Grid className="w-3 h-3" />
                                                <span className="hidden sm:inline">크게 보기</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Sort dropdown */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold text-slate-500">정렬:</span>
                                        <select 
                                            value={sortBy} 
                                            onChange={(e) => setSortBy(e.target.value as any)}
                                            className="bg-[#11111a] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                                        >
                                            <option value="UPLOAD_DESC">업로드순 (최신)</option>
                                            <option value="UPLOAD_ASC">업로드순 (과거)</option>
                                            <option value="CREATION_DESC">파일제작순 (최신)</option>
                                            <option value="CREATION_ASC">파일제작순 (과거)</option>
                                            <option value="NAME_ASC">파일이름순 (오름차순)</option>
                                            <option value="NAME_DESC">파일이름순 (내림차순)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className={
                                viewMode === 'GRID'
                                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                            }>
                                {folderPhotos.map((photo) => (
                                    <motion.div 
                                        key={photo.id}
                                        whileHover={{ y: -3, scale: 1.02 }}
                                        onClick={() => {
                                            const globalIdx = photos.findIndex(p => p.id === photo.id);
                                            if (globalIdx !== -1) {
                                                setActivePhotoIdx(globalIdx);
                                            }
                                        }}
                                        className="group relative flex flex-col bg-[#11111a] border border-white/5 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl hover:border-white/10 transition-all duration-300"
                                    >
                                        {/* Aspect Ratio container for Image */}
                                        <div className={
                                            viewMode === 'GRID'
                                                ? "relative aspect-[4/3] bg-black overflow-hidden border-b border-white/5"
                                                : "relative w-full bg-black/40 flex items-center justify-center overflow-hidden border-b border-white/5 aspect-auto min-h-[200px]"
                                        }>
                                            <img 
                                                src={`/api/photos/view?filename=${encodeURIComponent(photo.photo_path)}`}
                                                alt={photo.cntr_no}
                                                className={
                                                    viewMode === 'GRID'
                                                        ? "w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        : "w-full h-auto object-contain max-h-[60vh] group-hover:scale-[1.02] transition-transform duration-500"
                                                }
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                                                
                                                {/* Trash/Active actions overlay */}
                                                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => e.stopPropagation()}>
                                                    {isTrashView ? (
                                                        <>
                                                            <button 
                                                                onClick={(e) => handleRestorePhoto(photo, e)}
                                                                className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-sky-400 hover:text-white hover:bg-sky-500 transition-all"
                                                                title="복구"
                                                            >
                                                                <RotateCw className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleDeletePhotoPermanently(photo, e)}
                                                                className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-rose-400 hover:text-white hover:bg-rose-500 transition-all"
                                                                title="영구 삭제"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button 
                                                            onClick={(e) => handleDownload(photo, e)}
                                                            className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white hover:bg-black/90 transition-all"
                                                            title="다운로드"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                                                <div className="space-y-0.5">
                                                    <p className={`text-xs truncate uppercase tracking-tight font-black ${getCarrierColor(photo.transporter)}`}>
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
                                    <h3 className={`text-base md:text-lg font-black uppercase tracking-wide transition-colors duration-300 ${getCarrierColor(photos[activePhotoIdx].transporter)}`}>
                                        {photos[activePhotoIdx].cntr_no}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-bold mt-0.5">
                                        {photos[activePhotoIdx].job_name || "작업"} | 업로드: {photos[activePhotoIdx].uploader_name} ({photos[activePhotoIdx].uploader_username})
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isAdmin && (
                                        isTrashView ? (
                                            <>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleRestorePhoto(photos[activePhotoIdx], e); }}
                                                    className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:text-white hover:bg-sky-500 transition-all flex items-center gap-2 text-xs font-bold"
                                                    title="사진 복구"
                                                >
                                                    <RotateCw className="w-4 h-4" /> <span className="hidden sm:inline">복구</span>
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeletePhotoPermanently(photos[activePhotoIdx], e); }}
                                                    className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center gap-2 text-xs font-bold"
                                                    title="사진 영구 삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">영구 삭제</span>
                                                </button>
                                            </>
                                        ) : (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(photos[activePhotoIdx], e); }}
                                                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center gap-2 text-xs font-bold"
                                                title="사진 삭제 (휴지통으로 이동)"
                                            >
                                                <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">삭제</span>
                                            </button>
                                        )
                                    )}
                                    <a 
                                        href={`/api/photos/view?filename=${encodeURIComponent(photos[activePhotoIdx].photo_path)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-3 rounded-2xl bg-[#030712] border border-white/10 text-sky-400 hover:bg-sky-500 hover:text-white transition-all flex items-center gap-2 text-xs font-bold"
                                        title="새 탭에서 원본 화질과 크기로 보기"
                                    >
                                        <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">원본 보기</span>
                                    </a>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDownload(photos[activePhotoIdx]); }}
                                        className="p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-xs font-bold"
                                        title="다운로드"
                                    >
                                        <Download className="w-4 h-4" /> <span className="hidden sm:inline">다운로드</span>
                                    </button>
                                    <button 
                                        onClick={() => { setActivePhotoIdx(null); resetZoom(); }}
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
                                <div className="max-w-[90%] max-h-[80vh] flex items-center justify-center relative overflow-hidden select-none">
                                    <motion.div
                                        key={photos[activePhotoIdx].id}
                                        initial={{ scale: 0.98, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.98, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                        className="w-full h-full flex items-center justify-center"
                                    >
                                        <img 
                                            ref={imageRefCallback}
                                            src={`/api/photos/view?filename=${encodeURIComponent(photos[activePhotoIdx].photo_path)}`}
                                            alt={photos[activePhotoIdx].cntr_no}
                                            className="max-w-full max-h-[75vh] object-contain rounded-2xl border border-white/10 shadow-2xl select-none"
                                            style={{
                                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                                transformOrigin: 'center center',
                                                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                                                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (scale > 1) {
                                                    resetZoom();
                                                } else {
                                                    setScale(2.5); // Zoom to 2.5x on click
                                                }
                                            }}
                                            onMouseDown={(e) => {
                                                if (scale > 1) {
                                                    e.preventDefault();
                                                    setIsDragging(true);
                                                    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
                                                }
                                            }}
                                            onMouseMove={(e) => {
                                                if (isDragging && scale > 1) {
                                                    e.preventDefault();
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
                                <div className="flex justify-between items-center px-2 text-[10px] text-slate-500 font-bold">
                                    <span>등록 일시: {new Date(photos[activePhotoIdx].uploaded_at).toLocaleString('ko-KR')}</span>
                                    {selectedContainerFolder && folderPhotos.length > 0 && (
                                        <span className={`font-black transition-colors duration-300 ${isTrashView ? "text-purple-400" : "text-sky-400"}`}>
                                            {currentPhotoIndex + 1} / {folderPhotos.length}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
