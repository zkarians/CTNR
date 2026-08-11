const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const targetStr = `            if (editingReportItem) {
                if (isSameTeam(editingReportItem.teamName, manualTeamName)) {
                    existingCntrs[editingReportItem.cntrIdx] = { ...existingCntrs[editingReportItem.cntrIdx], ...newRawContainer };
                } else {
                    const oldTeamGroup = targetDateGroup.uploaders.find((u: any) => isSameTeam(u.teamName, editingReportItem.teamName));
                    if (oldTeamGroup && oldTeamGroup.containers) {
                        oldTeamGroup.containers.splice(editingReportItem.cntrIdx, 1);
                        oldTeamGroup.containers = calculateTeamTimeline<any>(oldTeamGroup.containers).map((item: any) => ({
                            ...item,
                            workTimeStr: \`\${item.durationMinutes}분 (\${item.startTimeStr}~\${item.endTimeStr}\${item.hasBreak ? ' *휴식/식사포함*' : ''})\`
                        }));
                    }
                    existingCntrs.push(newRawContainer);
                }
            } else {
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }
                
                if (existingCntrs.length > 0) {
                    if (insertIdx === 0) {
                        const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                    } else if (insertIdx >= existingCntrs.length) {
                        const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                    } else {
                        const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                        const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                    }
                } else {
                    targetFirstUploadedAt = new Date().toISOString();
                }
                
                if (targetFirstUploadedAt) {
                    (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            }`;

const replacementStr = `            if (editingReportItem) {
                // 1. Remove from old team
                const oldTeamGroup = targetDateGroup.uploaders.find((u: any) => isSameTeam(u.teamName, editingReportItem.teamName));
                let oldCntr = null;
                if (oldTeamGroup && oldTeamGroup.containers) {
                    oldCntr = oldTeamGroup.containers.splice(editingReportItem.cntrIdx, 1)[0];
                    if (!isSameTeam(editingReportItem.teamName, manualTeamName)) {
                        oldTeamGroup.containers = calculateTeamTimeline<any>(oldTeamGroup.containers).map((item: any) => ({
                            ...item,
                            workTimeStr: \`\${item.durationMinutes}분 (\${item.startTimeStr}~\${item.endTimeStr}\${item.hasBreak ? ' *휴식/식사포함*' : ''})\`
                        }));
                    }
                }
                newRawContainer = { ...oldCntr, ...newRawContainer };

                // 2. Determine new position in new team
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }

                // 3. Re-calculate firstUploadedAt if position changed or team changed
                const isSamePosition = isSameTeam(editingReportItem.teamName, manualTeamName) && (insertIdx === editingReportItem.cntrIdx || manualInsertIndex === 'end');
                if (!isSamePosition) {
                    if (existingCntrs.length > 0) {
                        if (insertIdx === 0) {
                            const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                        } else if (insertIdx >= existingCntrs.length) {
                            const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                        } else {
                            const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                            const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                            targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                        }
                    } else {
                        targetFirstUploadedAt = new Date().toISOString();
                    }
                    if (targetFirstUploadedAt) {
                        (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                    }
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            } else {
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }
                
                if (existingCntrs.length > 0) {
                    if (insertIdx === 0) {
                        const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                    } else if (insertIdx >= existingCntrs.length) {
                        const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                    } else {
                        const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                        const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                    }
                } else {
                    targetFirstUploadedAt = new Date().toISOString();
                }
                
                if (targetFirstUploadedAt) {
                    (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Patched logic in HomeClient.tsx successfully.");
} else {
    console.log("Could not find target block in HomeClient.tsx.");
}
