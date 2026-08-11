"use server";

import fs from 'fs';
import path from 'path';
import {
    getJobsFromDB,
    getProductsForJob,
    pool,
    resetPool
} from "./db";
import { Product, Job, JobFilters, DbConfig, Team } from "./types";
import { calculateTeamTimeline } from "./timeline";
import { generateJobType } from "./utils/jobType";
import {
    updatePassword as updatePass,
    getAllUsers as fetchAllUsers,
    createUserAccount,
    updateUserAccount,
    deleteUserAccount,
    deleteMultipleUserAccounts,
    selectTeam as selectTeamInSession,
    getSession
} from "./auth";

export { fetchAllUsers, createUserAccount, updateUserAccount, deleteUserAccount, deleteMultipleUserAccounts };

// ────────────────────────────────────────────────────────
// 조(Team) 관련 서버 액션
// ────────────────────────────────────────────────────────

export async function fetchTeams(): Promise<Team[]> {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query(`SELECT id, name FROM teams ORDER BY id ASC`);
            return res.rows;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("fetchTeams Error:", error);
        return [];
    }
}

export async function createTeam(name: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }
        const trimmed = name.trim();
        if (!trimmed) return { success: false, error: "조 이름을 입력해주세요." };

        const client = await pool.connect();
        try {
            await client.query(`INSERT INTO teams (name) VALUES ($1)`, [trimmed]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        if (error.code === '23505') return { success: false, error: "이미 존재하는 조 이름입니다." };
        console.error("createTeam Error:", error);
        return { success: false, error: "조 추가 중 오류가 발생했습니다." };
    }
}

export async function updateTeam(id: number, name: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }
        const trimmed = name.trim();
        if (!trimmed) return { success: false, error: "조 이름을 입력해주세요." };

        const client = await pool.connect();
        try {
            const oldRes = await client.query(`SELECT name FROM teams WHERE id = $1`, [id]);
            const oldName = oldRes.rows[0]?.name;

            const res = await client.query(`UPDATE teams SET name = $1 WHERE id = $2`, [trimmed, id]);
            if (res.rowCount === 0) return { success: false, error: "조를 찾을 수 없습니다." };

            if (oldName) {
                const cleanOld = oldName.replace(/\s*\([^)]*\)/g, '').trim();
                await client.query(
                    `UPDATE users SET team_name = $1 WHERE team_name = $2 OR team_name = $3 OR team_name ILIKE $4`,
                    [trimmed, oldName, cleanOld, `${cleanOld}(%`]
                );
            }
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        if (error.code === '23505') return { success: false, error: "이미 존재하는 조 이름입니다." };
        console.error("updateTeam Error:", error);
        return { success: false, error: "조 수정 중 오류가 발생했습니다." };
    }
}

export async function deleteTeam(id: number): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }
        const client = await pool.connect();
        try {
            await client.query(`UPDATE container_photos SET team_id = NULL WHERE team_id = $1`, [id]);
            await client.query(`DELETE FROM teams WHERE id = $1`, [id]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("deleteTeam Error:", error);
        return { success: false, error: "조 삭제 중 오류가 발생했습니다." };
    }
}

export async function selectTeam(teamId: number): Promise<{ success: boolean; error?: string }> {
    return selectTeamInSession(teamId);
}


export async function getDbConfig(): Promise<DbConfig> {
    return {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'excel',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '5432'),
        trash_retention_days: parseInt(process.env.TRASH_RETENTION_DAYS || '15', 10),
        upload_dir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    };
}

