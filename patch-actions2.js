const fs = require('fs');
const content = fs.readFileSync('src/lib/actions.ts', 'utf8');

const newCode = `
export async function updateManualReportEntry(id: number, params: {
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
                UPDATE manual_report_entries 
                SET work_date = $1, team_name = $2, cntr_no = $3, category = $4, duration_minutes = $5, remark = $6, products = $7::jsonb, empty_boxes = $8::jsonb
                WHERE id = $9
            \`, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products || []),
                JSON.stringify(params.emptyBoxes || []),
                id
            ]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateManualReportEntry Error:", error);
        return { success: false, error: error.message };
    }
}
`;

if (!content.includes('updateManualReportEntry')) {
    fs.writeFileSync('src/lib/actions.ts', content.trim() + '\n\n' + newCode);
    console.log("Appended.");
} else {
    console.log("Already exists.");
}
