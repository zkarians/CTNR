"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Users, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { fetchTeams, selectTeam } from "@/lib/actions";
import { logout } from "@/lib/auth";
import type { Team } from "@/lib/types";

export default function SelectTeamPage() {
    const router = useRouter();
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTeams().then((data) => {
            setTeams(data);
            setIsFetching(false);
        });
    }, []);

    const handleConfirm = async () => {
        if (!selectedTeamId) {
            setError("조를 선택해주세요.");
            return;
        }
        setIsLoading(true);
        setError(null);
        const result = await selectTeam(selectedTeamId);
        if (result.success) {
            router.push("/");
            router.refresh();
        } else {
            setError(result.error || "오류가 발생했습니다.");
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push("/login");
        router.refresh();
    };

    return (
        <main className="min-h-screen bg-[#030712] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-sky-500/5 rounded-full blur-[100px]" />
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(148,163,184,1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
            </div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="flex flex-col items-center mb-10">
                    <div className="relative mb-5">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-xl animate-pulse" />
                        <div className="relative w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
                            <Package className="w-8 h-8 text-emerald-400" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white uppercase">
                        CTNR <span className="text-emerald-400">Optimizer</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium">컨테이너 적재 최적화 시스템</p>
                </div>

                {/* Card */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-8 backdrop-blur-sm shadow-2xl shadow-black/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Users className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-100">조 선택</h2>
                    </div>
                    <p className="text-slate-500 text-sm mb-6 pl-1">
                        작업할 조를 선택하세요. 선택한 조로 작업 내역이 기록됩니다.
                    </p>

                    {isFetching ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                        </div>
                    ) : teams.length === 0 ? (
                        <div className="flex flex-col items-center py-10 gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-amber-400" />
                            </div>
                            <p className="text-slate-400 text-sm">등록된 조가 없습니다.</p>
                            <p className="text-slate-600 text-xs">관리자에게 조 등록을 요청하세요.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {teams.map((team) => {
                                const isSelected = selectedTeamId === team.id;
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => setSelectedTeamId(team.id)}
                                        className={`
                                            relative group flex flex-col items-center justify-center
                                            rounded-2xl border p-5 transition-all duration-200 text-center
                                            ${isSelected
                                                ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                                                : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.15] hover:bg-white/[0.05]"
                                            }
                                        `}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-2.5 right-2.5">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                            </div>
                                        )}
                                        <div className={`
                                            w-10 h-10 rounded-xl flex items-center justify-center mb-3 font-black text-lg
                                            ${isSelected
                                                ? "bg-emerald-500/20 text-emerald-300"
                                                : "bg-white/[0.05] text-slate-400 group-hover:text-slate-200"
                                            }
                                        `}>
                                            {team.name.charAt(0)}
                                        </div>
                                        <span className={`font-bold text-sm ${isSelected ? "text-emerald-300" : "text-slate-300"}`}>
                                            {team.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm mb-4">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {teams.length > 0 && (
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading || !selectedTeamId}
                            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-black text-sm transition-all flex items-center justify-center gap-2.5 shadow-[0_8px_32px_rgba(16,185,129,0.25)]"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    {selectedTeamId ? `${teams.find(t => t.id === selectedTeamId)?.name} 선택 완료` : "조를 선택해주세요"}
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Logout link */}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-1.5 mt-4 text-slate-600 hover:text-slate-400 text-xs transition-colors"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    다른 계정으로 로그인
                </button>
            </div>
        </main>
    );
}
