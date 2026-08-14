'use client';

import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Settings2, Database, Users, KeyRound, Download, Upload, Loader2,
    RotateCw, Trash2, UserPlus, Edit3, Shield, Check, X
} from 'lucide-react';
import { DbConfig, UserAccount, Team } from '@/lib/types';
import { SessionUser } from '@/lib/auth';

export interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: SessionUser;
    isAdmin: boolean;
    settingsTab: 'db' | 'users' | 'teams' | 'password';
    setSettingsTab: (tab: 'db' | 'users' | 'teams' | 'password') => void;
    // DB config
    dbConfig: DbConfig;
    setDbConfig: React.Dispatch<React.SetStateAction<DbConfig>>;
    handleDbSave: () => void;
    // DB dump / restore / sync
    isExportingDb: boolean;
    handleExportDbDump: () => void;
    isRestoringDb: boolean;
    handleRestoreDbDump: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isTriggeringSync: boolean;
    handleTriggerManualBackupAndSync: () => void;
    // Users
    userList: UserAccount[];
    isUserLoading: boolean;
    selectedUserIds: string[];
    toggleSelectUser: (id: string) => void;
    toggleSelectAllUsers: () => void;
    handleDeleteSelectedUsers: () => void;
    handleOpenAddUser: () => void;
    handleOpenEditUser: (user: UserAccount) => void;
    handleToggleApproval: (user: UserAccount) => void;
    // Teams
    teamList: Team[];
    isTeamLoading: boolean;
    newTeamName: string;
    setNewTeamName: (name: string) => void;
    handleAddTeam: () => void;
    editingTeam: Team | null;
    editingTeamName: string;
    setEditingTeamName: (name: string) => void;
    handleStartEditTeam: (team: Team) => void;
    handleCancelEditTeam: () => void;
    handleSaveEditTeam: () => void;
    handleDeleteTeam: (id: number, name: string) => void;
    // Password
    passwordData: { current: string; new: string; confirm: string };
    setPasswordData: React.Dispatch<React.SetStateAction<{ current: string; new: string; confirm: string }>>;
    isPasswordUpdating: boolean;
    handlePasswordUpdate: () => void;
    // Team Progress Reset
    handleResetTeamProgress: () => void;
}

