const fs = require('fs');

const codeToAppend = `

export async function addManualReportEntry(params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
    durationMinutes: number;
    remark: string;
    products: any[];
    emptyBoxes: any[];
}): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }
        const client = await pool.connect();
        try {
            await client.query(\`
                INSERT INTO manual_report_entries 
                (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
            \`, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products || []),
                JSON.stringify(params.emptyBoxes || [])
            ]);
        } finally {
            client.release();
        }
        return { success: true };
    } catch (err: any) {
        console.error('addManualReportEntry Error:', err);
        return { success: false, error: err?.message || 'DB insert error' };
    }
}

export async function deleteManualReportEntry(id: number): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }
        const client = await pool.connect();
        try {
            await client.query('DELETE FROM manual_report_entries WHERE id = $1', [id]);
        } finally {
            client.release();
        }
        return { success: true };
    } catch (err: any) {
        console.error('deleteManualReportEntry Error:', err);
        return { success: false, error: err?.message || 'DB delete error' };
    }
}
`;

fs.appendFileSync('src/lib/actions.ts', codeToAppend);
console.log('Functions appended to actions.ts');
