const fs = require('fs');
let content = fs.readFileSync('src/lib/actions.ts', 'utf8');

const target1 = '(work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes)';
const replacement1 = '(work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes, first_uploaded_at)';

const target2 = 'VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)';
const replacement2 = 'VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)';

const target3 = 'JSON.stringify(params.emptyBoxes || [])\n            ]);';
const replacement3 = 'JSON.stringify(params.emptyBoxes || []),\n                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()\n            ]);';
const target4 = 'JSON.stringify(params.emptyBoxes || [])\\r\\n            ]);';

if (content.includes(target1) && content.includes(target2)) {
    content = content.replace(target1, replacement1);
    content = content.replace(target2, replacement2);
    
    if (content.includes('JSON.stringify(params.emptyBoxes || [])\\r\\n            ]);')) {
        content = content.replace('JSON.stringify(params.emptyBoxes || [])\\r\\n            ]);', 'JSON.stringify(params.emptyBoxes || []),\\r\\n                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()\\r\\n            ]);');
    } else if (content.includes('JSON.stringify(params.emptyBoxes || [])\r\n            ]);')) {
        content = content.replace('JSON.stringify(params.emptyBoxes || [])\r\n            ]);', 'JSON.stringify(params.emptyBoxes || []),\r\n                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()\r\n            ]);');
    } else if (content.includes('JSON.stringify(params.emptyBoxes || [])\n            ]);')) {
        content = content.replace('JSON.stringify(params.emptyBoxes || [])\n            ]);', 'JSON.stringify(params.emptyBoxes || []),\n                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()\n            ]);');
    } else {
        console.error('Could not find target3');
        // Let's do regex replace for target3 to be safe
        content = content.replace(/JSON\.stringify\(params\.emptyBoxes \|\| \[\]\)[\r\n\s]*\]\);/, 'JSON.stringify(params.emptyBoxes || []),\n                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()\n            ]);');
    }
    
    fs.writeFileSync('src/lib/actions.ts', content);
    console.log('Successfully patched actions.ts!');
} else {
    console.error('Could not find target1 or target2');
}
