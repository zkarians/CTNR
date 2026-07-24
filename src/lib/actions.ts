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
        const res = await client.query(`
            SELECT prod_name as model_name, COALESCE(width, 0) as width, COALESCE(depth, 0) as length, COALESCE(height, 0) as height, prod_type
            FROM product_master_sync
            WHERE prod_name ILIKE $1
            LIMIT 10
        `, [`%${query}%`]);
        client.release();
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
    const workDate = new Date(d);
    if (workDate.getHours() < 13) {
        workDate.setDate(workDate.getDate() - 1);
    }
    return getLocalDateString(workDate);
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
            const whereClauses: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            whereClauses.push(`COALESCE(r.qty_plan, 0) > 0`);

            if (filters.startDate) {
                whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`);
                params.push(`${filters.startDate} 19:00:00`);
            }
            if (filters.endDate) {
                whereClauses.push(`COALESCE(p.uploaded_at, j.saved_at) AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx++}::date + INTERVAL '1 day 18 hours 59 minutes 59.999 seconds')`);
                params.push(filters.endDate);
            }
            if (filters.productName) {
                whereClauses.push(`r.prod_name ILIKE $${paramIdx++}`);
                params.push(`%${filters.productName}%`);
            }
            if (filters.containerNo) {
                whereClauses.push(`r.cntr_no ILIKE $${paramIdx++}`);
                params.push(`%${filters.containerNo}%`);
            }

            const whereSql = "WHERE " + whereClauses.join(" AND ");

            const query = `
                SELECT 
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
                    MAX(cc.admin_comment) as admin_comment
                FROM container_results r
                JOIN container_jobs j ON r.job_id = j.id
                LEFT JOIN (
                    SELECT 
                        job_id, 
                        cntr_no, 
                        MAX(team_id) as team_id,
                        MAX(work_duration_minutes) as work_duration_minutes,
                        BOOL_OR(is_completed) as is_completed,
                        MIN(uploaded_at) as uploaded_at,
                        MAX(remark) as remark
                    FROM container_photos
                    WHERE (is_deleted IS NOT TRUE)
                    GROUP BY job_id, cntr_no
                ) p ON p.job_id = j.id AND (p.cntr_no = r.cntr_no OR (r.cntr_no IS NULL AND p.cntr_no IS NULL))
                LEFT JOIN teams t ON p.team_id = t.id
                LEFT JOIN container_comments cc ON cc.cntr_no = COALESCE(r.cntr_no, j.job_name, '미지정')
                ${whereSql}
                GROUP BY COALESCE(r.cntr_no, j.job_name, '미지정'), r.prod_name, r.division, t.name
                ORDER BY team_name, cntr_no, r.prod_name
            `;

            const res = await client.query(query, params);
            const rows = res.rows;

            if (rows.length === 0) {
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
                products: { name: string; qty: number; division: string }[] 
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
                    cntrMap.set(cntrNo, { isCompleted, division, durationMinutes, firstUploadedAt, remark, transporter, adminComment, products: [] });
                }
                const cntrData = cntrMap.get(cntrNo)!;
                if (remark && !cntrData.remark) cntrData.remark = remark;
                if (transporter && !cntrData.transporter) cntrData.transporter = transporter;
                if (adminComment && !cntrData.adminComment) cntrData.adminComment = adminComment;
                cntrData.products.push({ name: prodName, qty, division });
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
                        const adminCommentNote = cntrData.adminComment ? ` (${cntrData.adminComment})` : '';
                        upLines.push(`${cntrData.cntrNo} (${modelCount}모델, ${totalQty.toLocaleString()}개${adminCommentNote}) [${cntrData.durationMinutes}분: ${cntrData.startTimeStr}~${cntrData.endTimeStr}${breakNote}]`);
                        if (cntrData.remark && cntrData.remark.trim()) {
                            upLines.push(`- 💬 지연사유: ${cntrData.remark.trim()}`);
                        }
                        for (const prod of cntrData.products) {
                            upLines.push(`- [${prod.division}] ${prod.name} ${prod.qty.toLocaleString()}개`);
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
                            products: cntrData.products
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
    }[];
}

export async function fetchTeamWorkProgress(targetWorkDate?: string): Promise<Record<string, TeamWorkProgress>> {
    try {
        const client = await pool.connect();
        try {
            const query = `
                SELECT 
                    COALESCE(t.name, '미지정 조') as team_name,
                    COALESCE(p.cntr_no, j.job_name, '미지정') as cntr_no,
                    COALESCE(MAX(p.work_duration_minutes), 45) as duration_minutes,
                    MIN(p.uploaded_at) as first_uploaded_at
                FROM container_photos p
                LEFT JOIN teams t ON p.team_id = t.id
                LEFT JOIN container_jobs j ON p.job_id = j.id
                WHERE (p.is_deleted IS NOT TRUE) AND (p.is_completed = true)
                GROUP BY COALESCE(t.name, '미지정 조'), COALESCE(p.cntr_no, j.job_name, '미지정')
                ORDER BY first_uploaded_at ASC
            `;

            const res = await client.query(query);
            const workDate = targetWorkDate || getWorkDateString(new Date());

            const teamContainersMap = new Map<string, Map<string, { durationMinutes: number; firstUploadedAt: Date }>>();

            for (const row of res.rows) {
                const uploadedAt = row.first_uploaded_at ? new Date(row.first_uploaded_at) : new Date();
                if (getWorkDateString(uploadedAt) !== workDate) continue;

                const teamName = row.team_name;
                const cntrNo = row.cntr_no;
                const durationMinutes = Number(row.duration_minutes) || 45;

                if (!teamContainersMap.has(teamName)) {
                    teamContainersMap.set(teamName, new Map());
                }
                const cntrMap = teamContainersMap.get(teamName)!;
                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { durationMinutes, firstUploadedAt: uploadedAt });
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
    comment: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO container_comments (cntr_no, admin_comment, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (cntr_no)
                DO UPDATE SET admin_comment = EXCLUDED.admin_comment, updated_at = NOW()
            `, [cntrNo, comment]);
            return { success: true };
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
                      AND (uploaded_at - INTERVAL '6 hours')::date = $1::date
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
                      AND (uploaded_at - INTERVAL '6 hours')::date = $1::date
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
        return { success: false, error: `초기화 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}