const fs = require('fs');
let code = fs.readFileSync('src/lib/packer/core.ts', 'utf8');

code = code.replace(
    'const wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false, isMixedWidthSpecialJob);',
    `const wallItems = blockPackShelf(container.width, container.height, limitD, allProducts, tempU, false, isMixedWidthSpecialJob);
    if (limitD === 665 || limitD === 680 || limitD === 935) console.log("blockPackShelf limitD:", limitD, "returned wallItems.length:", wallItems.length);`
);

fs.writeFileSync('src/lib/packer/core_temp2.ts', code);
