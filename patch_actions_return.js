const fs = require('fs');

let content = fs.readFileSync('src/lib/actions.ts', 'utf8');

const targetObjStr = `                            emptyBoxes: cntrData.emptyBoxes || []
                        };
                    });`;

const replacementObjStr = `                            emptyBoxes: cntrData.emptyBoxes || [],
                            firstUploadedAt: cntrData.firstUploadedAt,
                            manualEntryId: cntrData.manualEntryId
                        };
                    });`;

if (content.includes(targetObjStr)) {
    content = content.replace(targetObjStr, replacementObjStr);
    fs.writeFileSync('src/lib/actions.ts', content);
    console.log('actions.ts return block patched successfully');
} else {
    // try regex with any line endings
    const regex = /emptyBoxes:\s*cntrData\.emptyBoxes\s*\|\|\s*\[\]\s*\};\s*\}\);/;
    if (regex.test(content)) {
        content = content.replace(regex, `emptyBoxes: cntrData.emptyBoxes || [],\n                            firstUploadedAt: cntrData.firstUploadedAt,\n                            manualEntryId: cntrData.manualEntryId\n                        };\n                    });`);
        fs.writeFileSync('src/lib/actions.ts', content);
        console.log('actions.ts return block patched successfully using regex');
    } else {
        console.error('Failed to find return block in actions.ts');
    }
}
