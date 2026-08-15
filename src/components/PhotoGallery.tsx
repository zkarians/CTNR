"use client";

import React, { useState, useEffect } from 'react';
import { 
    X, Calendar, User, Download, Search, Image as ImageIcon, 
    ChevronLeft, ChevronRight, ChevronDown, Loader2, ArrowLeft, Trash2, Folder,
    ExternalLink, RotateCw, RotateCcw, Grid, LayoutGrid, Check, Undo,
    RefreshCw, SkipForward, Upload, Camera, FileText, AlertCircle, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchTeams } from '@/lib/actions/teamActions';
import { SessionUser } from '@/lib/auth';
import { Team } from '@/lib/types';

interface Photo {
    id: string;
    job_id: number;
    cntr_no: string;
    photo_path: string;
    remark: string;
    uploaded_at: string;
    uploaded_by: string;
    team_id?: number;
    team_name?: string;
    uploader_name: string;
    uploader_username: string;
    job_name: string;
    transporter?: string;
    gdrive_file_id?: string;
    gdrive_url?: string;
    is_completed?: boolean;
    photo_type?: string;
}

interface PhotoGalleryProps {
    isOpen: boolean;
    onClose: () => void;
    user: SessionUser;
    initialSearchCntrNo?: string;
    onOpenReport?: () => void;
}


function getWorkDateString(d: Date = new Date()): string {
    const workDate = new Date(d);
    if (workDate.getHours() < 13) {
        workDate.setDate(workDate.getDate() - 1);
    }
    return getLocalDateString(workDate);
}

function formatKoreanDate(dateStr: string): string {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[dateObj.getDay()];
        return `${y}년 ${String(m).padStart(2, '0')}월 ${String(d).padStart(2, '0')}일 (${dayName})`;
    } catch (e) {
        return dateStr;
    }
}

