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
                SELECT 
                    MIN(j.id) as id, 
                    j.job_name, 
                    j.etd,
                    j.saved_at,
                    r.cntr_no,
                    r.transporter,
                    r.cntr_type
                FROM container_jobs j
                LEFT JOIN container_results r ON r.job_id = j.id
                ${whereSql}
                GROUP BY j.job_name, j.etd, j.saved_at, r.cntr_no, r.transporter, r.cntr_type
                ORDER BY j.saved_at DESC, id DESC 
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
            const query = `
                SELECT 
                    r.prod_name as id,
                    r.prod_name as model_name,
                    CAST(m.width AS INTEGER) as width,
                    CAST(m.depth AS INTEGER) as length,
                    CAST(m.height AS INTEGER) as height,
                    CAST(r.qty_plan AS INTEGER) as quantity,
                    m.prod_type
                FROM container_results r
                JOIN product_master_sync m ON r.prod_name = m.prod_name
                WHERE r.job_id IN (
                    SELECT id FROM container_jobs 
                    WHERE job_name = (SELECT job_name FROM container_jobs WHERE id = $1)
                )
                AND r.qty_plan > 0
            `;
            const res = await client.query(query, [jobId]);

            return res.rows.map(row => ({
                id: row.id,
                model_name: row.model_name,
                width: row.width || 0,
                length: row.length || 0,
                height: row.height || 0,
                quantity: row.quantity,
                allow_rotate: true,
                allow_lay_down: (row.model_name && (row.model_name.includes('PSM') || row.model_name.includes('LT'))) || row.prod_type === 'CDZ' || (row.width <= 150 || row.length <= 150 || row.height <= 150)
            }));
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('getProductsForJob Error:', error);
        return [];
    }
}

