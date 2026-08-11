const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const targetStr = `            if (teamGroup && teamGroup.containers) {
                teamGroup.containers.splice(cntrIdx, 1);
                teamGroup.containers = calculateTeamTimeline<any>(teamGroup.containers).map((item: any) => ({
                    ...item,
                    workTimeStr: \`\${item.durationMinutes}분 (\${item.startTimeStr}~\${item.endTimeStr}\${item.hasBreak ? ' *식사/휴식*' : ''})\`
                }));
            }`;

const replacementStr = `            if (teamGroup && teamGroup.containers) {
                const container = teamGroup.containers[cntrIdx];
                if (container && container.manualEntryId) {
                    deleteManualReportEntry(container.manualEntryId).catch(console.error);
                }
                teamGroup.containers.splice(cntrIdx, 1);
                teamGroup.containers = calculateTeamTimeline<any>(teamGroup.containers).map((item: any) => ({
                    ...item,
                    workTimeStr: \`\${item.durationMinutes}분 (\${item.startTimeStr}~\${item.endTimeStr}\${item.hasBreak ? ' *식사/휴식*' : ''})\`
                }));
            }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log('Successfully patched HomeClient.tsx!');
} else {
    console.error('Could not find target string in HomeClient.tsx.');
    // Try a more robust regex patch
    const regex = /if \(teamGroup && teamGroup\.containers\) \{[\s\n\r]*teamGroup\.containers\.splice\(cntrIdx, 1\);/;
    const repl = `if (teamGroup && teamGroup.containers) {\n                const container = teamGroup.containers[cntrIdx];\n                if (container && container.manualEntryId) {\n                    deleteManualReportEntry(container.manualEntryId).catch(console.error);\n                }\n                teamGroup.containers.splice(cntrIdx, 1);`;
    if (regex.test(content)) {
        content = content.replace(regex, repl);
        fs.writeFileSync('src/components/HomeClient.tsx', content);
        console.log('Successfully patched HomeClient.tsx using regex!');
    } else {
        console.error('Regex patch also failed.');
    }
}
