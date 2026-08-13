const fs = require('fs');
const path = 'C:/Program Files (x86)/CTNR/src/components/HomeClient.tsx';

let content = fs.readFileSync(path, 'utf8');

// Fix 1: Make the asterisk optional in the regex
const oldRegexCode = `const regex = /(MAY[A-Z0-9]+)\\s*\\*\\s*([0-9]+)/gi;`;
const newRegexCode = `const regex = /(MAY[A-Z0-9]+)\\s*(?:\\*\\s*)?([0-9]+)/gi;`;
content = content.replace(oldRegexCode, newRegexCode);

// Fix 2: Remove the `.length > 0` check so it doesn't fall back to db_remark if empty boxes were explicitly saved as empty
const oldFallbackCode = `if (useWorkerSavedBoxes && job.empty_boxes && job.empty_boxes.length > 0) {`;
const newFallbackCode = `if (useWorkerSavedBoxes && job.empty_boxes) {`;
content = content.replace(oldFallbackCode, newFallbackCode);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched HomeClient.tsx successfully!');
