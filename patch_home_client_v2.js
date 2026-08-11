const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

// 1. Add addManualReportEntry call at the end of handleAddManualSubmit
const submitSearch = `        setIsManualCancelled(false);
    };`;
const submitReplace = `        setIsManualCancelled(false);
        
        if (!editingReportItem) {
            addManualReportEntry({
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0)
            }).catch(console.error);
        }
    };`;

if (content.includes(submitSearch)) {
    content = content.replace(submitSearch, submitReplace);
    console.log('Patched handleAddManualSubmit');
}

// 2. Add deleteManualReportEntry call in handleDeleteReportItem
const deleteSearch = `            if (teamGroup && teamGroup.containers) {
                teamGroup.containers.splice(cntrIdx, 1);
                teamGroup.containers = calculateTeamTimeline<any>(teamGroup.containers).map((item: any) => ({`;

const deleteReplace = `            if (teamGroup && teamGroup.containers) {
                const targetCntr = teamGroup.containers[cntrIdx];
                if (targetCntr && targetCntr.manualEntryId) {
                    deleteManualReportEntry(targetCntr.manualEntryId).catch(console.error);
                }
                teamGroup.containers.splice(cntrIdx, 1);
                teamGroup.containers = calculateTeamTimeline<any>(teamGroup.containers).map((item: any) => ({`;

if (content.includes(deleteSearch)) {
    content = content.replace(deleteSearch, deleteReplace);
    console.log('Patched handleDeleteReportItem');
}

fs.writeFileSync('src/components/HomeClient.tsx', content);
