'use server';

import { pool } from '@/lib/db';
import { JobFilters } from '@/lib/types';
import { getWorkDateString } from '@/lib/utils/dateUtils';
import { generateJobType } from '@/lib/utils/jobType';
import { getNormalizedCarrier } from '@/lib/utils/carrierUtils';
import { calculateTeamTimeline } from '@/lib/timeline';
import { getSession } from '@/lib/auth';

export async function generateWorkReport(filters: JobFilters): Promise<{ success: boolean; reportText?: string; reportData?: any[]; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const todayWorkDateStr = getWorkDateString(new Date());
            const startDateStr = typeof filters?.startDate === 'string' ? filters.startDate.trim() : '';
            const endDateStr = typeof filters?.endDate === 'string' ? filters.endDate.trim() : '';
            const productNameStr = typeof filters?.productName === 'string' ? filters.productName.trim() : '';
            const containerNoStr = typeof filters?.containerNo === 'string' ? filters.containerNo.trim() : '';
            const targetDateStr = startDateStr || todayWorkDateStr;
            const whereClauses: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            whereClauses.push(`COALESCE(r.qty_plan, 0) > 0`);

            if (!startDateStr && !endDateStr) {
                whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`);
                params.push(`${todayWorkDateStr} 13:00:00`);
            } else {
                if (startDateStr && endDateStr) {
                    const s = new Date(startDateStr);
                    const e = new Date(endDateStr);
                    const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 31) {
                        return { success: false, error: "보고서 생성은 최대 31일 범위까지만 가능합니다. 조회 기간을 줄여주세요." };
                    }
                }
                if (startDateStr) {
                    whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`);
                    params.push(`${startDateStr} 13:00:00`);
                }
                if (endDateStr) {
                    whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx++}::date + INTERVAL '1 day 12 hours 59 minutes 59.999 seconds')`);
                    params.push(endDateStr);
                }
            }

            if (productNameStr) {
                whereClauses.push(`r.prod_name ILIKE $${paramIdx++}`);
                params.push(`%${productNameStr}%`);
            }
            if (containerNoStr) {
                whereClauses.push(`r.cntr_no ILIKE $${paramIdx++}`);
                params.push(`%${containerNoStr}%`);
            }

            const commentDateParamIdx = paramIdx++;
            params.push(targetDateStr);

            const whereSql = "WHERE " + whereClauses.join(" AND ");

            const query = `
                WITH GroupedResults AS (
                    SELECT 
                        MAX(COALESCE(p.photo_job_id, j.id)) as job_id,
                        COALESCE(r.cntr_no, j.job_name, '미지정') as cntr_no,
                        r.prod_name,
                        r.division,
                        SUM(COALESCE(r.qty_plan, 0)) as qty,
                        COALESCE(t.name, '미지정 조') as team_name,
                        BOOL_OR(p.is_completed) as is_completed,
                        COALESCE(MAX(p.uploaded_at), MAX(j.saved_at)) as work_time,
                        COALESCE(MAX(p.work_duration_minutes), 45) as duration_minutes,
                        COALESCE(MIN(p.uploaded_at), MAX(j.saved_at)) as first_uploaded_at,
                        MAX(p.remark) as remark,
                        MAX(r.transporter) as transporter,
                        MAX(cc.admin_comment) as admin_comment,
                        MAX(mp.height) as height,
                        MAX(r.remark) as db_remark
                    FROM container_results r
                    JOIN container_jobs j ON r.job_id = j.id
                    LEFT JOIN product_master_sync mp ON r.prod_name = mp.prod_name
                    LEFT JOIN (
                        SELECT 
                            cj.job_name,
                            cp.cntr_no, 
                            MAX(cp.job_id) as photo_job_id,
                            MAX(cp.team_id) as team_id,
                            MAX(cp.work_duration_minutes) as work_duration_minutes,
                            BOOL_OR(cp.is_completed) as is_completed,
                            MIN(cp.uploaded_at) as uploaded_at,
                            MAX(cp.remark) as remark
                        FROM container_photos cp
                        LEFT JOIN container_jobs cj ON cp.job_id = cj.id
                        WHERE (cp.is_deleted IS NOT TRUE)
                        GROUP BY cj.job_name, cp.cntr_no
                    ) p ON p.job_name = j.job_name AND (p.cntr_no = r.cntr_no OR (r.cntr_no IS NULL AND p.cntr_no IS NULL))
                    LEFT JOIN teams t ON p.team_id = t.id
                    LEFT JOIN container_comments cc 
                      ON cc.cntr_no = COALESCE(r.cntr_no, j.job_name, '미지정')
                     AND (cc.work_date = $${commentDateParamIdx} OR cc.work_date = '' OR cc.work_date IS NULL)
                    ${whereSql}
                    GROUP BY COALESCE(r.cntr_no, j.job_name, '미지정'), r.prod_name, r.division, t.name
                )
                SELECT gr.*,
                       (SELECT json_agg(json_build_object('name', eb.box_name, 'qty', eb.qty)) 
                        FROM container_empty_boxes eb 
                        WHERE eb.job_id = gr.job_id AND eb.cntr_no = gr.cntr_no AND eb.qty > 0) as empty_boxes
                FROM GroupedResults gr
                ORDER BY gr.team_name, gr.cntr_no, gr.prod_name
            `;

            const res = await client.query(query, params);
            const rows = res.rows;

            // Fetch Manual Report Entries
            const manualWhereClauses = [];
            const manualParams = [];
            let mParamIdx = 1;
            
            if (!filters.startDate && !filters.endDate) {
                manualWhereClauses.push(`work_date = $${mParamIdx++}`);
                manualParams.push(todayWorkDateStr);
            } else {
                if (filters.startDate) {
                    manualWhereClauses.push(`work_date >= $${mParamIdx++}`);
                    manualParams.push(filters.startDate);
                }
                if (filters.endDate) {
                    manualWhereClauses.push(`work_date <= $${mParamIdx++}`);
                    manualParams.push(filters.endDate);
                }
            }
            if (filters.containerNo) {
                manualWhereClauses.push(`cntr_no ILIKE $${mParamIdx++}`);
                manualParams.push(`%${filters.containerNo}%`);
            }
            
            const mWhereSql = manualWhereClauses.length > 0 ? "WHERE " + manualWhereClauses.join(" AND ") : "";
            const manualRes = await client.query(`SELECT * FROM manual_report_entries ${mWhereSql}`, manualParams);
            
            if (rows.length === 0 && manualRes.rows.length === 0) {
                return { success: false, error: '조건에 일치하는 작업 내역이 없습니다.' };
            }

            // Group by workDate -> teamName -> cntr_no -> products & completion & timeline info
            const dateMap = new Map<string, Map<string, Map<string, { 
                isCompleted: boolean; 
                division: string; 
                durationMinutes: number; 
                firstUploadedAt: Date;
                remark: string;
                transporter: string;
                adminComment: string;
                products: { name: string; qty: number; division: string; height?: number }[];
                emptyBoxes: any[];
                manualEntryId?: number;
            }>>>();

            for (const row of rows) {
                const teamName = row.team_name;
                if (!teamName || teamName === '미지정 조') continue;

                const cntrNo = row.cntr_no;
                const division = row.division || '일반';
                const prodName = row.prod_name;
                const qty = Math.round(Number(row.qty)) || 0;
                const height = Number(row.height) || 0;
                const isCompleted = !!row.is_completed;
                const workTime = row.work_time ? new Date(row.work_time) : new Date();
                const durationMinutes = Number(row.duration_minutes) || 45;
                const firstUploadedAt = row.first_uploaded_at ? new Date(row.first_uploaded_at) : workTime;
                const remark = row.remark || '';
                const transporter = row.transporter || '';
                const adminComment = row.admin_comment || '';
                const workDateStr = getWorkDateString(workTime);

                if (!dateMap.has(workDateStr)) dateMap.set(workDateStr, new Map());
                const teamMap = dateMap.get(workDateStr)!;

                if (!teamMap.has(teamName)) teamMap.set(teamName, new Map());
                const cntrMap = teamMap.get(teamName)!;

                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { isCompleted, division, durationMinutes, firstUploadedAt, remark, transporter, adminComment, products: [], emptyBoxes: [] });
                }
                const cntrData = cntrMap.get(cntrNo)!;
                if (remark && !cntrData.remark) cntrData.remark = remark;
                if (transporter && !cntrData.transporter) cntrData.transporter = transporter;
                if (adminComment && !cntrData.adminComment) cntrData.adminComment = adminComment;
                cntrData.products.push({ name: prodName, qty, division, height });
                
                const emptyBoxes = Array.isArray(row.empty_boxes) ? row.empty_boxes : [];
                if (emptyBoxes.length > 0 && cntrData.emptyBoxes.length === 0) {
                    cntrData.emptyBoxes = emptyBoxes;
                }
            }
            
            // Merge Manual Report Entries
            for (const mRow of manualRes.rows) {
                const workDateStr = mRow.work_date;
                const teamName = mRow.team_name;
                const cntrNo = mRow.cntr_no;
                
                if (!dateMap.has(workDateStr)) dateMap.set(workDateStr, new Map());
                const teamMap = dateMap.get(workDateStr)!;
                if (!teamMap.has(teamName)) teamMap.set(teamName, new Map());
                const cntrMap = teamMap.get(teamName)!;
                
                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { 
                        isCompleted: true, 
                        division: 'DFZ', 
                        durationMinutes: mRow.duration_minutes || 45, 
                        firstUploadedAt: mRow.first_uploaded_at ? new Date(mRow.first_uploaded_at) : new Date(), 
                        remark: mRow.remark || '', 
                        transporter: mRow.transporter || '',
                        adminComment: mRow.category || '', 
                        products: [], 
                        emptyBoxes: [],
                        manualEntryId: mRow.id
                    });
                }
                
                const cntrData = cntrMap.get(cntrNo)!;
                
                const mProducts = mRow.products || [];
                for (const p of mProducts) {
                    cntrData.products.push({ name: p.name, qty: p.qty, division: p.division || 'DFZ', height: 0 });
                }
                
                const mEmptyBoxes = mRow.empty_boxes || [];
                if (mEmptyBoxes.length > 0) {
                    cntrData.emptyBoxes.push(...mEmptyBoxes);
                }
            }

            const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
            let lines: string[] = [];
            lines.push(`📋 [일자별 작업 현황 보고서]`);

            sortedDates.forEach(dateStr => {
                lines.push(`📅 ${dateStr} 작업 분량`);
                
                const teamMap = dateMap.get(dateStr)!;
                let totalContainersSum = 0;
                teamMap.forEach(cntrMap => {
                    totalContainersSum += cntrMap.size;
                });

                const dayNum = parseInt(dateStr.split('-')[2]);
                lines.push(`총합계: ${dayNum}일 ${totalContainersSum}개 작업완료`);
                lines.push(``);

                const teamsList: { name: string; lines: string[] }[] = [];

                teamMap.forEach((cntrMap, teamName) => {
                    const upLines = [];
                    const totalContainers = cntrMap.size;
                    upLines.push(`■ ${teamName} (합계 ${totalContainers}개)`);

                    const cntrList = Array.from(cntrMap.entries()).map(([cntrNo, data]) => ({
                        cntrNo,
                        ...data
                    })).sort((a, b) => a.firstUploadedAt.getTime() - b.firstUploadedAt.getTime());

                    const timelineList = calculateTeamTimeline(cntrList);

                    timelineList.forEach((cntrData) => {
                        const modelCount = cntrData.products.length;
                        const totalQty = cntrData.products.reduce((sum, p) => sum + p.qty, 0);
                        const breakNote = cntrData.hasBreak ? ' *휴식/식사포함*' : '';
                        const autoJobType = generateJobType(cntrData.products);
                        const displayComment = cntrData.adminComment || autoJobType;
                        const adminCommentNote = displayComment ? ` (${displayComment})` : '';
                        upLines.push(`${cntrData.cntrNo} (${modelCount}모델, ${totalQty.toLocaleString()}개${adminCommentNote}) [${cntrData.durationMinutes}분: ${cntrData.startTimeStr}~${cntrData.endTimeStr}${breakNote}]`);
                        if (cntrData.remark && cntrData.remark.trim()) {
                            upLines.push(`- 💬 지연사유: ${cntrData.remark.trim()}`);
                        }
                        for (const prod of cntrData.products) {
                            upLines.push(`- [${prod.division}] ${prod.name} ${prod.qty.toLocaleString()}개`);
                        }
                        if (cntrData.emptyBoxes && cntrData.emptyBoxes.length > 0) {
                            for (const eb of cntrData.emptyBoxes) {
                                upLines.push(`- 📦 [공박스] ${eb.name} ${eb.qty.toLocaleString()}개`);
                            }
                        }
                        upLines.push(``);
                    });

                    teamsList.push({
                        name: teamName,
                        lines: upLines
                    });
                });

                const chunkSize = 4;
                for (let i = 0; i < teamsList.length; i += chunkSize) {
                    const chunk = teamsList.slice(i, i + chunkSize);
                    const maxLines = Math.max(...chunk.map(up => up.lines.length));
                    
                    chunk.forEach(up => {
                        while (up.lines.length < maxLines) {
                            up.lines.push('');
                        }
                    });

                    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
                        const mergedLine = chunk
                            .map(up => up.lines[lineIdx])
                            .join('\t');
                        lines.push(mergedLine);
                    }
                    lines.push(``);
                }
            });

            const reportData = sortedDates.map(dateStr => {
                const teamMap = dateMap.get(dateStr)!;
                const teamsList: any[] = [];
                const carrierCounts: Record<string, number> = {};

                teamMap.forEach((cntrMap, teamName) => {
                    const cntrList = Array.from(cntrMap.entries()).map(([cntrNo, data]) => ({
                        cntrNo,
                        ...data
                    })).sort((a, b) => a.firstUploadedAt.getTime() - b.firstUploadedAt.getTime());

                    const timelineList = calculateTeamTimeline(cntrList);

                    const containersList = timelineList.map((cntrData) => {
                        const carrierKey = getNormalizedCarrier(cntrData.transporter);
                        carrierCounts[carrierKey] = (carrierCounts[carrierKey] || 0) + 1;

                        return {
                            cntrNo: cntrData.cntrNo,
                            isCompleted: cntrData.isCompleted,
                            division: cntrData.division,
                            durationMinutes: cntrData.durationMinutes,
                            startTimeStr: cntrData.startTimeStr,
                            endTimeStr: cntrData.endTimeStr,
                            hasBreak: cntrData.hasBreak,
                            remark: cntrData.remark,
                            transporter: cntrData.transporter,
                            adminComment: cntrData.adminComment,
                            products: cntrData.products,
                            emptyBoxes: cntrData.emptyBoxes || [],
                            firstUploadedAt: cntrData.firstUploadedAt ? cntrData.firstUploadedAt.toISOString() : undefined,
                            manualEntryId: cntrData.manualEntryId
                        };
                    });

                    teamsList.push({
                        teamName,
                        containers: containersList
                    });
                });
                return {
                    dateStr,
                    uploaders: teamsList,
                    carrierCounts
                };
            });

            return {
                success: true,
                reportData,
                reportText: lines.join('\n')
            };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("generateWorkReport Error:", error);
        return { success: false, error: `보고서 생성 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}

