"use server";

import fs from 'fs';
import path from 'path';
import {
    getJobsFromDB,
    getProductsForJob,
    pool,
    resetPool
} from "./db";
import { Product, Job, JobFilters, DbConfig } from "./types";
import {
    updatePassword as updatePass,
    getAllUsers as fetchAllUsers,
    createUserAccount,
    updateUserAccount,
    deleteUserAccount,
    deleteMultipleUserAccounts
} from "./auth";

export { fetchAllUsers, createUserAccount, updateUserAccount, deleteUserAccount, deleteMultipleUserAccounts };


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
    if (workDate.getHours() < 19) {
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
                    COALESCE(u.name, u.username, '미지정 업로더') as uploader_name,
                    BOOL_OR(p.is_completed) as is_completed,
                    COALESCE(MAX(p.uploaded_at), MAX(j.saved_at)) as work_time
                FROM container_results r
                JOIN container_jobs j ON r.job_id = j.id
                LEFT JOIN (
                    SELECT 
                        job_id, 
                        cntr_no, 
                        MAX(uploaded_by::text) as uploaded_by,
                        BOOL_OR(is_completed) as is_completed,
                        MAX(uploaded_at) as uploaded_at
                    FROM container_photos
                    WHERE (is_deleted IS NOT TRUE)
                    GROUP BY job_id, cntr_no
                ) p ON p.job_id = j.id AND (p.cntr_no = r.cntr_no OR (r.cntr_no IS NULL AND p.cntr_no IS NULL))
                LEFT JOIN "User" u ON p.uploaded_by = u.id::text
                ${whereSql}
                GROUP BY COALESCE(r.cntr_no, j.job_name, '미지정'), r.prod_name, r.division, u.name, u.username
                ORDER BY uploader_name, cntr_no, r.prod_name
            `;

            const res = await client.query(query, params);
            const rows = res.rows;

            if (rows.length === 0) {
                return { success: false, error: '조건에 일치하는 작업 내역이 없습니다.' };
            }

            // Group by workDate -> uploader_name -> cntr_no -> products & completion
            const dateMap = new Map<string, Map<string, Map<string, { isCompleted: boolean; division: string; products: { name: string; qty: number; division: string }[] }>>>();

            for (const row of rows) {
                const uploader = row.uploader_name;
                if (!uploader || uploader === '미지정 업로더') {
                    continue;
                }
                const cntrNo = row.cntr_no;
                const division = row.division || '일반';
                const prodName = row.prod_name;
                const qty = Math.round(Number(row.qty)) || 0;
                const isCompleted = !!row.is_completed;
                const workTime = row.work_time ? new Date(row.work_time) : new Date();
                const workDateStr = getWorkDateString(workTime);

                if (!dateMap.has(workDateStr)) {
                    dateMap.set(workDateStr, new Map());
                }
                const uploaderMap = dateMap.get(workDateStr)!;

                if (!uploaderMap.has(uploader)) {
                    uploaderMap.set(uploader, new Map());
                }
                const cntrMap = uploaderMap.get(uploader)!;

                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { isCompleted, division, products: [] });
                }
                const cntrData = cntrMap.get(cntrNo)!;
                cntrData.products.push({ name: prodName, qty, division });
            }

            if (dateMap.size === 0) {
                return { success: false, error: '업로더가 지정된 작업 데이터가 없습니다.' };
            }

            const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));
            let lines: string[] = [];
            lines.push(`📋 [일자별 작업 현황 보고서]`);

            sortedDates.forEach(dateStr => {
                lines.push(`📅 ${dateStr} 작업 분량`);
                
                const uploaderMap = dateMap.get(dateStr)!;
                let totalContainersSum = 0;
                uploaderMap.forEach(cntrMap => {
                    totalContainersSum += cntrMap.size;
                });

                const dayNum = parseInt(dateStr.split('-')[2]);
                lines.push(`총합계: ${dayNum}일 ${totalContainersSum}개 작업완료`);
                lines.push(``);

                const uploadersList: { name: string; lines: string[] }[] = [];

                uploaderMap.forEach((cntrMap, uploader) => {
                    const upLines = [];
                    const totalContainers = cntrMap.size;
                    upLines.push(`■ ${uploader} (합계 ${totalContainers}개)`);

                    cntrMap.forEach((cntrData, cntrNo) => {
                        const modelCount = cntrData.products.length;
                        const totalQty = cntrData.products.reduce((sum, p) => sum + p.qty, 0);
                        upLines.push(`${cntrNo} (${modelCount}모델, ${totalQty.toLocaleString()}개)`);
                        for (const prod of cntrData.products) {
                            upLines.push(`- [${prod.division}] ${prod.name} ${prod.qty.toLocaleString()}개`);
                        }
                        upLines.push(``);
                    });

                    uploadersList.push({
                        name: uploader,
                        lines: upLines
                    });
                });

                const chunkSize = 4;
                for (let i = 0; i < uploadersList.length; i += chunkSize) {
                    const chunk = uploadersList.slice(i, i + chunkSize);
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
                const uploaderMap = dateMap.get(dateStr)!;
                const uploadersList: any[] = [];
                uploaderMap.forEach((cntrMap, uploader) => {
                    const containersList: any[] = [];
                    cntrMap.forEach((cntrData, cntrNo) => {
                        containersList.push({
                            cntrNo,
                            isCompleted: cntrData.isCompleted,
                            division: cntrData.division,
                            products: cntrData.products
                        });
                    });
                    uploadersList.push({
                        uploaderName: uploader,
                        containers: containersList
                    });
                });
                return {
                    dateStr,
                    uploaders: uploadersList
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