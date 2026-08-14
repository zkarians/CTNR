import React from 'react';
import { 
    X, RotateCcw, RotateCw, Trash2, Folder, Download, 
    Cloud, HardDrive, CheckSquare
} from 'lucide-react';
import { ActionType } from './PhotoGalleryTypes';

interface BatchActionBarProps {
    selectedCount: number;
    selectedPhotoCount: number;
    selectedFolderCount: number;
    onClearSelection: () => void;
    onRotate: (degrees: number) => void;
    isRotating?: boolean;
    onOpenMoveModal: () => void;
    onActionWithCheck: (action: ActionType, e?: React.MouseEvent) => void;
    onDelete: () => void;
    onRestore?: () => void;
    onDeletePermanently?: () => void;
    isTrashView: boolean;
    isAdmin: boolean;
}

export default function BatchActionBar({
    selectedCount,
    selectedPhotoCount,
    selectedFolderCount,
    onClearSelection,
    onRotate,
    isRotating,
    onOpenMoveModal,
    onActionWithCheck,
    onDelete,
    onRestore,
    onDeletePermanently,
    isTrashView,
    isAdmin
}: BatchActionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] sm:max-w-none">
            <div className="flex flex-wrap items-center gap-2 p-2.5 px-4 rounded-3xl bg-[#0c0c16]/95 border border-white/10 shadow-2xl backdrop-blur-2xl">
                {/* Count Badge */}
                <div className="flex items-center gap-2 pr-3 border-r border-white/10 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
                    <span className="text-xs font-black text-white">
                        {selectedFolderCount > 0 && `${selectedFolderCount}개 폴더 `}
                        {selectedPhotoCount > 0 && `${selectedPhotoCount}장 선택`}
                    </span>
                </div>

                {/* Actions Group */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {isTrashView ? (
                        isAdmin && (
                            <>
                                {onRestore && (
                                    <button 
                                        onClick={onRestore}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-sky-400 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" /> 복구
                                    </button>
                                )}
                                {onDeletePermanently && (
                                    <button 
                                        onClick={onDeletePermanently}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> 영구 삭제
                                    </button>
                                )}
                            </>
                        )
                    ) : (
                        <>
                            {/* Move Container */}
                            <button 
                                onClick={onOpenMoveModal}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-xs font-black shrink-0 shadow-md shadow-indigo-500/20 cursor-pointer"
                            >
                                <Folder className="w-3.5 h-3.5" /> 이동
                            </button>

                            {/* Rotation Buttons */}
                            <button 
                                disabled={isRotating}
                                onClick={() => onRotate(-90)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer disabled:opacity-50"
                            >
                                <RotateCcw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} /> 좌회전
                            </button>
                            <button 
                                disabled={isRotating}
                                onClick={() => onRotate(90)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer disabled:opacity-50"
                            >
                                <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} /> 우회전
                            </button>

                            {/* Export / Sync Actions */}
                            <button 
                                onClick={(e) => onActionWithCheck('ZIP_DOWNLOAD', e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                            >
                                <Download className="w-3.5 h-3.5" /> ZIP 압축
                            </button>

                            <button 
                                onClick={(e) => onActionWithCheck('LOCAL_COPY', e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                            >
                                <HardDrive className="w-3.5 h-3.5" /> 로컬 복사
                            </button>

                            <button 
                                onClick={(e) => onActionWithCheck('GDRIVE_BACKUP', e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-sky-400 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                            >
                                <Cloud className="w-3.5 h-3.5" /> 드라이브 백업
                            </button>

                            {/* Delete Button */}
                            <button 
                                onClick={onDelete}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-xs font-black shrink-0 cursor-pointer"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> 삭제
                            </button>
                        </>
                    )}
                </div>

                {/* Cancel Selection Button */}
                <button 
                    onClick={onClearSelection}
                    className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors ml-1 cursor-pointer"
                    title="선택 해제"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