export async function updateDbConfig(config: DbConfig): Promise<{ success: boolean; message: string }> {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const lines = envContent.split('\n');
        const newLines = lines.map(line => {
            const [key] = line.split('=');
            if (key === 'DB_USER') return `DB_USER=${config.user}`;
            if (key === 'DB_HOST') return `DB_HOST=${config.host}`;
            if (key === 'DB_NAME') return `DB_NAME=${config.database}`;
            if (key === 'DB_PASSWORD' && config.password) return `DB_PASSWORD=${config.password}`;
            if (key === 'DB_PORT') return `DB_PORT=${config.port}`;
            if (key === 'TRASH_RETENTION_DAYS') return `TRASH_RETENTION_DAYS=${config.trash_retention_days || 15}`;
            if (key === 'UPLOAD_DIR') return `UPLOAD_DIR=${config.upload_dir || ''}`;
            return line;
        });

        // Add missing keys
        const keys = newLines.map(l => l.split('=')[0]);
        if (!keys.includes('DB_USER')) newLines.push(`DB_USER=${config.user}`);
        if (!keys.includes('DB_HOST')) newLines.push(`DB_HOST=${config.host}`);
        if (!keys.includes('DB_NAME')) newLines.push(`DB_NAME=${config.database}`);
        if (!keys.includes('DB_PASSWORD') && config.password) newLines.push(`DB_PASSWORD=${config.password}`);
        if (!keys.includes('DB_PORT')) newLines.push(`DB_PORT=${config.port}`);
        if (!keys.includes('TRASH_RETENTION_DAYS')) newLines.push(`TRASH_RETENTION_DAYS=${config.trash_retention_days || 15}`);
        if (!keys.includes('UPLOAD_DIR')) newLines.push(`UPLOAD_DIR=${config.upload_dir || ''}`);

        fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

        // Refresh process.env
        process.env.DB_USER = config.user;
        process.env.DB_HOST = config.host;
        process.env.DB_NAME = config.database;
        if (config.password) process.env.DB_PASSWORD = config.password;
        process.env.DB_PORT = config.port.toString();
        process.env.TRASH_RETENTION_DAYS = (config.trash_retention_days || 15).toString();
        process.env.UPLOAD_DIR = config.upload_dir || '';

        await resetPool();
        return { success: true, message: "DB 설정이 저장되었습니다." };
    } catch (error: any) {
        console.error("updateDbConfig Error:", error);
        return { success: false, message: error.message };
    }
}


export async function fetchJobs(filters?: JobFilters): Promise<Job[]> {
    try {
        const jobs = await getJobsFromDB(filters);
        if (jobs.length === 0) {
            console.log("fetchJobs: No jobs returned from DB.");
        }
        return jobs;
    } catch (error: any) {
        console.error("fetchJobs Server Action Error:", error);
        return [];
    }
}

export async function searchProducts(query: string): Promise<Product[]> {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query(`
                SELECT prod_name as model_name, COALESCE(width, 0) as width, COALESCE(depth, 0) as length, COALESCE(height, 0) as height, prod_type
                FROM product_master_sync
                WHERE prod_name ILIKE $1
                LIMIT 10
            `, [`%${query}%`]);
            return res.rows.map((row: any, idx: number) => ({
                id: `search_${idx}`,
                model_name: row.model_name,
                width: Number(row.width) || 0,
                length: Number(row.length) || 0,
                height: Number(row.height) || 0,
                quantity: 1,
                allow_rotate: true,
                allow_lay_down: false
            }));
        } finally {
            client.release();
        }
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function fetchProductsByJob(jobId: number): Promise<Product[]> {
    try {
        return await getProductsForJob(jobId);
    } catch (error: any) {
        console.error("Failed to fetch products for job:", error);
        return [];
    }
}

export async function updatePassword(currentPassword: string, newPassword: string) {
    return await updatePass(currentPassword, newPassword);
}


export async function fetchUsers(): Promise<{ id: string; name: string; username: string }[]> {
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT id, name, username FROM "User" ORDER BY name');
        client.release();
        return res.rows;
    } catch (error: any) {
        console.error("fetchUsers Error:", error);
        return [];
    }
}

