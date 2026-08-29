"use client";

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3, Copy, Check, Loader2 } from 'lucide-react';
import { generateJobType } from '@/lib/utils/jobType';
import { getUpcoming3DaysRosterStatus } from '@/lib/actions/rosterActions';

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
    let hasAircon = false;
    let hasComp = false;
    let hasFridge = false;
    let hasSKFridge = false;

    const uniqueModels = new Set<string>();

    for (const p of (cntr.products || [])) {
        if (p.division === 'ZZZ') continue;
        const name = (p.model_name || p.name || '').trim();
        if (name) uniqueModels.add(name);

        if (p.division === 'CVZ') hasOven = true;
        if (p.division === 'DFZ') hasWasher = true;
        if (p.division === 'CDZ') hasDishwasher = true;
        if (p.division === 'DMZ') hasAircon = true;
        if (p.division === 'DHZ') hasComp = true;
        if (p.division === 'CNZ') {
            hasFridge = true;
            const nameUpper = name.toUpperCase();
            if (nameUpper.startsWith('SK')) {
                hasSKFridge = true;
            }
        }
    }

    if (hasOven) return '오븐';
    if (hasWasher) return '세탁기';
    if (hasDishwasher) return '식기';
    if (hasAircon) return '에어컨';
    if (hasComp) return '콤프';
    if (hasSKFridge) {
        const modelCount = uniqueModels.size || cntr.modelCount || (cntr.products ? cntr.products.length : 1);
        if (modelCount >= 7) {
            return '다모델 SK냉장고';
        }
        return 'SK냉장고';
    }
    if (hasFridge) return '냉장고';

    return '기타';
}

const CATEGORIES = ['식기', '콤프', '오븐', '횡적', '세탁기', 'SK냉장고', '다모델 SK냉장고', '냉장고', '에어컨', '기타'];

function isContainerExcludedOrCancelled(cntr: any): { isExcluded: boolean; isCancelled: boolean } {
    const textToCheck = [
        cntr.adminComment,
        cntr.remark,
        cntr.lastRemark,
        cntr.category,
        cntr.modelSummaryStr,
        cntr.dbRemark
    ].filter(Boolean).join(' ');

    const isExcluded = textToCheck.includes('작업제외') || textToCheck.includes('[제외]') || textToCheck.includes('(제외)');
    const isCancelled = !isExcluded && (cntr.isCancelled || textToCheck.includes('작업취소') || textToCheck.includes('[취소]') || textToCheck.includes('(취소)'));

    return { isExcluded, isCancelled };
}

export default function TeamSummaryModal({ isOpen, onClose, reportData }: TeamSummaryModalProps) {
    const [dayShiftCount, setDayShiftCount] = React.useState<string>('');
    const [isCopied, setIsCopied] = React.useState(false);
    const [rosterMessages, setRosterMessages] = React.useState<string[]>([]);
    const [isLoadingRoster, setIsLoadingRoster] = React.useState(false);
    const dayShiftInputRef = React.useRef<HTMLInputElement>(null);

    // Target date extracted from reportData
    const targetDate = reportData?.[0]?.dateStr || reportData?.[0]?.date || '';
    
    React.useEffect(() => {
        if (!isOpen) return;
        if (!targetDate) {
            setDayShiftCount('');
            return;
        }
        const savedCount = localStorage.getItem(`dayShiftCount_${targetDate}`);
        if (savedCount !== null && savedCount.trim() !== '') {
            setDayShiftCount(savedCount);
        } else {
            setDayShiftCount('');
        }
    }, [isOpen, targetDate]);

    React.useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;

        const fetchRoster = async () => {
            const dateToQuery = targetDate || new Date().toISOString().split('T')[0];
            setIsLoadingRoster(true);
            try {
                const res = await getUpcoming3DaysRosterStatus(dateToQuery);
                if (isMounted && res.success) {
                    setRosterMessages(res.messages || []);
                } else if (isMounted) {
                    setRosterMessages([]);
                }
            } catch (err) {
                console.error('Failed to fetch upcoming 3-day roster status:', err);
                if (isMounted) setRosterMessages([]);
            } finally {
                if (isMounted) setIsLoadingRoster(false);
            }
        };

        fetchRoster();

        return () => {
            isMounted = false;
        };
    }, [isOpen, targetDate]);
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
                    const { isExcluded, isCancelled } = isContainerExcludedOrCancelled(cntr);
                    
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

    
    const carrierSummary = useMemo(() => {
        const counts: Record<string, number> = { '천마': 0, 'BNI': 0, '재작업': 0, '기타': 0 };
        if (!reportData) return counts;

        reportData.forEach((dateGroup: any) => {
            if (!dateGroup.uploaders) return;
            dateGroup.uploaders.forEach((team: any) => {
                if (!team.containers) return;
                team.containers.forEach((cntr: any) => {
                    const { isExcluded, isCancelled } = isContainerExcludedOrCancelled(cntr);
                    
                    if (!isExcluded && !isCancelled) {
                        let carrier = '기타';
                        if (cntr.transporter?.includes('천마')) carrier = '천마';
                        else if (cntr.transporter?.includes('BNI') || cntr.transporter?.includes('비엔아이')) carrier = 'BNI';
                        else if (cntr.transporter?.includes('재작업')) carrier = '재작업';
                        else if (!cntr.transporter && team.teamName.includes('천마')) carrier = '천마';
                        else if (!cntr.transporter && (team.teamName.includes('BNI') || team.teamName.includes('비엔아이'))) carrier = 'BNI';
                        
                        counts[carrier]++;
                    }
                });
            });
        });
        return counts;
    }, [reportData]);
