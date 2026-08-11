const fs = require('fs');

let content = fs.readFileSync('src/lib/actions.ts', 'utf8');

const target1 = `            const res = await client.query(query, params);
            const rows = res.rows;

            if (rows.length === 0) {
                return { success: false, error: '조건에 일치하는 작업 내역이 없습니다.' };
            }`;

const replacement1 = `            const res = await client.query(query, params);
            const rows = res.rows;

            // --- Fetch Manual Report Entries ---
            const manualWhereClauses = [];
            const manualParams = [];
            let mParamIdx = 1;
            
            if (!filters.startDate && !filters.endDate) {
                manualWhereClauses.push(\`work_date = $\${mParamIdx++}\`);
                manualParams.push(todayWorkDateStr);
            } else {
                if (filters.startDate) {
                    manualWhereClauses.push(\`work_date >= $\${mParamIdx++}\`);
                    manualParams.push(filters.startDate);
                }
                if (filters.endDate) {
                    manualWhereClauses.push(\`work_date <= $\${mParamIdx++}\`);
                    manualParams.push(filters.endDate);
                }
            }
            if (filters.containerNo) {
                manualWhereClauses.push(\`cntr_no ILIKE $\${mParamIdx++}\`);
                manualParams.push(\`%\${filters.containerNo}%\`);
            }
            
            const mWhereSql = manualWhereClauses.length > 0 ? "WHERE " + manualWhereClauses.join(" AND ") : "";
            const manualRes = await client.query(\`SELECT * FROM manual_report_entries \${mWhereSql}\`, manualParams);
            
            if (rows.length === 0 && manualRes.rows.length === 0) {
                return { success: false, error: '조건에 일치하는 작업 내역이 없습니다.' };
            }`;

const target2 = `                if (emptyBoxes.length > 0 && cntrData.emptyBoxes.length === 0) {
                    cntrData.emptyBoxes = emptyBoxes;
                }
            }`;

const replacement2 = `                if (emptyBoxes.length > 0 && cntrData.emptyBoxes.length === 0) {
                    cntrData.emptyBoxes = emptyBoxes;
                }
            }
            
            // --- Merge Manual Report Entries ---
            for (const mRow of manualRes.rows) {
                const workDateStr = mRow.work_date;
                const teamName = mRow.team_name;
                const cntrNo = mRow.cntr_no;
                
                if (!dateMap.has(workDateStr)) dateMap.set(workDateStr, new Map());
                const teamMap = dateMap.get(workDateStr);
                if (!teamMap.has(teamName)) teamMap.set(teamName, new Map());
                const cntrMap = teamMap.get(teamName);
                
                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { 
                        isCompleted: true, 
                        division: 'DFZ', 
                        durationMinutes: mRow.duration_minutes || 45, 
                        firstUploadedAt: new Date(), 
                        remark: mRow.remark || '', 
                        transporter: '', 
                        adminComment: mRow.category || '', 
                        products: [], 
                        emptyBoxes: [] 
                    });
                }
                
                const cntrData = cntrMap.get(cntrNo);
                
                const mProducts = mRow.products || [];
                for (const p of mProducts) {
                    cntrData.products.push({ name: p.name, qty: p.qty, division: p.division || 'DFZ', height: 0 });
                }
                
                const mEmptyBoxes = mRow.empty_boxes || [];
                if (mEmptyBoxes.length > 0) {
                    cntrData.emptyBoxes.push(...mEmptyBoxes);
                }
            }`;

if (content.includes(target1) && content.includes(target2)) {
    content = content.replace(target1, replacement1);
    content = content.replace(target2, replacement2);
    fs.writeFileSync('src/lib/actions.ts', content);
    console.log('actions.ts updated for manual report entries.');
} else {
    console.log('target1 found:', content.includes(target1));
    console.log('target2 found:', content.includes(target2));
}