export async function saveDailyWorkReport({
    workDate,
    reportText,
    reportData,
    savedBy
}: {
    workDate: string;
    reportText: string;
    reportData?: any;
    savedBy?: string;
}): Promise<{ success: boolean; message?: string; error?: string; updatedAt?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                CREATE TABLE IF NOT EXISTS daily_work_reports (
                    work_date VARCHAR(20) PRIMARY KEY,
                    report_text TEXT NOT NULL,
                    report_data JSONB,
                    saved_by VARCHAR(100),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            const res = await client.query(`
                INSERT INTO daily_work_reports (work_date, report_text, report_data, saved_by, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (work_date)
                DO UPDATE SET
                    report_text = EXCLUDED.report_text,
                    report_data = EXCLUDED.report_data,
                    saved_by = EXCLUDED.saved_by,
                    updated_at = NOW()
                RETURNING updated_at;
            `, [workDate, reportText, JSON.stringify(reportData || []), savedBy || '관리자']);

            await client.query('COMMIT');
            const updatedAt = res.rows[0]?.updated_at;

            return {
                success: true,
                message: `${workDate} 보고서가 성공적으로 저장되었습니다.`,
                updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString()
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("saveDailyWorkReport Error:", err);
        return { success: false, error: `보고서 저장 오류: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function getSavedDailyWorkReport(workDate: string): Promise<{ success: boolean; reportText?: string; reportData?: any[]; savedBy?: string; updatedAt?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS daily_work_reports (
                    work_date VARCHAR(20) PRIMARY KEY,
                    report_text TEXT NOT NULL,
                    report_data JSONB,
                    saved_by VARCHAR(100),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            const res = await client.query(`
                SELECT work_date, report_text, report_data, saved_by, updated_at
                FROM daily_work_reports
                WHERE work_date = $1
            `, [workDate]);

            if (res.rows.length === 0) {
                return { success: false, error: `${workDate}에 저장된 보고서가 없습니다.` };
            }

            const row = res.rows[0];
            let parsedData = [];
            try {
                parsedData = typeof row.report_data === 'string' ? JSON.parse(row.report_data) : (row.report_data || []);
            } catch (e) {
                parsedData = [];
            }

            return {
                success: true,
                reportText: row.report_text,
                reportData: parsedData,
                savedBy: row.saved_by,
                updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
            };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("getSavedDailyWorkReport Error:", err);
        return { success: false, error: `저장된 보고서 조회 오류: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function addManualReportEntry(params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
    transporter?: string;
    durationMinutes: number;
    remark: string;
    products: any[];
    emptyBoxes: any[];
    firstUploadedAt?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO manual_report_entries 
                  (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes, first_uploaded_at, transporter)
                  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
            `, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products || []),
                JSON.stringify(params.emptyBoxes || []),
                params.firstUploadedAt || new Date().toISOString(),
                params.transporter || ''
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

export async function updateManualReportEntry(id: number, params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
    transporter?: string;
    durationMinutes: number;
    remark: string;
    products: any[];
    emptyBoxes: any[];
    firstUploadedAt?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }
        const client = await pool.connect();
        try {
            if (params.firstUploadedAt) {
                await client.query(`
                    UPDATE manual_report_entries 
                      SET work_date = $1, team_name = $2, cntr_no = $3, category = $4, duration_minutes = $5, remark = $6, products = $7::jsonb, empty_boxes = $8::jsonb, first_uploaded_at = $10, transporter = $11
                      WHERE id = $9
                `, [
                    params.workDate, 
                    params.teamName, 
                    params.cntrNo, 
                    params.category, 
                    params.durationMinutes, 
                    params.remark, 
                    JSON.stringify(params.products || []),
                    JSON.stringify(params.emptyBoxes || []),
                    id,
                    params.firstUploadedAt,
                    params.transporter || ''
                ]);
            } else {
                await client.query(`
                    UPDATE manual_report_entries 
                      SET work_date = $1, team_name = $2, cntr_no = $3, category = $4, duration_minutes = $5, remark = $6, products = $7::jsonb, empty_boxes = $8::jsonb, transporter = $10
                      WHERE id = $9
                `, [
                    params.workDate, 
                    params.teamName, 
                    params.cntrNo, 
                    params.category, 
                    params.durationMinutes, 
                    params.remark, 
                    JSON.stringify(params.products || []),
                    JSON.stringify(params.emptyBoxes || []),
                    id,
                    params.transporter || ''
                ]);
            }
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateManualReportEntry Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateContainerReportDetails(params: {
    cntrNo: string;
    durationMinutes: number;
    remark: string;
    category?: string;
    workDate?: string;
    emptyBoxes?: any[];
}): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // 1. Update container_photos remark and work_duration_minutes
            await client.query(`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = $2
                WHERE UPPER(TRIM(cntr_no)) = UPPER(TRIM($3))
                  AND (is_deleted IS NOT TRUE)
            `, [params.durationMinutes, params.remark || '', params.cntrNo]);

            // 2. Update container_comments if category provided
            if (params.category !== undefined) {
                const targetWorkDate = params.workDate || getWorkDateString(new Date());
                await client.query(`
                    INSERT INTO container_comments (work_date, cntr_no, admin_comment, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (work_date, cntr_no)
                    DO UPDATE SET admin_comment = EXCLUDED.admin_comment, updated_at = NOW()
                `, [targetWorkDate, params.cntrNo, params.category]);
            }

            // 3. Update empty boxes if provided
            if (params.emptyBoxes && params.emptyBoxes.length > 0) {
                const jobRes = await client.query(`
                    SELECT MAX(job_id) as job_id FROM container_photos WHERE UPPER(TRIM(cntr_no)) = UPPER(TRIM($1))
                `, [params.cntrNo]);
                const jobId = jobRes.rows[0]?.job_id;
                if (jobId) {
                    for (const box of params.emptyBoxes) {
                        if (box.name && box.qty > 0) {
                            await client.query(`
                                INSERT INTO container_empty_boxes (job_id, cntr_no, box_name, qty, is_worker_edited)
                                VALUES ($1, $2, $3, $4, true)
                                ON CONFLICT (job_id, cntr_no, box_name) DO UPDATE 
                                SET qty = EXCLUDED.qty, is_worker_edited = true, updated_at = CURRENT_TIMESTAMP
                            `, [jobId, params.cntrNo, box.name, box.qty]);
                        }
                    }
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
    } catch (err: any) {
        console.error("updateContainerReportDetails Error:", err);
        return { success: false, error: err?.message || 'DB update error' };
    }
}
