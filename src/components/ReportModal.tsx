import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, ChevronLeft, ChevronRight, RotateCw, Loader2, Folder, Ban, Plus, Calendar, AlertCircle, Camera, UploadCloud, Save, Check, Copy, Download, BarChart3, Edit3 } from 'lucide-react';
import { getCarrierColor } from '@/lib/utils/colorUtils';
import { getWorkDateString } from '@/lib/utils/dateUtils';
import { generateJobType } from '@/lib/utils/jobType';
import { getNormalizedCarrier } from '@/lib/utils/carrierUtils';
import TeamSummaryModal from './TeamSummaryModal';

interface ReportModalProps {
    isReportOpen: boolean;
    setIsReportOpen: (open: boolean) => void;
    isAdmin: boolean;
    user: any;
    reportData: any[] | null;
    reportStartDate: string;
    setReportStartDate: (val: string) => void;
    reportEndDate: string;
    setReportEndDate: (val: string) => void;
    handleNavigateDate: (dir: number) => void;
    handleRegenerateReport: () => void;
    handleLoadSavedReport: () => void;
    isLoadingSavedReport: boolean;
    setIsCancelManageOpen: (open: boolean) => void;
    reportViewMode: string;
    setReportViewMode: (val: string) => void;
    handleOpenAddManual: () => void;
    isReportGenerating: boolean;
    isExportingImage: boolean;
    handleEditReportItem?: (teamName: string, cntrIdx: number, cntr: any, dateGroupIdx?: number) => void;
    handleDeleteReportItem?: (teamName: string, cntrIdx: number, dateGroupIdx?: number) => void;
    handleToggleCancelCntr: (cntrNo: string) => void;
    editingCommentCntr: string | null;
    setEditingCommentCntr: (val: string | null) => void;
    commentInput: string;
    setCommentInput: (val: string) => void;
    handleSaveComment: (cntrNo: string) => void;
    reportCaptureRef: any;
    handleSaveReport: () => void;
    handleCopyReport: () => void;
    handleCopyReportImage: () => void;
    handleDownloadReportImage: () => void;
    isSavingReport: boolean;
    imageCopyModalUrl: string | null;
    setImageCopyModalUrl: (val: string | null) => void;
    isCopied: boolean;
    reportText: string;
    savedReportInfo: { isSaved: boolean; savedAt?: string; savedBy?: string };
    isImageCopied: boolean;
    onOpenGallery?: () => void;
    onUpdateReportHeader?: (dateStr: string, customCarrierCounts: Record<string, number> | undefined, customRemark: string) => void;
}

