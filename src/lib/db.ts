import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Job, mapContainerType, Product, JobFilters } from "./types";

// Force load .env from the root directory for reliability
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let _pool: Pool | null = null;

export function getPool(): Pool {
    if (!_pool) {
        dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
        console.log("DB Pool: Initializing with host", process.env.DB_HOST);
        _pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'excel',
            password: process.env.DB_PASSWORD || 'z456qwe12!@',
            port: parseInt(process.env.DB_PORT || '5432'),
            ssl: false,
            connectionTimeoutMillis: 5000,
        });

        // Migration query to add soft delete columns to container_photos table
        _pool.query(`
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS gdrive_file_id VARCHAR(255);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS gdrive_url TEXT;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS photo_type VARCHAR(20) DEFAULT 'normal';
        `).then(() => {
            console.log("DB Migration: container_photos soft delete and completion columns ensured.");
        }).catch(err => {
            console.error("DB Migration Error:", err);
        });

        // Migration: teams table and team_id column
        _pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id   SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE
            );
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploader_username VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploader_name VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS work_duration_minutes INTEGER DEFAULT 45;

            CREATE TABLE IF NOT EXISTS container_comments (
                cntr_no VARCHAR(100) PRIMARY KEY,
                admin_comment TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).then(() => {
            console.log("DB Migration: teams and container_comments table ensured.");
        }).catch(err => {
            console.error("DB Migration Error:", err);
        });
    }
    return _pool;
}

export async function resetPool() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}

export const pool = new Proxy({} as Pool, {
    get: (target, prop) => {
        const p = getPool();
        const val = (p as any)[prop];
        if (typeof val === 'function') {
            return val.bind(p);
        }
        return val;
    }
});


/**
 * 폰 DB에서 최근 작업 리스트를 가져옵니다. (필터 지원)
 */
