"use client";

import dynamic from "next/dynamic";
import React from "react";

const HomeClient = dynamic(() => import("@/components/HomeClient"), {
    ssr: false,
    loading: () => (
        <div className="h-screen w-screen bg-[#030712] flex items-center justify-center text-slate-400 font-sans">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
    )
});

export default function ClientOnlyHome({ user }: { user: any }) {
    return <HomeClient user={user} />;
}
