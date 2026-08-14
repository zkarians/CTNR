import React, { useState, useMemo } from 'react';
import { Calendar, LayoutGrid, User, ChevronDown, Check, Folder } from 'lucide-react';
import { ContainerFolder, Photo, ViewMode } from './PhotoGalleryTypes';
import { formatKoreanDate } from '@/lib/utils/dateUtils';
import FolderCard from './FolderCard';

interface FolderGridViewProps {
    folders: ContainerFolder[];
    selectedFolders: string[];
    onToggleSelectFolder: (folderKey: string, e?: React.MouseEvent) => void;
    onSelectAllFolders: () => void;
    onToggleSelectDateGroup: (groupFolders: ContainerFolder[]) => void;
    onToggleTeamFolders: (teamFolders: ContainerFolder[]) => void;
    onOpenFolder: (cntrNo: string) => void;
    onSelectPhoto: (photo: Photo) => void;
    selectedPhotoIds: string[];
    onToggleSelectPhoto: (photoId: string, e?: React.MouseEvent) => void;
    duplicatePhotoIds: string[];
    isAdmin: boolean;
    isTrashView: boolean;
    viewMode: ViewMode;
    onDownloadPhoto: (photo: Photo, e: React.MouseEvent) => void;
    onDeletePhoto: (photo: Photo, e: React.MouseEvent) => void;
    onRestorePhoto: (photo: Photo, e: React.MouseEvent) => void;
    onDeletePhotoPermanently: (photo: Photo, e: React.MouseEvent) => void;
    onToggleCompleted?: (folder: ContainerFolder, e: React.MouseEvent) => void;
}