export async function getJobsFromDB(filters?: JobFilters): Promise<Job[]> {
    try {
        const client = await pool.connect();
        try {
            // 외부 ERP/엑셀 연동 시 누락될 수 있는 job_id 연결 고리를 자동으로 복구
            await client.query(`
                UPDATE container_results r
                SET job_id = j.id
                FROM container_jobs j
                WHERE r.job_name = j.job_name AND r.job_id IS NULL
            `);

            let whereClauses: string[] = [];
            let params: any[] = [];
            let paramIdx = 1;

            if (filters) {
                if (filters.startDate) {
                    whereClauses.push(`j.saved_at >= $${paramIdx++}`);
                    params.push(filters.startDate);
                }
                if (filters.endDate) {
                    whereClauses.push(`j.saved_at < ($${paramIdx++}::date + 1)`);
                    params.push(filters.endDate);
                }
                if (filters.productName) {
                    whereClauses.push(`j.id IN (SELECT job_id FROM container_results WHERE prod_name ILIKE $${paramIdx++})`);
                    params.push(`%${filters.productName}%`);
                }
                if (filters.containerNo) {
                    whereClauses.push(`r.cntr_no ILIKE $${paramIdx++}`);
                    params.push(`%${filters.containerNo}%`);
                }
            }

            const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
            const query = `
                SELECT * FROM (
                    SELECT DISTINCT ON (COALESCE(r.cntr_no, j.id::text), j.job_name)
                        j.id, 
                        j.job_name, 
                        j.etd,
                        j.saved_at,
                        r.cntr_no,
                        r.transporter,
                        r.cntr_type,
                        (SELECT COUNT(*)::integer FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE)) as photo_count,
                        (SELECT COUNT(*)::integer FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) AND (p.is_completed IS NOT TRUE)) as active_photo_count,
                        (SELECT COUNT(*)::integer FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) AND p.photo_type = 'seal') as seal_photo_count,
                        (SELECT ARRAY_AGG(DISTINCT uploader_info) FROM (
                            SELECT COALESCE(p.uploader_username, u.username, u.name, p.uploaded_by::text) as uploader_info
                            FROM container_photos p
                            LEFT JOIN "User" u ON (u.id::text = p.uploaded_by::text OR u.username = p.uploader_username)
                            WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) AND (p.is_completed IS NOT TRUE)
                        ) sub_u WHERE uploader_info IS NOT NULL) as uploaders,
                        (SELECT p.work_duration_minutes FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) ORDER BY p.id DESC LIMIT 1) as work_duration_minutes,
                        (SELECT p.remark FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) AND p.remark IS NOT NULL AND p.remark != '' ORDER BY p.id DESC LIMIT 1) as last_remark
                    FROM container_jobs j
                    LEFT JOIN container_results r ON r.job_id = j.id
                    ${whereSql}
                    ORDER BY COALESCE(r.cntr_no, j.id::text), j.job_name, j.saved_at DESC, j.id DESC
                ) sub
                ORDER BY saved_at DESC, id DESC 
                LIMIT 100
            `;
            const res = await client.query(query, params);
            return res.rows.map(row => ({
                id: row.id,
                job_name: row.job_name,
                // Prioritize explicit cntr_type from DB over job_name string
                container_type: mapContainerType(row.cntr_type || row.job_name || ''),
                etd: row.etd,
                cntr_no: row.cntr_no,
                transporter: row.transporter,
                photo_count: Number(row.photo_count) || 0,
                active_photo_count: Number(row.active_photo_count) || 0,
                seal_photo_count: Number(row.seal_photo_count) || 0,
                uploaders: Array.isArray(row.uploaders) ? row.uploaders.filter(Boolean) : [],
                work_duration_minutes: row.work_duration_minutes ? Number(row.work_duration_minutes) : undefined,
                remark: row.last_remark || undefined,
                work_date: (() => {
                    const savedAt = row.saved_at ? new Date(row.saved_at) : null;
                    if (savedAt && !isNaN(savedAt.getTime())) {
                        return savedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(' ', '');
                    }
                    // Fallback to ETD if saved_at is missing/invalid (e.g., "04월 21일" -> "04.21.")
                    if (row.etd && typeof row.etd === 'string') {
                        const etdMatch = row.etd.match(/(\d{1,2})월\s*(\d{1,2})일/);
                        if (etdMatch) {
                            return `${etdMatch[1].padStart(2, '0')}.${etdMatch[2].padStart(2, '0')}.`;
                        }
                    }
                    return '';
                })()
            }));
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('getJobsFromDB Error:', error);
        return [];
    }
}

/**
 * 특정 작업(Job)에 포함된 제품 목록과 수량을 가져옵니다.
 */
export async function getProductsForJob(jobId: number): Promise<Product[]> {
    try {
        const client = await pool.connect();
        try {
            // First, find the container number and job name for this jobId to handle split jobs
            const infoQuery = `
                SELECT j.job_name, r.cntr_no 
                FROM container_jobs j
                LEFT JOIN container_results r ON r.job_id = j.id
                WHERE j.id = $1
                LIMIT 1
            `;
            const infoRes = await client.query(infoQuery, [jobId]);
            
            if (infoRes.rows.length === 0) return [];
            
            const { job_name, cntr_no } = infoRes.rows[0];

            // If we have a container number, fetch products for ALL jobs that share this container number and job name.
            // This handles cases where data was split across multiple job IDs.
            // If cntr_no is null, fall back to only fetching for this specific job ID (matching grouping in getJobsFromDB).
            const query = `
                SELECT 
                    r.prod_name as id,
                    r.prod_name as model_name,
                    COALESCE(m.width, 0) as width,
                    COALESCE(m.depth, 0) as length,
                    COALESCE(m.height, 0) as height,
                    SUM(COALESCE(r.qty_plan, 0)) as quantity,
                    m.prod_type,
                    MAX(r.division) as division
                FROM container_results r
                JOIN container_jobs j ON r.job_id = j.id
                LEFT JOIN product_master_sync m ON r.prod_name = m.prod_name
                WHERE (
                    ($2::text IS NOT NULL AND r.cntr_no = $2 AND j.job_name = $3)
                    OR
                    ($2::text IS NULL AND j.id = $1)
                )
                AND COALESCE(r.qty_plan, 0) > 0
                GROUP BY r.prod_name, m.width, m.depth, m.height, m.prod_type
            `;
            
            console.log(`Fetching products for logical job (JobId: ${jobId}, Container: ${cntr_no}, Name: ${job_name})`);
            const res = await client.query(query, [jobId, cntr_no, job_name]);
            console.log(`Found ${res.rows.length} product types for logical job`);

            return res.rows.map(row => {
                const isDFZ = (row.division || '').toUpperCase().includes('DFZ');
                return {
                    id: row.id,
                    model_name: row.model_name,
                    width: Number(row.width) || 0,
                    length: Number(row.length) || 0,
                    height: Number(row.height) || 0,
                    quantity: Math.round(Number(row.quantity)) || 0,
                    allow_rotate: !isDFZ,
                    allow_lay_down: false
                };
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('getProductsForJob Error:', error);
        return [];
    }
}

