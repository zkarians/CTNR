import { getNormalizedCarrier } from './carrierUtils';

export type ReportPresetType = 'full' | 'summary' | 'anomaly';

export function buildReportTextFromData(dataArray: any[], preset: ReportPresetType = 'full'): string {
    if (!dataArray || dataArray.length === 0) return '';
    const lines: string[] = [];

    if (preset === 'summary') {
        lines.push(`📋 [작업 현황 간략 요약 보고]`);
    } else if (preset === 'anomaly') {
        lines.push(`🚨 [작업 특이사항 및 비고 집중 보고]`);
    } else {
        lines.push(`📋 [일자별 작업 현황 보고서]`);
    }

    dataArray.forEach((dateGroup: any) => {
        lines.push(`📅 ${dateGroup.dateStr || dateGroup.date} 작업 분량`);
        const activeCarrierCounts: Record<string, number> = {};
        dateGroup.uploaders?.forEach((u: any) => {
            u.containers?.forEach((c: any) => {
                if (!c.isCancelled && !c.adminComment?.includes('[취소]') && !c.adminComment?.includes('[작업취소]') && !c.adminComment?.includes('[작업제외]')) {
                    const cName = getNormalizedCarrier(c.transporter, u.teamName);
                    activeCarrierCounts[cName] = (activeCarrierCounts[cName] || 0) + 1;
                }
            });
        });
        const finalCarrierCounts = dateGroup.customCarrierCounts || activeCarrierCounts;
        const displayTotal = Object.values(finalCarrierCounts).reduce((a: any, b: any) => a + b, 0);

        const carrierEntries = Object.entries(finalCarrierCounts);
        const carrierStr = carrierEntries.length > 0 ? ` ( ${carrierEntries.map(([k, v]) => `${k}: ${v}개`).join(', ')} )` : '';
        const remarkText = dateGroup.customRemark ? ` | 비고: ${dateGroup.customRemark}` : '';
        lines.push(`총합계: ${displayTotal}개 작업완료${carrierStr}${remarkText}\n`);

        if (preset === 'anomaly') {
            let anomalyCount = 0;
            dateGroup.uploaders?.forEach((team: any) => {
                const teamAnomalies = (team.containers || []).filter((cntr: any) => 
                    cntr.isCancelled || 
                    cntr.adminComment?.includes('[취소]') || 
                    cntr.adminComment?.includes('[작업취소]') || 
                    cntr.adminComment?.includes('[작업제외]') || 
                    (cntr.adminComment && cntr.adminComment.trim()) || 
                    (cntr.lastRemark && cntr.lastRemark.trim()) ||
                    (cntr.remark && cntr.remark.trim())
                );

                if (teamAnomalies.length > 0) {
                    lines.push(`■ ${team.teamName}`);
                    teamAnomalies.forEach((cntr: any) => {
                        anomalyCount++;
                        const isExcluded = cntr.adminComment?.includes('[작업제외]');
                        const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                        const cancelTag = isExcluded ? ' [작업제외]' : isCancelled ? ' [작업취소]' : '';
                        const cleanComment = cntr.adminComment ? cntr.adminComment.replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim() : '';
                        const adminCommentNote = cleanComment ? ` (코멘트: ${cleanComment})` : '';
                        const remarkNote = (cntr.lastRemark || cntr.remark || '').trim();

                        lines.push(`- ${cntr.cntrNo}${cancelTag}${adminCommentNote}`);
                        if (remarkNote) {
                            lines.push(`  💬 비고/지연: ${remarkNote}`);
                        }
                    });
                    lines.push(``);
                }
            });

            if (anomalyCount === 0) {
                lines.push(`특이사항 및 지연/취소 건이 없습니다. (전 건 정상 작업 완료)`);
            }
            return;
        }

        dateGroup.uploaders?.forEach((team: any) => {
            const activeTeamCntrs = (team.containers || []).filter((c: any) => !c.isCancelled && !c.adminComment?.includes('[취소]') && !c.adminComment?.includes('[작업취소]') && !c.adminComment?.includes('[작업제외]'));
            lines.push(`■ ${team.teamName} (합계 ${activeTeamCntrs.length}개)`);
            team.containers?.forEach((cntr: any) => {
                const isExcluded = cntr.adminComment?.includes('[작업제외]');
                const isCancelled = !isExcluded && (cntr.isCancelled || cntr.adminComment?.includes('[취소]') || cntr.adminComment?.includes('[작업취소]'));
                const cancelTag = isExcluded ? ' [작업제외]' : isCancelled ? ' [작업취소]' : '';

                const cleanComment = cntr.adminComment ? cntr.adminComment.replace(/\[작업취소\]/g, '').replace(/\[작업제외\]/g, '').replace(/\[취소\]/g, '').trim() : '';
                const adminCommentNote = cleanComment ? ` (${cleanComment})` : '';

                const totalQty = cntr.totalQty ? cntr.totalQty.toLocaleString() : (cntr.products || []).reduce((s: number, p: any) => s + (p.qty || 0), 0).toLocaleString();
                const modelCount = cntr.modelCount || cntr.products?.length || 0;
                
                if (preset === 'summary') {
                    // Summary mode: only container line with model/qty and time, no nested items
                    lines.push(`- ${cntr.cntrNo}${cancelTag} (${modelCount}모델, ${totalQty}개${adminCommentNote}) ${cntr.workTimeStr ? `[${cntr.workTimeStr}]` : ''}`);
                    if (cntr.lastRemark && cntr.lastRemark.trim()) {
                        lines.push(`  💬 ${cntr.lastRemark.trim()}`);
                    }
                } else {
                    // Full mode: with all product line items
                    lines.push(`${cntr.cntrNo}${cancelTag} (${modelCount}모델, ${totalQty}개${adminCommentNote}) [${cntr.workTimeStr || ''}]`);

                    if (cntr.lastRemark && cntr.lastRemark.trim()) {
                        lines.push(`- 💬 ${cntr.lastRemark.trim()}`);
                    }
                    if (cntr.products) {
                        for (const p of cntr.products) {
                            lines.push(`- [${p.division || 'DFZ'}] ${p.name} ${(p.qty || 0).toLocaleString()}개`);
                        }
                    }
                    if (cntr.emptyBoxes && cntr.emptyBoxes.length > 0) {
                        for (const eb of cntr.emptyBoxes) {
                            lines.push(`- 📦 [공박스] ${eb.name} ${(eb.qty || 0).toLocaleString()}개`);
                        }
                    }
                    lines.push(``);
                }
            });
            if (preset === 'summary') {
                lines.push(``);
            }
        });
    });

    return lines.join('\n');
}
