const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const targetStr = `        setReportData((prevData: any[]) => {`;
const replaceStr = `        const updateData = (prevData: any[]) => {`;

const targetStrEnd = `            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        });

        setIsAddManualOpen(false);`;

const replaceStrEnd = `            setReportText(rebuildReportTextFromData(nextData));
            return nextData;
        };
        
        const nextReportData = updateData(reportData);
        setReportData(nextReportData);

        setIsAddManualOpen(false);`;

if (content.includes(targetStr) && content.includes(targetStrEnd)) {
    content = content.replace(targetStr, replaceStr);
    content = content.replace(targetStrEnd, replaceStrEnd);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("String patch 11 in HomeClient.tsx completed.");
} else {
    console.log("Target block 11 not found in HomeClient.tsx.");
}
