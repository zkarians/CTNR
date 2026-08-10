"use client";

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3 } from 'lucide-react';
import { generateJobType } from '@/lib/utils/jobType';

interface TeamSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportData: any[];
}

function getJobCategory(cntr: any): string {
    const jobTypeStr = cntr.adminComment || generateJobType(cntr.products || []);
    if (jobTypeStr.includes('횡적')) return '횡적';

    let hasOven = false;
    let hasWasher = false;
    let hasDishwasher = false;
    let hasComp = false;
    let hasFridge = false;
    let hasSKFridge = false;

    for (const p of (cntr.products || [])) {
        if (p.division === 'ZZZ') continue;
        if (p.division === 'CVZ') hasOven = true;
        if (p.division === 'DFZ') hasWasher = true;
        if (p.division === 'CDZ') hasDishwasher = true;
        if (p.division === 'DHZ') hasComp = true;
        if (p.division === 'CNZ') {
            hasFridge = true;
            const nameUpper = (p.model_name || p.name || '').toUpperCase();
            if (nameUpper.startsWith('SK')) {
                hasSKFridge = true;
            }
        }
    }

    if (hasOven) return '오븐';
    if (hasWasher) return '세탁기';
    if (hasDishwasher) return '식기';
    if (hasComp) return '콤프';
    if (hasSKFridge) return 'SK냉장고';
    if (hasFridge) return '냉장고';

    return '기타';
}

const CATEGORIES = ['오븐', '세탁기', '식기', '횡적', 'SK냉장고', '냉장고', '콤프', '기타'];

