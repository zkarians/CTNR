import React from 'react';
import { 
    Search, Calendar, Filter, X, Grid, LayoutGrid, RotateCw, 
    Trash2, CheckCircle2, FileText, Download, FolderArchive, ArrowUpDown, ChevronDown
} from 'lucide-react';
import { Team } from '@/lib/types';
import { SortOption, ViewMode, TabState } from './PhotoGalleryTypes';

interface GalleryHeaderProps {
    tabState: TabState;
    onTabChange: (tab: TabState) => void;
    totalCount: number;
    searchCntrNo: string;
    onSearchChange: (v: string) => void;
    dateRange: { startDate: string; endDate: string };
    onDateRangeChange: (r: { startDate: string; endDate: string }) => void;
    selectedTeam: string;
    onTeamChange: (v: string) => void;
    teams: Team[];
    selectedUser: string;
    onUserChange: (v: string) => void;
    availableUsers: { id: string; name: string }[];
    sortBy: SortOption;
    onSortChange: (v: SortOption) => void;
    viewMode: ViewMode;
    onViewModeChange: (v: ViewMode) => void;
    onRefresh: () => void;
    onClose: () => void;
    onOpenReport?: () => void;
    isAdmin: boolean;
}

export default function GalleryHeader({
    tabState,
    onTabChange,
    totalCount,
    searchCntrNo,
    onSearchChange,
    dateRange,
    onDateRangeChange,
    selectedTeam,
    onTeamChange,
    teams,
    selectedUser,
    onUserChange,
    availableUsers,
    sortBy,
    onSortChange,
    viewMode,
    onViewModeChange,
    onRefresh,
    onClose,
    onOpenReport,
    isAdmin
}: GalleryHeaderProps) {
    return (
        <header className="px-4 py-4 md:px-8 md:py-5 border-b border-white/5 bg-[#0a0a10]/80 backdrop-blur-md sticky top-0 z-30 shrink-0 space-y-4">
            {/* Top Bar: Tabs, Title & Close */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/5">
                    <button
                        onClick={() => onTabChange('ACTIVE')}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            tabState === 'ACTIVE'
                                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        작업중
                    </button>
                    <button
                        onClick={() => onTabChange('COMPLETED')}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            tabState === 'COMPLETED'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        완료 보관
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => onTabChange('TRASH')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                tabState === 'TRASH'
                                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                                    : 'text-slate-400 hover:text-rose-400 hover:bg-white/5'
                            }`}
                        >
                            <Trash2 className="w-3.5 h-3.5" /> 휴지통
                        </button>
                    )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                    {onOpenReport && (
                        <button
                            onClick={onOpenReport}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-all text-xs font-black cursor-pointer"
                        >
                            <FileText className="w-4 h-4" /> 일일 보고서
                        </button>
                    )}

                    <button 
                        onClick={onRefresh}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-all cursor-pointer"
                        title="새로고침"
                    >
                        <RotateCw className="w-4 h-4" />
                    </button>

                    <button 
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-all cursor-pointer"
                        title="닫기"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Filter Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Search & Select Filters */}
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                    {/* Search Input */}
                    <div className="relative min-w-[180px] max-w-[240px] flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={searchCntrNo}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="컨테이너 번호 검색..."
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                        {searchCntrNo && (
                            <button
                                onClick={() => onSearchChange('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Team Filter */}
                    <select
                        value={selectedTeam}
                        onChange={(e) => onTeamChange(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                    >
                        <option value="ALL" className="bg-[#12121c] text-white">전체 조</option>
                        {teams.map(t => (
                            <option key={t.id} value={String(t.id)} className="bg-[#12121c] text-white">{t.name}</option>
                        ))}
                    </select>

                    {/* User Filter */}
                    {availableUsers.length > 0 && (
                        <select
                            value={selectedUser}
                            onChange={(e) => onUserChange(e.target.value)}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                        >
                            <option value="ALL" className="bg-[#12121c] text-white">전체 작업자</option>
                            {availableUsers.map(u => (
                                <option key={u.id} value={u.id} className="bg-[#12121c] text-white">{u.name}</option>
                            ))}
                        </select>
                    )}

                    {/* Date Pickers */}
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <input 
                            type="date"
                            value={dateRange.startDate}
                            onChange={(e) => onDateRangeChange({ ...dateRange, startDate: e.target.value })}
                            className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
                        />
                        <span className="text-slate-600 text-xs">~</span>
                        <input 
                            type="date"
                            value={dateRange.endDate}
                            onChange={(e) => onDateRangeChange({ ...dateRange, endDate: e.target.value })}
                            className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Sort & View Options */}
                <div className="flex items-center gap-2 shrink-0">
                    <select
                        value={sortBy}
                        onChange={(e) => onSortChange(e.target.value as SortOption)}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
                    >
                        <option value="NAME_ASC" className="bg-[#12121c] text-white">파일명 오름차순</option>
                        <option value="NAME_DESC" className="bg-[#12121c] text-white">파일명 내림차순</option>
                        <option value="CREATION_ASC" className="bg-[#12121c] text-white">촬영시간 오름차순</option>
                        <option value="CREATION_DESC" className="bg-[#12121c] text-white">촬영시간 내림차순</option>
                        <option value="UPLOAD_DESC" className="bg-[#12121c] text-white">업로드 최신순</option>
                        <option value="UPLOAD_ASC" className="bg-[#12121c] text-white">업로드 과거순</option>
                    </select>

                    <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-0.5">
                        <button
                            onClick={() => onViewModeChange('LARGE')}
                            className={`p-1.5 rounded-lg transition-all ${
                                viewMode === 'LARGE' ? 'bg-sky-500 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                            title="크게 보기"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onViewModeChange('GRID')}
                            className={`p-1.5 rounded-lg transition-all ${
                                viewMode === 'GRID' ? 'bg-sky-500 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                            title="바둑판 보기"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
