const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const target1 = `        setReportData((prevData: any[]) => {
            let dateStr = reportStartDate || getLocalDateString(new Date());`;
const replace1 = `        let targetFirstUploadedAt: string | undefined = undefined;

        setReportData((prevData: any[]) => {
            let dateStr = reportStartDate || getLocalDateString(new Date());`;

const target2 = `            } else {
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }
                existingCntrs.splice(insertIdx, 0, newRawContainer);
            }`;

const replace2 = `            } else {
                let insertIdx = existingCntrs.length;
                if (manualInsertIndex !== 'end' && typeof manualInsertIndex === 'number') {
                    insertIdx = Math.min(Math.max(0, manualInsertIndex), existingCntrs.length);
                }
                
                if (existingCntrs.length > 0) {
                    if (insertIdx === 0) {
                        const firstTime = existingCntrs[0].firstUploadedAt ? new Date(existingCntrs[0].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(firstTime - 60000).toISOString();
                    } else if (insertIdx >= existingCntrs.length) {
                        const lastTime = existingCntrs[existingCntrs.length - 1].firstUploadedAt ? new Date(existingCntrs[existingCntrs.length - 1].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date(lastTime + 60000).toISOString();
                    } else {
                        const prevTime = existingCntrs[insertIdx - 1].firstUploadedAt ? new Date(existingCntrs[insertIdx - 1].firstUploadedAt).getTime() : new Date().getTime();
                        const nextTime = existingCntrs[insertIdx].firstUploadedAt ? new Date(existingCntrs[insertIdx].firstUploadedAt).getTime() : new Date().getTime();
                        targetFirstUploadedAt = new Date((prevTime + nextTime) / 2).toISOString();
                    }
                } else {
                    targetFirstUploadedAt = new Date().toISOString();
                }
                
                if (targetFirstUploadedAt) {
                    (newRawContainer as any).firstUploadedAt = targetFirstUploadedAt;
                }

                existingCntrs.splice(insertIdx, 0, newRawContainer);
            }`;

const target3 = `                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0)
            }).catch(console.error);
        }`;

const replace3 = `                remark: manualRemark.trim(),
                products: validProducts,
                emptyBoxes: manualEmptyBoxes.filter(e => e.name.trim() && e.qty > 0),
                firstUploadedAt: targetFirstUploadedAt
            }).catch(console.error);
        }`;

let success = true;
if (content.includes(target1)) content = content.replace(target1, replace1); else { console.error('Failed target1'); success = false; }
if (content.includes(target2)) content = content.replace(target2, replace2); else { console.error('Failed target2'); success = false; }
if (content.includes(target3)) content = content.replace(target3, replace3); else { console.error('Failed target3'); success = false; }

if (success) {
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log('HomeClient.tsx patched correctly for ordering.');
}