export default function TeamSummaryModal({ isOpen, onClose, reportData }: TeamSummaryModalProps) {
    const summary = useMemo(() => {
        const teamMap = new Map<string, Record<string, number>>();

        if (!reportData) return teamMap;

        reportData.forEach((dateGroup: any) => {
            if (!dateGroup.uploaders) return;
            dateGroup.uploaders.forEach((team: any) => {
                if (!teamMap.has(team.teamName)) {
                    const initCounts: Record<string, number> = {};
                    CATEGORIES.forEach(cat => initCounts[cat] = 0);
                    initCounts['total'] = 0;
                    teamMap.set(team.teamName, initCounts);
                }

                const counts = teamMap.get(team.teamName)!;

                if (!team.containers) return;
                team.containers.forEach((cntr: any) => {
                    const isExcluded = cntr.adminComment?.includes('[작업제외]');
                    const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                    
                    if (!isExcluded && !isCancelled) {
                        const cat = getJobCategory(cntr);
                        if (counts[cat] !== undefined) {
                            counts[cat]++;
                        } else {
                            counts['기타']++;
                        }
                        counts['total']++;
                    }
                });
            });
        });

        return teamMap;
    }, [reportData]);

    const emptyBoxSummary = useMemo(() => {
        const boxMap = new Map<string, number>();
        
        if (!reportData) return boxMap;

        reportData.forEach((dateGroup: any) => {
            if (!dateGroup.uploaders) return;
            dateGroup.uploaders.forEach((team: any) => {
                if (!team.containers) return;
                team.containers.forEach((cntr: any) => {
                    const isExcluded = cntr.adminComment?.includes('[작업제외]');
                    const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                    
                    if (!isExcluded && !isCancelled && cntr.emptyBoxes && Array.isArray(cntr.emptyBoxes)) {
                        cntr.emptyBoxes.forEach((box: any) => {
                            if (box.name && box.name.toUpperCase().startsWith('MAY')) {
                                const qty = parseInt(box.qty, 10) || 0;
                                if (qty > 0) {
                                    const current = boxMap.get(box.name) || 0;
                                    boxMap.set(box.name, current + qty);
                                }
                            }
                        });
                    }
                });
            });
        });
        
        return boxMap;
    }, [reportData]);

    if (!isOpen) return null;

    const teams = Array.from(summary.keys()).sort((a, b) => a.localeCompare(b));
    
    // Calculate column totals
    const colTotals: Record<string, number> = {};
    CATEGORIES.forEach(cat => colTotals[cat] = 0);
    colTotals['total'] = 0;

    teams.forEach(team => {
        const counts = summary.get(team)!;
        CATEGORIES.forEach(cat => colTotals[cat] += counts[cat]);
        colTotals['total'] += counts['total'];
    });

    const emptyBoxEntries = Array.from(emptyBoxSummary.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const totalEmptyBoxes = emptyBoxEntries.reduce((sum, [_, qty]) => sum + qty, 0);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
                >
                    <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                <BarChart3 className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-black text-slate-800">조별 작업수량 요약</h2>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-4 md:p-6 overflow-auto">
                        <div className="overflow-x-auto ring-1 ring-slate-200 rounded-xl">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600">
                                        <th className="px-4 py-3 font-bold border-b border-r border-slate-200">작업 조</th>
                                        {CATEGORIES.map(cat => (
                                            <th key={cat} className="px-4 py-3 font-bold text-center border-b border-slate-200">{cat}</th>
                                        ))}
                                        <th className="px-4 py-3 font-black text-center border-b border-l border-slate-200 text-indigo-700 bg-indigo-50/50">총계</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teams.length === 0 ? (
                                        <tr>
                                            <td colSpan={CATEGORIES.length + 2} className="px-4 py-8 text-center text-slate-400">데이터가 없습니다.</td>
                                        </tr>
                                    ) : (
                                        teams.map(team => {
                                            const counts = summary.get(team)!;
                                            return (
                                                <tr key={team} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                    <td className="px-4 py-3 font-bold text-slate-800 border-r border-slate-100">{team}</td>
                                                    {CATEGORIES.map(cat => (
                                                        <td key={cat} className={`px-4 py-3 text-center ${counts[cat] > 0 ? 'font-bold text-slate-700' : 'text-slate-300'}`}>
                                                            {counts[cat]}
                                                        </td>
                                                    ))}
                                                    <td className="px-4 py-3 text-center font-black text-indigo-600 border-l border-slate-100 bg-indigo-50/20">
                                                        {counts['total']}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                {teams.length > 0 && (
                                    <tfoot className="bg-slate-50 font-black">
                                        <tr>
                                            <td className="px-4 py-3 text-slate-700 border-r border-slate-200">전체 합계</td>
                                            {CATEGORIES.map(cat => (
                                                <td key={cat} className="px-4 py-3 text-center text-slate-700 border-t border-slate-200">
                                                    {colTotals[cat]}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-center text-indigo-700 border-t border-l border-slate-200 bg-indigo-50/50">
                                                {colTotals['total']}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {/* 공박스 내역 합계 표 */}
                        <div className="mt-8">
                            <h3 className="text-md font-black text-slate-800 mb-3 flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-sky-500 rounded-full"></div>
                                공박스 소모량 총계
                            </h3>
                            <div className="overflow-x-auto ring-1 ring-slate-200 rounded-xl">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-600">
                                            <th className="px-4 py-3 font-bold border-b border-r border-slate-200">공박스 모델명</th>
                                            <th className="px-4 py-3 font-bold text-center border-b border-slate-200">합계 수량</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {emptyBoxEntries.length === 0 ? (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">당일 사용된 공박스 내역이 없습니다.</td>
                                            </tr>
                                        ) : (
                                            emptyBoxEntries.map(([name, qty]) => (
                                                <tr key={name} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                    <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-100">{name}</td>
                                                    <td className="px-4 py-3 text-center text-slate-700">{qty}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {emptyBoxEntries.length > 0 && (
                                        <tfoot className="bg-slate-50 font-black">
                                            <tr>
                                                <td className="px-4 py-3 text-slate-700 border-r border-slate-200">전체 합계</td>
                                                <td className="px-4 py-3 text-center text-sky-600 border-t border-slate-200">
                                                    {totalEmptyBoxes}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                        <div className="mt-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <strong>* 분류 우선순위:</strong> 오븐 &gt; 세탁기 &gt; 식기 &gt; 횡적 &gt; 콤프 &gt; SK냉장고 &gt; 냉장고<br/>
                            <span className="text-slate-400 mt-1 block">작업취소 및 작업제외 처리된 컨테이너는 수량에서 제외되었습니다.</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