function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function PhotoGallery({ isOpen, onClose, user, initialSearchCntrNo, onOpenReport }: PhotoGalleryProps) {
    const isAdmin = user && (user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'MANAGER');

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Sort State
    const [sortBy, setSortBy] = useState<'UPLOAD_DESC' | 'UPLOAD_ASC' | 'CREATION_DESC' | 'CREATION_ASC' | 'NAME_ASC' | 'NAME_DESC'>('NAME_ASC');
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
    const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
    const [rotationOffsets, setRotationOffsets] = useState<{ [photoId: string]: number }>({});
    const touchStartXRef = React.useRef<number | null>(null);
    const touchStartYRef = React.useRef<number | null>(null);

    const [isGDriveProgressOpen, setIsGDriveProgressOpen] = useState(false);
    const [isGDriveUploading, setIsGDriveUploading] = useState(false);
    const [gdriveProgress, setGdriveProgress] = useState({
        current: 0,
        total: 0,
        percent: 0,
        currentFile: '',
        status: 'IDLE',
        uploadedCount: 0,
        skippedCount: 0,
        cleanedCount: 0,
        freedMB: '0.0',
        alreadyDoneCount: 0
    });
    const [lastGDriveTargetIds, setLastGDriveTargetIds] = useState<string[]>([]);
    const gdriveAbortControllerRef = React.useRef<AbortController | null>(null);

    // Move Container State
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [targetMoveCntrNo, setTargetMoveCntrNo] = useState('');
    const [isMoving, setIsMoving] = useState(false);

    // Rename State
    const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
    const [editFilename, setEditFilename] = useState('');

    type ActionType = 'LOCAL_COPY' | 'ZIP_DOWNLOAD' | 'GDRIVE_BACKUP';
    const [warningModalInfo, setWarningModalInfo] = useState<{ isOpen: boolean, action: ActionType | null, missingCntrs: string[] }>({ isOpen: false, action: null, missingCntrs: [] });

    const checkMissingSealPhotos = () => {
        if (selectedFolders.length === 0) return [];
        const foldersToProcess = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
        const missing = foldersToProcess.filter(f => f.photos.length > 0 && !f.photos.some(p => p.photo_type === 'seal'));
        return Array.from(new Set(missing.map(f => f.cntrNo)));
    };

    const handleActionWithCheck = (action: ActionType, e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        
        if (selectedFolders.length === 0 && selectedPhotoIds.length === 0) {
            alert("작업할 컨테이너 폴더를 하나 이상 선택해 주세요.\n(폴더 카드의 체크박스를 선택하거나 날짜 타이틀 옆의 '전체 선택'을 체크해 주세요)");
            return;
        }

        const missingCntrs = checkMissingSealPhotos();
        if (missingCntrs.length > 0) {
            setWarningModalInfo({ isOpen: true, action, missingCntrs });
        } else {
            executeAction(action);
        }
    };

    const executeAction = (action: ActionType) => {
        if (action === 'LOCAL_COPY') {
            setIsLocalCopyOpen(true);
        } else if (action === 'ZIP_DOWNLOAD') {
            handleDownloadSelectedFoldersZip();
        } else if (action === 'GDRIVE_BACKUP') {
            handleUploadToGDriveAndCleanLocal();
        }
    };

    const handleExecuteMovePhotos = async () => {
        const targetCntrNo = targetMoveCntrNo.trim().toUpperCase();
        if (!targetCntrNo) {
            alert("이동할 컨테이너 번호를 입력해 주세요.");
            return;
        }

        const currentPhoto = activePhotoIdx !== null && photos[activePhotoIdx] ? photos[activePhotoIdx] : null;
        const idsToMove = selectedPhotoIds.length > 0
            ? selectedPhotoIds
            : (currentPhoto ? [currentPhoto.id] : []);

        if (idsToMove.length === 0) {
            alert("이동할 사진을 선택해 주세요.");
            return;
        }

        setIsMoving(true);
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'move_container',
                    ids: idsToMove,
                    targetCntrNo
                })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                alert(`사진 이동 실패: ${data.error || '알 수 없는 오류'}`);
                return;
            }

            alert(data.message || `사진 ${idsToMove.length}장이 '${targetCntrNo}' 컨테이너로 성공적으로 이동되었습니다.`);
            setIsMoveModalOpen(false);
            setTargetMoveCntrNo('');
            setSelectedPhotoIds(prev => prev.filter(id => !idsToMove.includes(id)));
            loadPhotos();
        } catch (err: any) {
            console.error("Move photos error:", err);
            alert(`사진 이동 실패: ${err.message || '네트워크 오류'}`);
        } finally {
            setIsMoving(false);
        }
    };

    const lastSelectedPhotoIdRef = React.useRef<string | null>(null);

    const toggleSelectPhoto = (photoId: string, e?: React.MouseEvent, currentList?: Photo[]) => {
        if (e) e.stopPropagation();

        if (e?.shiftKey && lastSelectedPhotoIdRef.current && currentList && currentList.length > 0) {
            const lastIdx = currentList.findIndex(p => p.id === lastSelectedPhotoIdRef.current);
            const currentIdx = currentList.findIndex(p => p.id === photoId);
            if (lastIdx !== -1 && currentIdx !== -1) {
                const start = Math.min(lastIdx, currentIdx);
                const end = Math.max(lastIdx, currentIdx);
                const rangeIds = currentList.slice(start, end + 1).map(p => p.id);
                setSelectedPhotoIds(prev => Array.from(new Set([...prev, ...rangeIds])));
                lastSelectedPhotoIdRef.current = photoId;
                return;
            }
        }

        lastSelectedPhotoIdRef.current = photoId;
        setSelectedPhotoIds(prev => 
            prev.includes(photoId) ? prev.filter(id => id !== photoId) : [...prev, photoId]
        );
    };

    const handleToggleSelectAllPhotos = (visiblePhotos: Photo[]) => {
        const visibleIds = visiblePhotos.map(p => p.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedPhotoIds.includes(id));
        if (allSelected) {
            setSelectedPhotoIds(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            setSelectedPhotoIds(prev => Array.from(new Set([...prev, ...visibleIds])));
        }
    };

    const handleDeleteSelectedPhotos = async () => {
        if (selectedPhotoIds.length === 0) return;
        if (!confirm(`선택한 사진 총 ${selectedPhotoIds.length}장을 휴지통으로 이동하시겠습니까?`)) return;
        
        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(selectedPhotoIds.join(','))}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message || `선택한 사진 ${selectedPhotoIds.length}장이 휴지통으로 이동되었습니다.`);
                setSelectedPhotoIds([]);
                loadPhotos();
            } else {
                alert(`삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete selected photos error:", error);
            alert("사진 삭제 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSelectedPhotosPermanently = async () => {
        if (selectedPhotoIds.length === 0) return;
        if (!confirm(`[영구 삭제 경고]\n\n선택한 사진 총 ${selectedPhotoIds.length}장을 완전히 영구 삭제하시겠습니까?\n이 작업은 복구할 수 없으며 파일이 영구히 삭제됩니다.`)) return;
        if (!confirm("정말로 영구 삭제하시겠습니까? 이 작업은 절대 복구할 수 없습니다!")) return;

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(selectedPhotoIds.join(','))}&permanent=true`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message || "사진이 영구 삭제되었습니다.");
                setSelectedPhotoIds([]);
                loadPhotos();
            } else {
                alert(`영구 삭제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Delete selected photos permanently error:", error);
            alert("사진 영구 삭제 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRotatePhotos = async (degrees: number, singlePhotoId?: string) => {
        const targetIds = singlePhotoId ? [singlePhotoId] : selectedPhotoIds;
        if (targetIds.length === 0) return;
        
        // 1. Immediately apply rotation offset to UI (0ms instant response without full-page spinner)
        setRotationOffsets(prev => {
            const next = { ...prev };
            targetIds.forEach(id => {
                next[id] = ((next[id] || 0) + degrees) % 360;
            });
            return next;
        });

        // 2. Perform background async rotation on server without blocking UI
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'rotate',
                    ids: targetIds,
                    degrees
                })
            });
            const data = await res.json();
            if (data.success) {
                const now = Date.now();
                setPhotos(prev => prev.map(p => {
                    if (targetIds.includes(p.id)) {
                        return { ...p, photo_path: p.photo_path.split('?')[0] + '?t=' + now };
                    }
                    return p;
                }));
                // Clear temporary rotation offsets for saved photos
                setRotationOffsets(prev => {
                    const next = { ...prev };
                    targetIds.forEach(id => {
                        delete next[id];
                    });
                    return next;
                });
                if (!singlePhotoId) {
                    setSelectedPhotoIds([]);
                }
            } else {
                console.error("Rotate failed on server:", data.error);
                // Rollback on server error
                setRotationOffsets(prev => {
                    const next = { ...prev };
                    targetIds.forEach(id => {
                        next[id] = ((next[id] || 0) - degrees) % 360;
                    });
                    return next;
                });
                alert(`회전 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error("Rotate error:", error);
            // Rollback on error
            setRotationOffsets(prev => {
                const next = { ...prev };
                targetIds.forEach(id => {
                    next[id] = ((next[id] || 0) - degrees) % 360;
                });
                return next;
            });
            alert("사진 회전 중 통신 오류가 발생했습니다.");
        }
    };

    const handleToggleSealPhoto = async (photo: Photo) => {
        const newType = photo.photo_type === 'seal' ? 'normal' : 'seal';
        const confirmMsg = newType === 'seal' 
            ? '이 사진을 정식 [씰(Seal) 사진]으로 지정하시겠습니까?\n\n지정 시 해당 컨테이너 폴더의 씰 누락 빨간색 깜빡임이 해제되고, 보고서에도 씰 사진으로 정상 반영됩니다.'
            : '이 사진의 씰(Seal) 지정을 해제하고 [일반 사진]으로 변경하시겠습니까?';
        
        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_photo_type',
                    id: photo.id,
                    photo_type: newType
                })
            });
            const data = await res.json();
            if (data.success) {
                setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, photo_type: newType } : p));
                alert(data.message || '사진 구분이 성공적으로 변경되었습니다.');
            } else {
                alert(`변경 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error("Update photo type error:", error);
            alert("사진 구분 변경 중 오류가 발생했습니다.");
        }
    };

    const handleBatchToggleSealPhoto = async (targetType: 'seal' | 'normal') => {
        if (selectedPhotoIds.length === 0) return;

        const currentSelectedPhotos = photos.filter(p => selectedPhotoIds.includes(p.id));
        const targetPhotos = currentSelectedPhotos.filter(p => targetType === 'seal' ? p.photo_type !== 'seal' : p.photo_type === 'seal');
        const targetIds = (targetPhotos.length > 0 ? targetPhotos : currentSelectedPhotos).map(p => p.id);

        if (targetIds.length === 0) return;

        const count = targetIds.length;
        let confirmMsg = '';
        if (targetType === 'seal') {
            confirmMsg = count === 1
                ? '선택한 사진을 정식 [씰(Seal) 사진]으로 지정하시겠습니까?\n\n지정 시 해당 컨테이너 폴더의 씰 누락 빨간색 깜빡임이 해제되고, 보고서에도 씰 사진으로 정상 반영됩니다.'
                : (targetPhotos.length < selectedPhotoIds.length
                    ? `선택한 사진 중 일반 사진 ${count}장을 [씰(Seal) 사진]으로 일괄 지정하시겠습니까?`
                    : `선택한 사진 ${count}장을 [씰(Seal) 사진]으로 일괄 지정하시겠습니까?`);
        } else {
            confirmMsg = count === 1
                ? '선택한 사진의 씰(Seal) 지정을 해제하고 [일반 사진]으로 변경하시겠습니까?'
                : (targetPhotos.length < selectedPhotoIds.length
                    ? `선택한 사진 중 씰 사진 ${count}장의 지정을 해제하고 [일반 사진]으로 변경하시겠습니까?`
                    : `선택한 사진 ${count}장의 씰 지정을 해제하고 [일반 사진]으로 변경하시겠습니까?`);
        }

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_photo_type',
                    ids: targetIds,
                    photo_type: targetType
                })
            });
            const data = await res.json();
            if (data.success) {
                setPhotos(prev => prev.map(p => targetIds.includes(p.id) ? { ...p, photo_type: targetType } : p));
                alert(data.message || '사진 구분이 성공적으로 변경되었습니다.');
            } else {
                alert(`변경 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error("Batch update photo type error:", error);
            alert("사진 구분 변경 중 오류가 발생했습니다.");
        }
    };

    const handleRestoreSelectedPhotos = async () => {
        if (selectedPhotoIds.length === 0) return;
        if (!confirm(`선택한 사진 총 ${selectedPhotoIds.length}장을 복구하시겠습니까?`)) return;

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(selectedPhotoIds.join(','))}`, {
                method: 'PATCH'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message || "사진이 성공적으로 복구되었습니다.");
                setSelectedPhotoIds([]);
                loadPhotos();
            } else {
                alert(`복구 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Restore selected photos error:", error);
            alert("사진 복구 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResumeGDriveExport = () => {
        if (!lastGDriveTargetIds || lastGDriveTargetIds.length === 0) {
            alert("이전 백업 시도 기록을 찾을 수 없습니다. 폴더를 선택해 주세요.");
            return;
        }

        const allCurrentPhotos = folders.flatMap(f => f.photos);
        const missingIds = lastGDriveTargetIds.filter(id => {
            const photo = allCurrentPhotos.find(p => p.id === id);
            return photo ? !photo.gdrive_file_id : true;
        });

        if (missingIds.length === 0) {
            alert("🎉 이미 모든 사진이 구글드라이브에 완비되어 있습니다!");
            return;
        }

        handleUploadToGDriveAndCleanLocal(missingIds, true);
    };

    const handleUploadToGDriveAndCleanLocal = async (customTargetIds?: any, isResumeAction: boolean = false) => {
        // Extract exact photo IDs to ensure 100% accurate total count
        let targetIds: string[] = [];

        if (Array.isArray(customTargetIds) && customTargetIds.length > 0) {
            targetIds = customTargetIds;
        } else if (selectedPhotoIds.length > 0) {
            targetIds = [...selectedPhotoIds];
            setLastGDriveTargetIds(targetIds);
        } else if (selectedFolders.length > 0) {
            targetIds = folders
                .filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr))
                .flatMap(f => f.photos.map(p => p.id));
            setLastGDriveTargetIds(targetIds);
        } else {
            alert("백업할 컨테이너 폴더를 하나 이상 선택해 주세요.\n(폴더 카드의 체크박스를 선택하거나 날짜 타이틀 옆의 'OO일 전체 선택'을 체크해 주세요)");
            return;
        }

        if (targetIds.length === 0) {
            alert("구글드라이브로 백업할 사진이 없습니다.");
            return;
        }

        if (!isResumeAction) {
            const countText = selectedPhotoIds.length > 0 
                ? `선택한 사진 ${targetIds.length}장` 
                : selectedFolders.length > 0 
                    ? `선택한 컨테이너 폴더의 사진 ${targetIds.length}장` 
                    : `현재 탭의 전체 사진 ${targetIds.length}장`;

            if (!confirm(`[☁️ 구글드라이브 백업 & 로컬 용량 정리]\n\n${countText}을(를) 구글드라이브로 안전 백업하고, 업로드 확인 후 로컬 PC의 디스크 공간을 정리하시겠습니까?\n(※ 이전에 이미 완료된 파일은 자동 스킵되며, 남은 파일만 이어서 진행됩니다.)`)) {
                return;
            }
        }

        setIsGDriveProgressOpen(true);
        setIsGDriveUploading(true);
        setGdriveProgress({
            current: 0,
            total: targetIds.length,
            percent: 0,
            currentFile: '작업 준비 중...',
            status: 'STARTING',
            uploadedCount: 0,
            skippedCount: 0,
            cleanedCount: 0,
            freedMB: '0.0',
            alreadyDoneCount: 0
        });

        const abortController = new AbortController();
        gdriveAbortControllerRef.current = abortController;

        try {
            const bodyData = { 
                action: 'upload_gdrive',
                ids: targetIds
            };

            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData),
                signal: abortController.signal
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
            }

            if (!res.body) throw new Error("ReadableStream not supported.");

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
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
                        const event = JSON.parse(line.trim());
                        if (event.type === 'start') {
                            setGdriveProgress(prev => ({
                                ...prev,
                                total: event.total,
                                alreadyDoneCount: event.alreadyDoneCount || 0
                            }));
                        } else if (event.type === 'progress') {
                            setGdriveProgress(prev => ({
                                ...prev,
                                current: event.current,
                                total: event.total,
                                percent: event.percent,
                                currentFile: event.currentFile,
                                status: event.status,
                                uploadedCount: event.uploadedCount !== undefined ? event.uploadedCount : prev.uploadedCount,
                                skippedCount: event.skippedCount !== undefined ? event.skippedCount : prev.skippedCount,
                                cleanedCount: event.cleanedCount !== undefined ? event.cleanedCount : prev.cleanedCount,
                                freedMB: event.freedMB || prev.freedMB
                            }));
                        } else if (event.type === 'done') {
                            setGdriveProgress(prev => ({
                                ...prev,
                                percent: 100,
                                freedMB: event.freedMB,
                                uploadedCount: event.uploadedCount,
                                skippedCount: event.skippedCount,
                                cleanedCount: event.cleanedCount
                            }));
                            setTimeout(() => {
                                alert(event.message);
                                setSelectedPhotoIds([]);
                                setSelectedFolders([]);
                                loadPhotos();
                            }, 300);
                        } else if (event.type === 'error') {
                            console.warn("[GDrive Warning]", event.filename, event.error);
                        } else if (event.type === 'fatal_error') {
                            alert(`백업 중 오류가 발생했습니다: ${event.error}`);
                        }
                    } catch (e) {
                        console.error("NDJSON parse error:", e);
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                alert('구글 드라이브 백업 작업이 사용자에 의해 중지되었습니다.');
            } else {
                console.error("GDrive upload error:", error);
                alert(`구글드라이브 업로드 중 오류가 발생했습니다:\n${error.message}`);
            }
        } finally {
            setIsGDriveUploading(false);
            gdriveAbortControllerRef.current = null;
            loadPhotos();
        }
    };

    const handleStopGDriveUpload = () => {
        if (gdriveAbortControllerRef.current) {
            gdriveAbortControllerRef.current.abort();
        }
    };

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

    const getPhotoViewUrl = (pathStr: string, download = false) => {
        if (!pathStr) return '';
        const rawPath = pathStr.split('?')[0];
        const cacheQuery = pathStr.includes('?t=') ? '&t=' + pathStr.split('?t=')[1] : '';
        return `/api/photos/view?filename=${encodeURIComponent(rawPath)}${cacheQuery}${download ? '&download=1' : ''}`;
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
            setSelectedTeamId('');
        } else {
            setSelectedTeamId(user?.teamId ? String(user.teamId) : '');
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

    React.useEffect(() => {
        setSelectedPhotoIds([]);
    }, [selectedContainerFolder, tabState]);
    
    // Group photos by container number and work date
    const folders = React.useMemo(() => {
        const group: { [groupKey: string]: Photo[] } = {};
        photos.forEach(photo => {
            if (!photo.cntr_no) return;
            const cntrNo = photo.cntr_no.toUpperCase().trim();
            const workDateStr = getWorkDateString(new Date(photo.uploaded_at));
            const key = `${cntrNo}_${workDateStr}`;
            if (!group[key]) {
                group[key] = [];
            }
            group[key].push(photo);
        });
        
        return Object.entries(group).map(([groupKey, list]) => {
            const lastUnderscore = groupKey.lastIndexOf('_');
            const cntrNo = groupKey.substring(0, lastUnderscore);
            const workDateStr = groupKey.substring(lastUnderscore + 1);
            return {
                cntrNo,
                workDateStr,
                photos: list,
                transporter: list[0]?.transporter,
                firstUploadedAt: new Date(Math.min(...list.map(p => new Date(p.uploaded_at).getTime()))),
                lastUploadedAt: new Date(Math.max(...list.map(p => new Date(p.uploaded_at).getTime()))),
                teamNames: Array.from(new Set(list.map(p => p.team_name || '미지정 조'))).join(', '),
                uploaderNames: Array.from(new Set(list.map(p => {
                    const name = p.uploader_name || p.uploader_username;
                    return (name && name.trim()) ? name : '퇴사자';
                }))).join(', ')
            };
        }).sort((a, b) => b.lastUploadedAt.getTime() - a.lastUploadedAt.getTime());
    }, [photos]);

    const [folderViewMode, setFolderViewMode] = useState<'DATE_GROUP' | 'FLAT'>('DATE_GROUP');
    const [isTeamGroupEnabled, setIsTeamGroupEnabled] = useState<boolean>(true);
    const [collapsedDates, setCollapsedDates] = useState<{ [dateStr: string]: boolean }>({});

    const toggleCollapseDate = (dateStr: string) => {
        setCollapsedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
    };

    const foldersByWorkDate = React.useMemo(() => {
        const dateMap = new Map<string, typeof folders>();
        folders.forEach(folder => {
            const workDateStr = folder.workDateStr;
            if (!dateMap.has(workDateStr)) {
                dateMap.set(workDateStr, []);
            }
            dateMap.get(workDateStr)!.push(folder);
        });

        return Array.from(dateMap.entries()).map(([dateStr, folderList]) => {
            const totalPhotos = folderList.reduce((sum, f) => sum + f.photos.length, 0);

            // Sub group by team inside date
            const subTeamMap = new Map<string, typeof folders>();
            folderList.forEach(f => {
                const teamName = f.teamNames || '미지정 조';
                if (!subTeamMap.has(teamName)) {
                    subTeamMap.set(teamName, []);
                }
                subTeamMap.get(teamName)!.push(f);
            });

            const byTeam = Array.from(subTeamMap.entries()).map(([teamName, subFolders]) => ({
                teamName,
                folders: subFolders,
                totalPhotos: subFolders.reduce((sum, sf) => sum + sf.photos.length, 0)
            })).sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko-KR'));

            return {
                dateStr,
                folders: folderList,
                byTeam,
                totalPhotos
            };
        }).sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    }, [folders]);

    const handleToggleSelectDateGroup = (dateFolders: typeof folders) => {
        const folderKeys = dateFolders.map(f => f.cntrNo + '|' + f.workDateStr);
        const allSelected = folderKeys.length > 0 && folderKeys.every(key => selectedFolders.includes(key));
        if (allSelected) {
            setSelectedFolders(prev => prev.filter(key => !folderKeys.includes(key)));
        } else {
            setSelectedFolders(prev => Array.from(new Set([...prev, ...folderKeys])));
        }
    };

    const handleToggleSelectTeamGroup = (teamFolders: typeof folders) => {
        const folderKeys = teamFolders.map(f => f.cntrNo + '|' + f.workDateStr);
        const allSelected = folderKeys.length > 0 && folderKeys.every(key => selectedFolders.includes(key));
        if (allSelected) {
            setSelectedFolders(prev => prev.filter(key => !folderKeys.includes(key)));
        } else {
            setSelectedFolders(prev => Array.from(new Set([...prev, ...folderKeys])));
        }
    };


    const folderPhotos = React.useMemo(() => {
        if (!selectedContainerFolder) return [];
        const [cntrNo, workDateStr] = selectedContainerFolder.split('|');
        const filtered = photos.filter(p => p.cntr_no === cntrNo && (!workDateStr || getWorkDateString(new Date(p.uploaded_at)) === workDateStr));
        
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


    const renderFolderItem = (folder: typeof folders[0]) => {
        const hasUnsynced = isCompletedView && folder.photos.length > 0 && folder.photos.some(p => !p.gdrive_file_id);
        
        return (
        <div
            key={folder.cntrNo + '_' + folder.workDateStr}
            onClick={() => setSelectedContainerFolder(folder.cntrNo + '|' + folder.workDateStr)}
            className={`group relative flex flex-col bg-white border rounded-2xl p-3.5 cursor-pointer shadow-2xs hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.01] select-none text-slate-800 ${
                hasUnsynced ? 'border-rose-500 border-[2px] shadow-rose-500/10' : 'border-slate-200 hover:border-sky-400'
            }`}
        >
            {/* Top row: Checkbox, Folder icon, Title/Carrier, Count Badge */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                        <input 
                            type="checkbox"
                            checked={selectedFolders.includes(folder.cntrNo + '|' + folder.workDateStr)}
                            onChange={(e) => {
                                const folderKey = folder.cntrNo + '|' + folder.workDateStr;
                                setSelectedFolders(prev => 
                                    prev.includes(folderKey) 
                                        ? prev.filter(name => name !== folderKey)
                                        : [...prev, folderKey]
                                );
                            }}
                            className={`w-3.5 h-3.5 rounded border-slate-300 bg-white cursor-pointer ${
                                isTrashView 
                                    ? 'text-purple-600 focus:ring-purple-500' 
                                    : isCompletedView 
                                        ? 'text-emerald-600 focus:ring-emerald-500' 
                                        : 'text-sky-600 focus:ring-sky-500'
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
                <div className="flex items-center gap-1.5 shrink-0">
                    {(() => {
                        const gdriveCnt = folder.photos.filter(p => !!p.gdrive_file_id).length;
                        const isAllGDrive = folder.photos.length > 0 && gdriveCnt === folder.photos.length;
                        const isPartialGDrive = gdriveCnt > 0 && !isAllGDrive;
                        if (isAllGDrive) {
                            return (
                                <span className="text-xs font-extrabold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-md flex items-center justify-center" title="모든 사진이 구글드라이브에 안전 보관 중입니다 (로컬 용량 정리됨).">
                                    ☁️
                                </span>
                            );
                        } else if (isPartialGDrive) {
                            return (
                                <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md flex items-center gap-1" title={`사진 ${gdriveCnt}/${folder.photos.length}장 구글드라이브 보관 중`}>
                                    ☁️ {gdriveCnt}/{folder.photos.length}
                                </span>
                            );
                        } else {
                            return null;
                        }
                    })()}
                    {folder.photos.length > 0 && !folder.photos.some(p => p.photo_type === 'seal') && (
                        <span title="씰 사진이 업로드되지 않았습니다." className="inline-flex shrink-0 mr-1">
                            <Camera className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                        </span>
                    )}
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
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[9px] text-slate-500 font-bold">
                <span className="truncate max-w-[140px]">
                    조: {folder.teamNames} ({folder.uploaderNames && folder.uploaderNames.trim() ? folder.uploaderNames : '퇴사자'})
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-extrabold text-slate-600" title={`업로드 시각: ${folder.firstUploadedAt ? folder.firstUploadedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`}>
                        {folder.firstUploadedAt ? `${folder.firstUploadedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')} ${folder.firstUploadedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isTrashView ? (
                            isAdmin && (
                                <>
                                    <button
                                        onClick={(e) => handleRestoreFolder(folder, e)}
                                        className="p-1 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:text-white hover:bg-sky-500 transition-all cursor-pointer"
                                        title="폴더 복구"
                                    >
                                        <RotateCw className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteFolderPermanently(folder, e)}
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
                                        onClick={(e) => handleToggleCompleteFolder(folder, true, e)}
                                        className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:text-white hover:bg-amber-500 transition-all cursor-pointer"
                                        title="진행 중인 작업으로 변경"
                                    >
                                        <Undo className="w-2.5 h-2.5" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={(e) => handleToggleCompleteFolder(folder, false, e)}
                                        className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:text-white hover:bg-emerald-500 transition-all cursor-pointer"
                                        title="작업 완료 처리"
                                    >
                                        <Check className="w-2.5 h-2.5" />
                                    </button>
                                )}
                                {/* Delete (Admin Only) */}
                                {isAdmin && (
                                    <button
                                        onClick={(e) => handleDeleteFolder(folder, e)}
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
    );
    };

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [searchCntrNo, setSearchCntrNo] = useState('');

    React.useEffect(() => {
        if (isOpen && initialSearchCntrNo) {
            setSearchCntrNo(initialSearchCntrNo);
            setStartDate('');
            setEndDate('');
            setSelectedTeamId('');
            if (folders.length > 0) {
                const targetStr = initialSearchCntrNo.toUpperCase().trim();
                const targetFolder = folders.find(f => f.cntrNo.toUpperCase().trim() === targetStr);
                if (targetFolder) {
                    const folderKey = targetFolder.cntrNo + '|' + targetFolder.workDateStr;
                    setSelectedContainerFolder(folderKey);

                    const allCompleted = targetFolder.photos.length > 0 && targetFolder.photos.every(p => p.is_completed);
                    if (allCompleted) {
                        setTabState('COMPLETED');
                    } else {
                        setTabState('ACTIVE');
                    }

                    if (targetFolder.photos.length > 0) {
                        setActivePhotoIdx(null);
                    }
                }
            }
        }
    }, [isOpen, initialSearchCntrNo, folders]);

    // Local copy state
    const [isLocalCopyOpen, setIsLocalCopyOpen] = useState(false);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const [localCopyPath, setLocalCopyPath] = useState('');
    const [autoTeamSubfolder, setAutoTeamSubfolder] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ctnr_auto_team_subfolder');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [isCopying, setIsCopying] = useState(false);
    const [copyProgress, setCopyProgress] = useState<{ current: number; total: number; percent: number; currentFile: string; copiedCount: number; skippedCount: number }>({
        current: 0,
        total: 0,
        percent: 0,
        currentFile: '',
        copiedCount: 0,
        skippedCount: 0
    });
    const abortControllerRef = React.useRef<AbortController | null>(null);

    // Helper to summarize selected folders by team
    const selectedTeamSummary = React.useMemo(() => {
        const summary: Record<string, { count: number; containers: string[] }> = {};
        selectedFolders.forEach(key => {
            const folder = folders.find(f => (f.cntrNo + '|' + f.workDateStr) === key);
            const rawTeam = folder?.photos[0]?.team_name || folder?.teamNames || '';
            let cleanTeam = '기타조';
            if (rawTeam.includes('1조')) cleanTeam = '1조';
            else if (rawTeam.includes('2조')) cleanTeam = '2조';
            else if (rawTeam.includes('3조')) cleanTeam = '3조';
            else if (rawTeam.includes('4조')) cleanTeam = '4조';
            else if (rawTeam.includes('5조')) cleanTeam = '5조';
            else if (rawTeam) cleanTeam = rawTeam.split('(')[0].trim() || rawTeam;
            
            if (!summary[cleanTeam]) {
                summary[cleanTeam] = { count: 0, containers: [] };
            }
            summary[cleanTeam].count++;
            summary[cleanTeam].containers.push(folder?.cntrNo || key.split('|')[0]);
        });
        return summary;
    }, [selectedFolders, folders]);

    // Helper to summarize selected photos
    const selectedPhotoObjects = React.useMemo(() => {
        if (!selectedPhotoIds || selectedPhotoIds.length === 0) return [];
        return photos.filter(p => selectedPhotoIds.includes(p.id));
    }, [photos, selectedPhotoIds]);

    const hasNormalInSelection = React.useMemo(() => {
        return selectedPhotoObjects.some(p => p.photo_type !== 'seal');
    }, [selectedPhotoObjects]);

    const hasSealInSelection = React.useMemo(() => {
        return selectedPhotoObjects.some(p => p.photo_type === 'seal');
    }, [selectedPhotoObjects]);

    // Helper to determine the target team key for saving/loading local copy path
    const getActiveTeamStorageInfo = () => {
        if (selectedFolders.length > 0) {
            const selectedFolderObjs = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
            const teamName = selectedFolderObjs.find(f => f.photos[0]?.team_name)?.photos[0]?.team_name;
            if (teamName && teamName.trim()) {
                const cleanName = teamName.trim();
                return {
                    teamKey: `team_${cleanName}`,
                    teamName: cleanName
                };
            }
        }
        if (selectedTeamId) {
            const team = teams.find(t => String(t.id) === String(selectedTeamId));
            const teamName = team ? team.name.trim() : selectedTeamId;
            return {
                teamKey: `team_${teamName}`,
                teamName
            };
        }
        return {
            teamKey: 'all',
            teamName: '전체'
        };
    };

    const saveLocalCopyPathToStorage = (path: string) => {
        if (typeof window === 'undefined' || !path.trim()) return;
        const { teamKey } = getActiveTeamStorageInfo();
        const trimmed = path.trim();
        localStorage.setItem(`localCopyTargetPath_${teamKey}`, trimmed);
        localStorage.setItem(`localCopyTargetPath_${selectedTeamId || 'all'}`, trimmed);
        localStorage.setItem('localCopyTargetPath_last', trimmed);
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const { teamKey } = getActiveTeamStorageInfo();
            const savedPath = localStorage.getItem(`localCopyTargetPath_${teamKey}`) 
                           || localStorage.getItem(`localCopyTargetPath_${selectedTeamId || 'all'}`)
                           || localStorage.getItem('localCopyTargetPath_last') 
                           || '';
            if (savedPath) {
                setLocalCopyPath(savedPath);
            }
        }
    }, [isLocalCopyOpen, selectedTeamId, selectedFolders]);
    
    // Load teams once on mount
    useEffect(() => {
        const loadTeamsList = async () => {
            try {
                const data = await fetchTeams();
                setTeams(data);
            } catch (error) {
                console.error("Error loading teams:", error);
            }
        };
        loadTeamsList();
        
        // Initialize filters with yesterday as start date
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        
        setEndDate(getLocalDateString(today));
        setStartDate(getLocalDateString(yesterday));
    }, [user]);

    // Force non-admins to view their selected team if available
    useEffect(() => {
        if (isOpen && user) {
            if (!isAdmin && user.teamId && !initialSearchCntrNo) {
                setSelectedTeamId(String(user.teamId));
            }
        }
    }, [isOpen, user, isAdmin, initialSearchCntrNo]);

    // Load photos
    const loadPhotos = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedTeamId) params.append('teamId', selectedTeamId);
            if (isTrashView) params.append('showTrash', 'true');
            if (isCompletedView) params.append('showCompleted', 'true');
            if (searchCntrNo) params.append('cntrNo', searchCntrNo);
            
            const res = await fetch(`/api/photos?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setPhotos(data.photos);
                setSelectedFolders([]);
            } else {
                if (res.status === 401 || data.error?.includes('인증되지 않은')) {
                    // Ignore auth errors during logout
                } else {
                    console.error("Error fetching photos:", data.error);
                }
            }
        } catch (error: any) {
            if (error?.message?.includes('인증되지 않은')) {
                // Ignore
            } else {
                console.error("Error loading photos:", error);
            }
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
    }, [isOpen, startDate, endDate, selectedTeamId, tabState, searchCntrNo]);

    // Fetch duplicate photo IDs when selectedContainerFolder changes
    useEffect(() => {
        if (selectedContainerFolder) {
            const [cntrNo, workDateStr] = selectedContainerFolder.split('|');
            fetch(`/api/photos/duplicates?cntrNo=${encodeURIComponent(cntrNo)}&workDate=${encodeURIComponent(workDateStr || '')}`)
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

    const handleDeleteFolder = async (folder: typeof folders[0], e: React.MouseEvent) => {
        e.stopPropagation();
        
        const confirmMsg = `컨테이너 '${folder.cntrNo}' 폴더와 그 안의 사진 총 ${folder.photos.length}장을 모두 휴지통으로 이동하시겠습니까?`;
        if (!confirm(confirmMsg)) {
            return;
        }
        if (!confirm("정말 삭제(휴지통 이동)하시겠습니까?")) {
            return;
        }

        setIsLoading(true);
        try {
            const photoIds = folder.photos.map(p => p.id).join(',');
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(photoIds)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert("폴더가 휴지통으로 이동되었습니다.");
                if (selectedContainerFolder === (folder.cntrNo + '|' + folder.workDateStr)) {
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

    const handleDeleteFolderPermanently = async (folder: typeof folders[0], e: React.MouseEvent) => {
        e.stopPropagation();
        
        const confirmMsg = `[영구 삭제 경고]\n\n컨테이너 '${folder.cntrNo}' 폴더와 그 안의 사진 총 ${folder.photos.length}장을 완전히 영구 삭제하시겠습니까?\n이 작업은 복구할 수 없으며 서버 디스크에서 파일이 영구히 삭제됩니다.`;
        if (!confirm(confirmMsg)) {
            return;
        }
        if (!confirm("정말로 영구 삭제하시겠습니까? 이 작업은 절대 복구할 수 없습니다!")) {
            return;
        }

        setIsLoading(true);
        try {
            const photoIds = folder.photos.map(p => p.id).join(',');
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(photoIds)}&permanent=true`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert("폴더가 영구 삭제되었습니다.");
                if (selectedContainerFolder === (folder.cntrNo + '|' + folder.workDateStr)) {
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

    const handleRenameSubmit = async (photoId: string, newFilename: string) => {
        if (!newFilename.trim()) {
            alert("파일 이름을 입력해주세요.");
            return;
        }

        try {
            setIsLoading(true);
            const res = await fetch('/api/photos/rename', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoId, newFilename })
            });

            const data = await res.json();
            if (data.success) {
                setPhotos(prev => prev.map(p => {
                    if (p.id === photoId) {
                        return { ...p, photo_path: data.photoPath };
                    }
                    return p;
                }));
                setEditingPhotoId(null);
            } else {
                alert(`이름 변경 실패: ${data.error}`);
            }
        } catch (error) {
            console.error("Rename photo error:", error);
            alert("파일 이름 변경 중 오류가 발생했습니다.");
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

    const handleRestoreFolder = async (folder: typeof folders[0], e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!confirm(`컨테이너 '${folder.cntrNo}' 폴더의 모든 사진을 복구하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const photoIds = folder.photos.map(p => p.id).join(',');
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(photoIds)}`, {
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

    const handleToggleCompleteFolder = async (folder: typeof folders[0], currentCompleted: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        const actionText = currentCompleted ? "진행 중으로 변경" : "완료 처리";
        if (!confirm(`정말로 이 작업을 ${actionText}하시겠습니까?`)) {
            return;
        }

        setIsLoading(true);
        try {
            const photoIds = folder.photos.map(p => p.id).join(',');
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(photoIds)}&complete=${!currentCompleted}`, {
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
            const foldersToProcess = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
            const photoIds = foldersToProcess.flatMap(f => f.photos.map(p => p.id));
            const cntrNos = foldersToProcess.map(f => f.cntrNo);

            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: photoIds,
                    cntrNos: cntrNos,
                    complete: !currentCompleted
                })
            });
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }

            if (res.ok && data?.success !== false) {
                alert(`성공적으로 ${foldersToProcess.length}개 작업을 ${actionText}했습니다.`);
                setSelectedFolders([]);
                loadPhotos();
            } else {
                alert(data?.error || data?.message || `상태 변경 중 오류가 발생했습니다. (HTTP ${res.status})`);
            }
        } catch (error) {
            console.error("Error toggling completion for selected folders:", error);
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCleanupSingleFolderDuplicates = async () => {
        if (!selectedContainerFolder) return;
        const [cntrNo, workDateStr] = selectedContainerFolder.split('|');
        if (!confirm("이 폴더 내의 모든 중복 사진을 정리(휴지통 이동)하시겠습니까?")) {
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/photos/duplicates?cntrNo=${encodeURIComponent(cntrNo)}&workDate=${encodeURIComponent(workDateStr || '')}`, {
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
            const foldersToClean = selectedFolders.map(key => {
                const [cntrNo, workDateStr] = key.split('|');
                return { cntrNo, workDate: workDateStr };
            });
            const res = await fetch('/api/photos/duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folders: foldersToClean })
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
            const foldersToProcess = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
            const photoIds = foldersToProcess.flatMap(f => f.photos.map(p => p.id));
            const res = await fetch('/api/photos', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: photoIds,
                    permanent: isTrashView
                })
            });
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }

            if (res.ok && data?.success !== false) {
                alert(`성공적으로 ${foldersToProcess.length}개 폴더를 ${actionText}했습니다.`);
                setSelectedFolders([]);
                loadPhotos();
            } else {
                alert(data?.error || data?.message || "폴더 삭제 중 오류가 발생했습니다.");
            }
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
            const foldersToProcess = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
            const photoIds = foldersToProcess.flatMap(f => f.photos.map(p => p.id));
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: photoIds
                })
            });
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }

            if (res.ok && data?.success !== false) {
                alert(`성공적으로 ${foldersToProcess.length}개 폴더를 복구했습니다.`);
                setSelectedFolders([]);
                loadPhotos();
            } else {
                alert(data?.error || data?.message || "폴더 복구 중 오류가 발생했습니다.");
            }
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
            setSelectedFolders(folders.map(f => f.cntrNo + '|' + f.workDateStr));
        }
    };

    const handleToggleTeamFolders = (teamFolders: typeof folders) => {
        const teamFolderKeys = teamFolders.map(f => f.cntrNo + '|' + f.workDateStr);
        const allSelected = teamFolderKeys.length > 0 && teamFolderKeys.every(key => selectedFolders.includes(key));
        if (allSelected) {
            setSelectedFolders(prev => prev.filter(key => !teamFolderKeys.includes(key)));
        } else {
            setSelectedFolders(prev => Array.from(new Set([...prev, ...teamFolderKeys])));
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
                    saveLocalCopyPathToStorage(data.path);
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

    const handleLocalCopy = () => {
        const hasSelection = selectedFolders.length > 0 || (selectedPhotoIds && selectedPhotoIds.length > 0);
        if (!hasSelection) {
            alert("복사할 항목을 하나 이상 선택해 주세요.");
            return;
        }
        if (!localCopyPath.trim()) {
            alert("대상 폴더 경로를 입력해 주세요.");
            return;
        }
        setIsConflictModalOpen(true);
    };

    const handleStopCopy = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const executeLocalCopy = async (conflictAction: 'overwrite' | 'skip') => {
        setIsConflictModalOpen(false);
        setIsCopying(true);
        setCopyProgress({ current: 0, total: 0, percent: 0, currentFile: '', copiedCount: 0, skippedCount: 0 });

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const isPhotoSelection = selectedFolders.length === 0 && selectedPhotoIds && selectedPhotoIds.length > 0;
        const targetIds = isPhotoSelection
            ? selectedPhotoIds
            : folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr)).flatMap(f => f.photos.map(p => p.id));

        try {
            const response = await fetch('/api/photos/local-copy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ids: targetIds,
                    targetPath: localCopyPath.trim(),
                    conflictAction,
                    autoTeamSubfolder: isPhotoSelection ? false : autoTeamSubfolder,
                    isDirectPhotoCopy: isPhotoSelection
                }),
                signal: controller.signal
            });

            if (!response.ok || !response.body) {
                setIsCopying(false);
                const errData = await response.json().catch(() => ({}));
                alert(`복사 실패: ${errData.error || '알 수 없는 오류가 발생했습니다.'}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
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
                        if (event.type === 'start') {
                            setCopyProgress(prev => ({
                                ...prev,
                                total: event.total,
                                current: 0,
                                percent: 0
                            }));
                        } else if (event.type === 'progress') {
                            setCopyProgress({
                                current: event.current,
                                total: event.total,
                                percent: event.percent,
                                currentFile: event.currentFile,
                                copiedCount: event.copiedCount,
                                skippedCount: event.skippedCount
                            });
                        } else if (event.type === 'done') {
                            saveLocalCopyPathToStorage(localCopyPath);
                            setCopyProgress(prev => ({
                                ...prev,
                                current: event.total,
                                percent: 100
                            }));
                            setTimeout(() => {
                                alert(event.message);
                                setIsLocalCopyOpen(false);
                                setSelectedFolders([]);
                            }, 150);
                        } else if (event.type === 'aborted') {
                            setTimeout(() => {
                                alert(`복사가 사용자에 의해 중단되었습니다. (완료: ${event.copiedCount}개)`);
                            }, 150);
                        }
                    } catch (e) {
                        console.error("NDJSON parse error:", e);
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                alert('복사 작업이 중지되었습니다.');
            } else {
                console.error("Local copy error:", error);
                alert("로컬 폴더 복사 중 오류가 발생했습니다.");
            }
        } finally {
            setIsCopying(false);
            abortControllerRef.current = null;
        }
    };

    const handleDownloadSelectedFoldersZip = async () => {
        if (selectedFolders.length === 0) {
            alert('다운로드할 폴더를 선택해주세요.');
            return;
        }

        setIsLoading(true);
        try {
            const foldersToProcess = folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
            const photoIds = foldersToProcess.flatMap(f => f.photos.map(p => p.id)).join(',');

            const params = new URLSearchParams();
            params.append('ids', photoIds);

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

    const handleDownloadSelectedPhotos = async () => {
        if (selectedPhotoIds.length === 0) return;

        if (selectedPhotoIds.length === 1) {
            const targetPhoto = photos.find(p => p.id === selectedPhotoIds[0]);
            if (targetPhoto) {
                await handleDownload(targetPhoto);
                return;
            }
        }

        // Multiple photos: download as ZIP
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('ids', selectedPhotoIds.join(','));

            const downloadUrl = `/api/photos/download?${params.toString()}`;
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            a.download = `selected_photos_${todayStr}.zip`;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error) {
            console.error("Download failed:", error);
            alert("사진 다운로드 중 오류가 발생했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (photo: Photo, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const cleanCntr = (photo.cntr_no || "CNTR").replace(/[^a-zA-Z0-9]/g, '_');
        let dateStr = 'DATE';
        let timeStr = 'TIME';
        if (photo.uploaded_at) {
            const dateObj = new Date(photo.uploaded_at);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().slice(0, 10).replace(/-/g, '');
                timeStr = dateObj.toTimeString().slice(0, 8).replace(/:/g, '');
            }
        }
        const downloadFilename = `${cleanCntr}_${dateStr}_${timeStr}.jpg`;

        try {
            const response = await fetch(getPhotoViewUrl(photo.photo_path));
            if (!response.ok) throw new Error("File not found");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download fetch error, falling back to direct download link:', error);
            try {
                const directUrl = getPhotoViewUrl(photo.photo_path, true);
                const a = document.createElement('a');
                a.href = directUrl;
                a.download = downloadFilename;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (fallbackErr) {
                console.error('Fallback download failed:', fallbackErr);
                alert('사진 다운로드 중 오류가 발생했습니다.');
            }
        }
    };

    const handlePrevPhoto = (e?: React.MouseEvent | React.TouchEvent | React.SyntheticEvent) => {
        if (e) e.stopPropagation();
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

    const handleNextPhoto = (e?: React.MouseEvent | React.TouchEvent | React.SyntheticEvent) => {
        if (e) e.stopPropagation();
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
                className="fixed inset-0 z-50 bg-slate-50 flex flex-col w-full h-full text-slate-800 opacity-100 overflow-hidden"
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-slate-200 bg-white shrink-0 shadow-xs transition-colors duration-300">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className={`text-base md:text-xl font-black tracking-tight flex items-center gap-2 transition-colors duration-300 ${
                                isTrashView 
                                    ? "text-purple-700" 
                                    : isCompletedView 
                                        ? "text-emerald-700" 
                                        : "text-sky-700"
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
                    <div className="flex items-center gap-2 shrink-0">
                        {onOpenReport && (
                            <button 
                                onClick={onOpenReport}
                                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500 text-blue-700 hover:text-white border border-blue-500/30 font-black text-xs transition-all cursor-pointer shadow-2xs"
                                title="보고서 보기"
                            >
                                <FileText className="w-4 h-4" />
                                <span>보고서 보기</span>
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-500/30 font-black text-xs transition-all cursor-pointer shadow-2xs"
                            title="사진 보관함 창 닫기"
                        >
                            <X className="w-4 h-4" />
                            <span>닫기</span>
                        </button>
                    </div>
                </header>

                {/* Filter Panel - Mobile-first redesign */}
                <section className="px-3 pt-4 pb-2 md:px-8 md:py-4 border-b border-slate-200 bg-white shrink-0 shadow-2xs mt-0.5">
                    {/* PC: Horizontal layout */}
                    <div className="hidden md:flex flex-row gap-3 items-end">
                        <div className="flex gap-3 flex-1 flex-wrap items-end">
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-sky-600" /> 시작일
                                </label>
                                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                                    className="bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:hover:opacity-100" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-sky-600" /> 종료일
                                </label>
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                                    className="bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:hover:opacity-100" />
                            </div>
                            <div className="space-y-1 w-44">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <User className="w-3 h-3 text-emerald-600" /> 작업 조
                                </label>
                                <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors appearance-none cursor-pointer shadow-2xs">
                                    <option value="">전체 조</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold tracking-wider uppercase flex items-center gap-1">
                                    <Folder className="w-3 h-3 text-sky-600" /> 컨테이너 번호
                                </label>
                                <div className="flex items-center gap-2">
                                    <input type="text" placeholder="컨테이너 번호 입력" value={searchCntrNo}
                                        onChange={(e) => setSearchCntrNo(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') loadPhotos(); }}
                                        className="w-44 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs" />
                                    <button onClick={handleResetFilters}
                                        className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-all font-black text-xs cursor-pointer flex items-center gap-1.5 h-[38px]">
                                        <RotateCcw className="w-3.5 h-3.5" /> 초기화
                                    </button>
                                    <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-xl gap-0.5 h-[38px]">
                                        <button onClick={() => { setTabState('ACTIVE'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                            className={`px-3 py-1.5 rounded-lg transition-all text-xs font-black cursor-pointer whitespace-nowrap ${tabState === 'ACTIVE' ? "bg-sky-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}>
                                            진행 중인 작업
                                        </button>
                                        <button onClick={() => { setTabState('COMPLETED'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                            className={`px-3 py-1.5 rounded-lg transition-all text-xs font-black cursor-pointer whitespace-nowrap ${tabState === 'COMPLETED' ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}>
                                            완료된 작업
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => { setTabState('TRASH'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 text-xs font-black cursor-pointer whitespace-nowrap ${tabState === 'TRASH' ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}>
                                                <Trash2 className="w-3.5 h-3.5" /> 휴지통
                                            </button>
                                        )}
                                    </div>
                                    {selectedContainerFolder !== null && (
                                        <button onClick={() => {
                                            setSelectedContainerFolder(null);
                                            loadPhotos();
                                        }}
                                            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-black text-xs transition-all cursor-pointer h-[38px]"
                                            title="이전 폴더 목록으로 뒤로가기">
                                            <ArrowLeft className="w-3.5 h-3.5" />
                                            <span>뒤로가기</span>
                                        </button>
                                    )}

                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {isAdmin && (
                                <button onClick={() => handleActionWithCheck('GDRIVE_BACKUP')}
                                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 border border-sky-500 hover:bg-sky-500 text-white font-black text-xs transition-all shadow-lg shadow-sky-600/20 cursor-pointer shrink-0"
                                    title="선택한 폴더 또는 완료된 사진들을 구글드라이브에 백업하고 로컬 PC 용량을 정리합니다.">
                                    <Upload className="w-3.5 h-3.5" /> GDrive 백업 & 용량정리
                                </button>
                            )}
                            <button onClick={loadPhotos}
                                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 border border-emerald-600 hover:bg-emerald-400 text-white font-black text-xs transition-all shadow-lg shadow-emerald-500/10 cursor-pointer shrink-0">
                                <RefreshCw className="w-3.5 h-3.5" /> 새로고침
                            </button>
                        </div>
                    </div>

                    {/* Mobile: Ultra-Slim layout */}
                    <div className="flex flex-col gap-1.5 md:hidden text-slate-800 pt-1">
                        {/* Row 1: Dates without label */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs cursor-pointer h-7.5 text-center [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80" />
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs cursor-pointer h-7.5 text-center [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80" />
                        </div>
                        {/* Row 2: Team select & Container Search side by side */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer shadow-2xs h-7.5">
                                <option value="">전체 조</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                <input type="text" placeholder="컨테이너 번호검색" value={searchCntrNo}
                                    onChange={(e) => setSearchCntrNo(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') loadPhotos(); }}
                                    className="w-full bg-white border border-slate-300 rounded-lg pl-7 pr-2 py-1 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors shadow-2xs h-7.5" />
                            </div>
                        </div>
                        {/* Row 3: Action buttons (GDrive backup visible ONLY to isAdmin) */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {isAdmin && (
                                <button onClick={() => handleActionWithCheck('GDRIVE_BACKUP')}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-sky-600 border border-sky-500 hover:bg-sky-500 text-white font-black text-[11px] transition-all shadow-xs cursor-pointer h-7.5">
                                    <Upload className="w-3 h-3" /> ☁️ GDrive 백업
                                </button>
                            )}
                            <button onClick={handleResetFilters}
                                title="필터 초기화"
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-all font-black text-[11px] cursor-pointer shadow-2xs h-7.5">
                                <RotateCcw className="w-3 h-3" /> 초기화
                            </button>
                            <button onClick={loadPhotos}
                                title="새로고침"
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 border border-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] transition-all shadow-xs cursor-pointer h-7.5">
                                <RefreshCw className="w-3 h-3" /> 새로고침
                            </button>
                        </div>
                        {/* Mobile Navigation Bar: Back & Close */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {selectedContainerFolder !== null && (
                                <button onClick={() => {
                                    setSelectedContainerFolder(null);
                                    loadPhotos();
                                }}
                                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-800 transition-all cursor-pointer text-[11px] font-black shadow-2xs h-7.5">
                                    <ArrowLeft className="w-3 h-3" /> 뒤로가기
                                </button>
                            )}
                            <button onClick={onClose}
                                className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-500/30 transition-all cursor-pointer text-[11px] font-black shadow-2xs h-7.5">
                                <X className="w-3 h-3" /> 보관함 닫기
                            </button>
                        </div>
                    </div>
                </section>

                {/* Photo Grid Area */}
                <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 pb-20 md:pb-6 custom-scrollbar">
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
                            {/* Selection Toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                                {/* Left: Select All + View Mode Toggle */}
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={handleSelectAllFolders}
                                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-all text-[11px] font-black cursor-pointer shadow-2xs"
                                    >
                                        {selectedFolders.length === folders.length && folders.length > 0 ? "전체 해제" : "전체 선택"}
                                    </button>
                                    {/* View Mode Toggle */}
                                    <div className="flex bg-slate-200/80 border border-slate-300 p-0.5 rounded-lg gap-0.5 shadow-2xs items-center">
                                        <button
                                            onClick={() => setFolderViewMode('DATE_GROUP')}
                                            className={`px-2 py-1 rounded-md text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${folderViewMode === 'DATE_GROUP' ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                            title="작업일자별 그룹 보기"
                                        >
                                            <Calendar className="w-3 h-3" />
                                            <span className="hidden sm:inline">작업일자별</span>
                                        </button>
                                        <button
                                            onClick={() => setFolderViewMode('FLAT')}
                                            className={`px-2 py-1 rounded-md text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${folderViewMode === 'FLAT' ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                            title="전체 목록 보기"
                                        >
                                            <LayoutGrid className="w-3 h-3" />
                                            <span className="hidden sm:inline">전체 목록</span>
                                        </button>
                                    </div>

                                    {/* Sub-toggle: Team Grouping inside Date View */}
                                    {folderViewMode === 'DATE_GROUP' && (
                                        <button
                                            onClick={() => setIsTeamGroupEnabled(prev => !prev)}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                                                isTeamGroupEnabled
                                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                            }`}
                                            title="날짜 카드 내부 조별 소그룹 모아보기"
                                        >
                                            <User className="w-3 h-3" />
                                            <span>조별 보기 {isTeamGroupEnabled ? 'ON' : 'OFF'}</span>
                                        </button>
                                    )}
                                </div>
                                {/* Right: Total count (PC only) */}
                                <div className="hidden md:flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">
                                        총 {folders.length}개 폴더
                                    </span>
                                </div>
                            </div>

                            {/* Mobile Floating Action Bar (appears when folders selected) */}
                            {selectedFolders.length > 0 && (
                                <div className="fixed bottom-16 left-4 right-4 z-40 md:hidden animate-fade-in">
                                    <div className={`rounded-2xl border shadow-2xl p-3 backdrop-blur-xl ${isTrashView ? "bg-purple-950/90 border-purple-500/30" : isCompletedView ? "bg-emerald-950/90 border-emerald-500/30" : "bg-sky-950/90 border-sky-500/30"}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className="text-xs font-black text-white">
                                                📁 {selectedFolders.length}개 폴더 선택됨
                                            </span>
                                            <button onClick={() => setSelectedFolders([])}
                                                className="p-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {isTrashView ? (
                                                isAdmin && (
                                                    <>
                                                        <button onClick={handleRestoreSelectedFolders}
                                                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all cursor-pointer col-span-1">
                                                            <RotateCw className="w-4 h-4" /> 복구
                                                        </button>
                                                        <button onClick={handleDeleteSelectedFolders}
                                                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all cursor-pointer col-span-1">
                                                            <Trash2 className="w-4 h-4" /> 영구 삭제
                                                        </button>
                                                    </>
                                                )
                                            ) : (
                                                <>
                                                    {isCompletedView ? (
                                                        <button onClick={() => handleToggleSelectedFoldersCompletion(true)}
                                                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black text-xs transition-all cursor-pointer col-span-2">
                                                            <Undo className="w-4 h-4" /> 완료 취소
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleToggleSelectedFoldersCompletion(false)}
                                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all cursor-pointer">
                                                                <Check className="w-4 h-4" /> 완료 처리
                                                            </button>
                                                            <button onClick={handleDownloadSelectedFoldersZip}
                                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs transition-all cursor-pointer">
                                                                <Download className="w-4 h-4" /> 다운로드
                                                            </button>
                                                            <button onClick={handleUploadToGDriveAndCleanLocal}
                                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 border border-sky-400 text-white font-black text-xs transition-all cursor-pointer shadow-md shadow-sky-500/20"
                                                                title="선택한 폴더의 사진을 구글 드라이브로 백업하고 로컬 용량을 정리합니다.">
                                                                <Upload className="w-4 h-4" /> GDrive 백업 ({selectedFolders.length})
                                                            </button>
                                                            <button onClick={() => setIsLocalCopyOpen(true)}
                                                                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/10 border border-white/10 text-slate-300 hover:text-white font-black text-xs transition-all cursor-pointer">
                                                                <Folder className="w-4 h-4" /> 로컬 복사
                                                            </button>
                                                            {isAdmin && (
                                                                <button onClick={handleDeleteSelectedFolders}
                                                                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition-all cursor-pointer">
                                                                    <Trash2 className="w-4 h-4" /> 삭제
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {folderViewMode === 'DATE_GROUP' ? (
                                <div className="space-y-6">
                                    {foldersByWorkDate.map(group => {
                                        const isCollapsed = !!collapsedDates[group.dateStr];
                                        const allGroupSelected = group.folders.length > 0 && group.folders.every(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));
                                        const someGroupSelected = group.folders.some(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr));

                                        return (
                                            <div key={group.dateStr} className="bg-slate-200/50 border border-slate-300/80 rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-2xs">
                                                {/* Date Section Header - Compact Single Line */}
                                                <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-300/60 select-none">
                                                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                                                        <button
                                                            onClick={() => toggleCollapseDate(group.dateStr)}
                                                            className="p-1.5 rounded-lg bg-white border border-slate-300 text-sky-600 hover:bg-sky-50 transition-all cursor-pointer shadow-2xs shrink-0"
                                                        >
                                                            <Calendar className="w-3.5 h-3.5" />
                                                        </button>
                                                        <h3 className="text-sm font-black text-slate-900 tracking-tight shrink-0">
                                                            {formatKoreanDate(group.dateStr)} 작업
                                                        </h3>
                                                        <button
                                                            onClick={() => handleToggleSelectDateGroup(group.folders)}
                                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-[11px] font-black text-slate-700 hover:text-slate-900 transition-all cursor-pointer shadow-2xs shrink-0"
                                                        >
                                                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                                                                allGroupSelected
                                                                    ? "bg-sky-600 border-sky-600 text-white"
                                                                    : someGroupSelected
                                                                        ? "bg-sky-500/40 border-sky-500 text-white"
                                                                        : "bg-white border-slate-400"
                                                            }`}>
                                                                {allGroupSelected ? (
                                                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                                ) : someGroupSelected ? (
                                                                    <div className="w-1.5 h-0.5 bg-white rounded-full" />
                                                                ) : null}
                                                            </div>
                                                            <span>{parseInt(group.dateStr.split('-')[2] || '0', 10)}일 전체 선택 ({group.folders.filter(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr)).length}/{group.folders.length})</span>
                                                        </button>
                                                        <span className="text-[11px] font-bold text-slate-600 shrink-0 hidden xs:inline">
                                                            컨테이너 <strong className="text-sky-700 font-extrabold">{group.folders.length}개</strong> · 총 <strong className="text-slate-800">{group.totalPhotos}장</strong>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            onClick={() => toggleCollapseDate(group.dateStr)}
                                                            className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
                                                            title={isCollapsed ? "펼치기" : "접기"}
                                                        >
                                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Folder Grid for this Date Section */}
                                                {!isCollapsed && (
                                                    isTeamGroupEnabled ? (
                                                        <div className="space-y-4 mt-2">
                                                            {group.byTeam.map(subTeam => (
                                                                <div key={subTeam.teamName} className="bg-white/80 border border-slate-300/60 rounded-xl p-3 shadow-2xs">
                                                                    <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-200 text-xs font-black text-slate-800 select-none">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <User className="w-3.5 h-3.5 text-emerald-600" />
                                                                            <span className="text-slate-900 font-extrabold">{subTeam.teamName}</span>
                                                                            <span className="text-[10px] text-slate-500 font-bold">({subTeam.folders.length}개 컨테이너 · {subTeam.totalPhotos}장)</span>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleToggleTeamFolders(subTeam.folders)}
                                                                            className="px-2.5 py-1 text-[10px] font-black rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                                                        >
                                                                            {subTeam.folders.length > 0 && subTeam.folders.every(f => selectedFolders.includes(f.cntrNo + '|' + f.workDateStr)) ? '전체 해제' : '전체 선택'}
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                                                        {subTeam.folders.map(folder => renderFolderItem(folder))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                                            {group.folders.map(folder => renderFolderItem(folder))}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {folders.map(folder => renderFolderItem(folder))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* PHOTO GRID VIEW (INSIDE SELECTED FOLDER) */
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="text-xs font-black text-sky-400 uppercase tracking-widest bg-sky-500/10 border border-sky-500/20 px-4 py-2 rounded-xl">
                                        폴더: {selectedContainerFolder ? selectedContainerFolder.split('|')[0] : ''} ({folderPhotos.length}장)
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
                            {/* Photo Selection & Bulk Actions Control Bar */}
                            <div className="mb-4 p-3 rounded-2xl bg-[#11111a] border border-white/5 flex flex-wrap items-center justify-between gap-3 shadow-md">
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => handleToggleSelectAllPhotos(folderPhotos)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer"
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                            folderPhotos.length > 0 && folderPhotos.every(p => selectedPhotoIds.includes(p.id))
                                                ? "bg-sky-500 border-sky-400 text-white"
                                                : selectedPhotoIds.some(id => folderPhotos.some(p => p.id === id))
                                                    ? "bg-sky-500/40 border-sky-400 text-white"
                                                    : "bg-slate-900 border-slate-700"
                                        }`}>
                                            {folderPhotos.length > 0 && folderPhotos.every(p => selectedPhotoIds.includes(p.id)) ? (
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            ) : selectedPhotoIds.some(id => folderPhotos.some(p => p.id === id)) ? (
                                                <div className="w-2 h-0.5 bg-white rounded-full" />
                                            ) : null}
                                        </div>
                                        <span>
                                            전체 선택 {selectedPhotoIds.filter(id => folderPhotos.some(p => p.id === id)).length > 0 ? `(${selectedPhotoIds.filter(id => folderPhotos.some(p => p.id === id)).length} / ${folderPhotos.length}장)` : `(${folderPhotos.length}장)`}
                                        </span>
                                    </button>
                                    {selectedPhotoIds.filter(id => folderPhotos.some(p => p.id === id)).length > 0 && (
                                        <span className="text-xs font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg">
                                            {selectedPhotoIds.filter(id => folderPhotos.some(p => p.id === id)).length}장 선택됨
                                        </span>
                                    )}
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
                                        style={{ contentVisibility: 'auto', containIntrinsicSize: '240px' }}
                                        onClick={() => {
                                            const globalIdx = photos.findIndex(p => p.id === photo.id);
                                            if (globalIdx !== -1) {
                                                setActivePhotoIdx(globalIdx);
                                            }
                                        }}
                                        className={`group relative flex flex-col bg-[#11111a] border rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-[3px] hover:scale-[1.02] ${
                                            isCompletedView && !photo.gdrive_file_id
                                                ? 'border-rose-500 border-[2px] shadow-rose-500/20'
                                                : 'border-white/5 hover:border-white/10'
                                        }`}
                                    >
                                        {/* Aspect Ratio container for Image */}
                                        <div className={
                                            viewMode === 'GRID'
                                                ? "relative aspect-[4/3] bg-black overflow-hidden border-b border-white/5"
                                                : "relative w-full bg-black/40 flex items-center justify-center overflow-hidden border-b border-white/5 aspect-auto min-h-[200px]"
                                        }>
                                            {/* Selection Checkbox */}
                                            <div 
                                                onClick={(e) => toggleSelectPhoto(photo.id, e, folderPhotos)}
                                                className="absolute top-2.5 left-2.5 z-20 flex items-center justify-center p-0.5 cursor-pointer"
                                                title={selectedPhotoIds.includes(photo.id) ? "선택 해제" : "사진 선택 (Shift+클릭으로 연속 선택 가능)"}
                                            >
                                                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shadow-md ${
                                                    selectedPhotoIds.includes(photo.id)
                                                        ? "bg-sky-500 border-sky-400 text-white"
                                                        : "bg-black/60 border-white/20 text-transparent hover:border-white/50 backdrop-blur-sm"
                                                }`}>
                                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                </div>
                                            </div>

                                            {/* Storage Location Badge - GDrive only */}
                                            {photo.gdrive_file_id && (
                                                <div className="absolute top-2.5 right-2.5 z-10 px-1.5 py-0.5 rounded-md bg-sky-600/90 border border-sky-400/40 text-white font-black text-xs shadow-md backdrop-blur-md flex items-center justify-center" title="구글드라이브 안전 보관 사진 (PC 용량 정리 완료)">
                                                    ☁️
                                                </div>
                                            )}

                                            {/* Duplicate badge shifted */}
                                            {duplicatePhotoIds.includes(photo.id) && (
                                                <div className="absolute top-2.5 left-9 z-10 px-2 py-1 rounded-lg bg-amber-500 text-[#07070d] font-black text-[9px] uppercase tracking-wider shadow-md animate-pulse">
                                                    중복
                                                </div>
                                            )}

                                            {/* Seal Badge */}
                                            {photo.photo_type === 'seal' && (
                                                <div className="absolute top-2.5 right-9 z-10 px-2 py-1 rounded-lg bg-rose-600/90 border border-rose-400/40 text-white font-black text-[9px] uppercase tracking-wider shadow-md backdrop-blur-md flex items-center gap-1">
                                                    <Camera className="w-2.5 h-2.5 text-white" /> 씰
                                                </div>
                                            )}
                                            <img 
                                                src={getPhotoViewUrl(photo.photo_path)}
                                                alt={photo.cntr_no}
                                                style={{
                                                    transform: (rotationOffsets[photo.id] || 0) ? `rotate(${rotationOffsets[photo.id]}deg)` : undefined,
                                                    transition: 'transform 0.2s ease-out'
                                                }}
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
                                                    <div className="flex items-center justify-between">
                                                        <p className={`text-xs truncate uppercase tracking-tight font-black ${getCarrierColor(photo.transporter)}`}>
                                                            {photo.cntr_no}
                                                        </p>
                                                        {photo.remark && (
                                                            <p className="text-[10px] text-slate-400 font-bold line-clamp-1 truncate max-w-[60px] ml-2">
                                                                {photo.remark}
                                                            </p>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Filename display and edit */}
                                                    <div className="pt-1.5">
                                                        {editingPhotoId === photo.id ? (
                                                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                                <input 
                                                                    type="text" 
                                                                    value={editFilename}
                                                                    onChange={e => setEditFilename(e.target.value)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') handleRenameSubmit(photo.id, editFilename);
                                                                        if (e.key === 'Escape') setEditingPhotoId(null);
                                                                    }}
                                                                    className="flex-1 w-full bg-black/50 border border-sky-500 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => handleRenameSubmit(photo.id, editFilename)} className="p-1 rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-colors">
                                                                    <Check className="w-3 h-3" />
                                                                </button>
                                                                <button onClick={() => setEditingPhotoId(null)} className="p-1 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-between group/name cursor-text border border-transparent hover:border-white/10 rounded" onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingPhotoId(photo.id);
                                                                const baseName = photo.photo_path.split('/').pop() || '';
                                                                const nameWithoutExt = baseName.substring(0, baseName.lastIndexOf('.')) || baseName;
                                                                setEditFilename(nameWithoutExt);
                                                            }}>
                                                                <p className="text-[10px] text-slate-300 truncate font-mono bg-white/5 px-1.5 py-0.5 flex-1" title={photo.photo_path.split('/').pop()}>
                                                                    {photo.photo_path.split('/').pop()}
                                                                </p>
                                                                <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover/name:opacity-100 ml-1 hover:text-sky-400 transition-colors" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-1.5 border-t border-white/5 text-[9px] text-slate-500 font-bold">
                                                    <span className="flex items-center gap-1 truncate max-w-[60px]">
                                                        <User className="w-2.5 h-2.5 text-slate-600" /> {(photo.uploader_name && photo.uploader_name.trim()) || (photo.uploader_username && photo.uploader_username.trim()) || '퇴사자'}
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

                                        {/* Photo Type (Seal) Section */}
                                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] font-bold text-slate-400">구분:</span>
                                                {photos[activePhotoIdx].photo_type === 'seal' ? (
                                                    <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black flex items-center gap-1">
                                                        <Camera className="w-3 h-3 text-rose-400" /> 씰(Seal) 사진
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[10px] font-bold">
                                                        일반 적재 사진
                                                    </span>
                                                )}
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleToggleSealPhoto(photos[activePhotoIdx]); }}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 shadow-sm ${
                                                        photos[activePhotoIdx].photo_type === 'seal'
                                                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                                            : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                                                    }`}
                                                    title={photos[activePhotoIdx].photo_type === 'seal' ? '씰 지정을 해제하고 일반 사진으로 변경' : '이 사진을 정식 씰(Seal) 사진으로 지정'}
                                                >
                                                    <Camera className="w-3.5 h-3.5" />
                                                    <span>{photos[activePhotoIdx].photo_type === 'seal' ? '씰 해제' : '씰 사진 지정'}</span>
                                                </button>
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
                                            href={getPhotoViewUrl(photos[activePhotoIdx].photo_path)}
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

                                    <div className="grid grid-cols-3 gap-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRotatePhotos(-90, photos[activePhotoIdx].id); }}
                                            className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-1 text-xs font-black cursor-pointer"
                                            title="좌측으로 90도 회전"
                                        >
                                            <RotateCcw className="w-4 h-4 text-sky-400" />
                                            <span>좌회전 (-90°)</span>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRotatePhotos(180, photos[activePhotoIdx].id); }}
                                            className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-1 text-xs font-black cursor-pointer"
                                            title="180도 상하반전 회전"
                                        >
                                            <RotateCw className="w-4 h-4 text-amber-400" />
                                            <span>180° 회전</span>
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRotatePhotos(90, photos[activePhotoIdx].id); }}
                                            className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-1 text-xs font-black cursor-pointer"
                                            title="우측으로 90도 회전"
                                        >
                                            <RotateCw className="w-4 h-4 text-sky-400" />
                                            <span>우회전 (+90°)</span>
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
                                {/* Floating Close Button on Desktop */}
                                <button 
                                    onClick={() => { setActivePhotoIdx(null); resetZoom(); }}
                                    className="hidden md:flex absolute top-6 right-6 p-3 rounded-2xl bg-black/40 border border-white/10 text-slate-400 hover:text-white hover:bg-black/80 transition-all z-20 cursor-pointer"
                                    title="닫기"
                                >
                                    <X className="w-5 h-5" />
                                </button>

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

                                    {/* Image Wrapper with Mobile Swipe Support */}
                                    <div 
                                        onTouchStart={(e) => {
                                            if (scale > 1) return;
                                            touchStartXRef.current = e.touches[0].clientX;
                                            touchStartYRef.current = e.touches[0].clientY;
                                        }}
                                        onTouchEnd={(e) => {
                                            if (scale > 1 || touchStartXRef.current === null || touchStartYRef.current === null) return;
                                            const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
                                            const diffY = e.changedTouches[0].clientY - touchStartYRef.current;
                                            if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
                                                if (diffX > 0) {
                                                    handlePrevPhoto();
                                                } else {
                                                    handleNextPhoto();
                                                }
                                            }
                                            touchStartXRef.current = null;
                                            touchStartYRef.current = null;
                                        }}
                                        className="max-w-full max-h-[92vh] flex items-center justify-center relative overflow-hidden select-none touch-pan-y"
                                    >
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
                                                src={getPhotoViewUrl(photos[activePhotoIdx].photo_path)}
                                                alt={photos[activePhotoIdx].cntr_no}
                                                className="max-w-full max-h-[90vh] object-contain rounded-2xl border border-white/10 shadow-2xl select-none"
                                                style={{
                                                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotationOffsets[photos[activePhotoIdx].id] || 0}deg)`,
                                                    transformOrigin: 'center center',
                                                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                                                    transition: isDragging ? 'none' : 'transform 0.2s ease-out'
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
                {/* Google Drive Progress Tracking Modal */}
                <AnimatePresence>
                    {isGDriveProgressOpen && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                            <motion.div 
                                key="gdrive-modal-backdrop"
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                            />
                            <motion.div 
                                key="gdrive-modal-content"
                                initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                                animate={{ scale: 1, opacity: 1, y: 0 }} 
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="relative w-full max-w-lg bg-[#0e111c] border border-sky-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10 text-slate-100"
                            >
                                <div className="flex items-center justify-between gap-3 mb-6 border-b border-white/10 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-sky-500/10 rounded-2xl text-sky-400 border border-sky-500/20">
                                            <Upload className={`w-6 h-6 ${isGDriveUploading ? "animate-bounce" : ""}`} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                                ☁️ 구글 드라이브 실시간 백업
                                            </h2>
                                            <p className="text-xs text-sky-400 font-bold">
                                                {isGDriveUploading ? "안전하게 업로드 및 디스크 정리 중..." : "작업 완료됨"}
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsGDriveProgressOpen(false)}
                                        disabled={isGDriveUploading}
                                        className={`p-2 rounded-xl border transition-all ${
                                            isGDriveUploading 
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
                                                {gdriveProgress.percent}%
                                            </div>
                                            <div className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                                                <span>처리 진행:</span>
                                                <strong className="text-sky-400 font-mono text-sm">{gdriveProgress.current}</strong>
                                                <span>/</span>
                                                <span className="font-mono text-slate-300">{gdriveProgress.total} 장</span>
                                                {gdriveProgress.alreadyDoneCount > 0 && (
                                                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md ml-1" title="전체 대상 중 백업을 시작하기 전 이미 구글드라이브에 완비되어 있던 사진 수량입니다.">
                                                        기존 보관 완료 (총 {gdriveProgress.alreadyDoneCount}장 스킵 대상)
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl inline-block font-mono">
                                                💾 {gdriveProgress.freedMB} MB 확보
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar Track */}
                                    <div className="w-full h-3.5 bg-black/60 border border-white/10 rounded-full overflow-hidden p-0.5">
                                        <motion.div 
                                            className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 rounded-full shadow-lg shadow-sky-500/50"
                                            initial={{ width: "0%" }}
                                            animate={{ width: `${gdriveProgress.percent}%` }}
                                            transition={{ duration: 0.2 }}
                                        />
                                    </div>

                                    {/* Current File Banner */}
                                    <div className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-1">
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                            <Loader2 className={`w-3.5 h-3.5 text-sky-400 ${isGDriveUploading ? "animate-spin" : ""}`} />
                                            현재 작업 대상:
                                        </div>
                                        <div className="text-xs font-mono text-slate-200 truncate font-semibold">
                                            {gdriveProgress.currentFile || "대기 중..."}
                                        </div>
                                    </div>

                                    {/* Summary Stats Grid */}
                                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                                        <div className="p-2.5 bg-sky-500/5 border border-sky-500/10 rounded-xl">
                                            <div className="text-[10px] font-bold text-slate-500">신규 백업</div>
                                            <div className="text-sm font-black text-sky-400 font-mono mt-0.5">{gdriveProgress.uploadedCount}장</div>
                                        </div>
                                        <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                                            <div className="text-[10px] font-bold text-slate-500">기존 보관 스킵</div>
                                            <div className="text-sm font-black text-amber-400 font-mono mt-0.5">{gdriveProgress.skippedCount}장</div>
                                        </div>
                                        <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                            <div className="text-[10px] font-bold text-slate-500">로컬 삭제 정리</div>
                                            <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">{gdriveProgress.cleanedCount}장</div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-end gap-2">
                                        {isGDriveUploading ? (
                                            <button 
                                                onClick={handleStopGDriveUpload}
                                                className="w-full py-3 rounded-xl bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/10"
                                            >
                                                <X className="w-4 h-4" /> 백업 중단 (Cancel)
                                            </button>
                                        ) : (
                                            <>
                                                {gdriveProgress.percent < 100 && (
                                                    <button 
                                                        onClick={handleResumeGDriveExport}
                                                        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 border border-sky-400 text-white font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-sky-500/30 animate-pulse"
                                                        title="폴더 재선택 없이 끊긴 미완료 사진만 자동으로 이어서 백업"
                                                    >
                                                        <RotateCw className="w-4 h-4" /> 🔄 끊긴 사진 자동 이어서 재전송
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => setIsGDriveProgressOpen(false)}
                                                    className={`py-3 rounded-xl text-white font-black text-xs transition-all cursor-pointer shadow-lg ${gdriveProgress.percent < 100 ? "px-5 bg-white/10 hover:bg-white/20 border border-white/10 shrink-0" : "w-full bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20"}`}
                                                >
                                                    닫기 (Close)
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Container Move Modal */}
                <AnimatePresence>
                    {isMoveModalOpen && (
                        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                            <motion.div 
                                key="move-modal-backdrop"
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                onClick={() => !isMoving && setIsMoveModalOpen(false)}
                                className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                            />
                            <motion.div 
                                key="move-modal-content"
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
                                        onClick={() => setIsMoveModalOpen(false)}
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
                                            총 {selectedPhotoIds.length > 0 ? selectedPhotoIds.length : (activePhotoIdx !== null ? 1 : 0)}장 선택됨
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-300 uppercase tracking-wider block">
                                            목표 컨테이너 번호 입력
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="예: TCLU4912355"
                                            value={targetMoveCntrNo}
                                            onChange={(e) => setTargetMoveCntrNo(e.target.value.toUpperCase())}
                                            className="w-full bg-black/60 border border-indigo-500/30 focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white uppercase outline-none transition-all placeholder:text-slate-600"
                                            autoFocus
                                        />
                                    </div>

                                    {/* Quick selector of existing folders */}
                                    {folders.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="text-[11px] font-bold text-slate-400">기존 컨테이너에서 선택:</div>
                                            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-black/30 rounded-xl border border-white/5">
                                                {folders.slice(0, 15).map((f, idx) => (
                                                    <button
                                                        key={`${f.cntrNo}_${f.workDateStr}_${idx}`}
                                                        type="button"
                                                        onClick={() => setTargetMoveCntrNo(f.cntrNo)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black transition-all cursor-pointer border ${
                                                            targetMoveCntrNo === f.cntrNo
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
                                            onClick={() => setIsMoveModalOpen(false)}
                                            disabled={isMoving}
                                            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs transition-all cursor-pointer"
                                        >
                                            취소
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleExecuteMovePhotos}
                                            disabled={isMoving || !targetMoveCntrNo.trim()}
                                            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs transition-all cursor-pointer shadow-lg shadow-indigo-500/20 flex items-center gap-1.5"
                                        >
                                            {isMoving ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" /> 이동 중...
                                                </>
                                            ) : (
                                                <>
                                                    <Folder className="w-4 h-4" /> 이동 완료
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Local Copy Modal */}
                <AnimatePresence>
                    {isLocalCopyOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div 
                                key="local-copy-backdrop"
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }} 
                                onClick={() => setIsLocalCopyOpen(false)} 
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                            />
                            <motion.div 
                                key="local-copy-content"
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
                                        {selectedFolders.length > 0 ? (
                                            <>
                                                선택한 <strong className="text-emerald-400">{selectedFolders.length}개</strong> 컨테이너 폴더를 지정한 로컬 디렉토리로 압축 없이 즉시 복사합니다.
                                                {getActiveTeamStorageInfo().teamName !== '전체' && (
                                                    <span className="block mt-1 text-[11px] text-emerald-400 font-black">
                                                        🏷️ [{getActiveTeamStorageInfo().teamName}] 전용 마지막 저장 경로가 자동 적용됩니다.
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                선택한 <strong className="text-emerald-400">{selectedPhotoIds.length}장</strong>의 사진을 지정한 대상 로컬 폴더로 직접 복사합니다.
                                            </>
                                        )}
                                    </p>
                                    
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">
                                            {selectedFolders.length > 0 ? "대상 폴더 기준 경로 (PC 경로)" : "복사할 대상 로컬 폴더 경로"}
                                        </label>
                                        <div className="flex gap-2">
                                            <input 
                                                value={localCopyPath} 
                                                onChange={e => setLocalCopyPath(e.target.value)}
                                                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs md:text-sm focus:border-emerald-500 outline-none text-slate-200 transition-all placeholder:text-slate-600 font-mono" 
                                                placeholder={selectedFolders.length > 0 ? "예: X:\\26.08\\15\\야간 또는 D:\\Downloads" : "예: X:\\26.08\\15\\야간\\1조\\TSSU1234567 또는 D:\\사진"} 
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

                                    {/* Auto Team Subfolder Option - Only for Folder Copy */}
                                    {selectedFolders.length > 0 && (
                                        <label className="flex items-start gap-2.5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl cursor-pointer select-none hover:bg-emerald-500/15 transition-all">
                                            <input 
                                                type="checkbox"
                                                checked={autoTeamSubfolder}
                                                onChange={(e) => {
                                                    setAutoTeamSubfolder(e.target.checked);
                                                    if (typeof window !== 'undefined') {
                                                        localStorage.setItem('ctnr_auto_team_subfolder', String(e.target.checked));
                                                    }
                                                }}
                                                className="w-4 h-4 mt-0.5 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-emerald-300">작업 조(1조, 2조, 3조...)별 하위 폴더 자동 분류 복사</span>
                                                <span className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                                                    기준 경로 아래에 각 조 폴더(1조, 2조...)를 자동 인식/생성하여 해당 조의 컨테이너를 쏙쏙 분류 저장합니다.
                                                </span>
                                            </div>
                                        </label>
                                    )}

                                    {/* Live Team Routing Preview - Only for Folder Copy */}
                                    {selectedFolders.length > 0 && autoTeamSubfolder && Object.keys(selectedTeamSummary).length > 0 && (
                                        <div className="space-y-1.5 p-3.5 bg-black/40 border border-white/10 rounded-2xl">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                                                <span className="flex items-center gap-1.5 text-emerald-400">
                                                    <Folder className="w-3.5 h-3.5" />
                                                    조별 자동 분류 미리보기 ({Object.keys(selectedTeamSummary).length}개 조 / 총 {selectedFolders.length}개 컨테이너)
                                                </span>
                                            </div>
                                            <div className="space-y-1.5 mt-2 text-[11px] font-mono max-h-36 overflow-y-auto pr-1">
                                                {Object.entries(selectedTeamSummary).map(([team, data]) => {
                                                    let baseDir = localCopyPath.trim() || 'X:\\26.08\\15\\야간';
                                                    const baseParts = baseDir.split(/[\\/]/);
                                                    const lastPart = baseParts[baseParts.length - 1] || '';
                                                    if (/^[1-9]조/.test(lastPart) || lastPart.endsWith('조')) {
                                                        baseParts.pop();
                                                        baseDir = baseParts.join('\\');
                                                    }
                                                    const previewPath = `${baseDir}\\${team}\\`;
                                                    return (
                                                        <div key={team} className="flex items-center justify-between text-slate-300 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5 gap-2">
                                                            <span className="font-bold text-emerald-300 shrink-0">🏷️ {team} ({data.count}개)</span>
                                                            <span className="text-slate-400 truncate text-[10px]" title={previewPath}>{previewPath}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Progress Bar Display when copying */}
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
                                            <X className="w-4 h-4" />
                                            복사 중지
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => setIsLocalCopyOpen(false)} 
                                            className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all cursor-pointer"
                                        >
                                            취소
                                        </button>
                                    )}

                                    <button 
                                        onClick={handleLocalCopy} 
                                        disabled={isCopying}
                                        className={`flex-2 py-4 px-8 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                                            isCopying 
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
                    )}
                </AnimatePresence>

                {/* Duplicate Conflict Selection Modal */}
                <AnimatePresence>
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
                                className="relative w-full max-w-md bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-8 z-10"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
                                        <RefreshCw className="w-6 h-6 animate-spin-slow" />
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
                                            <div className="text-[11px] text-slate-400">동일한 기존 파일은 복사하지 않고 생략합니다.</div>
                                        </div>
                                    </button>
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
                                    <button 
                                        onClick={() => setIsConflictModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs transition-all cursor-pointer"
                                    >
                                        취소
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Seal Warning Modal (Root level single instance) */}
                <AnimatePresence>
                    {warningModalInfo.isOpen && (
                        <div 
                            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ duration: 0.15 }}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-rose-50/70 shrink-0">
                                    <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                                        <AlertCircle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-800">씰(Seal) 사진 누락 경고</h2>
                                        <p className="text-xs font-bold text-rose-500">주의: 일부 컨테이너에 씰 사진이 없습니다.</p>
                                    </div>
                                </div>
                                
                                <div className="p-5 flex-1 overflow-y-auto max-h-[50vh]">
                                    <div className="text-sm font-bold text-slate-700 mb-2">누락된 컨테이너 목록:</div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap gap-1.5 mb-4 max-h-32 overflow-y-auto">
                                        {warningModalInfo.missingCntrs.map((cntr, idx) => (
                                            <span key={idx} className="px-2 py-1 bg-white border border-rose-200 text-rose-600 font-black text-xs rounded-md shadow-sm">
                                                {cntr}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed font-bold">
                                        위 컨테이너들의 씰(Seal) 사진이 업로드되지 않았습니다.<br/>
                                        그래도 이대로 계속 진행하시겠습니까?
                                    </p>
                                </div>

                                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end shrink-0">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setWarningModalInfo({ isOpen: false, action: null, missingCntrs: [] });
                                        }}
                                        className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 font-bold text-sm transition-colors cursor-pointer"
                                    >
                                        취소
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (warningModalInfo.action) executeAction(warningModalInfo.action);
                                            setWarningModalInfo({ isOpen: false, action: null, missingCntrs: [] });
                                        }}
                                        className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm shadow-md shadow-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Check className="w-4 h-4" /> 계속 진행
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Floating Action Bar (FAB) */}
                {(selectedFolders.length > 0 || (selectedPhotoIds && selectedPhotoIds.length > 0)) && (
                    <div className="fixed bottom-[66px] md:bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[96vw] sm:w-auto max-w-[96vw] md:max-w-[90vw] animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
                        <div className="flex items-center justify-between gap-1.5 md:gap-3 px-2 py-1 md:px-4 md:py-2.5 rounded-xl md:rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 shadow-xl shadow-slate-900/20 text-slate-800 dark:text-slate-200 w-full sm:w-max">
                            <div className="flex items-center gap-1 md:gap-1.5 pr-1.5 md:pr-3 border-r border-slate-300 dark:border-slate-700 shrink-0">
                                <span className="flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold text-[10px] md:text-xs md:min-w-[24px] md:h-6 md:px-1.5">
                                    {selectedFolders.length > 0 ? selectedFolders.length : selectedPhotoIds.length}
                                </span>
                                <span className="text-xs md:text-sm font-black tracking-tight whitespace-nowrap hidden sm:inline">
                                    {selectedFolders.length > 0 ? '폴더 선택됨' : '사진 선택됨'}
                                </span>
                            </div>

                            <div className="flex-1 min-w-0 flex items-center gap-1 md:gap-1.5 overflow-x-auto touch-pan-x py-0.5 px-0.5">
                                {selectedFolders.length > 0 ? (
                                    /* Folder Actions */
                                    isTrashView ? (
                                        isAdmin && (
                                            <>
                                                <button onClick={handleRestoreSelectedFolders} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/10 dark:hover:bg-purple-500 text-purple-700 dark:text-purple-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <RotateCw className="w-3 h-3 md:w-3.5 md:h-3.5" /> 복구
                                                </button>
                                                <button onClick={handleDeleteSelectedFolders} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500 text-rose-700 dark:text-rose-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 영구 삭제
                                                </button>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            {isAdmin && (
                                                <button onClick={handleDeleteSelectedFolders} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500 text-rose-700 dark:text-rose-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 삭제
                                                </button>
                                            )}
                                            {isCompletedView ? (
                                                <button onClick={() => handleToggleSelectedFoldersCompletion(true)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500 text-amber-700 dark:text-amber-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <Undo className="w-3 h-3 md:w-3.5 md:h-3.5" /> 완료 취소
                                                </button>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleToggleSelectedFoldersCompletion(false)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-500 text-emerald-700 dark:text-emerald-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                        <Check className="w-3 h-3 md:w-3.5 md:h-3.5" /> 완료 처리
                                                    </button>
                                                    <button onClick={handleCleanupSelectedFoldersDuplicates} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500 text-amber-700 dark:text-amber-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                        <ImageIcon className="w-3 h-3 md:w-3.5 md:h-3.5" /> 중복 정리
                                                    </button>
                                                </>
                                            )}

                                            <button onClick={() => handleActionWithCheck('LOCAL_COPY')} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-emerald-500/20 cursor-pointer">
                                                <Folder className="w-3 h-3 md:w-3.5 md:h-3.5" /> 로컬 복사
                                            </button>
                                            <button onClick={() => handleActionWithCheck('ZIP_DOWNLOAD')} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-sky-500 hover:bg-sky-400 border border-sky-600 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-indigo-500/20 cursor-pointer">
                                                <Download className="w-3 h-3 md:w-3.5 md:h-3.5" /> ZIP
                                            </button>
                                        </>
                                    )
                                ) : (
                                    /* Photo Actions */
                                    isTrashView ? (
                                        isAdmin && (
                                            <>
                                                <button onClick={handleRestoreSelectedPhotos} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-sky-100 hover:bg-sky-200 dark:bg-sky-500/10 dark:hover:bg-sky-500 text-sky-700 dark:text-sky-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <RotateCw className="w-3 h-3 md:w-3.5 md:h-3.5" /> 복구
                                                </button>
                                                <button onClick={handleDeleteSelectedPhotosPermanently} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500 text-rose-700 dark:text-rose-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer">
                                                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 영구 삭제
                                                </button>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <button onClick={handleDeleteSelectedPhotos} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500 text-rose-700 dark:text-rose-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer" title="선택한 사진 삭제 (휴지통 이동)">
                                                <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 삭제
                                            </button>
                                            {hasNormalInSelection && (
                                                <button 
                                                    onClick={() => handleBatchToggleSealPhoto('seal')} 
                                                    className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-rose-500/20 cursor-pointer" 
                                                    title={selectedPhotoIds.length > 1 ? "선택한 사진을 씰(Seal) 사진으로 지정" : "선택한 사진을 정식 씰(Seal) 사진으로 지정"}
                                                >
                                                    <Camera className="w-3 h-3 md:w-3.5 md:h-3.5" /> 씰 지정
                                                </button>
                                            )}
                                            {hasSealInSelection && (
                                                <button 
                                                    onClick={() => handleBatchToggleSealPhoto('normal')} 
                                                    className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/50 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer" 
                                                    title={selectedPhotoIds.length > 1 ? "선택한 사진 중 씰(Seal) 지정 해제" : "씰(Seal) 지정 해제 (일반 사진으로 변경)"}
                                                >
                                                    <Camera className="w-3 h-3 md:w-3.5 md:h-3.5 text-rose-500" /> 씰 해제
                                                </button>
                                            )}
                                            <button onClick={() => setIsMoveModalOpen(true)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-indigo-500/20 cursor-pointer">
                                                <Folder className="w-3 h-3 md:w-3.5 md:h-3.5" /> 이동
                                            </button>
                                            <button onClick={handleDownloadSelectedPhotos} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-sky-500/20 cursor-pointer" title={selectedPhotoIds.length > 1 ? "선택한 사진들을 압축(ZIP)하여 다운로드" : "선택한 사진 다운로드"}>
                                                <Download className="w-3 h-3 md:w-3.5 md:h-3.5" /> 다운로드
                                            </button>
                                            <button onClick={() => setIsLocalCopyOpen(true)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all text-[11px] md:text-xs font-black shrink-0 shadow-md shadow-emerald-500/20 cursor-pointer" title="선택한 사진들을 지정한 로컬 폴더로 직접 복사">
                                                <Folder className="w-3 h-3 md:w-3.5 md:h-3.5" /> 로컬 복사
                                            </button>
                                            <button onClick={() => handleRotatePhotos(-90)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-500/10 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer" title="선택한 사진들을 반시계방향 90도 회전">
                                                <RotateCcw className="w-3 h-3 md:w-3.5 md:h-3.5" /> 좌회전
                                            </button>
                                            <button onClick={() => handleRotatePhotos(180)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-500/10 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer" title="선택한 사진들을 180도 회전">
                                                <RotateCw className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-500" /> 180°
                                            </button>
                                            <button onClick={() => handleRotatePhotos(90)} className="flex items-center gap-1 md:gap-1.5 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-500/10 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-400 dark:hover:text-white transition-all text-[11px] md:text-xs font-black shrink-0 cursor-pointer" title="선택한 사진들을 시계방향 90도 회전">
                                                <RotateCw className="w-3 h-3 md:w-3.5 md:h-3.5" /> 우회전
                                            </button>
                                        </>
                                    )
                                )}
                            </div>

                            <div className="pl-1.5 md:pl-3 border-l border-slate-300 dark:border-slate-700 shrink-0">
                                <button onClick={() => { setSelectedFolders([]); setSelectedPhotoIds([]); }} className="p-0.5 md:p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer" title="선택 취소">
                                    <X className="w-3.5 h-3.5 md:w-5 md:h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Bottom Tab Bar */}
                <div className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg text-slate-700">
                    <button
                        onClick={() => { setTabState('ACTIVE'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${tabState === 'ACTIVE' ? 'text-sky-600' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        <div className={`w-6 h-0.5 rounded-full transition-all mb-0.5 ${tabState === 'ACTIVE' ? 'bg-sky-600' : 'bg-transparent'}`} />
                        <Folder className="w-5 h-5" />
                        <span className="text-[10px] font-black tracking-tight">진행중인 작업</span>
                    </button>
                    <button
                        onClick={() => { setTabState('COMPLETED'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${tabState === 'COMPLETED' ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        <div className={`w-6 h-0.5 rounded-full transition-all mb-0.5 ${tabState === 'COMPLETED' ? 'bg-emerald-600' : 'bg-transparent'}`} />
                        <Check className="w-5 h-5" />
                        <span className="text-[10px] font-black tracking-tight">완료된 작업</span>
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => { setTabState('TRASH'); setSelectedFolders([]); setSelectedContainerFolder(null); }}
                            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${tabState === 'TRASH' ? 'text-purple-600' : 'text-slate-400 hover:text-slate-700'}`}
                        >
                            <div className={`w-6 h-0.5 rounded-full transition-all mb-0.5 ${tabState === 'TRASH' ? 'bg-purple-600' : 'bg-transparent'}`} />
                            <Trash2 className="w-5 h-5" />
                            <span className="text-[10px] font-black tracking-tight">휴지통</span>
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
