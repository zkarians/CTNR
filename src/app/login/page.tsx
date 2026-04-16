"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { Package, LogIn, Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError("아이디와 비밀번호를 입력해주세요.");
            return;
        }
        setIsLoading(true);
        setError(null);

        const result = await login(username.trim(), password, rememberMe);

        if (result.success) {
            router.push("/");
            router.refresh();
        } else {
            setError(result.error || "로그인에 실패했습니다.");
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#030712] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background glow effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px]" />
                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(148,163,184,1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full max-w-sm relative z-10"
            >
                {/* Logo */}
                <div className="flex flex-col items-center mb-10">
                    <div className="relative mb-5">
                        <div className="absolute inset-0 bg-sky-500/20 rounded-2xl blur-xl animate-pulse" />
                        <div className="relative w-16 h-16 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30 rounded-2xl flex items-center justify-center">
                            <Package className="w-8 h-8 text-sky-400" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white uppercase">
                        CTNR <span className="text-sky-400">Optimizer</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium">컨테이너 적재 최적화 시스템</p>
                </div>

                {/* Card */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-8 backdrop-blur-sm shadow-2xl shadow-black/50">
                    <h2 className="text-lg font-bold text-slate-100 mb-6">로그인</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                                아이디
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="사용자 이름 입력"
                                autoComplete="username"
                                disabled={isLoading}
                                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all disabled:opacity-50"
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                                비밀번호
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력"
                                    autoComplete="current-password"
                                    disabled={isLoading}
                                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 pr-12 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-4 h-4" />
                                    ) : (
                                        <Eye className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Remember Me */}
                        <div className="flex items-center gap-2 px-1">
                            <input
                                id="rememberMe"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                disabled={isLoading}
                                className="w-4 h-4 rounded bg-white/[0.05] border-white/[0.08] text-sky-500 focus:ring-sky-500/30 transition-all cursor-pointer"
                            />
                            <label
                                htmlFor="rememberMe"
                                className="text-xs text-slate-400 font-medium cursor-pointer select-none"
                            >
                                로그인 상태 유지
                            </label>
                        </div>

                        {/* Error */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm"
                            >
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </motion.div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:hover:bg-sky-500 text-white font-black text-sm transition-all flex items-center justify-center gap-2.5 shadow-[0_8px_32px_rgba(56,189,248,0.25)] group mt-2"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    로그인
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-600 text-[11px] mt-6">
                    계정이 없으시면 관리자에게 문의하세요.
                </p>
            </motion.div>
        </main>
    );
}