const emptyBoxSummary = useMemo(() => {
        const boxMap = new Map<string, number>();
        
        if (!reportData) return boxMap;

        reportData.forEach((dateGroup: any) => {
            if (!dateGroup.uploaders) return;
            dateGroup.uploaders.forEach((team: any) => {
                if (!team.containers) return;
                team.containers.forEach((cntr: any) => {
                    const { isExcluded, isCancelled } = isContainerExcludedOrCancelled(cntr);
                    
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

    // Generate text report
    let carrierStr = '';
    ['천마', 'BNI', '재작업', '기타'].forEach(c => {
        if (carrierSummary[c] > 0) carrierStr += `${c}${carrierSummary[c]} `;
    });
    carrierStr = carrierStr.trim();

    let categoryStr = '';
    const REPORT_CATEGORIES = ['식기', '콤프', '오븐', '횡적', '세탁기', 'SK냉장고', '냉장고', '에어컨', '기타'];
    REPORT_CATEGORIES.forEach(cat => {
        let count = colTotals[cat] || 0;
        if (cat === 'SK냉장고') {
            count += (colTotals['다모델 SK냉장고'] || 0);
        }
        if (count > 0) {
            const displayLabel = cat === 'SK냉장고' ? 'SK' : cat;
            categoryStr += `${displayLabel}${count} `;
        }
    });
    categoryStr = categoryStr.trim();

    const nightTotal = colTotals['total'] || 0;
    const isDayShiftEmpty = dayShiftCount === '' || dayShiftCount.trim() === '';
    const dayTotalStr = isDayShiftEmpty ? '(미입력)' : dayShiftCount.trim();

    let emptyBoxSuffix = '';
    if (emptyBoxEntries.length > 0) {
        const emptyBoxLines: string[] = ['공박스'];
        emptyBoxEntries.forEach(([name, qty]) => {
            emptyBoxLines.push(`${name} ${qty.toLocaleString()}개`);
        });
        emptyBoxLines.push(`합계 ${totalEmptyBoxes.toLocaleString()}개 장입`);
        emptyBoxSuffix = `\n\n${emptyBoxLines.join('\n')}`;
    }

    const rosterSuffix = rosterMessages.length > 0 ? `\n\n${rosterMessages.join('\n')}` : '';
    const generatedText = `웅동 야간출하\n\n${carrierStr}\n${categoryStr}\n주간${dayTotalStr} 야간${nightTotal} 장입 이상무${emptyBoxSuffix}${rosterSuffix}`;

    const handleCopyText = async () => {
        if (isDayShiftEmpty) {
            alert('주간 작업수량을 입력해주세요. (0대인 경우 0 입력)');
            dayShiftInputRef.current?.focus();
            return;
        }

        const copyText = `웅동 야간출하\n\n${carrierStr}\n${categoryStr}\n주간${dayShiftCount.trim()} 야간${nightTotal} 장입 이상무${emptyBoxSuffix}${rosterSuffix}`;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(copyText);
            } else {
                // Fallback for non-HTTPS environments
                const textArea = document.createElement('textarea');
                textArea.value = copyText;
                
                // Avoid scrolling to bottom
                textArea.style.top = '0';
                textArea.style.left = '0';
                textArea.style.position = 'fixed';
                
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
            alert('복사 중 오류가 발생했습니다. 수동으로 텍스트를 복사해주세요.');
        }
    };


    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-5xl lg:max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
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

                    <div className="p-3 sm:p-5 md:p-6 overflow-auto">
                        <div className="overflow-x-auto ring-1 ring-slate-200 rounded-xl">
                            <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600">
                                        <th className="px-3 py-2.5 font-bold border-b border-r border-slate-200">작업 조</th>
                                        {CATEGORIES.map(cat => (
                                            <th key={cat} className="px-2 sm:px-2.5 py-2.5 font-bold text-center border-b border-slate-200">{cat}</th>
                                        ))}
                                        <th className="px-3 py-2.5 font-black text-center border-b border-l border-slate-200 text-indigo-700 bg-indigo-50/50">총계</th>
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
                                                    <td className="px-3 py-2.5 font-bold text-slate-800 border-r border-slate-100">{team}</td>
                                                    {CATEGORIES.map(cat => (
                                                        <td key={cat} className={`px-2 sm:px-2.5 py-2.5 text-center ${counts[cat] > 0 ? 'font-bold text-slate-700' : 'text-slate-300'}`}>
                                                            {counts[cat]}
                                                        </td>
                                                    ))}
                                                    <td className="px-3 py-2.5 text-center font-black text-indigo-600 border-l border-slate-100 bg-indigo-50/20">
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
                                            <td className="px-3 py-2.5 text-slate-700 border-r border-slate-200">전체 합계</td>
                                            {CATEGORIES.map(cat => (
                                                <td key={cat} className="px-2 sm:px-2.5 py-2.5 text-center text-slate-700 border-t border-slate-200">
                                                    {colTotals[cat]}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2.5 text-center text-indigo-700 border-t border-l border-slate-200 bg-indigo-50/50">
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
                        
                        {/* 텍스트 보고서 생성 영역 */}
                        <div className="mt-8 border-t border-slate-200 pt-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-md font-black text-slate-800 flex items-center gap-2">
                                            <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                                            카톡 보고서 텍스트
                                        </h3>
                                        {isLoadingRoster && (
                                            <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium ml-2">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                근무편성 확인 중...
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                                        <label className="text-sm font-bold text-slate-600">주간 작업수량:</label>
                                        <input 
                                            ref={dayShiftInputRef}
                                            type="number" 
                                            min="0"
                                            className={`w-16 px-2 py-1 text-sm font-bold text-slate-800 border rounded focus:outline-none focus:ring-2 text-right bg-white transition-all ${
                                                isDayShiftEmpty ? 'border-amber-400 ring-1 ring-amber-300' : 'border-slate-300 focus:ring-indigo-500'
                                            }`}
                                            placeholder="미입력"
                                            value={dayShiftCount}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setDayShiftCount(val);
                                                if (targetDate) {
                                                    if (val === '') {
                                                        localStorage.removeItem(`dayShiftCount_${targetDate}`);
                                                    } else {
                                                        localStorage.setItem(`dayShiftCount_${targetDate}`, val);
                                                    }
                                                }
                                            }}
                                        />
                                        <span className="text-sm font-bold text-slate-600">대</span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <textarea 
                                        className="w-full h-52 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none resize-none shadow-inner leading-relaxed"
                                        readOnly
                                        value={generatedText}
                                    />
                                    <button
                                        onClick={handleCopyText}
                                        className="absolute bottom-4 right-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-md active:scale-95"
                                    >
                                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {isCopied ? '복사됨' : '복사하기'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <strong>* 분류 우선순위:</strong> 오븐 &gt; 세탁기 &gt; 식기 &gt; 에어컨 &gt; 횡적 &gt; 콤프 &gt; SK냉장고(다모델) &gt; 냉장고<br/>
                            <span className="text-slate-400 mt-1 block">작업취소 및 작업제외 처리된 컨테이너는 수량에서 제외되었습니다.</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
