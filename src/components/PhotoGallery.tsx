import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ImageIcon, ArrowLeft, Download, Trash2, Check, RotateCw } from 'lucide-react';
import { SessionUser } from '@/lib/auth';
import { Photo, ContainerFolder, ActionType, PhotoGalleryProps } from './gallery/PhotoGalleryTypes';
import { usePhotoGallery } from './gallery/usePhotoGallery';
import GalleryHeader from './gallery/GalleryHeader';
import FolderGridView from './gallery/FolderGridView';
import PhotoLightboxModal from './gallery/PhotoLightboxModal';
import BatchActionBar from './gallery/BatchActionBar';
import LocalCopyModal from './gallery/LocalCopyModal';
import MoveContainerModal from './gallery/MoveContainerModal';
import GDriveSyncModal, { GDriveProgress } from './gallery/GDriveSyncModal';
import SealWarningModal from './gallery/SealWarningModal';

export default function PhotoGallery({
    isOpen,
    onClose,
    user,
    initialSearchCntrNo,
    onOpenReport
}: PhotoGalleryProps) {
    const {
        photos,
        teams,
        isLoading,
        isRotating,
        tabState,
        setTabState,
        isTrashView,
        isCompletedView,
        selectedTeam,
        setSelectedTeam,
        selectedUser,
        setSelectedUser,
        searchCntrNo,
        setSearchCntrNo,
        dateRange,
        setDateRange,
        sortBy,
        setSortBy,
        viewMode,
        setViewMode,
        selectedPhotoIds,
        setSelectedPhotoIds,
        selectedFolders,
        setSelectedFolders,
        selectedContainerFolder,
        setSelectedContainerFolder,
        availableUsers,
        folders,
        sortPhotos,
        handleRotatePhotos,
        loadPhotos,
        isAdmin
    } = usePhotoGallery(user, initialSearchCntrNo);

    // Lightbox Modal State
    const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);

    // Sub-modal states
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [isLocalCopyOpen, setIsLocalCopyOpen] = useState(false);
    const [isGDriveProgressOpen, setIsGDriveProgressOpen] = useState(false);
    const [isGDriveUploading, setIsGDriveUploading] = useState(false);
    const [gdriveProgress, setGdriveProgress] = useState<GDriveProgress>({
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
    const gdriveAbortControllerRef = useRef<AbortController | null>(null);
    const [lastGDriveTargetIds, setLastGDriveTargetIds] = useState<string[]>([]);

    const [warningModalInfo, setWarningModalInfo] = useState<{
        isOpen: boolean;
        action: ActionType | null;
        missingCntrs: string[];
    }>({ isOpen: false, action: null, missingCntrs: [] });

    // Sorted active photo list for Lightbox / Folder detail view
    const folderPhotos = useMemo(() => {
        if (!selectedContainerFolder) return [];
        const [cntrNo, dateStr] = selectedContainerFolder.split('|');
        const list = photos.filter(p => {
            if (dateStr) {
                return p.cntr_no === cntrNo;
            }
            return p.cntr_no === cntrNo;
        });
        return sortPhotos(list, sortBy);
    }, [photos, selectedContainerFolder, sortPhotos, sortBy]);

    const activePhotoList = useMemo(() => {
        if (selectedContainerFolder) return folderPhotos;
        return sortPhotos(photos, sortBy);
    }, [selectedContainerFolder, folderPhotos, photos, sortPhotos, sortBy]);

    if (!isOpen) return null;

    // Selection Handlers
    const handleToggleSelectPhoto = (photoId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSelectedPhotoIds(prev => 
            prev.includes(photoId) ? prev.filter(id => id !== photoId) : [...prev, photoId]
        );
    };

    const handleToggleSelectFolder = (folderKey: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setSelectedFolders(prev =>
            prev.includes(folderKey) ? prev.filter(k => k !== folderKey) : [...prev, folderKey]
        );
    };

    const handleSelectAllFolders = () => {
        if (selectedFolders.length === folders.length && folders.length > 0) {
            setSelectedFolders([]);
        } else {
            setSelectedFolders(folders.map(f => `${f.cntrNo}|${f.workDateStr}`));
        }
    };

    const handleToggleSelectDateGroup = (groupFolders: ContainerFolder[]) => {
        const groupKeys = groupFolders.map(f => `${f.cntrNo}|${f.workDateStr}`);
        const allSelected = groupKeys.every(k => selectedFolders.includes(k));
        if (allSelected) {
            setSelectedFolders(prev => prev.filter(k => !groupKeys.includes(k)));
        } else {
            setSelectedFolders(prev => Array.from(new Set([...prev, ...groupKeys])));
        }
    };

    const handleToggleTeamFolders = (teamFolders: ContainerFolder[]) => {
        const teamKeys = teamFolders.map(f => `${f.cntrNo}|${f.workDateStr}`);
        const allSelected = teamKeys.every(k => selectedFolders.includes(k));
        if (allSelected) {
            setSelectedFolders(prev => prev.filter(k => !teamKeys.includes(k)));
        } else {
            setSelectedFolders(prev => Array.from(new Set([...prev, ...teamKeys])));
        }
    };

    // Actions
    const handleSingleDownload = (photo: Photo) => {
        const rawPath = photo.photo_path.split('?')[0];
        const link = document.createElement('a');
        link.href = `/api/photos/view?filename=${encodeURIComponent(rawPath)}&download=1`;
        link.download = rawPath.split('/').pop() || 'photo.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSingleDelete = async (photo: Photo) => {
        if (!confirm(`'${photo.cntr_no}' 사진을 휴지통으로 이동하시겠습니까?`)) return;
        try {
            const res = await fetch(`/api/photos?ids=${photo.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert('휴지통으로 이동되었습니다.');
                loadPhotos();
            } else {
                alert(`삭제 실패: ${data.error}`);
            }
        } catch (e) {
            console.error('Delete error:', e);
        }
    };

    const handleSingleRestore = async (photo: Photo) => {
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'restore', ids: [photo.id] })
            });
            const data = await res.json();
            if (data.success) {
                alert('사진이 복구되었습니다.');
                loadPhotos();
            }
        } catch (e) {
            console.error('Restore error:', e);
        }
    };

    const handleSingleDeletePermanently = async (photo: Photo) => {
        if (!confirm(`[영구 삭제]\n\n'${photo.cntr_no}' 사진을 영구히 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.`)) return;
        try {
            const res = await fetch(`/api/photos?ids=${photo.id}&permanent=true`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert('영구 삭제되었습니다.');
                loadPhotos();
            }
        } catch (e) {
            console.error('Permanent delete error:', e);
        }
    };

    // Bulk Actions
    const handleBulkDelete = async () => {
        const targetIds = selectedPhotoIds.length > 0
            ? selectedPhotoIds
            : folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)).flatMap(f => f.photos.map(p => p.id));

        if (targetIds.length === 0) return;
        if (!confirm(`선택한 사진 총 ${targetIds.length}장을 휴지통으로 이동하시겠습니까?`)) return;

        try {
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(targetIds.join(','))}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message || '휴지통으로 이동되었습니다.');
                setSelectedPhotoIds([]);
                setSelectedFolders([]);
                loadPhotos();
            }
        } catch (e) {
            console.error('Bulk delete error:', e);
        }
    };

    const handleBulkRestore = async () => {
        const targetIds = selectedPhotoIds.length > 0
            ? selectedPhotoIds
            : folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)).flatMap(f => f.photos.map(p => p.id));

        if (targetIds.length === 0) return;
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'restore', ids: targetIds })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message || '사진이 복구되었습니다.');
                setSelectedPhotoIds([]);
                setSelectedFolders([]);
                loadPhotos();
            }
        } catch (e) {
            console.error('Bulk restore error:', e);
        }
    };

    const handleBulkDeletePermanently = async () => {
        const targetIds = selectedPhotoIds.length > 0
            ? selectedPhotoIds
            : folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)).flatMap(f => f.photos.map(p => p.id));

        if (targetIds.length === 0) return;
        if (!confirm(`[영구 삭제 경고]\n\n총 ${targetIds.length}장의 사진을 완전히 영구 삭제하시겠습니까?\n이 작업은 절대 복구할 수 없습니다.`)) return;

        try {
            const res = await fetch(`/api/photos?ids=${encodeURIComponent(targetIds.join(','))}&permanent=true`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message || '영구 삭제되었습니다.');
                setSelectedPhotoIds([]);
                setSelectedFolders([]);
                loadPhotos();
            }
        } catch (e) {
            console.error('Bulk permanent delete error:', e);
        }
    };

    const handleMovePhotos = async (targetCntrNo: string) => {
        const targetIds = selectedPhotoIds.length > 0
            ? selectedPhotoIds
            : (activePhotoIdx !== null && activePhotoList[activePhotoIdx] ? [activePhotoList[activePhotoIdx].id] : []);

        if (targetIds.length === 0) return;

        const res = await fetch('/api/photos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'move_container', ids: targetIds, targetCntrNo })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message || '사진이 성공적으로 이동되었습니다.');
            setSelectedPhotoIds([]);
            loadPhotos();
        } else {
            alert(`이동 실패: ${data.error}`);
        }
    };

    // Seal Photo Missing Check
    const checkMissingSealPhotos = () => {
        if (selectedFolders.length === 0) return [];
        const foldersToProcess = folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`));
        const missing = foldersToProcess.filter(f => f.photos.length > 0 && !f.photos.some(p => p.photo_type === 'seal'));
        return Array.from(new Set(missing.map(f => f.cntrNo)));
    };

    const handleActionWithCheck = (action: ActionType, e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        if (selectedFolders.length === 0 && selectedPhotoIds.length === 0) {
            alert("작업할 컨테이너 폴더를 하나 이상 선택해 주세요.");
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
            handleDownloadZip();
        } else if (action === 'GDRIVE_BACKUP') {
            handleUploadGDrive();
        }
    };

    const handleDownloadZip = () => {
        const targetFolders = folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`));
        const targetIds = targetFolders.flatMap(f => f.photos.map(p => p.id));
        if (targetIds.length === 0) return;
        window.location.href = `/api/photos/download?ids=${encodeURIComponent(targetIds.join(','))}`;
    };

    const handleUploadGDrive = async (customIds?: string[], isResume = false) => {
        let targetIds = customIds || [];
        if (targetIds.length === 0) {
            targetIds = selectedPhotoIds.length > 0
                ? [...selectedPhotoIds]
                : folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)).flatMap(f => f.photos.map(p => p.id));
        }
        if (targetIds.length === 0) return;

        setLastGDriveTargetIds(targetIds);
        if (!isResume) {
            if (!confirm(`[☁️ 구글 드라이브 백업]\n\n총 ${targetIds.length}장의 사진을 구글 드라이브로 백업하고 로컬 용량을 정리하시겠습니까?`)) return;
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
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'upload_gdrive', ids: targetIds }),
                signal: abortController.signal
            });

            const reader = res.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            if (reader) {
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
                            if (event.type === 'progress') {
                                setGdriveProgress(prev => ({ ...prev, ...event }));
                            } else if (event.type === 'done') {
                                setGdriveProgress(prev => ({ ...prev, percent: 100 }));
                                alert(event.message || '백업이 완료되었습니다.');
                                setSelectedPhotoIds([]);
                                setSelectedFolders([]);
                                loadPhotos();
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error('GDrive error:', e);
                alert(`백업 중 오류: ${e.message}`);
            }
        } finally {
            setIsGDriveUploading(false);
            gdriveAbortControllerRef.current = null;
            loadPhotos();
        }
    };

    const handleToggleCompleted = async (folder: ContainerFolder, e: React.MouseEvent) => {
        e.stopPropagation();
        const newCompleted = !folder.isCompleted;
        const photoIds = folder.photos.map(p => p.id);
        try {
            const res = await fetch('/api/photos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle_completed', ids: photoIds, isCompleted: newCompleted })
            });
            const data = await res.json();
            if (data.success) {
                loadPhotos();
            }
        } catch (e) {
            console.error('Toggle completed error:', e);
        }
    };

    const selectedFolderObjects = useMemo(() => {
        return folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`));
    }, [folders, selectedFolders]);

    return (
        <div className="fixed inset-0 z-50 bg-[#07070d] flex flex-col text-slate-100 overflow-hidden select-none">
            {/* Header */}
            <GalleryHeader
                tabState={tabState}
                onTabChange={setTabState}
                totalCount={photos.length}
                searchCntrNo={searchCntrNo}
                onSearchChange={setSearchCntrNo}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                selectedTeam={selectedTeam}
                onTeamChange={setSelectedTeam}
                teams={teams}
                selectedUser={selectedUser}
                onUserChange={setSelectedUser}
                availableUsers={availableUsers}
                sortBy={sortBy}
                onSortChange={setSortBy}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onRefresh={loadPhotos}
                onClose={onClose}
                onOpenReport={onOpenReport}
                isAdmin={isAdmin}
            />

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 pb-24 custom-scrollbar">
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
                    /* Folder Grid View */
                    <FolderGridView
                        folders={folders}
                        selectedFolders={selectedFolders}
                        onToggleSelectFolder={handleToggleSelectFolder}
                        onSelectAllFolders={handleSelectAllFolders}
                        onToggleSelectDateGroup={handleToggleSelectDateGroup}
                        onToggleTeamFolders={handleToggleTeamFolders}
                        onOpenFolder={(cntrNo) => setSelectedContainerFolder(cntrNo)}
                        onSelectPhoto={(photo) => {
                            const idx = activePhotoList.findIndex(p => p.id === photo.id);
                            if (idx !== -1) setActivePhotoIdx(idx);
                        }}
                        selectedPhotoIds={selectedPhotoIds}
                        onToggleSelectPhoto={handleToggleSelectPhoto}
                        duplicatePhotoIds={[]}
                        isAdmin={isAdmin}
                        isTrashView={isTrashView}
                        viewMode={viewMode}
                        onDownloadPhoto={(photo, e) => { e.stopPropagation(); handleSingleDownload(photo); }}
                        onDeletePhoto={(photo, e) => { e.stopPropagation(); handleSingleDelete(photo); }}
                        onRestorePhoto={(photo, e) => { e.stopPropagation(); handleSingleRestore(photo); }}
                        onDeletePhotoPermanently={(photo, e) => { e.stopPropagation(); handleSingleDeletePermanently(photo); }}
                        onToggleCompleted={handleToggleCompleted}
                    />
                ) : (
                    /* Photos inside single container */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                            <button
                                onClick={() => setSelectedContainerFolder(null)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" /> 전체 폴더 목록으로 돌아가기
                            </button>
                            <span className="text-sm font-black text-sky-400">
                                {selectedContainerFolder} ({folderPhotos.length}장)
                            </span>
                        </div>

                        <div className={viewMode === 'GRID' 
                            ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3" 
                            : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                        }>
                            {folderPhotos.map((photo, idx) => {
                                const rawPhotoPath = photo.photo_path.split('?')[0];
                                const cacheQuery = photo.photo_path.includes('?t=') ? '&t=' + photo.photo_path.split('?t=')[1] : '';
                                const photoUrl = `/api/photos/view?filename=${encodeURIComponent(rawPhotoPath)}${cacheQuery}`;
                                const isSelected = selectedPhotoIds.includes(photo.id);

                                return (
                                    <div
                                        key={photo.id}
                                        onClick={() => setActivePhotoIdx(idx)}
                                        className="group relative aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/5 hover:border-sky-500/40 transition-all cursor-pointer"
                                    >
                                        <img
                                            src={photoUrl}
                                            alt={photo.cntr_no}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                        <div 
                                            onClick={(e) => handleToggleSelectPhoto(photo.id, e)}
                                            className="absolute top-2 left-2 z-10 p-1"
                                        >
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                                isSelected 
                                                    ? 'bg-sky-500 border-sky-400 text-white' 
                                                    : 'bg-black/60 border-white/20 text-transparent group-hover:border-white/50 backdrop-blur-sm'
                                            }`}>
                                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                            </div>
                                        </div>

                                        {photo.gdrive_file_id && (
                                            <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-sky-600/90 border border-sky-400/40 text-white font-black text-[10px] shadow-md backdrop-blur-md">
                                                ☁️
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Batch Actions Floating Bar */}
            <BatchActionBar
                selectedCount={selectedPhotoIds.length + selectedFolders.length}
                selectedPhotoCount={selectedPhotoIds.length}
                selectedFolderCount={selectedFolders.length}
                onClearSelection={() => { setSelectedPhotoIds([]); setSelectedFolders([]); }}
                onRotate={handleRotatePhotos}
                isRotating={isRotating}
                onOpenMoveModal={() => setIsMoveModalOpen(true)}
                onActionWithCheck={handleActionWithCheck}
                onDelete={handleBulkDelete}
                onRestore={handleBulkRestore}
                onDeletePermanently={handleBulkDeletePermanently}
                isTrashView={isTrashView}
                isAdmin={isAdmin}
            />

            {/* Lightbox Modal */}
            <PhotoLightboxModal
                photos={activePhotoList}
                activePhotoIdx={activePhotoIdx}
                onClose={() => setActivePhotoIdx(null)}
                onSelectIndex={setActivePhotoIdx}
                isAdmin={isAdmin}
                isTrashView={isTrashView}
                onDownload={handleSingleDownload}
                onDelete={handleSingleDelete}
                onRestore={handleSingleRestore}
                onDeletePermanently={handleSingleDeletePermanently}
                onRotate={handleRotatePhotos}
                isRotating={isRotating}
            />

            {/* Move Container Modal */}
            <MoveContainerModal
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                selectedCount={selectedPhotoIds.length > 0 ? selectedPhotoIds.length : (activePhotoIdx !== null ? 1 : 0)}
                existingFolders={folders}
                onMove={handleMovePhotos}
            />

            {/* Local Copy Modal */}
            <LocalCopyModal
                isOpen={isLocalCopyOpen}
                onClose={() => setIsLocalCopyOpen(false)}
                selectedFolders={selectedFolderObjects}
            />

            {/* GDrive Progress Modal */}
            <GDriveSyncModal
                isOpen={isGDriveProgressOpen}
                onClose={() => setIsGDriveProgressOpen(false)}
                isUploading={isGDriveUploading}
                progress={gdriveProgress}
                onStopUpload={() => {
                    if (gdriveAbortControllerRef.current) {
                        gdriveAbortControllerRef.current.abort();
                    }
                }}
                onResumeUpload={() => handleUploadGDrive(lastGDriveTargetIds, true)}
            />

            {/* Seal Missing Warning Modal */}
            <SealWarningModal
                isOpen={warningModalInfo.isOpen}
                missingCntrs={warningModalInfo.missingCntrs}
                onClose={() => setWarningModalInfo({ isOpen: false, action: null, missingCntrs: [] })}
                onProceed={() => {
                    const action = warningModalInfo.action;
                    setWarningModalInfo({ isOpen: false, action: null, missingCntrs: [] });
                    if (action) executeAction(action);
                }}
            />
        </div>
    );
}