export default function ReportModal({
    isReportOpen, setIsReportOpen, isAdmin, user, reportData, reportStartDate, setReportStartDate,
    reportEndDate, setReportEndDate, handleNavigateDate, handleRegenerateReport, handleLoadSavedReport,
    isLoadingSavedReport, setIsCancelManageOpen, reportViewMode, setReportViewMode, handleOpenAddManual,
    isReportGenerating, isExportingImage, handleEditReportItem, handleDeleteReportItem,
    handleToggleCancelCntr, editingCommentCntr, setEditingCommentCntr, commentInput, setCommentInput,
    handleSaveComment, reportCaptureRef, handleSaveReport, handleCopyReport, handleCopyReportImage,
    handleDownloadReportImage, isSavingReport, imageCopyModalUrl, setImageCopyModalUrl, isCopied, reportText, savedReportInfo, isImageCopied, onOpenGallery,
    onUpdateReportHeader
}: ReportModalProps) {
    const [isSummaryOpen, setIsSummaryOpen] = React.useState(false);
    const [editingHeaderDate, setEditingHeaderDate] = React.useState<string | null>(null);
    const [editCarrierCounts, setEditCarrierCounts] = React.useState<Record<string, number>>({});
    const [editRemarkVal, setEditRemarkVal] = React.useState<string>('');

    if (!isReportOpen) return null;

    const workerContainers = (!isAdmin && reportData) ? reportData.flatMap((dateGroup: any) =>
        dateGroup.uploaders.flatMap((upGroup: any) =>
            upGroup.containers
        )
    ) : [];

    const totalWorkerDuration = workerContainers.reduce((sum: number, cntr: any) => sum + (cntr.durationMinutes || 45), 0);
    const workerHours = Math.floor(totalWorkerDuration / 60);
    const workerMins = totalWorkerDuration % 60;
    const formattedWorkerTime = workerHours > 0 
        ? `${workerHours}시간 ${workerMins > 0 ? `${workerMins}분` : ''}` 
        : `${workerMins}분`;

    let maxNumTeams = 1;
    if (reportData && Array.isArray(reportData)) {
        let max = 1;
        reportData.forEach((dateGroup: any) => {
            if (dateGroup.uploaders && Array.isArray(dateGroup.uploaders)) {
                if (dateGroup.uploaders.length > max) {
                    max = dateGroup.uploaders.length;
                }
            }
        });
        maxNumTeams = Math.min(Math.max(max, 1), 4);
    }

    const modalWidthStyle = maxNumTeams === 1 
        ? 'md:max-w-3xl' 
        : maxNumTeams === 2 
        ? 'md:max-w-5xl' 
        : maxNumTeams === 3 
        ? 'md:max-w-7xl' 
        : 'md:max-w-[96vw]';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-1 sm:p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    onClick={() => setIsReportOpen(false)} 
                    className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                />
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className={`relative w-full max-w-[99vw] ${modalWidthStyle} transition-all duration-500 bg-white border border-slate-300 rounded-[1.2rem] sm:rounded-[1.5rem] md:rounded-[2rem] shadow-2xl overflow-hidden p-1 pb-1.5 sm:p-2 md:p-3 z-10 h-[96dvh] max-h-[97dvh] md:h-[96vh] md:max-h-[98vh] flex flex-col text-slate-900`}
                >
                    <div className="flex items-start justify-between pb-2 mb-1.5 border-b border-slate-200 shrink-0 gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 bg-emerald-500/10 rounded-xl shrink-0 mt-0.5">
                                <FileText className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <h2 className="text-lg md:text-xl font-black text-slate-900 leading-tight truncate">
                                    {isAdmin ? "작업 완료 보고서" : `${user.teamName || ''} 작업 내역`}
                                </h2>
                                {!isAdmin && workerContainers.length > 0 && (
                                    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-bold text-sky-900 bg-sky-50 border border-sky-200 px-3 py-1 rounded-full shadow-sm">
                                        <span>총 {workerContainers.length}개 컨테이너</span>
                                        <span className="text-sky-300">|</span>
                                        <span>총 작업시간 {formattedWorkerTime} ({totalWorkerDuration}분)</span>
                                    </div>
                                )}
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Work Completion Official Report</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setIsSummaryOpen(true)}
                                className="p-2 hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 rounded-full transition-all cursor-pointer shrink-0"
                                title="조별 작업수량 요약"
                            >
                                <BarChart3 className="w-5 h-5" />
                            </button>
                            {onOpenGallery && (
                                <button 
                                    onClick={onOpenGallery}
                                    className="p-2 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded-full transition-all cursor-pointer shrink-0"
                                    title="사진보관함 보기"
                                >
                                    <Camera className="w-5 h-5" />
                                </button>
                            )}
                            <button 
                                onClick={() => setIsReportOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-all cursor-pointer shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="mb-1.5 bg-slate-100 border border-slate-200 rounded-xl p-1.5 md:p-2.5 text-slate-900 shrink-0">
                        <div className="hidden md:flex items-center justify-between gap-2">
                            {isAdmin ? (
                                <>
                                    <span className="text-xs font-bold text-slate-600">조회 일자:</span>
                                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl p-1 shadow-xs">
                                        <button
                                            onClick={() => handleNavigateDate(-1)}
                                            className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                            title="이전날 (어제)로 이동"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            <span>이전날</span>
                                        </button>

                                        <input 
                                            type="date"
                                            value={reportStartDate}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setReportStartDate(val);
                                                setReportEndDate(val);
                                            }}
                                            className="bg-transparent border-x border-slate-200 px-3 py-0.5 text-xs text-slate-900 focus:outline-none font-black cursor-pointer text-center"
                                        />

                                        <button
                                            onClick={() => handleNavigateDate(1)}
                                            className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                            title="다음날 (내일)로 이동"
                                        >
                                            <span>다음날</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleRegenerateReport}
                                        className="px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" />
                                        조회
                                    </button>
                                    <button
                                        onClick={handleLoadSavedReport}
                                        disabled={isLoadingSavedReport}
                                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                                        title="선택된 날짜의 DB 저장된 보고서 불러오기"
                                    >
                                        {isLoadingSavedReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Folder className="w-3.5 h-3.5" />}
                                        <span>불러오기</span>
                                    </button>
                                    <button
                                        onClick={() => setIsCancelManageOpen(true)}
                                        className="px-3.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white text-rose-600 font-black text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0"
                                        title="조별 작업취소 선택 및 관리"
                                    >
                                        <Ban className="w-3.5 h-3.5 text-rose-500" />
                                        <span>작업취소</span>
                                    </button>
                                    <div className="ml-auto flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl shrink-0">
                                        <button
                                            onClick={() => setReportViewMode('full')}
                                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                                                reportViewMode === 'full' 
                                                    ? 'bg-white text-slate-900 shadow-xs' 
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            📋 상세보기
                                        </button>
                                        <button
                                            onClick={() => setReportViewMode('compact')}
                                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                                                reportViewMode === 'compact' 
                                                    ? 'bg-white text-slate-900 shadow-xs' 
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            ⚡ 요약보기
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-600">내 담당 조:</span>
                                    <span className="px-2.5 py-1 bg-sky-100 border border-sky-300 text-sky-800 rounded-lg text-xs font-black">
                                        {user.teamName || '미지정 조'}
                                    </span>
                                </div>
                            )}

                            <button
                                onClick={handleOpenAddManual}
                                className="ml-auto px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
                                title="보고서 전용 수동 항목 추가"
                            >
                                <Plus className="w-4 h-4" />
                                <span>추가</span>
                            </button>
                        </div>

                        <div className="flex md:hidden flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 w-full">
                                <div className="flex-1 flex items-center justify-between bg-white border border-slate-300 rounded-xl p-1 shadow-xs min-w-0">
                                    <button
                                        onClick={() => handleNavigateDate(-1)}
                                        className="p-1 text-slate-700 hover:bg-slate-100 rounded-lg transition-all flex items-center justify-center cursor-pointer shrink-0"
                                        title="이전날"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <input 
                                        type="date"
                                        value={reportStartDate}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setReportStartDate(val);
                                            setReportEndDate(val);
                                        }}
                                        className="bg-transparent text-xs text-slate-900 focus:outline-none font-black text-center w-full min-w-0"
                                    />
                                    <button
                                        onClick={() => handleNavigateDate(1)}
                                        className="p-1 text-slate-700 hover:bg-slate-100 rounded-lg transition-all flex items-center justify-center cursor-pointer shrink-0"
                                        title="다음날"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                                {isAdmin && (
                                    <>
                                        <button
                                            onClick={handleRegenerateReport}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 shrink-0 h-9"
                                        >
                                            <RotateCw className="w-3.5 h-3.5" />
                                            <span>조회</span>
                                        </button>
                                        <button
                                            onClick={handleLoadSavedReport}
                                            disabled={isLoadingSavedReport}
                                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 shrink-0 h-9 disabled:opacity-50"
                                            title="선택된 날짜의 DB 저장된 보고서 불러오기"
                                        >
                                            {isLoadingSavedReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Folder className="w-3.5 h-3.5" />}
                                            <span>불러오기</span>
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-1.5 w-full">
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                        {isAdmin && (
                                        <button
                                            onClick={() => setIsCancelManageOpen(true)}
                                            className="flex-1 py-1.5 px-1 bg-rose-50 border border-rose-200 text-rose-600 font-black rounded-lg shadow-2xs flex items-center justify-center gap-1 text-[11px] truncate cursor-pointer h-8"
                                        >
                                            <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                            <span className="truncate">작업취소</span>
                                        </button>
                                        )}
                                        <button
                                            onClick={handleOpenAddManual}
                                            className="flex-1 py-1.5 px-1 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-lg shadow-xs flex items-center justify-center gap-1 text-[11px] truncate cursor-pointer h-8"
                                        >
                                            <Plus className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">추가</span>
                                        </button>
                                    </div>

                                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg shrink-0 h-8">
                                        <button
                                            onClick={() => setReportViewMode('full')}
                                            className={`px-2.5 py-1 text-center text-xs font-black rounded-md transition-all cursor-pointer ${
                                                reportViewMode === 'full' 
                                                    ? 'bg-white text-slate-900 shadow-2xs' 
                                                    : 'text-slate-600'
                                            }`}
                                        >
                                            📋 상세보기
                                        </button>
                                        <button
                                            onClick={() => setReportViewMode('compact')}
                                            className={`px-2.5 py-1 text-center text-xs font-black rounded-md transition-all cursor-pointer ${
                                                reportViewMode === 'compact' 
                                                    ? 'bg-white text-slate-900 shadow-2xs' 
                                                    : 'text-slate-600'
                                            }`}
                                        >
                                            ⚡ 요약보기
                                        </button>
                                    </div>
                                </div>
                        </div>
                    </div>

                    <div ref={reportCaptureRef} className="overflow-y-auto flex-1 min-h-0 bg-white border border-slate-200 rounded-xl md:rounded-2xl p-2 sm:p-4 md:p-5 custom-scrollbar text-slate-900">
                        {isReportGenerating ? (
                            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                                <p className="text-xs font-bold">보고서를 생성하는 중입니다...</p>
                            </div>
                        ) : reportData && reportData.length > 0 ? (
                            isAdmin ? (
                            <div className="space-y-8">
                                {reportData.map((dateGroup: any, dgIdx: number) => {
                                    const activeContainers = dateGroup.uploaders.flatMap((u: any) => u.containers).filter((c: any) => !c.isCancelled && !c.adminComment?.includes('[취소]') && !c.adminComment?.includes('[작업취소]') && !c.adminComment?.includes('[작업제외]'));
                                    const totalCntr = activeContainers.length;
                                    
                                    const activeCarrierCounts: Record<string, number> = {};
                                    dateGroup.uploaders.forEach((u: any) => {
                                        u.containers.forEach((c: any) => {
                                            if (c.isCancelled || c.adminComment?.includes('[취소]') || c.adminComment?.includes('[작업취소]') || c.adminComment?.includes('[작업제외]')) return;
                                            const cName = getNormalizedCarrier(c.transporter);
                                            activeCarrierCounts[cName] = (activeCarrierCounts[cName] || 0) + 1;
                                        });
                                    });

                                    const numTeams = dateGroup.uploaders.length;
                                    const gridColsStyle = numTeams === 1 
                                        ? 'md:grid-cols-1' 
                                        : numTeams === 2 
                                        ? 'md:grid-cols-2' 
                                        : numTeams === 3 
                                        ? 'md:grid-cols-3' 
                                        : 'md:grid-cols-4';

                                    return (
                                        <div key={dateGroup.dateStr} className="bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl p-1.5 sm:p-2 md:p-3 shadow-sm">
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5 flex-wrap gap-2">
                                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-sky-600 animate-pulse" />
                                                    {dateGroup.dateStr} 작업 분량
                                                </h3>
                                                {(() => {
                                                    const finalCarrierCounts = (dateGroup.customCarrierCounts || activeCarrierCounts) as Record<string, number>;
                                                    const displayTotal = Object.values(finalCarrierCounts).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

                                                    if (editingHeaderDate === dateGroup.dateStr) {
                                                        return (
                                                            <div className="flex items-center gap-2 bg-white border border-slate-300 p-1.5 rounded-full shadow-sm text-sm flex-wrap">
                                                                <span className="font-bold pl-2 text-slate-900">총합계: {Object.values(editCarrierCounts).reduce((a, b) => a + b, 0)}개</span>
                                                                <span className="text-slate-300 mx-1">|</span>
                                                                {Object.keys(editCarrierCounts).map(cName => (
                                                                    <div key={cName} className="flex items-center gap-1">
                                                                        <span className="font-bold text-slate-600">{cName}:</span>
                                                                        <input 
                                                                            type="number" 
                                                                            className="w-12 px-1 py-0.5 border border-slate-200 rounded focus:outline-none focus:border-sky-500 font-bold text-center"
                                                                            value={editCarrierCounts[cName]}
                                                                            onChange={e => setEditCarrierCounts(prev => ({ ...prev, [cName]: parseInt(e.target.value) || 0 }))}
                                                                        />
                                                                    </div>
                                                                ))}
                                                                <span className="text-slate-300 mx-1">|</span>
                                                                <span className="font-bold pl-1 text-slate-600">비고:</span>
                                                                <input 
                                                                    type="text" 
                                                                    className="w-32 px-2 py-0.5 border border-slate-200 rounded-md focus:outline-none focus:border-sky-500 font-bold"
                                                                    value={editRemarkVal}
                                                                    onChange={e => setEditRemarkVal(e.target.value)}
                                                                    placeholder="없음"
                                                                />
                                                                <button 
                                                                    onClick={() => {
                                                                        onUpdateReportHeader?.(dateGroup.dateStr, editCarrierCounts, editRemarkVal);
                                                                        setEditingHeaderDate(null);
                                                                    }}
                                                                    className="ml-1 bg-sky-600 hover:bg-sky-500 text-white rounded-full p-1 cursor-pointer flex items-center justify-center"
                                                                >
                                                                    <Check className="w-4 h-4" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => setEditingHeaderDate(null)}
                                                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full p-1 cursor-pointer flex items-center justify-center"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <span className="text-sm font-black text-slate-800 bg-white border border-slate-300 shadow-sm px-3.5 py-1 rounded-full flex items-center gap-1.5 flex-wrap">
                                                            <span>총합계: {displayTotal}개 작업완료</span>
                                                            {Object.keys(finalCarrierCounts).length > 0 && (
                                                                <span className="text-slate-600 font-bold text-xs border-l border-slate-300 pl-2 ml-1 flex items-center gap-1.5 flex-wrap">
                                                                    (
                                                                    {Object.entries(finalCarrierCounts).map(([cName, count]: [string, any], idx: number) => {
                                                                        const carrierColorClass = cName.includes('천마') 
                                                                            ? 'text-rose-600 font-black' 
                                                                            : (cName.includes('BNI') || cName.includes('비엔아이')) 
                                                                            ? 'text-indigo-600 font-black' 
                                                                            : 'text-emerald-600 font-black';
                                                                        return (
                                                                            <span key={cName} className="flex items-center">
                                                                                {idx > 0 && <span className="text-slate-400 mr-1.5">,</span>}
                                                                                <span className={carrierColorClass}>{cName}: {count}개</span>
                                                                            </span>
                                                                        );
                                                                    })}
                                                                    )
                                                                </span>
                                                            )}
                                                            {dateGroup.customRemark && (
                                                                <span className="text-slate-600 font-bold text-xs border-l border-slate-300 pl-2 ml-1 flex items-center gap-1.5">
                                                                    비고: {dateGroup.customRemark}
                                                                </span>
                                                            )}
                                                            <button 
                                                                onClick={() => {
                                                                    setEditCarrierCounts(finalCarrierCounts);
                                                                    setEditRemarkVal(dateGroup.customRemark || '');
                                                                    setEditingHeaderDate(dateGroup.dateStr);
                                                                }}
                                                                className="ml-1 text-slate-400 hover:text-sky-600 cursor-pointer p-0.5"
                                                                title="총합계 및 비고 수정"
                                                            >
                                                                <Edit3 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className={`grid grid-cols-1 ${gridColsStyle} gap-4 items-start w-full`}>
                                                {dateGroup.uploaders.map((upGroup: any) => {
                                                    const activeTeamCntrs = upGroup.containers.filter((c: any) => !c.isCancelled && !c.adminComment?.includes('[취소]') && !c.adminComment?.includes('[작업취소]') && !c.adminComment?.includes('[작업제외]'));
                                                    return (
                                                    <div key={upGroup.teamName ?? upGroup.uploaderName} className="bg-white border border-slate-200 rounded-xl md:rounded-2xl p-2.5 sm:p-4 flex flex-col gap-3 md:gap-4 h-auto shadow-sm">
                                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                                            <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                                                <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                                                                {upGroup.teamName ?? upGroup.uploaderName}
                                                            </span>
                                                            <span className="text-xs font-bold text-slate-500">합계 {activeTeamCntrs.length}개</span>
                                                        </div>
                                                        <div className="space-y-3">
                                                            {upGroup.containers.map((cntr: any, cntrIdx: number) => {
                                                                const totalQty = cntr.products.reduce((sum: number, p: any) => sum + p.qty, 0);
                                                                const isExcluded = cntr.adminComment?.includes('[작업제외]');
                                                                const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                                                                return (
                                                                    <div key={`${cntr.cntrNo}_${cntrIdx}`} className="bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl p-2.5 sm:p-3 hover:border-slate-300 transition-all space-y-1.5">
                                                                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <span className={`text-sm font-black shrink-0 uppercase ${getCarrierColor(cntr.transporter)}`}>{cntr.cntrNo}</span>
                                                                                {isExcluded ? (
                                                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 font-extrabold text-[11px] shrink-0">
                                                                                        [작업제외]
                                                                                    </span>
                                                                                ) : isCancelled ? (
                                                                                    <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 font-extrabold text-[11px] shrink-0">
                                                                                        [작업취소]
                                                                                    </span>
                                                                                ) : null}
                                                                            </div>
                                                                            <div className="flex items-center gap-0.5 shrink-0">
                                                                                {!isExportingImage && (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (handleEditReportItem) handleEditReportItem(upGroup.teamName ?? upGroup.uploaderName, cntrIdx, cntr, dgIdx);
                                                                                            }}
                                                                                            className="p-0.5 rounded bg-slate-100 hover:bg-sky-100 text-slate-500 hover:text-sky-600 transition-colors cursor-pointer border border-transparent hover:border-sky-200"
                                                                                            title="이 항목 수정 (보고서 내용만)"
                                                                                        >
                                                                                            <span className="text-[12px] font-black">✏️</span>
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (handleDeleteReportItem) handleDeleteReportItem(upGroup.teamName ?? upGroup.uploaderName, cntrIdx, dgIdx);
                                                                                            }}
                                                                                            className="p-0.5 rounded bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                                                                            title="이 항목 삭제 (보고서 내용만)"
                                                                                        >
                                                                                            <span className="text-[12px] font-black">🗑️</span>
                                                                                        </button>
                                                                                    </>
                                                                                )}

                                                                                {cntr.startTimeStr && cntr.endTimeStr && (
                                                                                    <span className="text-sky-900 font-bold text-[11px] bg-sky-100 px-1.5 py-0.5 rounded border border-sky-200 shrink-0">
                                                                                        {cntr.durationMinutes || 45}분 ({cntr.startTimeStr}~{cntr.endTimeStr})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-xs text-slate-700 font-bold mb-2 flex items-center flex-wrap gap-1">
                                                                            <span>{cntr.products.length}모델, {totalQty.toLocaleString()}개</span>
                                                                            {(() => {
                                                                                const autoJobType = generateJobType(cntr.products || []);
                                                                                const displayComment = cntr.adminComment || autoJobType;
                                                                                return displayComment ? (
                                                                                <span className="text-rose-600 font-black ml-1 inline-flex items-center">
                                                                                    (&nbsp;
                                                                                    {editingCommentCntr === cntr.cntrNo ? (
                                                                                        <input
                                                                                            type="text"
                                                                                            autoFocus
                                                                                            value={commentInput}
                                                                                            onChange={(e) => setCommentInput(e.target.value)}
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'Enter') handleSaveComment(cntr.cntrNo);
                                                                                                if (e.key === 'Escape') setEditingCommentCntr(null);
                                                                                            }}
                                                                                            onBlur={() => handleSaveComment(cntr.cntrNo)}
                                                                                            placeholder="코멘트 수정..."
                                                                                            className="bg-white border border-rose-500 rounded px-1.5 py-0.5 text-xs text-slate-900 font-bold outline-none shadow-sm min-w-[70px]"
                                                                                        />
                                                                                    ) : (
                                                                                        <span
                                                                                            onClick={() => {
                                                                                                if (isAdmin) {
                                                                                                    setEditingCommentCntr(cntr.cntrNo);
                                                                                                    setCommentInput(cntr.adminComment || autoJobType);
                                                                                                }
                                                                                            }}
                                                                                            className={`text-slate-900 font-bold ${isAdmin ? 'cursor-pointer hover:underline' : ''}`}
                                                                                            title={isAdmin ? "관리자 코멘트 수정 (클릭)" : undefined}
                                                                                        >
                                                                                            {displayComment}
                                                                                        </span>
                                                                                    )}
                                                                                    &nbsp;)
                                                                                </span>
                                                                            ) : isAdmin ? (
                                                                                editingCommentCntr === cntr.cntrNo ? (
                                                                                    <span className="text-rose-600 font-black ml-1 inline-flex items-center">
                                                                                        (&nbsp;
                                                                                        <input
                                                                                            type="text"
                                                                                            autoFocus
                                                                                            value={commentInput}
                                                                                            onChange={(e) => setCommentInput(e.target.value)}
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'Enter') handleSaveComment(cntr.cntrNo);
                                                                                                if (e.key === 'Escape') setEditingCommentCntr(null);
                                                                                            }}
                                                                                            onBlur={() => handleSaveComment(cntr.cntrNo)}
                                                                                            placeholder="코멘트 입력..."
                                                                                            className="bg-white border border-rose-500 rounded px-1.5 py-0.5 text-xs text-slate-900 font-bold outline-none shadow-sm min-w-[80px]"
                                                                                        />
                                                                                        &nbsp;)
                                                                                    </span>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setEditingCommentCntr(cntr.cntrNo);
                                                                                            setCommentInput(autoJobType);
                                                                                        }}
                                                                                        className="ml-1 px-1.5 py-0.5 text-[11px] font-black text-rose-600 hover:text-white bg-rose-50 border border-rose-200 hover:bg-rose-600 rounded transition-all cursor-pointer inline-flex items-center justify-center leading-none"
                                                                                        title="코멘트 추가"
                                                                                    >
                                                                                        +
                                                                                    </button>
                                                                                )
                                                                            ) : null;
                                                                            })()}
                                                                        </div>
                                                                        {cntr.remark && cntr.remark.trim() && (
                                                                            <div className="text-xs text-amber-900 font-bold bg-amber-50/90 border border-amber-200/80 px-3 py-2 rounded-xl mb-2 flex items-start gap-1.5 leading-relaxed shadow-sm">
                                                                                <span className="shrink-0 text-amber-600 mt-0.5">💬</span>
                                                                                <div className="flex-1 break-words leading-relaxed">
                                                                                    <span className="text-amber-900 font-black">지연사유:</span> {cntr.remark.trim()}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {reportViewMode === 'full' && (
                                                                            <div className="space-y-1 pt-1.5 border-t border-slate-200/80 pl-0.5">
                                                                                {cntr.products.map((p: any, idx: number) => (
                                                                                    <div key={idx} className="text-[11px] sm:text-xs text-slate-600 font-medium flex items-center justify-between gap-1.5 leading-snug min-w-0">
                                                                                        <span className="truncate min-w-0 flex-1" title={`[${p.division}] ${p.name}`}>- [{p.division}] {p.name}</span>
                                                                                        <span className="font-black text-slate-800 shrink-0 ml-1">{p.qty.toLocaleString()}개</span>
                                                                                    </div>
                                                                                ))}
                                                                                {cntr.emptyBoxes && cntr.emptyBoxes.map((eb: any, idx: number) => (
                                                                                    <div key={`eb-${idx}`} className="text-[11px] sm:text-xs text-slate-600 font-medium flex items-center justify-between gap-1.5 leading-snug min-w-0">
                                                                                        <span className="truncate min-w-0 flex-1" title={`[공박스] ${eb.name}`}>- 📦 [공박스] {eb.name}</span>
                                                                                        <span className="font-black text-slate-800 shrink-0 ml-1">{eb.qty.toLocaleString()}개</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            ) : (
                            <div className="space-y-4">
                                {reportData.map((dateGroup: any) => (
                                    <div key={dateGroup.dateStr} className="bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl p-2.5 sm:p-3.5 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                                                {dateGroup.dateStr} 작업 분량
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {dateGroup.uploaders.flatMap((upGroup: any, upIdx: number) =>
                                                upGroup.containers.map((cntr: any, cntrIdx: number) => {
                                                    const totalQty = cntr.products.reduce((sum: number, p: any) => sum + p.qty, 0);
                                                    return (
                                                        <div key={`${cntr.cntrNo}_${upIdx}_${cntrIdx}`} className="bg-white border border-slate-200 rounded-lg md:rounded-xl p-2.5 sm:p-3.5 shadow-sm space-y-2">
                                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                <span className={`text-sm font-black uppercase tracking-wide ${getCarrierColor(cntr.transporter)}`}>{cntr.cntrNo}</span>
                                                                {cntr.startTimeStr && cntr.endTimeStr && (
                                                                    <span className="text-sky-900 font-bold text-xs bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200 shrink-0">
                                                                        {cntr.durationMinutes || 45}분 ({cntr.startTimeStr}~{cntr.endTimeStr})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            
                                                            <div className="text-xs text-slate-700 font-bold flex items-center flex-wrap gap-1">
                                                                <span>{cntr.products.length}모델, {totalQty.toLocaleString()}개</span>
                                                                {cntr.adminComment && (
                                                                    <span className="text-rose-600 font-black ml-1 inline-flex items-center">
                                                                        (&nbsp;<span className="text-slate-900 font-bold">{cntr.adminComment}</span>&nbsp;)
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="pt-2 border-t border-slate-100 space-y-1 pl-1">
                                                                {cntr.products.map((p: any, idx: number) => (
                                                                    <div key={idx} className="text-xs text-slate-600 font-medium flex items-center justify-between gap-2">
                                                                        <span className="break-words min-w-0 flex-1 leading-snug">- [{p.division}] {p.name}</span>
                                                                        <span className="font-bold text-slate-800 shrink-0">{p.qty.toLocaleString()}개</span>
                                                                    </div>
                                                                ))}
                                                                {cntr.emptyBoxes && cntr.emptyBoxes.map((eb: any, idx: number) => (
                                                                    <div key={`eb-${idx}`} className="text-xs text-slate-600 font-medium flex items-center justify-between gap-2">
                                                                        <span className="break-words min-w-0 flex-1 leading-snug">- 📦 [공박스] {eb.name}</span>
                                                                        <span className="font-bold text-slate-800 shrink-0">{eb.qty.toLocaleString()}개</span>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {cntr.remark && cntr.remark.trim() && (
                                                                <div className="text-xs text-amber-900 font-bold bg-amber-50/90 border border-amber-200/80 px-3 py-2 rounded-xl mt-2 flex items-start gap-1.5 leading-relaxed shadow-sm">
                                                                    <span className="shrink-0 text-amber-600 mt-0.5">💬</span>
                                                                    <div className="flex-1 break-words leading-relaxed">
                                                                        <span className="text-amber-900 font-black">지연사유:</span> {cntr.remark.trim()}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            )
                        ) : (
                            <div className="font-mono text-xs md:text-sm leading-relaxed text-slate-700 select-all whitespace-pre-wrap">
                                {reportText}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-2 sm:mt-3 shrink-0 pb-1 sm:pb-0">
                        {savedReportInfo?.isSaved && (
                            <span className="text-[11px] sm:text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl flex items-center justify-center sm:justify-start gap-1 shadow-2xs w-full sm:w-auto truncate">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{savedReportInfo.savedAt}에 DB 저장 완료 ({savedReportInfo.savedBy})</span>
                            </span>
                        )}

                        <div className={`w-full sm:w-auto ml-auto flex ${isAdmin ? 'grid grid-cols-4 sm:flex' : 'justify-end'} items-center sm:justify-end gap-2`}>
                                <button
                                    onClick={handleSaveReport}
                                    disabled={isSavingReport || !reportText}
                                    className="py-2 px-3 sm:py-2.5 sm:px-4 md:px-5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-lg ring-2 ring-sky-400 ring-offset-2 animate-[pulse_2s_ease-in-out_infinite] whitespace-nowrap"
                                    title={isAdmin ? "현재 화면의 데이터를 1일 보고서 DB에 덮어쓰기 합니다" : "추가한 작업내역을 영구 저장합니다"}
                                >
                                    {isSavingReport ? <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
                                    <span>{isSavingReport ? '저장 중...' : isAdmin ? '보고서 저장' : '작업내역 저장'}</span>
                                </button>

                            {isAdmin && (
                                <button
                                    onClick={handleCopyReport}
                                    disabled={isReportGenerating || !reportText}
                                    className={`py-2 px-1 sm:py-2.5 sm:px-4 rounded-xl font-bold text-[11px] sm:text-xs md:text-sm transition-all shadow-sm flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                        isCopied
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                                    }`}
                                >
                                    {isCopied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-100 shrink-0" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />}
                                    <span>{isCopied ? '복사 완료!' : '텍스트 복사'}</span>
                                </button>
                            )}

                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleCopyReportImage}
                                        disabled={isReportGenerating || isExportingImage || !reportData || reportData.length === 0}
                                        className={`py-2 px-1 sm:py-2.5 sm:px-4 md:px-5 rounded-xl font-bold text-[11px] sm:text-xs md:text-sm transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer disabled:opacity-50 shadow-md whitespace-nowrap ${
                                            isImageCopied
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-sky-600 hover:bg-sky-500 text-white'
                                        }`}
                                    >
                                        {isExportingImage ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white shrink-0" /> : isImageCopied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-100 shrink-0" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
                                        <span>{isExportingImage ? '생성 중...' : isImageCopied ? '복사 완료!' : '이미지 복사'}</span>
                                    </button>
                                    <button
                                        onClick={handleDownloadReportImage}
                                        disabled={isReportGenerating || isExportingImage || !reportData || reportData.length === 0}
                                        className="py-2 px-1 sm:py-2.5 sm:px-4 md:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] sm:text-xs md:text-sm transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer disabled:opacity-50 shadow-md whitespace-nowrap"
                                    >
                                        {isExportingImage ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white shrink-0" /> : <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
                                        <span>{isExportingImage ? '생성 중...' : '이미지 저장'}<span className="hidden sm:inline"> (.png)</span></span>
                                    </button>
                                </>
                            )}

                            <button
                                onClick={() => setIsReportOpen(false)}
                                className={`py-2 px-4 sm:py-2.5 sm:px-4 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs md:text-sm transition-all cursor-pointer ${isAdmin ? 'hidden sm:inline-flex items-center justify-center' : 'w-auto inline-flex items-center justify-center shrink-0'}`}
                            >
                                닫기
                            </button>
                        </div>
                    </div>

                    {imageCopyModalUrl && (
                        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                            <div className="bg-[#11111a] border border-white/10 rounded-3xl p-5 md:p-6 w-full max-w-2xl shadow-2xl space-y-4 text-white flex flex-col max-h-[90vh]">
                                <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Copy className="w-5 h-5 text-sky-400" />
                                        <h3 className="text-base font-black text-white">카카오톡 전송용 이미지 복사</h3>
                                    </div>
                                    <button 
                                        onClick={() => setImageCopyModalUrl(null)}
                                        className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-3.5 text-xs text-sky-300 space-y-1 shrink-0">
                                    <p className="font-bold text-sky-200 flex items-center gap-1">
                                        <span>💡</span>
                                        <span>카카오톡 전송 방법 (우클릭 ➔ 이미지 복사)</span>
                                    </p>
                                    <p className="leading-relaxed">
                                        아래 생성된 이미지 위에서 <strong>[마우스 우클릭 ➔ 이미지 복사]</strong> 하시면 카카오톡 채팅창에 바로 <strong>Ctrl+V (붙여넣기)</strong> 전송이 가능합니다!
                                        <br />
                                        <span className="text-[11px] text-slate-400">(모바일: 이미지를 1초간 길게 누르기 ➔ 이미지 복사)</span>
                                    </p>
                                </div>

                                <div className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-white p-2 flex justify-center items-start">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img 
                                        src={imageCopyModalUrl} 
                                        alt="작업완료보고서" 
                                        className="max-w-full h-auto rounded-lg shadow-md select-all cursor-pointer" 
                                        title="우클릭하여 이미지 복사"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1 shrink-0">
                                    <button
                                        onClick={() => {
                                            const dateStr = reportStartDate || getWorkDateString(new Date());
                                            const link = document.createElement('a');
                                            link.download = `작업완료보고서_${dateStr}.png`;
                                            link.href = imageCopyModalUrl;
                                            link.click();
                                        }}
                                        className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs md:text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>이미지 파일 다운로드</span>
                                    </button>
                                    <button
                                        onClick={() => setImageCopyModalUrl(null)}
                                        className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs md:text-sm transition-all cursor-pointer"
                                    >
                                        닫기
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
                <TeamSummaryModal 
                    isOpen={isSummaryOpen} 
                    onClose={() => setIsSummaryOpen(false)} 
                    reportData={reportData || []} 
                />
            </div>
        </AnimatePresence>
    );
}
