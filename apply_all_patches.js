const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

// 1. v4 logic
content = content.replace(
    "deleteManualReportEntry } from '@/lib/actions';",
    "deleteManualReportEntry, updateManualReportEntry } from '@/lib/actions';"
);
content = content.replace(
    "const [editingReportItem, setEditingReportItem] = useState<{ teamName: string; cntrIdx: number; dateGroupIdx?: number } | null>(null);",
    "const [editingReportItem, setEditingReportItem] = useState<{ teamName: string; cntrIdx: number; dateGroupIdx?: number; cntr?: any } | null>(null);"
);

// 2. v7 logic
const v7Regex = /const handleEditReportItem = \(teamName: string, cntrIdx: number, cntr: any, dateGroupIdx\?: number\) => \{\s*setEditingReportItem\(\{ teamName, cntrIdx, dateGroupIdx \}\);\s*setManualTeamName\(teamName\);/;
content = content.replace(v7Regex, `const handleEditReportItem = (teamName: string, cntrIdx: number, cntr: any, dateGroupIdx?: number) => {
        setEditingReportItem({ teamName, cntrIdx, dateGroupIdx, cntr });
        setManualInsertIndex(cntrIdx);
        setManualTeamName(teamName);`);

// 3. const to let for newRawContainer
content = content.replace("const newRawContainer = {", "let newRawContainer = {");

// 4. v6 logic (replacing the if (editingReportItem) block inside setReportData)
const v6Regex = /if \(editingReportItem\) \{[\s\S]*?existingCntrs\.splice\(insertIdx, 0, newRawContainer\);\s*\}/;
const v6ReplacementStr = `if (editingReportItem) {
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
content = content.replace(v6Regex, v6ReplacementStr);

// 5. v10 logic (replacing addManualReportEntry call at the end of handleAddManualSubmit)
const v10TargetStr = `        if (!editingReportItem) {
            addManualReportEntry({
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt
            }).catch(console.error);
        }
    };`;
const v10ReplaceStr = `        if (!editingReportItem) {
            addManualReportEntry({
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt
            }).catch(console.error);
        } else if (editingReportItem.cntr && editingReportItem.cntr.manualEntryId) {
            updateManualReportEntry(editingReportItem.cntr.manualEntryId, {
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt
            }).catch(console.error);
        }
    };`;
if (content.includes(v10TargetStr)) {
    content = content.replace(v10TargetStr, v10ReplaceStr);
} else {
    const fallbackRegex = /if \(\!editingReportItem\) \{[\s\S]*?addManualReportEntry\(\{[\s\S]*?\}\)\.catch\(console\.error\);\s*\}\s*\};\s*/;
    content = content.replace(fallbackRegex, v10ReplaceStr + "\n");
}

fs.writeFileSync('src/components/HomeClient.tsx', content);
console.log("All patches applied successfully to HomeClient.tsx.");
