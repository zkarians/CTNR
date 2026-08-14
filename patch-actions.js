const fs = require('fs');
const path = 'C:/Program Files (x86)/CTNR/src/lib/actions.ts';

let content = fs.readFileSync(path, 'utf8');

const oldFunc = `export async function updateContainerWorkDuration(
    jobId: number,
    cntrNo: string,
    durationMinutes: number,
    remark?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(\`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = $2
                WHERE job_id = $3 
                  AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) 
                  AND (is_deleted IS NOT TRUE)
            \`, [durationMinutes, remark || '', jobId, cntrNo]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerWorkDuration Error:", error);
        return { success: false, error: \`에러: \${error?.message || '알 수 없는 에러'}\` };
    }
}`;

const newFunc = `export async function updateContainerWorkDuration(
    jobId: number,
    cntrNo: string,
    durationMinutes: number,
    remark?: string,
    emptyBoxes?: { name: string; qty: number }[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            await client.query(\`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = $2
                WHERE job_id = $3 
                  AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) 
                  AND (is_deleted IS NOT TRUE)
            \`, [durationMinutes, remark || '', jobId, cntrNo]);

            if (emptyBoxes) {
                if (emptyBoxes.length > 0) {
                    for (const box of emptyBoxes) {
                        await client.query(\`
                            INSERT INTO container_empty_boxes (job_id, cntr_no, box_name, qty, is_worker_edited)
                            VALUES ($1, $2, $3, $4, true)
                            ON CONFLICT (job_id, cntr_no, box_name) DO UPDATE 
                            SET qty = EXCLUDED.qty, is_worker_edited = true, updated_at = CURRENT_TIMESTAMP
                        \`, [jobId, cntrNo, box.name, box.qty]);
                    }
                    const boxNames = emptyBoxes.map(b => b.name);
                    await client.query(\`
                        DELETE FROM container_empty_boxes 
                        WHERE job_id = $1 AND cntr_no = $2 AND box_name != ALL($3)
                    \`, [jobId, cntrNo, boxNames]);
                } else {
                    await client.query(\`
                        DELETE FROM container_empty_boxes 
                        WHERE job_id = $1 AND cntr_no = $2
                    \`, [jobId, cntrNo]);
                }
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerWorkDuration Error:", error);
        return { success: false, error: \`서버 오류: \${error?.message || '알 수 없는 오류'}\` };
    }
}`;

if (content.includes('durationMinutes: number,\n    remark?: string\n)')) {
    content = content.replace(oldFunc, newFunc);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Patched actions.ts successfully!');
} else {
    console.log('Target string not found in actions.ts. Patch failed.');
}