export default function SettingsModal({
    isOpen,
    onClose,
    user,
    isAdmin,
    settingsTab,
    setSettingsTab,
    dbConfig,
    setDbConfig,
    handleDbSave,
    isExportingDb,
    handleExportDbDump,
    isRestoringDb,
    handleRestoreDbDump,
    isTriggeringSync,
    handleTriggerManualBackupAndSync,
    userList,
    isUserLoading,
    selectedUserIds,
    toggleSelectUser,
    toggleSelectAllUsers,
    handleDeleteSelectedUsers,
    handleOpenAddUser,
    handleOpenEditUser,
    handleToggleApproval,
    teamList,
    isTeamLoading,
    newTeamName,
    setNewTeamName,
    handleAddTeam,
    editingTeam,
    editingTeamName,
    setEditingTeamName,
    handleStartEditTeam,
    handleCancelEditTeam,
    handleSaveEditTeam,
    handleDeleteTeam,
    passwordData,
    setPasswordData,
    isPasswordUpdating,
    handlePasswordUpdate,
    handleResetTeamProgress
}: SettingsModalProps) {
    const restoreFileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const deletableUsers = userList.filter(u => u.id !== user.id);
    const isAllUsersSelected = deletableUsers.length > 0 && selectedUserIds.length === deletableUsers.length;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-lg bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden p-6 md:p-8 max-h-[90vh] flex flex-col"
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-sky-500/10 rounded-2xl">
                                <Settings2 className="w-6 h-6 text-sky-500" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white">
                                    {isAdmin ? "시스템 설정" : "사용자 설정"}
                                </h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                                    {isAdmin ? "System Configuration" : "User Settings"}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Settings Tab Navigation */}
                    {isAdmin && (
                        <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 mb-6 shrink-0 gap-1">
                            <button 
                                onClick={() => setSettingsTab('db')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'db' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <Database className="w-3.5 h-3.5" />
                                DB 설정
                            </button>
                            <button 
                                onClick={() => setSettingsTab('users')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'users' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                계정 관리
                            </button>
                            <button 
                                onClick={() => setSettingsTab('teams')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'teams' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                조 관리
                            </button>
                            <button 
                                onClick={() => setSettingsTab('password')}
                                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${settingsTab === 'password' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <KeyRound className="w-3.5 h-3.5" />
                                비밀번호
                            </button>
                        </div>
                    )}

                    {/* Current Team Info & Quick Change */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between mb-5 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-lg flex items-center justify-center border border-emerald-500/30">
                                {user.teamName ? user.teamName.charAt(0) : "조"}
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">현재 선택된 작업 조</span>
                                <span className="text-sm font-black text-white">{user.teamName || "미선택 (조 선택 필요)"}</span>
                            </div>
                        </div>
                        <a
                            href="/select-team"
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 whitespace-nowrap"
                        >
                            <Users className="w-3.5 h-3.5" />
                            조 변경하기
                        </a>
                    </div>

                    {/* Tab Content */}
                    <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 space-y-6">
                        {(settingsTab === 'db' && isAdmin) && (
                            <>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">Host 주소</label>
                                        <input value={dbConfig.host} onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" placeholder="localhost 또는 IP주소" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-500 ml-1">DB 이름</label>
                                            <input value={dbConfig.database} onChange={e => setDbConfig({ ...dbConfig, database: e.target.value })}
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-500 ml-1">Port</label>
                                            <input type="number" value={dbConfig.port} onChange={e => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) || 5432 })}
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">User ID</label>
                                        <input value={dbConfig.user} onChange={e => setDbConfig({ ...dbConfig, user: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">Password</label>
                                        <input type="password" value={dbConfig.password} onChange={e => setDbConfig({ ...dbConfig, password: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" placeholder="비밀번호 입력" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">휴지통 보관 기간 (일)</label>
                                        <input type="number" value={dbConfig.trash_retention_days} onChange={e => setDbConfig({ ...dbConfig, trash_retention_days: parseInt(e.target.value) || 15 })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" min={1} max={365} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">사진 저장 폴더 (저장지)</label>
                                        <input value={dbConfig.upload_dir || ''} onChange={e => setDbConfig({ ...dbConfig, upload_dir: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all text-slate-200" placeholder="예: C:\CTNR_uploads (기본값: uploads)" />
                                    </div>

                                    {/* DB Backup & Restore Panel */}
                                    <div className="pt-4 border-t border-white/10 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                                                <Database className="w-4 h-4 text-sky-400" />
                                                <span>🗄️ DB 백업 & 복구 (데이터 덤프)</span>
                                            </label>
                                            <span className="text-[10px] font-bold text-slate-500">사진 실물 제외 (메타데이터 덤프)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={handleExportDbDump}
                                                disabled={isExportingDb}
                                                className="py-3 px-3 rounded-2xl bg-sky-500/20 border border-sky-500/40 hover:bg-sky-500/30 text-sky-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md"
                                                title="PostgreSQL 전체 메타데이터를 JSON 파일로 추출 저장"
                                            >
                                                {isExportingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                <span>💾 DB 백업 저장</span>
                                            </button>

                                            <label
                                                className={`py-3 px-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${isRestoringDb ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title="백업받은 JSON 파일로 DB 복원"
                                            >
                                                {isRestoringDb ? <Loader2 className="w-4 h-4 animate-spin text-emerald-300" /> : <Upload className="w-4 h-4 text-emerald-300" />}
                                                <span>{isRestoringDb ? '복원 진행 중...' : '📤 DB 복구 파일 선택'}</span>
                                                <input
                                                    ref={restoreFileInputRef}
                                                    type="file"
                                                    accept=".json"
                                                    onChange={handleRestoreDbDump}
                                                    disabled={isRestoringDb}
                                                    className="hidden"
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Instant DB sync trigger */}
                                    <div className="pt-4 border-t border-white/10 space-y-3">
                                        <button
                                            type="button"
                                            onClick={handleTriggerManualBackupAndSync}
                                            disabled={isTriggeringSync}
                                            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                                            title="지금 즉시 로컬 DB 백업 파일 생성 및 idlezero 원격 DB 동기화 실행"
                                        >
                                            {isTriggeringSync ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <RotateCw className="w-4 h-4 text-emerald-200" />}
                                            <span>{isTriggeringSync ? '백업 및 원격 동기화 진행 중...' : '⚡ DB 백업 & 원격 동기화 즉시 실행'}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button onClick={onClose} className="flex-1 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-sm transition-all">취소</button>
                                    <button onClick={handleDbSave} className="flex-2 py-4 px-8 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-sm transition-all shadow-lg shadow-sky-500/20">설정 저장</button>
                                </div>
                            </>
                        )}

                        {(settingsTab === 'users' && isAdmin) && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-2 flex-wrap bg-black/40 p-3 rounded-2xl border border-white/5">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer select-none">
                                        <input 
                                            type="checkbox"
                                            checked={isAllUsersSelected}
                                            disabled={deletableUsers.length === 0}
                                            onChange={toggleSelectAllUsers}
                                            className="w-4 h-4 rounded border-white/20 bg-black/40 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500 disabled:opacity-30"
                                        />
                                        <span>전체 선택 ({deletableUsers.length}명 중 {selectedUserIds.length}명 선택)</span>
                                    </label>

                                    <div className="flex items-center gap-2">
                                        {selectedUserIds.length > 0 && (
                                            <button 
                                                onClick={handleDeleteSelectedUsers}
                                                disabled={isUserLoading}
                                                className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                선택 삭제 ({selectedUserIds.length})
                                            </button>
                                        )}
                                        <button 
                                            onClick={handleOpenAddUser}
                                            className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <UserPlus className="w-3.5 h-3.5" />
                                            계정 추가
                                        </button>
                                    </div>
                                </div>

                                {isUserLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                                        <p className="text-xs">사용자 목록을 불러오는 중...</p>
                                    </div>
                                ) : userList.length === 0 ? (
                                    <div className="py-12 text-center text-xs text-slate-500 bg-white/5 rounded-2xl border border-white/5">
                                        등록된 사용자 계정이 없습니다.
                                    </div>
                                ) : (
                                    <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                                        {userList.map((u) => {
                                            const isSelf = u.id === user.id;
                                            const isSelected = selectedUserIds.includes(u.id);
                                            const roleUpper = (u.role || 'USER').toUpperCase();
                                            return (
                                                <div key={u.id} className={`p-3.5 rounded-2xl bg-black/40 border transition-all flex items-center justify-between gap-3 ${isSelected ? 'border-sky-500/50 bg-sky-500/5' : 'border-white/5 hover:border-white/10'}`}>
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <input 
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            disabled={isSelf}
                                                            onChange={() => toggleSelectUser(u.id)}
                                                            className="w-4 h-4 rounded border-white/20 bg-black/40 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                                            title={isSelf ? "본인 계정은 선택할 수 없습니다" : "선택"}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-sm font-black text-white truncate">{u.name}</span>
                                                                <span className="text-xs text-slate-400 truncate">({u.username})</span>
                                                                {isSelf && <span className="text-[10px] bg-sky-500/20 text-sky-400 font-bold px-1.5 py-0.5 rounded-md shrink-0">본인</span>}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                                                                    roleUpper === 'ADMIN' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                                                    roleUpper === 'MANAGER' ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' :
                                                                    'bg-slate-500/10 border-slate-500/30 text-slate-400'
                                                                }`}>
                                                                    {roleUpper === 'ADMIN' ? '관리자' : roleUpper === 'MANAGER' ? '매니저' : '일반 사용자'}
                                                                </span>
                                                                
                                                                <button 
                                                                    onClick={() => handleToggleApproval(u)}
                                                                    disabled={isSelf}
                                                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                                                                        u.isApproved 
                                                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                                                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                                    title={isSelf ? "본인 계정 승인 상태는 변경할 수 없습니다" : "승인 상태 변경"}
                                                                >
                                                                    {u.isApproved ? '승인됨' : '승인 대기'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button 
                                                            onClick={() => handleOpenEditUser(u)}
                                                            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-sky-400 transition-all"
                                                            title="수정"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {(settingsTab === 'teams' && isAdmin) && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">신규 조 등록</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={newTeamName}
                                            onChange={e => setNewTeamName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddTeam(); }}
                                            className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all text-slate-200"
                                            placeholder="예: 4조, A조..."
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddTeam}
                                            disabled={isTeamLoading || !newTeamName.trim()}
                                            className="py-3 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 whitespace-nowrap"
                                        >
                                            추가
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-white/10">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">등록된 조 목록 ({teamList.length}개)</label>
                                    {isTeamLoading ? (
                                        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                                            <p className="text-xs">조 목록을 불러오는 중...</p>
                                        </div>
                                    ) : teamList.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-slate-500 bg-white/5 rounded-2xl border border-white/5">
                                            등록된 조가 없습니다. 위에서 새 조를 등록해 주세요.
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                                            {teamList.map(t => (
                                                <div key={t.id} className="p-3 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between gap-3">
                                                    {editingTeam?.id === t.id ? (
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <input
                                                                value={editingTeamName}
                                                                onChange={e => setEditingTeamName(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveEditTeam(); }}
                                                                className="flex-1 bg-black/60 border border-emerald-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                                                                autoFocus
                                                            />
                                                            <button
                                                                onClick={handleSaveEditTeam}
                                                                className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                                                                title="저장"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={handleCancelEditTeam}
                                                                className="p-1.5 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 transition-all"
                                                                title="취소"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center">
                                                                    {t.name.charAt(0)}
                                                                </div>
                                                                <span className="text-sm font-bold text-white">{t.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => handleStartEditTeam(t)}
                                                                    className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-emerald-400 transition-all"
                                                                    title="조 이름 수정"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteTeam(t.id, t.name)}
                                                                    className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-rose-400 transition-all"
                                                                    title="조 삭제"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Reset Work Progress for today */}
                                <div className="space-y-2 pt-4 border-t border-white/10">
                                    <label className="text-[11px] font-black text-rose-400 ml-1 flex items-center gap-1.5">
                                        <RotateCw className="w-3.5 h-3.5" />
                                        <span>오늘 조별 작업시간 / 완료상태 초기화 (초기화 도구)</span>
                                    </label>
                                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 space-y-3 text-slate-300 text-xs">
                                        <p className="font-medium leading-relaxed">
                                            오늘 완료 처리된 모든 컨테이너를 진행 중 상태로 원복하고, 조별 근무시간을 19:00 시작 초기 상태로 초기화합니다.<br/>
                                            <span className="text-emerald-400 font-bold">* 보고서 데이터 및 사진 파일은 삭제되지 않고 안전하게 보존됩니다.</span>
                                        </p>
                                        <button
                                            onClick={handleResetTeamProgress}
                                            className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            <RotateCw className="w-4 h-4" />
                                            <span>오늘 조별 근무시간/완료기록 초기화 실행</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(settingsTab === 'password' || !isAdmin) && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 ml-1">현재 비밀번호</label>
                                    <input type="password" value={passwordData.current} onChange={e => setPasswordData({ ...passwordData, current: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all text-slate-200" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">새 비밀번호</label>
                                        <input type="password" value={passwordData.new} onChange={e => setPasswordData({ ...passwordData, new: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all text-slate-200" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-500 ml-1">비밀번호 확인</label>
                                        <input type="password" value={passwordData.confirm} onChange={e => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none transition-all text-slate-200" />
                                    </div>
                                </div>
                                <button onClick={handlePasswordUpdate} disabled={isPasswordUpdating}
                                    className="w-full py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white font-black text-sm transition-all mt-2">
                                    {isPasswordUpdating ? "변경 중..." : "비밀번호 변경 적용"}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
