const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const regexStart = /setReportData\(\(prevData: any\[\]\) => \{/g;
const regexEnd = /teamGroup\.containers = recalculatedTimeline;\s*setReportText\(rebuildReportTextFromData\(nextData\)\);\s*return nextData;\s*\}\);\s*setIsAddManualOpen\(false\);/g;

// Only replace the LAST match of the end regex (since it might exist elsewhere)
// Wait, the end regex is specific enough with `setIsAddManualOpen`.

// But wait, the `setReportData` occurs multiple times.
// We should replace only the specific one inside handleAddManualSubmit.

const targetBlockRegex = /let targetFirstUploadedAt: string \| undefined = undefined;\s*setReportData\(\(prevData: any\[\]\) => \{([\s\S]*?teamGroup\.containers = recalculatedTimeline;\s*setReportText\(rebuildReportTextFromData\(nextData\)\);\s*return nextData;\s*)\}\);\s*setIsAddManualOpen\(false\);/;

const replacementStr = `let targetFirstUploadedAt: string | undefined = undefined;

        const updateData = (prevData: any[]) => {
$1};
        
        const nextReportData = updateData(reportData);
        setReportData(nextReportData);

        setIsAddManualOpen(false);`;

if (targetBlockRegex.test(content)) {
    content = content.replace(targetBlockRegex, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Regex patch 12 in HomeClient.tsx completed.");
} else {
    console.log("Regex 12 not found in HomeClient.tsx.");
}
