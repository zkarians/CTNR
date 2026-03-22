import { Pool } from 'pg';
import { Job, mapContainerType, Product, JobFilters } from "./types";

export const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false,
    connectionTimeoutMillis: 5000,
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
                    whereClauses.push(`saved_at >= $${paramIdx++}`);
                    params.push(filters.startDate);
                }
                if (filters.endDate) {
                    whereClauses.push(`saved_at <= $${paramIdx++}::timestamp + interval '1 day'`);
                    params.push(filters.endDate);
                }
                if (filters.productName) {
                    whereClauses.push(`id IN (SELECT job_id FROM container_results WHERE prod_name ILIKE $${paramIdx++})`);
                    params.push(`%${filters.productName}%`);
                }
                if (filters.containerNo) {
                    whereClauses.push(`id IN (SELECT job_id FROM container_results WHERE cntr_no ILIKE $${paramIdx++})`);
                    params.push(`%${filters.containerNo}%`);
                }
            }

            const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
            const query = `
                SELECT 
                    j.id, 
                    j.job_name, 
                    j.etd,
                    r.cntr_no,
                    r.transporter,
                    r.cntr_type
                FROM container_jobs j
                LEFT JOIN (
                    SELECT DISTINCT ON (job_id) job_id, cntr_no, transporter, cntr_type
                    FROM container_results
                ) r ON r.job_id = j.id
                ${whereSql}
                ORDER BY j.saved_at DESC 
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
                transporter: row.transporter
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
                WHERE r.job_id = $1
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
                allow_lay_down: (row.model_name && (row.model_name.includes('PSM') || row.model_name.includes('LT'))) || row.prod_type === 'CDZ'
            }));
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('getProductsForJob Error:', error);
        return [];
    }
}

/** @deprecated Use getProductsForJob instead */
export async function getProductsFromA23DB(): Promise<Product[]> {
    try {
        const client = await pool.connect();
        try {
            const query = `
                SELECT 
                    m.prod_name as id,
                    m.prod_name as model_name,
                    CAST(m.width AS INTEGER) as width,
                    CAST(m.depth AS INTEGER) as length,
                    CAST(m.height AS INTEGER) as height,
                    10 as quantity,
                    m.prod_type
                FROM product_master_sync m
                ORDER BY m.last_used_at DESC NULLS LAST
                LIMIT 50
            `;
            const res = await client.query(query);
            return res.rows.map(row => ({
                id: row.id,
                model_name: row.model_name,
                width: row.width || 0,
                length: row.length || 0,
                height: row.height || 0,
                quantity: row.quantity,
                allow_rotate: true,
                allow_lay_down: (row.model_name && (row.model_name.includes('PSM') || row.model_name.includes('LT'))) || row.prod_type === 'CDZ'
            }));
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('getProductsFromA23DB Error:', error);
        return [];
    }
}
