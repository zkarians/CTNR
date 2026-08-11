const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const regex = /updateManualReportEntry\(editingReportItem\.cntr\.manualEntryId, \{\s*workDate: reportStartDate \|\| getLocalDateString\(new Date\(\)\),\s*teamName: manualTeamName,\s*cntrNo: manualCntrNo\.trim\(\)\.toUpperCase\(\),\s*category: adminCommentStr,\s*durationMinutes: duration,\s*remark: manualRemark\.trim\(\),\s*products: validProducts,\s*emptyBoxes: manualEmptyBoxes\.filter\(e => e\.name\.trim\(\) && e\.qty > 0\)\s*\}\)\.catch\(console\.error\);/;

const fallbackRegex = /updateManualReportEntry\(editingReportItem\.cntr\.manualEntryId, \{[\s\S]*?emptyBoxes: manualEmptyBoxes\.filter\(e => e\.name\.trim\(\) && e\.qty > 0\)\s*\}\)\.catch\(console\.error\);/;

const replacementStr = `updateManualReportEntry(editingReportItem.cntr.manualEntryId, {
                workDate: reportStartDate || getLocalDateString(new Date()),
                teamName: manualTeamName,
                cntrNo: manualCntrNo.trim().toUpperCase(),
                category: adminCommentStr,
                durationMinutes: duration,
                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt
            }).catch(console.error);`;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Regex patch 9 in HomeClient.tsx completed.");
} else if (fallbackRegex.test(content)) {
    content = content.replace(fallbackRegex, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Fallback Regex patch 9 in HomeClient.tsx completed.");
} else {
    console.log("Regex 9 not found in HomeClient.tsx.");
}
