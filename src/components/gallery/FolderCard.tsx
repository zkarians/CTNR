import React from 'react';
import { 
    Check, Download, Trash2, RotateCw, Folder, Clock, User, Shield, CheckCircle2, Circle
} from 'lucide-react';
import { Photo, ContainerFolder, ViewMode } from './PhotoGalleryTypes';
import { getCarrierColor } from '@/lib/utils/colorUtils';

interface FolderCardProps {
    folder: ContainerFolder;
    isSelected: boolean;
    onToggleSelectFolder: (key: string, e?: React.MouseEvent) => void;
    onOpenFolder: (cntrNo: string) => void;
    onSelectPhoto: (photo: Photo) => void;
    selectedPhotoIds: string[];
    onToggleSelectPhoto: (id: string, e?: React.MouseEvent) => void;
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

export default function FolderCard({
    folder,
    isSelected,
    onToggleSelectFolder,
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
}: FolderCardProps) {
    const folderKey = `${folder.cntrNo}|${folder.workDateStr}`;
    const sortedThumbnails = folder.photos.slice(0, 4);

    return (
        <div className={`p-4 md:p-5 rounded-3xl bg-[#0e0e16]/80 border transition-all duration-300 ${
            isSelected 
                ? 'border-sky-500/50 bg-sky-500/[0.03] shadow-lg shadow-sky-500/10' 
                : 'border-white/5 hover:border-white/15'
        }`}>
            {/* Folder Header */}
            <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                    <button 
                        onClick={(e) => onToggleSelectFolder(folderKey, e)}
                        className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected 
                                ? 'bg-sky-500 border-sky-400 text-white' 
                                : 'border-white/20 hover:border-white/40'
                        }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                    </button>

                    <div 
                        onClick={() => onOpenFolder(folder.cntrNo)}
                        className="cursor-pointer group flex items-center gap-2.5 truncate"
                    >
                        <span className={`text-base font-black tracking-tight group-hover:text-sky-400 transition-colors ${getCarrierColor(folder.transporter)}`}>
                            {folder.cntrNo}
                        </span>
                        {folder.jobName && (
                            <span className="text-xs font-bold text-slate-400 truncate hidden sm:inline">
                                ({folder.jobName})
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Completion Status Toggle */}
                    {onToggleCompleted && !isTrashView && (
                        <button
                            onClick={(e) => onToggleCompleted(folder, e)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-black border flex items-center gap-1.5 transition-all cursor-pointer ${
                                folder.isCompleted
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                            }`}
                            title={folder.isCompleted ? '작업 완료됨 (클릭 시 미완료로 변경)' : '작업 진행중 (클릭 시 완료로 변경)'}
                        >
                            {folder.isCompleted ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                                <Circle className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            {folder.isCompleted ? '완료' : '진행중'}
                        </button>
                    )}

                    <span className="px-2.5 py-0.5 rounded-full bg-white/5 text-[11px] font-black text-slate-300 border border-white/5">
                        {folder.photos.length}장
                    </span>
                </div>
            </div>

            {/* Folder Metadata Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400 mb-3 px-1">
                {folder.uploaderName && (
                    <div className="flex items-center gap-1 text-[11px]">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-bold text-slate-300">{folder.uploaderName}</span>
                    </div>
                )}
                {folder.teamName && (
                    <div className="flex items-center gap-1 text-[11px]">
                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-bold text-slate-300">{folder.teamName}</span>
                    </div>
                )}
                {folder.workDurationMinutes !== undefined && (
                    <div className="flex items-center gap-1 text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>공수 {folder.workDurationMinutes}분</span>
                    </div>
                )}
            </div>

            {/* Thumbnail Photos Grid inside Folder */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {sortedThumbnails.map(photo => {
                    const isPhotoSelected = selectedPhotoIds.includes(photo.id);
                    const rawPhotoPath = photo.photo_path.split('?')[0];
                    const cacheQuery = photo.photo_path.includes('?t=') ? '&t=' + photo.photo_path.split('?t=')[1] : '';
                    const photoViewUrl = `/api/photos/view?filename=${encodeURIComponent(rawPhotoPath)}${cacheQuery}`;

                    return (
                        <div 
                            key={photo.id}
                            onClick={() => onSelectPhoto(photo)}
                            className="group relative aspect-square rounded-2xl overflow-hidden bg-black/40 border border-white/5 hover:border-sky-500/40 transition-all cursor-pointer"
                        >
                            <img 
                                src={photoViewUrl}
                                alt={photo.cntr_no}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                            />

                            {/* Selection Checkbox */}
                            <div 
                                onClick={(e) => onToggleSelectPhoto(photo.id, e)}
                                className="absolute top-2 left-2 z-10 p-1"
                            >
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                    isPhotoSelected
                                        ? 'bg-sky-500 border-sky-400 text-white'
                                        : 'bg-black/60 border-white/20 text-transparent group-hover:border-white/50 backdrop-blur-sm'
                                }`}>
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                            </div>

                            {/* Badges */}
                            {photo.gdrive_file_id && (
                                <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-sky-600/90 border border-sky-400/40 text-white font-black text-[10px] shadow-md backdrop-blur-md" title="구글 드라이브 백업 완료">
                                    ☁️
                                </div>
                            )}

                            {/* Hover Actions */}
                            <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => e.stopPropagation()}>
                                {isTrashView ? (
                                    <>
                                        <button 
                                            onClick={(e) => onRestorePhoto(photo, e)}
                                            className="p-1.5 rounded-lg bg-black/70 hover:bg-sky-500 text-sky-400 hover:text-white border border-white/10 transition-all"
                                            title="복구"
                                        >
                                            <RotateCw className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            onClick={(e) => onDeletePhotoPermanently(photo, e)}
                                            className="p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-rose-400 hover:text-white border border-white/10 transition-all"
                                            title="영구 삭제"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                ) : (
                                    <button 
                                        onClick={(e) => onDownloadPhoto(photo, e)}
                                        className="p-1.5 rounded-lg bg-black/70 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10 transition-all"
                                        title="다운로드"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
