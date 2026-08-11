const fs = require('fs');

let content = fs.readFileSync('src/lib/actions.ts', 'utf8');

content = content.replace(
    /INSERT INTO manual_report_entries[\s\S]*?VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7::jsonb, \$8::jsonb\)[\s\S]*?\]\);/,
    \`INSERT INTO manual_report_entries 
                  (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes, first_uploaded_at)
                  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
              \`, [
                  params.workDate, 
                  params.teamName, 
                  params.cntrNo, 
                  params.category, 
                  params.durationMinutes, 
                  params.remark, 
                  JSON.stringify(params.products || []),
                  JSON.stringify(params.emptyBoxes || []),
                  params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()
              ]);\`
);

fs.writeFileSync('src/lib/actions.ts', content);
console.log('Regex patch applied!');
