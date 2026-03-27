import React from 'react';
import { Maximize, Ruler } from 'lucide-react';
import { PackingResult } from '@/lib/types';

interface PackingStatsCardProps {
    result: PackingResult;
}

export default function PackingStatsCard({ result }: PackingStatsCardProps) {
    const { container, items, efficiency, unpacked } = result;
    const unpackedCount = unpacked.reduce((s, u) => s + u.quantity, 0);

    return (
        <div className="glass-card p-4 !bg-black/60 backdrop-blur-xl border-white/15 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-500">
            <div className="flex items-center gap-2 mb-2 text-sky-400">
                <Maximize className="w-3.5 h-3.5" />
                <h3 className="text-[10px] font-black uppercase tracking-widest leading-none">{container.name} 결과</h3>
            </div>

            <div className="space-y-3">
                <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">적재 효율성</p>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-black text-white leading-none">{efficiency.toFixed(1)}%</span>
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden mb-1">
                            <div className="h-full bg-sky-500" style={{ width: `${efficiency}%` }} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
                    <div>
                        <p className="text-[8px] text-slate-500 font-bold uppercase">적재 완료</p>
                        <p className="text-base font-bold text-white">{items.length} <span className="text-[9px] font-normal text-slate-400 italic">PKGS</span></p>
                    </div>
                    <div>
                        <p className="text-[8px] text-slate-500 font-bold uppercase">미적재</p>
                        <p className={`text-base font-bold ${unpackedCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {unpackedCount} <span className="text-[9px] font-normal text-slate-400 italic">PKGS</span>
                        </p>
                    </div>
                </div>

                {unpackedCount > 0 ? (
                    <div className="pt-3 border-t border-red-500/20">
                        <p className="text-[9px] font-black uppercase text-red-400 mb-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                            미적재 목록
                        </p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                            {unpacked.map((u, i) => (
                                <div key={i} className="flex justify-between items-center bg-red-500/10 rounded-lg px-2.5 py-1.5 border border-red-500/20">
                                    <span className="text-[10px] text-red-300 font-bold truncate mr-2">{u.model_name}</span>
                                    <span className="text-[10px] font-black text-red-400 shrink-0">×{u.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="pt-3 border-t border-emerald-500/20">
                        <div className="flex items-center gap-2 bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-500/20">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                            <p className="text-[10px] font-black text-emerald-400">전량 적재 완료</p>
                        </div>
                    </div>
                )}
                
                <div className="pt-3 border-t border-white/5 flex items-center gap-3 text-[9px] font-bold text-slate-400">
                    <div className="flex items-center gap-1">
                        <Ruler className="w-3 h-3 text-sky-500/70" />
                        <span>{container.width}×{container.length}</span>
                    </div>
                    <div className="w-px h-2 bg-white/10" />
                    <div className="flex items-center gap-1 uppercase">
                        <span>H: {container.height}mm</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
