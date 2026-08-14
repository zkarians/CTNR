'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, UserPlus, UserCheck, UserX, X } from 'lucide-react';
import { UserAccount } from '@/lib/types';

export interface UserFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingUser: UserAccount | null;
    userForm: {
        username: string;
        name: string;
        password: string;
        role: string;
        isApproved: boolean;
    };
    setUserForm: React.Dispatch<React.SetStateAction<{
        username: string;
        name: string;
        password: string;
        role: string;
        isApproved: boolean;
    }>>;
    onSave: () => void;
    isLoading: boolean;
}

export default function UserFormModal({
    isOpen,
    onClose,
    editingUser,
    userForm,
    setUserForm,
    onSave,
    isLoading
}: UserFormModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-sm bg-[#0f111a] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden p-6 flex flex-col"
                >
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            {editingUser ? <Edit3 className="w-5 h-5 text-sky-400" /> : <UserPlus className="w-5 h-5 text-emerald-400" />}
                            {editingUser ? "사용자 정보 수정" : "신규 사용자 등록"}
                        </h3>
                        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 ml-1">아이디 (Username)</label>
                            <input 
                                value={userForm.username} 
                                disabled={!!editingUser}
                                onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all disabled:opacity-50 disabled:bg-white/5 text-slate-200"
                                placeholder="로그인 아이디 입력" 
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 ml-1">이름 (Name)</label>
                            <input 
                                value={userForm.name} 
                                onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all text-slate-200"
                                placeholder="사용자 이름 입력" 
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 ml-1">
                                비밀번호 {editingUser && <span className="text-[10px] text-slate-500 font-normal">(변경 시에만 입력)</span>}
                            </label>
                            <input 
                                type="password"
                                value={userForm.password} 
                                onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:border-sky-500 outline-none transition-all text-slate-200"
                                placeholder={editingUser ? "변경할 비밀번호 입력 (선택)" : "비밀번호 입력"} 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-400 ml-1">권한 (Role)</label>
                                <select 
                                    value={userForm.role}
                                    onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-500 outline-none transition-all text-white"
                                >
                                    <option value="USER" className="bg-[#0f111a]">일반 (USER)</option>
                                    <option value="MANAGER" className="bg-[#0f111a]">매니저 (MANAGER)</option>
                                    <option value="ADMIN" className="bg-[#0f111a]">관리자 (ADMIN)</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-400 ml-1">승인 상태</label>
                                <button
                                    type="button"
                                    onClick={() => setUserForm({ ...userForm, isApproved: !userForm.isApproved })}
                                    className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        userForm.isApproved 
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                                            : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                                    }`}
                                >
                                    {userForm.isApproved ? (
                                        <><UserCheck className="w-3.5 h-3.5" /> 승인됨</>
                                    ) : (
                                        <><UserX className="w-3.5 h-3.5" /> 승인 대기</>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button 
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs transition-all"
                            >
                                취소
                            </button>
                            <button 
                                type="button"
                                onClick={onSave}
                                disabled={isLoading}
                                className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50"
                            >
                                {isLoading ? "저장 중..." : "저장"}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
