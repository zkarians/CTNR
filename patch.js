const fs = require('fs');
let code = fs.readFileSync('src/lib/packer/core_temp.ts', 'utf8');

code = code.replace(
    'const rowCount = Math.min(fitCount, combinedAvail);',
    `const rowCount = Math.min(fitCount, combinedAvail);
if (to.type === 'lay' && to.w === 935) console.log("lay w=935:", "fitCountW", fitCountW, "fitCountL", fitCountL, "combinedAvail", combinedAvail, "rowCount", rowCount);`
);

code = code.replace(
    'if (!hasSupportAtZInTemp(targetX, targetYRel, to.w, to.l, curZ, tempItems)) {',
    `let supp = hasSupportAtZInTemp(targetX, targetYRel, to.w, to.l, curZ, tempItems);
if (to.type === 'lay' && to.w === 935) console.log("targetX:", targetX, "targetYRel:", targetYRel, "supp:", supp);
if (!supp) {`
);

code = code.replace(
    'if (stacked >= 10) {',
    `if (to.type === 'lay' && to.w === 935) console.log("stacked:", stacked);
if (stacked >= 10) {`
);

code = code.replace(
    /if \(overlap\) \{\s*continue;\s*\}/g,
    `if (to.type === 'lay' && to.w === 935) console.log("overlap:", overlap);
if (overlap) continue;`
);

fs.writeFileSync('src/lib/packer/core_temp.ts', code);
