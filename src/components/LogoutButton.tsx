"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface LogoutButtonProps {
    username: string;
    name: string;
    role: string;
}

export default function LogoutButton({ username, name, role }: LogoutButtonProps) {
    const router = useRouter();

    const handleLogout = async () => {
        await logout();
        router.push("/login");
        router.refresh();
    };

    const roleLabel = role === "ADMIN" ? "관리자" : role === "MANAGER" ? "매니저" : "작업자";

    return (
        <div className="flex items-center gap-2 ml-auto">
            <div className="text-right">
                <p className="text-xs font-bold text-slate-200">{name || username}</p>
                <p className="text-[10px] text-slate-500">{roleLabel}</p>
            </div>
            <button
                onClick={handleLogout}
                title="로그아웃"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[10px] font-bold hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 transition-all"
            >
                <LogOut className="w-3 h-3" />
                로그아웃
            </button>
        </div>
    );
}
