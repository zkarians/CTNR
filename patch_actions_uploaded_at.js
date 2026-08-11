const fs = require('fs');
let content = fs.readFileSync('src/lib/actions.ts', 'utf8');

// 1. Update addManualReportEntry signature and query
const addManualSearch = `export async function addManualReportEntry(params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
    durationMinutes: number;
    remark: string;
    products: any[];
    emptyBoxes: any[];
}): Promise<{ success: boolean; error?: string }> {`;

const addManualReplace = `export async function addManualReportEntry(params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
    durationMinutes: number;
    remark: string;
    products: any[];
    emptyBoxes: any[];
    firstUploadedAt?: string;
}): Promise<{ success: boolean; error?: string }> {`;

content = content.replace(addManualSearch, addManualReplace);

const querySearch = `                INSERT INTO manual_report_entries 
                (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
            \`, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products), 
                JSON.stringify(params.emptyBoxes)
            ]);`;

const queryReplace = `                INSERT INTO manual_report_entries 
                (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes, first_uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
            \`, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products), 
                JSON.stringify(params.emptyBoxes),
                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()
            ]);`;

content = content.replace(querySearch, queryReplace);

// 2. Update generateWorkReport to use mRow.first_uploaded_at
const generateSearch = `                        isCompleted: true, 
                        division: 'DFZ', 
                        durationMinutes: mRow.duration_minutes || 45, 
                        firstUploadedAt: new Date(), 
                        remark: mRow.remark || '', `;

const generateReplace = `                        isCompleted: true, 
                        division: 'DFZ', 
                        durationMinutes: mRow.duration_minutes || 45, 
                        firstUploadedAt: mRow.first_uploaded_at ? new Date(mRow.first_uploaded_at) : new Date(), 
                        remark: mRow.remark || '', `;

content = content.replace(generateSearch, generateReplace);

fs.writeFileSync('src/lib/actions.ts', content);
console.log('actions.ts patched');