export default function FolderGridView({
    folders,
    selectedFolders,
    onToggleSelectFolder,
    onSelectAllFolders,
    onToggleSelectDateGroup,
    onToggleTeamFolders,
    onOpenFolder,
    onSelectPhoto,
    selectedPhotoIds,
    onToggleSelectPhoto,
    duplicatePhotoIds,
    isAdmin,
    isTrashView,
    viewMode,
    onDownloadPhoto,
    onDeletePhoto,
    onRestorePhoto,
    onDeletePhotoPermanently,
    onToggleCompleted
}: FolderGridViewProps) {
    const [folderViewMode, setFolderViewMode] = useState<'DATE_GROUP' | 'FLAT'>('DATE_GROUP');
    const [isTeamGroupEnabled, setIsTeamGroupEnabled] = useState(false);
    const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

    const toggleCollapseDate = (dateStr: string) => {
        setCollapsedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
    };

    // Group folders by workDateStr
    const foldersByWorkDate = useMemo(() => {
        const map = new Map<string, ContainerFolder[]>();
        folders.forEach(f => {
            if (!map.has(f.workDateStr)) map.set(f.workDateStr, []);
            map.get(f.workDateStr)!.push(f);
        });

        const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
        return sortedDates.map(dateStr => {
            const groupFolders = map.get(dateStr)!;
            const totalPhotos = groupFolders.reduce((sum, f) => sum + f.photos.length, 0);

            // Group by team within date
            const teamMap = new Map<string, ContainerFolder[]>();
            groupFolders.forEach(f => {
                const tName = f.teamName || '미지정 조';
                if (!teamMap.has(tName)) teamMap.set(tName, []);
                teamMap.get(tName)!.push(f);
            });

            const byTeam = Array.from(teamMap.entries()).map(([teamName, tFolders]) => ({
                teamName,
                folders: tFolders,
                totalPhotos: tFolders.reduce((s, tf) => s + tf.photos.length, 0)
            }));

            return {
                dateStr,
                folders: groupFolders,
                totalPhotos,
                byTeam
            };
        });
    }, [folders]);

    return (
        <div className="space-y-4">
            {/* Selection Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                {/* Left: Select All + View Mode Toggle */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onSelectAllFolders}
                        className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 text-white transition-all text-xs font-black cursor-pointer shadow-sm"
                    >
                        {selectedFolders.length === folders.length && folders.length > 0 ? "전체 해제" : "전체 선택"}
                    </button>

                    {/* View Mode Toggle */}
                    <div className="flex bg-white/5 border border-white/10 p-0.5 rounded-xl gap-0.5 items-center">
                        <button
                            onClick={() => setFolderViewMode('DATE_GROUP')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                                folderViewMode === 'DATE_GROUP' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                            }`}
                            title="작업일자별 그룹 보기"
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">작업일자별</span>
                        </button>
                        <button
                            onClick={() => setFolderViewMode('FLAT')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                                folderViewMode === 'FLAT' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                            }`}
                            title="전체 목록 보기"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">전체 목록</span>
                        </button>
                    </div>

                    {/* Sub-toggle: Team Grouping inside Date View */}
                    {folderViewMode === 'DATE_GROUP' && (
                        <button
                            onClick={() => setIsTeamGroupEnabled(prev => !prev)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer border shadow-sm ${
                                isTeamGroupEnabled
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                            }`}
                            title="날짜 카드 내부 조별 소그룹 모아보기"
                        >
                            <User className="w-3.5 h-3.5" />
                            <span>조별 보기 {isTeamGroupEnabled ? 'ON' : 'OFF'}</span>
                        </button>
                    )}
                </div>

                {/* Right: Total Count */}
                <div className="text-xs font-bold text-slate-400">
                    총 {folders.length}개 컨테이너
                </div>
            </div>

            {/* Folder Grid Views */}
            {folderViewMode === 'DATE_GROUP' ? (
                <div className="space-y-6">
                    {foldersByWorkDate.map(group => {
                        const isCollapsed = !!collapsedDates[group.dateStr];
                        const allGroupSelected = group.folders.length > 0 && group.folders.every(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`));
                        const someGroupSelected = group.folders.some(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`));

                        return (
                            <div key={group.dateStr} className="bg-[#0b0c14]/90 border border-white/10 rounded-3xl p-4 md:p-5 shadow-xl space-y-4">
                                {/* Date Section Header */}
                                <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 select-none">
                                    <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                                        <button
                                            onClick={() => toggleCollapseDate(group.dateStr)}
                                            className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-all cursor-pointer shrink-0"
                                        >
                                            <Calendar className="w-4 h-4" />
                                        </button>
                                        <h3 className="text-base font-black text-white tracking-tight shrink-0">
                                            {formatKoreanDate(group.dateStr)} 작업
                                        </h3>
                                        <button
                                            onClick={() => onToggleSelectDateGroup(group.folders)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer shrink-0"
                                        >
                                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                                allGroupSelected
                                                    ? "bg-sky-500 border-sky-400 text-white"
                                                    : someGroupSelected
                                                        ? "bg-sky-500/40 border-sky-500 text-white"
                                                        : "border-white/30"
                                            }`}>
                                                {allGroupSelected ? (
                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                ) : someGroupSelected ? (
                                                    <div className="w-2 h-0.5 bg-white rounded-full" />
                                                ) : null}
                                            </div>
                                            <span>
                                                {parseInt(group.dateStr.split('-')[2] || '0', 10)}일 전체 선택 ({group.folders.filter(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)).length}/{group.folders.length})
                                            </span>
                                        </button>
                                        <span className="text-xs font-bold text-slate-400 shrink-0 hidden xs:inline">
                                            컨테이너 <strong className="text-sky-400 font-black">{group.folders.length}개</strong> · 총 <strong className="text-slate-200">{group.totalPhotos}장</strong>
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => toggleCollapseDate(group.dateStr)}
                                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
                                        title={isCollapsed ? "펼치기" : "접기"}
                                    >
                                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`} />
                                    </button>
                                </div>

                                {/* Folder Grid for this Date */}
                                {!isCollapsed && (
                                    isTeamGroupEnabled ? (
                                        <div className="space-y-4 pt-1">
                                            {group.byTeam.map(subTeam => (
                                                <div key={subTeam.teamName} className="bg-black/30 border border-white/5 rounded-2xl p-3.5 space-y-3">
                                                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/5 text-xs font-black text-slate-300">
                                                        <div className="flex items-center gap-2">
                                                            <User className="w-3.5 h-3.5 text-emerald-400" />
                                                            <span className="text-white font-extrabold">{subTeam.teamName}</span>
                                                            <span className="text-[11px] text-slate-500">({subTeam.folders.length}개 컨테이너 · {subTeam.totalPhotos}장)</span>
                                                        </div>
                                                        <button
                                                            onClick={() => onToggleTeamFolders(subTeam.folders)}
                                                            className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 transition-colors cursor-pointer"
                                                        >
                                                            {subTeam.folders.length > 0 && subTeam.folders.every(f => selectedFolders.includes(`${f.cntrNo}|${f.workDateStr}`)) ? '전체 해제' : '전체 선택'}
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                        {subTeam.folders.map(folder => (
                                                            <FolderCard
                                                                key={`${folder.cntrNo}|${folder.workDateStr}`}
                                                                folder={folder}
                                                                isSelected={selectedFolders.includes(`${folder.cntrNo}|${folder.workDateStr}`)}
                                                                onToggleSelectFolder={onToggleSelectFolder}
                                                                onOpenFolder={onOpenFolder}
                                                                onSelectPhoto={onSelectPhoto}
                                                                selectedPhotoIds={selectedPhotoIds}
                                                                onToggleSelectPhoto={onToggleSelectPhoto}
                                                                duplicatePhotoIds={duplicatePhotoIds}
                                                                isAdmin={isAdmin}
                                                                isTrashView={isTrashView}
                                                                viewMode={viewMode}
                                                                onDownloadPhoto={onDownloadPhoto}
                                                                onDeletePhoto={onDeletePhoto}
                                                                onRestorePhoto={onRestorePhoto}
                                                                onDeletePhotoPermanently={onDeletePhotoPermanently}
                                                                onToggleCompleted={onToggleCompleted}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {group.folders.map(folder => (
                                                <FolderCard
                                                    key={`${folder.cntrNo}|${folder.workDateStr}`}
                                                    folder={folder}
                                                    isSelected={selectedFolders.includes(`${folder.cntrNo}|${folder.workDateStr}`)}
                                                    onToggleSelectFolder={onToggleSelectFolder}
                                                    onOpenFolder={onOpenFolder}
                                                    onSelectPhoto={onSelectPhoto}
                                                    selectedPhotoIds={selectedPhotoIds}
                                                    onToggleSelectPhoto={onToggleSelectPhoto}
                                                    duplicatePhotoIds={duplicatePhotoIds}
                                                    isAdmin={isAdmin}
                                                    isTrashView={isTrashView}
                                                    viewMode={viewMode}
                                                    onDownloadPhoto={onDownloadPhoto}
                                                    onDeletePhoto={onDeletePhoto}
                                                    onRestorePhoto={onRestorePhoto}
                                                    onDeletePhotoPermanently={onDeletePhotoPermanently}
                                                    onToggleCompleted={onToggleCompleted}
                                                />
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {folders.map(folder => (
                        <FolderCard
                            key={`${folder.cntrNo}|${folder.workDateStr}`}
                            folder={folder}
                            isSelected={selectedFolders.includes(`${folder.cntrNo}|${folder.workDateStr}`)}
                            onToggleSelectFolder={onToggleSelectFolder}
                            onOpenFolder={onOpenFolder}
                            onSelectPhoto={onSelectPhoto}
                            selectedPhotoIds={selectedPhotoIds}
                            onToggleSelectPhoto={onToggleSelectPhoto}
                            duplicatePhotoIds={duplicatePhotoIds}
                            isAdmin={isAdmin}
                            isTrashView={isTrashView}
                            viewMode={viewMode}
                            onDownloadPhoto={onDownloadPhoto}
                            onDeletePhoto={onDeletePhoto}
                            onRestorePhoto={onRestorePhoto}
                            onDeletePhotoPermanently={onDeletePhotoPermanently}
                            onToggleCompleted={onToggleCompleted}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
