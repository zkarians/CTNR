const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const targetStr = `        let remark = cntr.lastRemark || '';
        if (remark.startsWith('지연사유: ')) {`;

const replaceStr = `        let remark = cntr.remark || cntr.lastRemark || '';
        if (remark.startsWith('지연사유: ')) {`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Remark patch completed.");
} else {
    console.log("Target block not found.");
}
