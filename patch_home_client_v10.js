const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

// The block to replace
const targetStr = `        if (!editingReportItem) {
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

const replaceStr = `        if (!editingReportItem) {
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

// Try exact string replacement
if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("String patch 10 in HomeClient.tsx completed.");
} else {
    // Regex replacement if string not found due to newline differences
    const regex = /if \(\!editingReportItem\) \{[\s\S]*?addManualReportEntry\(\{[\s\S]*?\}\)\.catch\(console\.error\);\s*\}\s*\};\s*/;
    if (regex.test(content)) {
        content = content.replace(regex, replaceStr + "\n");
        fs.writeFileSync('src/components/HomeClient.tsx', content);
        console.log("Regex patch 10 in HomeClient.tsx completed.");
    } else {
        console.log("Target block 10 not found in HomeClient.tsx.");
    }
}
