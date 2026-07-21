"use client";

import React, { useState, useEffect } from 'react';
import { 
    X, Calendar, User, Download, Search, Image as ImageIcon, 
    ChevronLeft, ChevronRight, Loader2, ArrowLeft, Trash2, Folder,
    ExternalLink, RotateCw, RotateCcw, Grid, LayoutGrid, Check, Undo
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

function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function PhotoGallery({ isOpen, onClose, user }: PhotoGalleryProps) {
    const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'MANAGER');

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Sort State
    const [sortBy, setSortBy] = useState<'UPLOAD_DESC' | 'UPLOAD_ASC' | 'CREATION_DESC' | 'CREATION_ASC' | 'NAME_ASC' | 'NAME_DESC'>('UPLOAD_DESC');
    const [viewMode, setViewMode] = useState<'GRID' | 'LARGE'>('LARGE');
    
    // Lightbox State
    const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const dragStartPosRef = React.useRef({ x: 0, y: 0 });
    const hasDraggedRef = React.useRef(false);
    type TabState = 'ACTIVE' | 'COMPLETED' | 'TRASH';
    const [tabState, setTabState] = useState<TabState>('ACTIVE');
    const isTrashView = tabState === 'TRASH';
    const isCompletedView = tabState === 'COMPLETED';
    const [duplicatePhotoIds, setDuplicatePhotoIds] = useState<string[]>([]);

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
        
        setEndDate(getLocalDateString(today));
        setStartDate(getLocalDateString(yesterday));
        
        if (isAdmin) {
            setSelectedUserId('');
        } else {
            setSelectedUserId(user.id);
        }
        
        setSearchCntrNo('');
        setTabState('ACTIVE');
        setSelectedContainerFolder(null);
        setSelectedFolders([]);
        setViewMode('LARGE');
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

    // Local copy state
    const [isLocalCopyOpen, setIsLocalCopyOpen] = useState(false);
    const [localCopyPath, setLocalCopyPath] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedPath = localStorage.getItem('localCopyTargetPath') || '';
            setLocalCopyPath(savedPath);
        }
    }, []);
    
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
        
        setEndDate(getLocalDateString(today));
        setStartDate(getLocalDateString(yesterday));
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
            if (isCompletedView) params.append('showCompleted', 'true');
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
    }, [isOpen, startDate, endDate, selectedUserId, tabState, searchCntrNo]);

    // Fetch duplicate photo IDs when selectedContainerFolder changes
    useEffect(() => {
        if (selectedContainerFolder) {
            fetch(`/api/photos/duplicates?cntrNo=${encodeURIComponent(selectedContainerFolder)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.duplicateGroups) {
                        const dupIds: string[] = [];
                        data.duplicateGroups.forEach((group: any) => {
                            dupIds.push(...group.duplicatePhotoIds);
                        });
                        setDuplicatePhotoIds(dupIds);
                    } else {
                        setDuplicatePhotoIds([]);
                    }
                })
                .catch(err => {
                    console.error("Error fetching duplicate details:", err);
                    setDuplicatePhotoIds([]);
                });
        } else {
            setDuplicatePhotoIds([]);
        }
    }, [selectedContainerFolder]);

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

    const handleToggleCompleteFolder = async (cntrNo: string, currentCompleted: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        const actionText = currentCompleted ? "진행 중으로 변경" : "완료 처리";
        if (!confirm(`정말로 이 작업을 ${actionText}하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}&complete=${!currentCompleted}`, {
                method: 'PATCH'
            });
            const data = await res.json();
            if (data.success) {
                loadPhotos();
            } else {
                alert(data.error || "상태 변경에 실패했습니다.");
            }
        } catch (error) {
            console.error("Error toggling completion:", error);
            alert("서버 연결에 실패했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleSelectedFoldersCompletion = async (currentCompleted: boolean) => {
        const actionText = currentCompleted ? "진행 중으로 변경" : "완료 처리";
        if (!confirm(`선택한 ${selectedFolders.length}개 작업을 ${actionText}하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            let successCount = 0;
            for (const cntrNo of selectedFolders) {
                const res = await fetch(`/api/photos?cntrNo=${encodeURIComponent(cntrNo)}&complete=${!currentCompleted}`, {
                    method: 'PATCH'
                });
                if (res.ok) successCount++;
            }
            alert(`성공적으로 ${successCount}개 폴더를 ${actionText}했습니다.`);
            setSelectedFolders([]);
            loadPhotos();
        } catch (error) {
            console.error("Error toggling completion for selected folders:", error);
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCleanupSingleFolderDuplicates = async () => {
        if (!selectedContainerFolder) return;
        if (!confirm("이 폴더 내의 모든 중복 사진을 정리(휴지통 이동)하시겠습니까?")) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos/duplicates?cntrNo=${encodeURIComponent(selectedContainerFolder)}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert(`성공적으로 중복 사진 ${data.cleanedCount}장을 휴지통으로 이동했습니다.`);
                loadPhotos();
                setDuplicatePhotoIds([]);
            } else {
                alert(data.error || "중복 사진 정리 중 오류가 발생했습니다.");
            }
        } catch (error) {
            console.error("Error cleaning folder duplicates:", error);
            alert("서버 연결에 실패했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCleanupSelectedFoldersDuplicates = async () => {
        if (selectedFolders.length === 0) return;
        if (!confirm(`선택한 ${selectedFolders.length}개 폴더 내의 모든 중복 사진을 정리(휴지통 이동)하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/photos/duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cntrNos: selectedFolders })
            });
            const data = await res.json();
            if (data.success) {
                alert(`성공적으로 중복 사진 ${data.cleanedCount}장을 휴지통으로 이동했습니다.`);
                setSelectedFolders([]);
                loadPhotos();
            } else {
                alert(data.error || "중복 사진 정리 중 오류가 발생했습니다.");
            }
        } catch (error) {
            console.error("Error cleaning bulk duplicates:", error);
            alert("서버 연결에 실패했습니다.");
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

    const handleBrowseFolder = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/photos/select-local-folder');
            const data = await response.json();
            if (response.ok && data.success) {
                if (!data.cancelled && data.path) {
                    setLocalCopyPath(data.path);
                }
            } else {
                alert(`폴더 선택 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
            }
        } catch (error) {
            console.error("Browse folder error:", error);
            alert("폴더 선택창을 여는 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLocalCopy = async () => {
        if (selectedFolders.length === 0) {
            alert("복사할 폴더를 하나 이상 선택해 주세요.");
            return;
        }
        if (!localCopyPath.trim()) {
            alert("대상 폴더 경로를 입력해 주세요.");
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/photos/local-copy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cntrNos: selectedFolders,
                    targetPath: localCopyPath.trim(),
                }),
            });

            const data = await response.json();
            if (response.ok && data.success) {
                localStorage.setItem('localCopyTargetPath', localCopyPath.trim());
                alert(data.message);
                setIsLocalCopyOpen(false);
                setSelectedFolders([]);
            } else {
                alert(`복사 실패: ${data.error || '알 수 없는 오류가 발생했습니다.'}`);
            }
        } catch (error) {
            console.error("Local copy error:", error);
            alert("로컬 폴더 복사 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
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
                <header className={`flex items-center justify-between px-6 py-4 md:px-8 border-b border-white/5 shrink-0 transition-colors duration-300 ${
                    isTrashView 
                        ? "bg-purple-950/20" 
                        : isCompletedView 
                            ? "bg-emerald-950/20" 
                            : "bg-black/20"
                }`}>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onClose}
                            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all md:hidden"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className={`text-lg md:text-xl font-black tracking-tight flex items-center gap-2 transition-colors duration-300 ${
                                isTrashView 
                                    ? "text-purple-400" 
                                    : isCompletedView 
                                        ? "text-emerald-400" 
                                        : "text-sky-400"
                            }`}>
                                <ImageIcon className="w-5 h-5" /> {
                                    isTrashView 
                                        ? "작업 사진 휴지통" 
                                        : isCompletedView 
                                            ? "완료된 작업 사진 보관함" 
                                            : "진행 중인 작업 사진 보관함"
                                }
                            </h2>
                            <p className="text-xs text-slate-500 font-bold mt-0.5 hidden md:block">
                                {isTrashView 
                                    ? "휴지통에 임시 보관 중인 사진들을 관리하고 복구할 수 있습니다." 
                                    : isCompletedView
                                        ? "완료된 작업 폴더들의 사진들을 조회하고 필요 시 작업 상태를 되돌립니다."
                                        : "현장에서 업로드된 진행 중인 컨테이너 적재 사진을 조회하고 완료 처리합니다."}
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
                                    {/* Segmented Control for Active / Completed / Trash */}
                                    <div className="flex bg-[#11111a] border border-white/5 p-0.5 rounded-xl gap-0.5 h-[38px]">
                                        <button
                                            onClick={() => { setTabState('ACTIVE'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer whitespace-nowrap ${
                                                tabState === 'ACTIVE'
                                                    ? "bg-sky-500 text-white shadow-sm"
                                                    : "text-slate-400 hover:text-white"
                                            }`}
                                        >
                                            진행 중인 작업
                                        </button>
                                        <button
                                            onClick={() => { setTabState('COMPLETED'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer whitespace-nowrap ${
                                                tabState === 'COMPLETED'
                                                    ? "bg-emerald-500 text-white shadow-sm"
                                                    : "text-slate-400 hover:text-white"
                                            }`}
                                        >
                                            완료된 작업
                                        </button>
                                        {isAdmin && (
                                            <button
                                                onClick={() => { setTabState('TRASH'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer whitespace-nowrap ${
                                                    tabState === 'TRASH'
                                                        ? "bg-purple-500 text-white shadow-sm"
                                                        : "text-slate-400 hover:text-white"
                                                }`}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> 휴지통
                                            </button>
                                        )}
                                    </div>
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
                                    {/* Action Buttons right next to Select All when folder(s) selected */}
                                    {selectedFolders.length > 0 && (
                                        <div className="flex items-center gap-2 animate-fade-in">
                                            {isTrashView ? (
                                                isAdmin && (
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
                                                )
                                            ) : (
                                                <>
                                                    {/* Bulk Complete / Undo Complete (Everyone) */}
                                                    {isCompletedView ? (
                                                        <button
                                                            onClick={() => handleToggleSelectedFoldersCompletion(true)}
                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-600 text-amber-400 hover:text-white font-black text-xs transition-all cursor-pointer"
                                                        >
                                                            <Undo className="w-3.5 h-3.5" /> 선택 완료 취소 ({selectedFolders.length}개)
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleToggleSelectedFoldersCompletion(false)}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-600 text-emerald-400 hover:text-white font-black text-xs transition-all cursor-pointer"
                                                            >
                                                                <Check className="w-3.5 h-3.5" /> 선택 완료 처리 ({selectedFolders.length}개)
                                                            </button>
                                                            <button
                                                                onClick={handleCleanupSelectedFoldersDuplicates}
                                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-600 text-amber-400 hover:text-white font-black text-xs transition-all cursor-pointer shadow-lg shadow-amber-500/5"
                                                            >
                                                                <ImageIcon className="w-3.5 h-3.5" /> 선택 중복 정리 ({selectedFolders.length}개)
                                                            </button>
                                                        </>
                                                    )}
                                                    
                                                    {/* Delete (Admin Only) */}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={handleDeleteSelectedFolders}
                                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-400 hover:text-white font-black text-xs transition-all cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> 선택 삭제 ({selectedFolders.length}개)
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <span className="text-xs font-bold text-slate-400">
                                        총 {folders.length}개 폴더 중 <strong className={
                                            isTrashView 
                                                ? "text-purple-400" 
                                                : isCompletedView 
                                                    ? "text-emerald-400" 
                                                    : "text-sky-400"
                                        }>{selectedFolders.length}개</strong> 선택됨
                                    </span>
                                </div>
                                
                                {!isTrashView && selectedFolders.length > 0 && (
                                    <div className="flex gap-2 animate-fade-in">
                                        <button
                                            onClick={() => setIsLocalCopyOpen(true)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 border border-emerald-600 text-white font-black text-xs transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
                                        >
                                            <Folder className="w-3.5 h-3.5" /> 로컬 폴더로 복사
                                        </button>
                                        <button
                                            onClick={handleDownloadSelectedFoldersZip}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 border border-sky-600 text-white font-black text-xs transition-all shadow-lg shadow-sky-500/10 cursor-pointer"
                                        >
                                            <Download className="w-3.5 h-3.5" /> 선택 폴더 압축 다운로드 (.ZIP)
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {folders.map(folder => (
                                    <div
                                        key={folder.cntrNo}
                                        onClick={() => setSelectedContainerFolder(folder.cntrNo)}
                                        className="group relative flex flex-col bg-[#121422]/80 border border-white/5 rounded-2xl p-3 cursor-pointer shadow-md hover:shadow-lg hover:border-sky-500/20 hover:bg-[#15182e]/90 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] select-none"
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
                                                        className={`w-3.5 h-3.5 rounded border-white/20 bg-black/40 cursor-pointer ${
                                                            isTrashView 
                                                                ? 'text-purple-500 focus:ring-purple-500' 
                                                                : isCompletedView 
                                                                    ? 'text-emerald-500 focus:ring-emerald-500' 
                                                                    : 'text-sky-500 focus:ring-sky-500'
                                                        }`}
                                                    />
                                                </div>
                                                <Folder className={`w-4 h-4 shrink-0 ${
                                                    isTrashView 
                                                        ? 'text-purple-400' 
                                                        : isCompletedView 
                                                            ? 'text-emerald-400' 
                                                            : 'text-sky-400'
                                                }`} />
                                                <h4 className={`text-xs font-black truncate uppercase tracking-tight ${getCarrierColor(folder.transporter)}`}>
                                                    {folder.cntrNo}
                                                    {folder.transporter && (
                                                        <span className="ml-1 text-[9px] font-bold text-slate-600 normal-case tracking-normal">
                                                            [{folder.transporter.includes("천마") ? "천마" : (folder.transporter.includes("BNI") || folder.transporter.includes("비엔아이") ? "BNI" : folder.transporter.split('(')[0])}]
                                                        </span>
                                                    )}
                                                </h4>
                                            </div>
                                            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-lg shrink-0 ${
                                                isTrashView 
                                                    ? 'bg-purple-500/10 text-purple-400' 
                                                    : isCompletedView 
                                                        ? 'bg-emerald-500/10 text-emerald-400' 
                                                        : 'bg-sky-500/10 text-sky-400'
                                            }`}>
                                                {folder.photos.length}장
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[9px] text-slate-500 font-bold">
                                            <span className="truncate max-w-[120px]">
                                                작업자: {folder.uploaderNames}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span>
                                                    {folder.lastUploadedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                                                </span>
                                                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    {isTrashView ? (
                                                        isAdmin && (
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
                                                        )
                                                    ) : (
                                                        <>
                                                            {/* Complete / Undo Complete (Everyone) */}
                                                            {isCompletedView ? (
                                                                <button
                                                                    onClick={(e) => handleToggleCompleteFolder(folder.cntrNo, true, e)}
                                                                    className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:text-white hover:bg-amber-500 transition-all cursor-pointer"
                                                                    title="진행 중인 작업으로 변경"
                                                                >
                                                                    <Undo className="w-2.5 h-2.5" />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={(e) => handleToggleCompleteFolder(folder.cntrNo, false, e)}
                                                                    className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:text-white hover:bg-emerald-500 transition-all cursor-pointer"
                                                                    title="작업 완료 처리"
                                                                >
                                                                    <Check className="w-2.5 h-2.5" />
                                                                </button>
                                                            )}
                                                            {/* Delete (Admin Only) */}
                                                            {isAdmin && (
                                                                <button
                                                                    onClick={(e) => handleDeleteFolder(folder.cntrNo, folder.photos.length, e)}
                                                                    className="p-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-500 hover:border-rose-600 transition-all shrink-0 cursor-pointer"
                                                                    title="폴더 삭제 (휴지통으로 이동)"
                                                                >
                                                                    <Trash2 className="w-2.5 h-2.5" />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
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
                            {/* Duplicate Photos Banner */}
                            {duplicatePhotoIds.length > 0 && (
                                <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                                            <ImageIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black">이 폴더에 완전히 동일한 중복 사진이 {duplicatePhotoIds.length}장 감지되었습니다.</p>
                                            <p className="text-xs text-amber-500/80 font-bold mt-0.5">중복본은 주황색 '중복' 배지로 구분되며, 정리 시 휴지통으로 이동합니다.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleCleanupSingleFolderDuplicates}
                                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#07070d] font-black text-xs transition-all shadow-lg shadow-amber-500/15 cursor-pointer whitespace-nowrap"
                                    >
                                        중복 사진 일괄 정리
                                    </button>
                                </div>
                            )}

                            <div className={
                                viewMode === 'GRID'
                                    ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                            }>
                                {folderPhotos.map((photo) => (
                                    <div 
                                        key={photo.id}
                                        onClick={() => {
                                            const globalIdx = photos.findIndex(p => p.id === photo.id);
                                            if (globalIdx !== -1) {
                                                setActivePhotoIdx(globalIdx);
                                            }
                                        }}
                                        className="group relative flex flex-col bg-[#11111a] border border-white/5 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl hover:border-white/10 transition-all duration-300 hover:-translate-y-[3px] hover:scale-[1.02]"
                                    >
                                        {/* Aspect Ratio container for Image */}
                                        <div className={
                                            viewMode === 'GRID'
                                                ? "relative aspect-[4/3] bg-black overflow-hidden border-b border-white/5"
                                                : "relative w-full bg-black/40 flex items-center justify-center overflow-hidden border-b border-white/5 aspect-auto min-h-[200px]"
                                        }>
                                            {duplicatePhotoIds.includes(photo.id) && (
                                                <div className="absolute top-2.5 left-2.5 z-10 px-2 py-1 rounded-lg bg-amber-500 text-[#07070d] font-black text-[9px] uppercase tracking-wider shadow-md animate-pulse">
                                                    중복
                                                </div>
                                            )}
                                            <img 
                                                src={`/api/photos/view?filename=${encodeURIComponent(photo.photo_path)}`}
                                                alt={photo.cntr_no}
                                                className={
                                                    viewMode === 'GRID'
                                                        ? "w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        : "w-full h-auto object-contain max-h-[60vh] group-hover:scale-[1.02] transition-transform duration-500"
                                                }
                                                loading="lazy"
                                                decoding="async"
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
                                        </div>
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
                            className="fixed inset-0 z-[60] bg-[#07070a]/98 backdrop-blur-xl flex flex-col-reverse md:flex-row"
                        >
                            {/* Left Info Sidebar */}
                            <div 
                                className="w-full md:w-96 bg-[#0b0b10] border-t md:border-t-0 md:border-r border-white/5 p-6 flex flex-col justify-between shrink-0 overflow-y-auto h-[30vh] md:h-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="space-y-6">
                                    {/* Close Button & Title */}
                                    <div className="hidden md:flex items-center justify-between">
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">상세 정보</h4>
                                        <button 
                                            onClick={() => { setActivePhotoIdx(null); resetZoom(); }}
                                            className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                                            title="닫기"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Container Info Card */}
                                    <div className="bg-[#12121a] border border-white/5 rounded-2xl p-5 space-y-3 shadow-md">
                                        <div>
                                            <h3 className={`text-lg md:text-xl font-black uppercase tracking-wide transition-colors duration-300 ${getCarrierColor(photos[activePhotoIdx].transporter)}`}>
                                                {photos[activePhotoIdx].cntr_no}
                                            </h3>
                                            <p className="text-xs text-sky-400 font-bold mt-1 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg inline-block">
                                                {photos[activePhotoIdx].job_name || "작업"}
                                            </p>
                                        </div>

                                        <div className="flex justify-between items-center text-xs text-slate-500 font-bold pt-2 border-t border-white/5">
                                            <span>사진 순서</span>
                                            {selectedContainerFolder && folderPhotos.length > 0 && (
                                                <span className={`font-black ${
                                                    isTrashView 
                                                        ? "text-purple-400" 
                                                        : isCompletedView 
                                                            ? "text-emerald-400" 
                                                            : "text-sky-400"
                                                }`}>
                                                    {currentPhotoIndex + 1} / {folderPhotos.length} 장
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Meta info list */}
                                    <div className="space-y-4">
                                        {/* Uploader info */}
                                        <div className="flex items-start gap-3">
                                            <div className="p-2.5 rounded-xl bg-white/5 text-slate-400">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-500">등록자</p>
                                                <p className="text-xs font-black text-slate-300 mt-0.5">
                                                    {photos[activePhotoIdx].uploader_name} <span className="text-[10px] text-slate-500 font-normal">({photos[activePhotoIdx].uploader_username})</span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Upload date */}
                                        <div className="flex items-start gap-3">
                                            <div className="p-2.5 rounded-xl bg-white/5 text-slate-400">
                                                <Calendar className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-500">등록 일시</p>
                                                <p className="text-xs font-black text-slate-300 mt-0.5">
                                                    {new Date(photos[activePhotoIdx].uploaded_at).toLocaleString('ko-KR')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Remarks / Memo section */}
                                        <div className="bg-[#12121a]/50 border border-white/5 rounded-2xl p-4 space-y-2.5">
                                            <p className="text-xs font-black text-slate-400">메모 / 특이사항</p>
                                            <div className="text-xs font-bold text-slate-200 leading-relaxed bg-[#0c0c12]/50 border border-white/5 rounded-xl p-3 min-h-[80px]">
                                                {photos[activePhotoIdx].remark || "등록된 메모가 없습니다."}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons Panel at bottom of sidebar */}
                                <div className="space-y-2 pt-6 border-t border-white/5">
                                    <div className="grid grid-cols-2 gap-2">
                                        <a 
                                            href={`/api/photos/view?filename=${encodeURIComponent(photos[activePhotoIdx].photo_path)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-3 rounded-xl bg-[#12121a] border border-white/5 hover:border-white/10 text-sky-400 hover:bg-sky-500 hover:text-white transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                            title="새 탭에서 원본 보기"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" /> 원본 보기
                                        </a>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDownload(photos[activePhotoIdx]); }}
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
                                                    onClick={(e) => { e.stopPropagation(); handleRestorePhoto(photos[activePhotoIdx], e); }}
                                                    className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:text-white hover:bg-sky-500 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                                    title="사진 복구"
                                                >
                                                    <RotateCw className="w-3.5 h-3.5" /> 복구
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeletePhotoPermanently(photos[activePhotoIdx], e); }}
                                                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                                    title="사진 영구 삭제"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> 영구 삭제
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(photos[activePhotoIdx], e); }}
                                                className="w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:text-white hover:bg-rose-600 transition-all flex items-center justify-center gap-1.5 text-xs font-black"
                                                title="사진 삭제 (휴지통으로 이동)"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" /> 사진 삭제 (휴지통 이동)
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Right Main View (Image Area) */}
                            <div className="flex-1 flex flex-col justify-between p-2 md:p-4 relative h-[70vh] md:h-full" onClick={(e) => e.stopPropagation()}>
                                {/* Mobile Header only */}
                                <div className="flex items-center justify-between z-10 shrink-0 md:hidden">
                                    <div className="text-left">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">사진 상세 보기</span>
                                    </div>
                                    <button 
                                        onClick={() => { setActivePhotoIdx(null); resetZoom(); }}
                                        className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white transition-all"
                                        title="닫기"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Main Image display & navigation */}
                                <div className="flex-1 flex items-center justify-center relative w-full my-2">
                                    {/* Left Arrow */}
                                    <button 
                                        onClick={handlePrevPhoto}
                                        className="absolute left-2 md:left-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10"
                                    >
                                        <ChevronLeft className="w-6 h-6" />
                                    </button>

                                    {/* Image Wrapper */}
                                    <div className="max-w-full max-h-[92vh] flex items-center justify-center relative overflow-hidden select-none">
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
                                        onClick={handleNextPhoto}
                                        className="absolute right-2 md:right-6 p-3 rounded-2xl bg-black/40 border border-white/5 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-10"
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </button>
                                </div>

                                {/* Slide index on bottom-left for mobile */}
                                <div className="text-center text-[10px] text-slate-500 font-bold md:hidden shrink-0 z-10">
                                    {selectedContainerFolder && folderPhotos.length > 0 && (
                                        <span>{currentPhotoIndex + 1} / {folderPhotos.length}</span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Local Copy Modal */}
                <AnimatePresence>
                    {isLocalCopyOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                onClick={() => setIsLocalCopyOpen(false)} 
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
                                                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-emerald-500 outline-none text-slate-200 transition-all placeholder:text-slate-600" 
                                                placeholder="예: D:\MyDownloads 또는 C:\Users\Downloads" 
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleLocalCopy();
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={handleBrowseFolder}
                                                className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-xs transition-all flex items-center justify-center shrink-0 cursor-pointer"
                                                title="폴더 선택"
                                                disabled={isLoading}
                                            >
                                                찾아보기...
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button 
                                        onClick={() => setIsLocalCopyOpen(false)} 
                                        className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all"
                                    >
                                        취소
                                    </button>
                                    <button 
                                        onClick={handleLocalCopy} 
                                        className="flex-2 py-4 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm transition-all shadow-lg shadow-emerald-500/20"
                                    >
                                        복사 시작
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
