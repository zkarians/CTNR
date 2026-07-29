import React from 'react';
import { Ban, X } from 'lucide-react';

interface CancelManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    cancelMode: string;
    setCancelMode: (mode: string) => void;
    reportData: any[] | null;
    handleToggleCancelCntr: (cntrNo: string, mode: string) => void;
    handleSetCancelType: (cntrNo: string, type: 'cancel' | 'exclude') => void;
}

export default function CancelManageModal({
    isOpen,
    onClose,
    cancelMode,
    setCancelMode,
    reportData,
    handleToggleCancelCntr,
    handleSetCancelType
}: CancelManageModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl p-5 md:p-6 flex flex-col max-h-[85vh] animate-fade-in text-slate-900">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <Ban className="w-5 h-5 text-rose-600" />
                        조별 작업취소 및 작업제외 관리
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 표기 선택 버튼 */}
                <div className="flex items-center justify-between bg-slate-100 p-2 rounded-2xl border border-slate-200 mt-3 mb-2 flex-wrap gap-2 shrink-0">
                    <span className="text-xs font-bold text-slate-700">체크 시 기본 지정 표기:</span>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setCancelMode('cancel')}
                            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                                cancelMode === 'cancel'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span>🚫 작업취소</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCancelMode('exclude')}
                            className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                                cancelMode === 'exclude'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span>⚠️ 작업제외</span>
                        </button>
                    </div>
                </div>

                <p className="text-xs text-slate-500 font-bold mb-3 shrink-0">
                    💡 체크한 컨테이너는 <strong className={cancelMode === 'cancel' ? "text-rose-600" : "text-amber-600"}>[{cancelMode === 'cancel' ? '작업취소' : '작업제외'}]</strong>로 지정되며, 수량 합계에서 자동 제외됩니다. 항목 오른쪽 버튼으로 개별 전환할 수 있습니다.
                </p>

                <div className="overflow-y-auto flex-1 custom-scrollbar space-y-4 pr-1">
                    {reportData && reportData.length > 0 ? (
                        reportData.map((dateGroup: any) =>
                            dateGroup.uploaders?.map((teamGroup: any) => (
                                <div key={teamGroup.teamName || teamGroup.uploaderName} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                        <span className="text-sm font-black text-slate-900 flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                                            {teamGroup.teamName || teamGroup.uploaderName}
                                        </span>
                                        <span className="text-xs font-bold text-slate-500">
                                            총 {teamGroup.containers.length}개 항목
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {teamGroup.containers.map((cntr: any, cntrIdx: number) => {
                                            const isExcluded = cntr.adminComment?.includes('[작업제외]');
                                            const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                                            const isSelected = isCancelled || isExcluded;

                                            return (
                                                <div
                                                    key={`${cntr.cntrNo}_${cntrIdx}`}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                                        isExcluded
                                                            ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                                                            : isCancelled
                                                            ? 'bg-rose-50 border-rose-200 text-rose-900 shadow-sm'
                                                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                                                    }`}
                                                >
                                                    <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleCancelCntr(cntr.cntrNo, cancelMode)}
                                                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-black text-xs uppercase truncate flex items-center gap-1.5">
                                                                <span>{cntr.cntrNo}</span>
                                                                {isExcluded ? (
                                                                    <span className="px-1.5 py-0.2 rounded bg-amber-600 text-white font-extrabold text-[10px]">
                                                                        작업제외
                                                                    </span>
                                                                ) : isCancelled ? (
                                                                    <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-extrabold text-[10px]">
                                                                        작업취소
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                                                                {cntr.modelSummaryStr || `${cntr.products?.length || 1}모델`}
                                                            </div>
                                                        </div>
                                                    </label>

                                                    {isSelected && (
                                                        <div className="flex items-center gap-1 shrink-0 ml-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSetCancelType(cntr.cntrNo, 'cancel')}
                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                                                                    isCancelled
                                                                        ? 'bg-rose-600 text-white shadow-2xs'
                                                                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                            >
                                                                취소
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSetCancelType(cntr.cntrNo, 'exclude')}
                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                                                                    isExcluded
                                                                        ? 'bg-amber-600 text-white shadow-2xs'
                                                                        : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                            >
                                                                제외
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )
                    ) : (
                        <div className="text-center py-12 text-slate-400 font-bold text-xs">
                            조회된 작업 내역이 없습니다.
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t border-slate-200 shrink-0 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all"
                    >
                        적용 및 닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
