const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

// 1. Import
content = content.replace(
    "deleteManualReportEntry } from '@/lib/actions';",
    "deleteManualReportEntry, updateManualReportEntry } from '@/lib/actions';"
);

// 2. Type definition
content = content.replace(
    "const [editingReportItem, setEditingReportItem] = useState<{ teamName: string; cntrIdx: number; dateGroupIdx?: number } | null>(null);",
    "const [editingReportItem, setEditingReportItem] = useState<{ teamName: string; cntrIdx: number; dateGroupIdx?: number; cntr?: any } | null>(null);"
);

// 3. handleEditReportItem
content = content.replace(
    "setEditingReportItem({ teamName, cntrIdx, dateGroupIdx });",
    "setEditingReportItem({ teamName, cntrIdx, dateGroupIdx, cntr });"
);

// 4. handleAddManualSubmit
const findStr = `
        if (!editingReportItem) {
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

const replaceStr = `
        if (!editingReportItem) {
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
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0)
            }).catch(console.error);
        }
    };`;

content = content.replace(findStr, replaceStr);

fs.writeFileSync('src/components/HomeClient.tsx', content);
console.log("Patched HomeClient.tsx successfully.");