function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWorkDateString(d: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(d);
    let year = '', month = '', day = '', hour = 0;
    for (const part of parts) {
        if (part.type === 'year') year = part.value;
        if (part.type === 'month') month = part.value;
        if (part.type === 'day') day = part.value;
        if (part.type === 'hour') hour = parseInt(part.value, 10);
    }
    if (hour < 13) {
        const kstDate = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
        kstDate.setUTCDate(kstDate.getUTCDate() - 1);
        const yyyy = kstDate.getUTCFullYear();
        const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(kstDate.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    return `${year}-${month}-${day}`;
}


function getVisualWidth(str: string): number {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3130 && code <= 0x318f)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

function padString(str: string, targetWidth: number): string {
    const currentWidth = getVisualWidth(str);
    if (currentWidth >= targetWidth) {
        return str;
    }
    return str + ' '.repeat(targetWidth - currentWidth);
}

export async function generateWorkReport(filters: JobFilters): Promise<{ success: boolean; reportText?: string; reportData?: any[]; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const todayWorkDateStr = getWorkDateString(new Date());
            const targetDateStr = filters.startDate || todayWorkDateStr;
            const isPastDate = targetDateStr < todayWorkDateStr;
            const whereClauses: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            whereClauses.push(`COALESCE(r.qty_plan, 0) > 0`);

            if (!filters.startDate && !filters.endDate) {
                // 기본값: 오늘 날짜
                whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`);
                params.push(`${todayWorkDateStr} 13:00:00`);
            } else {
                if (filters.startDate && filters.endDate) {
                    const s = new Date(filters.startDate);
                    const e = new Date(filters.endDate);
                    const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 31) {
                        return { success: false, error: "보고서 생성은 최대 31일 범위까지만 가능합니다. 조회 기간을 줄여주세요." };
                    }
                }
                if (filters.startDate) {
                    whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`);
                    params.push(`${filters.startDate} 13:00:00`);
                }
                if (filters.endDate) {
                    whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx++}::date + INTERVAL '1 day 12 hours 59 minutes 59.999 seconds')`);
                    params.push(filters.endDate);
                }
            }

            if (filters.productName) {
                whereClauses.push(`r.prod_name ILIKE $${paramIdx++}`);
                params.push(`%${filters.productName}%`);
            }
            if (filters.containerNo) {
                whereClauses.push(`r.cntr_no ILIKE $${paramIdx++}`);
                params.push(`%${filters.containerNo}%`);
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

            // --- Fetch Manual Report Entries ---
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
                products: { name: string; qty: number; division: string; height?: number }[] 
            }>>>();

            for (const row of rows) {
                const teamName = row.team_name;
                if (!teamName || teamName === '미지정 조') {
                    continue;
                }
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

                if (!dateMap.has(workDateStr)) {
                    dateMap.set(workDateStr, new Map());
                }
                const teamMap = dateMap.get(workDateStr)!;

                if (!teamMap.has(teamName)) {
                    teamMap.set(teamName, new Map());
                }
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
                        firstUploadedAt: mRow.first_uploaded_at ? new Date(mRow.first_uploaded_at) : new Date(), 
                        remark: mRow.remark || '', 
                        transporter: '', 
                        adminComment: mRow.category || '', 
                        products: [], 
                        emptyBoxes: [],
                        manualEntryId: mRow.id
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
            }

            if (dateMap.size === 0) {
                return { success: false, error: '조가 지정된 작업 데이터가 없습니다.' };
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

                    // 컨테이너 업로드 순서대로 나열하여 타임라인 산출
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
                        const transporter = cntrData.transporter || '기타';
                        let carrierKey = '기타';
                        if (transporter.includes('천마')) carrierKey = '천마';
                        else if (transporter.includes('BNI') || transporter.includes('비엔아이')) carrierKey = 'BNI';
                        else if (transporter.trim()) carrierKey = transporter.split('(')[0].trim();

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

// ────────────────────────────────────────────────────────
// 팀 작업 진행 현황 산출 (오늘 근무일 기준)
// ────────────────────────────────────────────────────────

export interface TeamWorkProgress {
    teamName: string;
    completedCount: number;
    totalDurationMinutes: number;
    startTimeStr: string;
    endTimeStr: string;
    lastCntrNo?: string;
    containers: {
        cntrNo: string;
        durationMinutes: number;
        startTimeStr: string;
        endTimeStr: string;
        isManual?: boolean;
        manualEntryId?: number;
        firstUploadedAt?: string;
    }[];
}

export async function fetchTeamWorkProgress(targetWorkDate?: string): Promise<Record<string, TeamWorkProgress>> {
    try {
        const client = await pool.connect();
        try {
            // KST = UTC+9. getWorkDateString() uses Node local time (KST=+9 on this server).
            // PG timezone is also Asia/Seoul, so uploaded_at is stored as UTC but EXTRACT(HOUR)
            // returns KST hours. ::date cast however gives UTC date. We must add 9 hours manually
            // to convert UTC timestamp to KST before casting to date.
            const workDate = targetWorkDate || getWorkDateString(new Date());

            const query = `
                WITH Combined AS (
                    SELECT 
                        COALESCE(t.name, '미지정 조') as team_name,
                        COALESCE(p.cntr_no, j.job_name, '미지정') as cntr_no,
                        COALESCE(MAX(p.work_duration_minutes), 45) as duration_minutes,
                        MIN(p.uploaded_at) as first_uploaded_at,
                        false as is_manual,
                        NULL::integer as manual_entry_id
                    FROM container_photos p
                    LEFT JOIN teams t ON p.team_id = t.id
                    LEFT JOIN container_jobs j ON p.job_id = j.id
                    WHERE (p.is_deleted IS NOT TRUE)
                      AND (p.is_completed IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (p.uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((p.uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (p.uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                    GROUP BY COALESCE(t.name, '미지정 조'), COALESCE(p.cntr_no, j.job_name, '미지정')
                    
                    UNION ALL
                    
                    SELECT 
                        team_name,
                        cntr_no,
                        duration_minutes,
                        first_uploaded_at,
                        true as is_manual,
                        id as manual_entry_id
                    FROM manual_report_entries
                    WHERE work_date = $1
                )
                SELECT * FROM Combined ORDER BY first_uploaded_at ASC
            `;

            const res = await client.query(query, [workDate]);

            const teamContainersMap = new Map<string, Map<string, { durationMinutes: number; firstUploadedAt: Date; isManual?: boolean; manualEntryId?: number }>>();

            for (const row of res.rows) {
                const uploadedAt = row.first_uploaded_at ? new Date(row.first_uploaded_at) : new Date();

                const teamName = row.team_name;
                const cntrNo = row.cntr_no;
                const durationMinutes = Number(row.duration_minutes) || 45;

                if (!teamContainersMap.has(teamName)) {
                    teamContainersMap.set(teamName, new Map());
                }
                const cntrMap = teamContainersMap.get(teamName)!;
                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { 
                        durationMinutes, 
                        firstUploadedAt: uploadedAt,
                        isManual: row.is_manual,
                        manualEntryId: row.manual_entry_id
                    });
                }
            }

            const result: Record<string, TeamWorkProgress> = {};

            teamContainersMap.forEach((cntrMap, teamName) => {
                const cntrList = Array.from(cntrMap.entries()).map(([cntrNo, data]) => ({
                    cntrNo,
                    ...data
                })).sort((a, b) => a.firstUploadedAt.getTime() - b.firstUploadedAt.getTime());

                const timelineList = calculateTeamTimeline(cntrList);

                if (timelineList.length > 0) {
                    const last = timelineList[timelineList.length - 1];
                    const totalDuration = timelineList.reduce((sum, c) => sum + c.durationMinutes, 0);
                    result[teamName] = {
                        teamName,
                        completedCount: timelineList.length,
                        totalDurationMinutes: totalDuration,
                        startTimeStr: '19:00',
                        endTimeStr: last.endTimeStr,
                        lastCntrNo: last.cntrNo,
                        containers: timelineList.map(c => ({
                            cntrNo: c.cntrNo,
                            durationMinutes: c.durationMinutes,
                            startTimeStr: c.startTimeStr,
                            endTimeStr: c.endTimeStr,
                            isManual: (c as any).isManual,
                            manualEntryId: (c as any).manualEntryId,
                            firstUploadedAt: (c as any).firstUploadedAt ? (c as any).firstUploadedAt.toISOString() : undefined
                        }))
                    };
                }
            });

            return result;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("fetchTeamWorkProgress Error:", error);
        return {};
    }
}

// ────────────────────────────────────────────────────────
// 기존 등록된 컨테이너의 작업시간 및 메모 수정
// ────────────────────────────────────────────────────────

export async function updateContainerWorkDuration(
    jobId: number,
    cntrNo: string,
    durationMinutes: number,
    remark?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = $2
                WHERE job_id = $3 
                  AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) 
                  AND (is_deleted IS NOT TRUE)
            `, [durationMinutes, remark || '', jobId, cntrNo]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerWorkDuration Error:", error);
        return { success: false, error: `수정 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}

export async function updateContainerAdminComment(
    cntrNo: string,
    comment: string,
    workDate?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const todayStr = getWorkDateString(new Date());
            const targetWorkDate = workDate || todayStr;
            await client.query(`
                UPDATE container_comments
                SET admin_comment = $2, updated_at = NOW()
                WHERE cntr_no = $1
            `, [cntrNo, comment]);

            await client.query(`
                INSERT INTO container_comments (work_date, cntr_no, admin_comment, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (work_date, cntr_no)
                DO UPDATE SET admin_comment = EXCLUDED.admin_comment, updated_at = NOW()
            `, [targetWorkDate, cntrNo, comment]);
            await client.query('COMMIT');
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerAdminComment Error:", error);
        return { success: false, error: `코멘트 저장 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}

export async function resetTeamWorkProgress(
    actionType: 'COMPLETE_RESET' | 'TRASH_RESET' = 'COMPLETE_RESET',
    targetDateStr?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const dateStr = targetDateStr || getWorkDateString(new Date());

            if (actionType === 'COMPLETE_RESET') {
                await client.query(`
                    UPDATE container_photos
                    SET is_completed = false, completed_at = NULL
                    WHERE (is_deleted IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                `, [dateStr]);
                return {
                    success: true,
                    message: `오늘(${dateStr}) 작업의 완료 상태가 모두 '진행 중'으로 초기화되었습니다.`
                };
            } else {
                await client.query(`
                    UPDATE container_photos
                    SET is_deleted = true, deleted_at = NOW()
                    WHERE (is_deleted IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                `, [dateStr]);
                return {
                    success: true,
                    message: `오늘(${dateStr}) 작업 사진이 휴지통으로 이동되어 조별 근무시간이 초기화되었습니다.`
                };
            }
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("resetTeamWorkProgress Error:", error);
        return { success: false, error: `작업 초기화 오류: ${error?.message || '알 수 없는 오류'}` };
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

export async function exportDatabaseDump(): Promise<{ success: boolean; dump?: any; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const tables = ['teams', 'users', 'container_jobs', 'container_results', 'container_photos', 'container_comments', 'daily_work_reports', 'db_config'];
            const dumpData: any = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                tables: {}
            };

            for (const table of tables) {
                try {
                    const res = await client.query(`SELECT * FROM ${table}`);
                    dumpData.tables[table] = res.rows;
                } catch (e) {
                    dumpData.tables[table] = [];
                }
            }

            return { success: true, dump: dumpData };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("exportDatabaseDump Error:", err);
        return { success: false, error: `DB 백업 추출 오류: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function restoreDatabaseDump(dumpData: any): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!dumpData || !dumpData.tables) {
        return { success: false, error: '유효하지 않은 백업 데이터 파일입니다.' };
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const tables = dumpData.tables;

            // Restore teams
            if (Array.isArray(tables.teams)) {
                for (const row of tables.teams) {
                    await client.query(`
                        INSERT INTO teams (id, name, created_at)
                        VALUES ($1, $2, COALESCE($3::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
                    `, [row.id, row.name, row.created_at]);
                }
            }

            // Restore users
            if (Array.isArray(tables.users)) {
                for (const row of tables.users) {
                    await client.query(`
                        INSERT INTO users (id, username, password_hash, name, role, team_name, is_active, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), COALESCE($8::timestamp, NOW()))
                        ON CONFLICT (username) DO UPDATE SET
                            name = EXCLUDED.name,
                            role = EXCLUDED.role,
                            team_name = EXCLUDED.team_name,
                            is_active = EXCLUDED.is_active;
                    `, [row.id, row.username, row.password_hash, row.name, row.role, row.team_name, row.is_active, row.created_at]);
                }
            }

            // Restore container_jobs
            if (Array.isArray(tables.container_jobs)) {
                for (const row of tables.container_jobs) {
                    await client.query(`
                        INSERT INTO container_jobs (id, job_name, original_filename, saved_at)
                        VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET
                            job_name = EXCLUDED.job_name,
                            original_filename = EXCLUDED.original_filename;
                    `, [row.id, row.job_name, row.original_filename, row.saved_at]);
                }
            }

            // Restore container_results
            if (Array.isArray(tables.container_results)) {
                for (const row of tables.container_results) {
                    await client.query(`
                        INSERT INTO container_results (id, job_id, cntr_no, prod_name, qty_plan, division, transporter, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET
                            qty_plan = EXCLUDED.qty_plan,
                            division = EXCLUDED.division,
                            transporter = EXCLUDED.transporter;
                    `, [row.id, row.job_id, row.cntr_no, row.prod_name, row.qty_plan, row.division, row.transporter, row.created_at]);
                }
            }

            // Restore container_photos
            if (Array.isArray(tables.container_photos)) {
                for (const row of tables.container_photos) {
                    await client.query(`
                        INSERT INTO container_photos (
                            id, job_id, cntr_no, photo_path, original_name, uploader_username, uploader_name, team_id, team_name,
                            uploaded_at, file_created_at, is_completed, completed_at, is_deleted, deleted_at, gdrive_file_id,
                            gdrive_view_link, work_duration_minutes, remark
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamp, NOW()), $11, $12, $13, $14, $15, $16, $17, $18, $19)
                        ON CONFLICT (id) DO UPDATE SET
                            is_completed = EXCLUDED.is_completed,
                            completed_at = EXCLUDED.completed_at,
                            is_deleted = EXCLUDED.is_deleted,
                            deleted_at = EXCLUDED.deleted_at,
                            gdrive_file_id = EXCLUDED.gdrive_file_id,
                            gdrive_view_link = EXCLUDED.gdrive_view_link,
                            work_duration_minutes = EXCLUDED.work_duration_minutes,
                            remark = EXCLUDED.remark;
                    `, [
                        row.id, row.job_id, row.cntr_no, row.photo_path, row.original_name, row.uploader_username, row.uploader_name, row.team_id, row.team_name,
                        row.uploaded_at, row.file_created_at, row.is_completed, row.completed_at, row.is_deleted, row.deleted_at, row.gdrive_file_id,
                        row.gdrive_view_link, row.work_duration_minutes, row.remark
                    ]);
                }
            }

            // Restore container_comments
            if (Array.isArray(tables.container_comments)) {
                for (const row of tables.container_comments) {
                    const wDate = row.work_date || '';
                    await client.query(`
                        INSERT INTO container_comments (work_date, cntr_no, admin_comment, updated_at)
                        VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()))
                        ON CONFLICT (work_date, cntr_no) DO UPDATE SET
                            admin_comment = EXCLUDED.admin_comment,
                            updated_at = NOW();
                    `, [wDate, row.cntr_no, row.admin_comment, row.updated_at]);
                }
            }

            // Restore daily_work_reports
            if (Array.isArray(tables.daily_work_reports)) {
                for (const row of tables.daily_work_reports) {
                    await client.query(`
                        INSERT INTO daily_work_reports (work_date, report_text, report_data, saved_by, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()), COALESCE($6::timestamp, NOW()))
                        ON CONFLICT (work_date) DO UPDATE SET
                            report_text = EXCLUDED.report_text,
                            report_data = EXCLUDED.report_data,
                            saved_by = EXCLUDED.saved_by,
                            updated_at = EXCLUDED.updated_at;
                    `, [row.work_date, row.report_text, JSON.stringify(row.report_data || []), row.saved_by, row.created_at, row.updated_at]);
                }
            }

            await client.query('COMMIT');
            return { success: true, message: 'DB 백업 데이터가 성공적으로 복구되었습니다.' };
        } catch (err: any) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("restoreDatabaseDump Error:", err);
        return { success: false, error: `DB 복구 실패: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function getAutoSyncConfig(): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS db_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            const res = await client.query("SELECT value FROM db_config WHERE key = 'auto_remote_sync_enabled'");
            const enabled = res.rows.length > 0 ? res.rows[0].value === 'true' : true;
            return { success: true, enabled };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("getAutoSyncConfig Error:", err);
        return { success: false, enabled: true, error: err?.message };
    }
}

export async function updateAutoSyncConfig(enabled: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO db_config (key, value, updated_at)
                VALUES ('auto_remote_sync_enabled', $1, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
            `, [enabled ? 'true' : 'false']);
            return { success: true, message: `매일 13:00 DB 자동 백업 & 원격 동기화가 ${enabled ? '활성화(ON)' : '비활성화(OFF)'} 되었습니다.` };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("updateAutoSyncConfig Error:", err);
        return { success: false, error: err?.message };
    }
}

export async function getAutoGdriveSyncConfig(): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS db_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            const res = await client.query("SELECT value FROM db_config WHERE key = 'auto_gdrive_sync_enabled'");
            const enabled = res.rows.length > 0 ? res.rows[0].value === 'true' : false; // Default false to be safe? The user approved it so default can be true, but let's say true for consistency.
            return { success: true, enabled: res.rows.length > 0 ? res.rows[0].value === 'true' : true };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("getAutoGdriveSyncConfig Error:", err);
        return { success: false, enabled: true, error: err?.message };
    }
}

export async function updateAutoGdriveSyncConfig(enabled: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO db_config (key, value, updated_at)
                VALUES ('auto_gdrive_sync_enabled', $1, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
            `, [enabled ? 'true' : 'false']);
            return { success: true, message: `낮 12:30 GDrive 자동 백업 및 용량 정리가 ${enabled ? '활성화(ON)' : '비활성화(OFF)'} 되었습니다.` };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("updateAutoGdriveSyncConfig Error:", err);
        return { success: false, error: err?.message };
    }
}

export async function triggerManualBackupAndSync(): Promise<{ success: boolean; message?: string; report?: any; error?: string }> {
    try {
        const { performBackupAndRemoteSync } = await import('./remoteSyncScheduler');
        return await performBackupAndRemoteSync();
    } catch (err: any) {
        console.error("triggerManualBackupAndSync Error:", err);
        return { success: false, error: err?.message || '실행 중 오류가 발생했습니다.' };
    }
}
export async function deleteContainerResult(jobId: string, prodName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
            return { success: false, error: 'Unauthorized' };
        }

        const client = await pool.connect();
        try {
            // Find job info
            const infoRes = await client.query('SELECT job_name, (SELECT cntr_no FROM container_results WHERE job_id = $1 LIMIT 1) as cntr_no FROM container_jobs WHERE id = $1', [jobId]);
            if (infoRes.rows.length > 0) {
                const { job_name, cntr_no } = infoRes.rows[0];
                await client.query(`
                    DELETE FROM container_results 
                    WHERE prod_name = $1 
                    AND (
                        ($2::text IS NOT NULL AND cntr_no = $2 AND job_id IN (SELECT id FROM container_jobs WHERE job_name = $3))
                        OR
                        ($2::text IS NULL AND job_id = $4)
                    )
                `, [prodName, cntr_no, job_name, jobId]);
            }
        } finally {
            client.release();
        }
        
        return { success: true };
    } catch (err: any) {
        console.error('deleteContainerResult Error:', err);
        return { success: false, error: err?.message || 'DB delete error' };
    }
}


export async function addManualReportEntry(params: {
    workDate: string;
    teamName: string;
    cntrNo: string;
    category: string;
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
                (work_date, team_name, cntr_no, category, duration_minutes, remark, products, empty_boxes, first_uploaded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
            `, [
                params.workDate, 
                params.teamName, 
                params.cntrNo, 
                params.category, 
                params.durationMinutes, 
                params.remark, 
                JSON.stringify(params.products || []),
                JSON.stringify(params.emptyBoxes || []),
                params.firstUploadedAt ? new Date(params.firstUploadedAt) : new Date()
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
                    SET work_date = $1, team_name = $2, cntr_no = $3, category = $4, duration_minutes = $5, remark = $6, products = $7::jsonb, empty_boxes = $8::jsonb, first_uploaded_at = $10
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
                    params.firstUploadedAt
                ]);
            } else {
                await client.query(`
                    UPDATE manual_report_entries 
                    SET work_date = $1, team_name = $2, cntr_no = $3, category = $4, duration_minutes = $5, remark = $6, products = $7::jsonb, empty_boxes = $8::jsonb
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
                    id
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
