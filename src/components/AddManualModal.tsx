import React from 'react';
import { Plus, X } from 'lucide-react';
import { isSameTeam } from '@/lib/utils/teamUtils';

interface AddManualModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingReportItem: any;
    isAdmin: boolean;
    user: any;
    manualTeamName: string;
    setManualTeamName: (val: string) => void;
    manualCntrNo: string;
    setManualCntrNo: (val: string) => void;
    manualCategory: string;
    setManualCategory: (val: string) => void;
    manualInsertIndex: string | number;
    setManualInsertIndex: (val: string | number) => void;
    currentTeamContainers: any[];
    manualDuration: string;
    setManualDuration: (val: string) => void;
    manualRemark: string;
    setManualRemark: (val: string) => void;
    isManualCancelled: boolean;
    setIsManualCancelled: (val: boolean) => void;
    manualProducts: any[];
    setManualProducts: (val: any[]) => void;
    manualEmptyBoxes: any[];
    setManualEmptyBoxes: (val: any[]) => void;
    handlePasteExcel: (e: React.ClipboardEvent<HTMLDivElement>) => void;
    handleAddManualSubmit: () => void;
}

export default function AddManualModal({
    isOpen,
    onClose,
    editingReportItem,
    isAdmin,
    user,
    manualTeamName,
    setManualTeamName,
    manualCntrNo,
    setManualCntrNo,
    manualCategory,
    setManualCategory,
    manualInsertIndex,
    setManualInsertIndex,
    currentTeamContainers,
    manualDuration,
    setManualDuration,
    manualRemark,
    setManualRemark,
    isManualCancelled,
    setIsManualCancelled,
    manualProducts,
    setManualProducts,
    manualEmptyBoxes,
    setManualEmptyBoxes,
    handlePasteExcel,
    handleAddManualSubmit
}: AddManualModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-lg shadow-2xl space-y-4 text-slate-900 overflow-y-auto max-h-[90vh]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-sky-600" />
                        <h3 className="text-base font-black text-slate-900">
                            {editingReportItem ? '보고서 항목 수정' : '보고서 전용 수동 항목 추가'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-3 text-xs">
                    <div>
                        <label className="block font-black text-slate-700 mb-1">담당 조 (팀)</label>
                        <div className="flex gap-2">
                            {['1조(BNI)', '2조(천마)', '3조(천마)'].map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => { if (isAdmin || isSameTeam(t, user?.teamName || '')) setManualTeamName(t); }}
                                    disabled={editingReportItem !== null}
                                    className={`flex-1 py-1.5 rounded-xl font-black border transition-all cursor-pointer ${manualTeamName === t ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block font-black text-slate-700 mb-1">컨테이너 번호 *</label>
                            <input
                                type="text"
                                placeholder="예: FFAU1090911"
                                value={manualCntrNo}
                                onChange={e => setManualCntrNo(e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold uppercase focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white"
                            />
                        </div>
                        <div>
                            <label className="block font-black text-slate-700 mb-1">품목 종류 (비고)</label>
                            <input
                                type="text"
                                placeholder="예: 세탁기"
                                value={manualCategory}
                                onChange={e => setManualCategory(e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block font-black text-slate-700 mb-1">
                            {editingReportItem ? "작업 위치 수정 *" : "작업 위치 (몇 번째 작업인지) *"}
                        </label>
                        <select
                            value={manualInsertIndex}
                            onChange={e => setManualInsertIndex(e.target.value === 'end' ? 'end' : parseInt(e.target.value))}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white text-slate-900 cursor-pointer"
                        >
                            <option value="end">
                                {currentTeamContainers.length === 0 ? '첫 번째 작업입니다' : (editingReportItem ? '맨 마지막 위치로 이동' : '맨 끝 작업으로 추가 (기본)')}
                            </option>
                            
                            {currentTeamContainers.length > 0 && (
                                <option value={0}>1번째 (맨 앞으로 이동)</option>
                            )}
                            
                            {currentTeamContainers.map((cntr: any, idx: number) => (
                                <option key={cntr.cntrNo + '_' + idx} value={idx + 1}>
                                    {idx + 1}번째 ({cntr.cntrNo}) 작업 뒤로
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block font-black text-slate-700 mb-1">작업 소요시간 (분) *</label>
                        <input
                            type="number"
                            placeholder="예: 45 또는 60"
                            value={manualDuration}
                            onChange={e => setManualDuration(e.target.value)}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white"
                        />
                    </div>

                    <div>
                        <label className="block font-black text-slate-700 mb-1">지연 사유 (선택)</label>
                        <input
                            type="text"
                            placeholder="예: 수량장입사진확인 박스불량 조치"
                            value={manualRemark}
                            onChange={e => setManualRemark(e.target.value)}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white"
                        />
                    </div>

                    <div className="pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">
                            <input
                                type="checkbox"
                                checked={isManualCancelled}
                                onChange={e => setIsManualCancelled(e.target.checked)}
                                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                            <span>🚫 [작업취소] 항목으로 등록 (합계 수량에서 제외)</span>
                        </label>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                                            <div className="flex items-center justify-between mb-2">
                            <label className="font-black text-slate-700">제품 모델 및 수량 목록 *</label>
                            <button
                                type="button"
                                onClick={() => setManualProducts([...manualProducts, { division: 'DFZ', name: '', qty: 0 }])}
                                className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                                <Plus className="w-3 h-3" /> 모델 추가
                            </button>
                        </div>
                        <div className="mb-2 px-2 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-[11px] text-emerald-700 font-bold flex items-start gap-1.5">
                            <span className="text-emerald-500">💡</span>
                            <p>엑셀 표를 복사(Ctrl+C)하여 <strong>이 아래 영역 아무데나 클릭 후 붙여넣기(Ctrl+V)</strong> 하시면 한 번에 모두 입력됩니다.</p>
                        </div>

                        <div 
                            className="space-y-2 max-h-40 overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-slate-50 transition-colors focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100" 
                            onPaste={handlePasteExcel}
                        >
                            {manualProducts.map((p, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                                    <input
                                        type="text"
                                        placeholder="구분"
                                        value={p.division}
                                        onChange={e => {
                                            const next = [...manualProducts];
                                            next[idx].division = e.target.value;
                                            setManualProducts(next);
                                        }}
                                        className="w-16 px-2 py-1 border border-slate-200 rounded-md font-bold text-center uppercase"
                                    />
                                    <input
                                        type="text"
                                        placeholder="모델명 (예: S3BNF.BLBPEHK)"
                                        value={p.name}
                                        onChange={e => {
                                            const next = [...manualProducts];
                                            next[idx].name = e.target.value;
                                            setManualProducts(next);
                                        }}
                                        className="flex-1 px-2 py-1 border border-slate-200 rounded-md font-bold uppercase min-w-0"
                                    />
                                    <input
                                        type="number"
                                        placeholder="수량"
                                        value={p.qty || ''}
                                        onChange={e => {
                                            const next = [...manualProducts];
                                            next[idx].qty = parseInt(e.target.value) || 0;
                                            setManualProducts(next);
                                        }}
                                        className="w-16 px-2 py-1 border border-slate-200 rounded-md font-bold text-right"
                                    />
                                    <span className="text-slate-500 font-bold">개</span>
                                    {manualProducts.length > 1 && (
                                        <button
                                            type="button"
                                     onClick={() => setManualProducts(manualProducts.filter((_, i) => i !== idx))}
                                            className="text-rose-500 hover:bg-rose-50 p-1 rounded-md cursor-pointer"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                            <label className="font-black text-slate-700">공박스 추가/수정</label>
                            <button
                                type="button"
                                onClick={() => setManualEmptyBoxes([...manualEmptyBoxes, { name: '', qty: 0 }])}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                                <Plus className="w-3 h-3" /> 공박스 추가
                            </button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-slate-50 transition-colors focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100">
                            {manualEmptyBoxes.map((eb, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="text-amber-600 font-black px-1">📦</span>
                                    <input
                                        type="text"
                                        placeholder="모델명 (MAY...)"
                                        value={eb.name}
                                        onChange={e => {
                                            const next = [...manualEmptyBoxes];
                                            next[idx].name = e.target.value;
                                            setManualEmptyBoxes(next);
                                        }}
                                        className="flex-1 px-2 py-1 border border-slate-200 rounded-md font-bold uppercase min-w-0"
                                    />
                                    <input
                                        type="number"
                                        placeholder="수량"
                                        value={eb.qty || ''}
                                        onChange={e => {
                                            const next = [...manualEmptyBoxes];
                                            next[idx].qty = parseInt(e.target.value) || 0;
                                            setManualEmptyBoxes(next);
                                        }}
                                        className="w-16 px-2 py-1 border border-slate-200 rounded-md font-bold text-right"
                                    />
                                    <span className="text-slate-500 font-bold">개</span>
                                    <button
                                        type="button"
                                        onClick={() => setManualEmptyBoxes(manualEmptyBoxes.filter((_, i) => i !== idx))}
                                        className="text-rose-500 hover:bg-rose-50 p-1 rounded-md cursor-pointer"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {manualEmptyBoxes.length === 0 && (
                                <div className="text-center py-2 text-slate-400 font-bold text-[11px]">
                                    등록된 공박스가 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-200">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleAddManualSubmit}
                        className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-xl shadow-md cursor-pointer"
                    >
                        {editingReportItem ? '수정 내용 저장' : '보고서에 추가'}
                    </button>
                </div>
            </div>
        </div>
    );
}
