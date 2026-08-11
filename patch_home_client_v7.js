const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const regex = /const handleEditReportItem = \(teamName: string, cntrIdx: number, cntr: any, dateGroupIdx\?: number\) => \{\s*setEditingReportItem\(\{ teamName, cntrIdx, dateGroupIdx, cntr \}\);\s*setManualTeamName\(teamName\);/;

const replacementStr = `const handleEditReportItem = (teamName: string, cntrIdx: number, cntr: any, dateGroupIdx?: number) => {
        setEditingReportItem({ teamName, cntrIdx, dateGroupIdx, cntr });
        setManualInsertIndex(cntrIdx);
        setManualTeamName(teamName);`;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Regex patch 7 in HomeClient.tsx completed.");
} else {
    console.log("Regex 7 not found in HomeClient.tsx.");
}
