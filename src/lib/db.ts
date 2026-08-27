import { Pool } from 'pg';
import { Job, JobFilters, Product, mapContainerType } from './types';

let _pool: Pool | null = null;

export function getPool(): Pool {
    if (!_pool) {
        _pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || '127.0.0.1',
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
                work_date VARCHAR(20) NOT NULL DEFAULT '',
                cntr_no VARCHAR(100) NOT NULL,
                admin_comment TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (work_date, cntr_no)
            );
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS work_date VARCHAR(20) NOT NULL DEFAULT '';

            CREATE TABLE IF NOT EXISTS container_empty_boxes (
                job_id INTEGER REFERENCES container_jobs(id) ON DELETE CASCADE,
                cntr_no VARCHAR(100) NOT NULL,
                box_name VARCHAR(100) NOT NULL,
                qty INTEGER NOT NULL DEFAULT 0,
                is_worker_edited BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (job_id, cntr_no, box_name)
            );

            -- Run one-time migration: Populate container_empty_boxes from container_results db_remark
            DO $$
            DECLARE
                r RECORD;
                match_arr TEXT[];
                box_name VARCHAR;
                qty INTEGER;
            BEGIN
                -- This will only insert if the table is currently empty, avoiding repeated expensive parsing
                IF NOT EXISTS (SELECT 1 FROM container_empty_boxes LIMIT 1) THEN
                    FOR r IN 
                        SELECT job_id, cntr_no, MAX(remark) as db_remark 
                        FROM container_results 
                        WHERE remark IS NOT NULL AND remark LIKE '%MAY%'
                        GROUP BY job_id, cntr_no 
                    LOOP
                        -- Simple regex parsing using regexp_matches in postgres
                        FOR match_arr IN SELECT regexp_matches(r.db_remark, '(MAY[A-Z0-9]+)\\s*\\*?\\s*([0-9]+)', 'gi')
                        LOOP
                            BEGIN
                                box_name := UPPER(match_arr[1]);
                                qty := match_arr[2]::INTEGER;
                                INSERT INTO container_empty_boxes (job_id, cntr_no, box_name, qty, is_worker_edited)
                                VALUES (r.job_id, r.cntr_no, box_name, qty, false)
                                ON CONFLICT DO NOTHING;
                            EXCEPTION WHEN OTHERS THEN
                                -- Ignore casting errors etc
                            END;
                        END LOOP;
                    END LOOP;
                END IF;
            END $$;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'container_comments_pkey' 
                    AND table_name = 'container_comments'
                ) THEN
                    ALTER TABLE container_comments DROP CONSTRAINT container_comments_pkey;
                    ALTER TABLE container_comments ADD PRIMARY KEY (work_date, cntr_no);
                END IF;
            EXCEPTION
                WHEN OTHERS THEN NULL;
            END $$;
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
            // 1. 동일 지시서명(job_name) 및 동일 컨테이너(cntr_no)인데 job_id가 쪼개져 있는 경우, 최신/사진 매핑 메인 job_id로 자동 일원화 (Self-Healing)
            await client.query(`
                WITH DuplicateJobs AS (
                    SELECT 
                        r.job_name,
                        r.cntr_no,
                        COALESCE(
                            (SELECT cp.job_id FROM container_photos cp WHERE cp.job_id = ANY(ARRAY_AGG(DISTINCT r.job_id)) AND (cp.is_deleted IS NOT TRUE) ORDER BY cp.id DESC LIMIT 1),
                            MAX(r.job_id)
                        ) as target_job_id,
                        ARRAY_AGG(DISTINCT r.job_id) as all_job_ids
                    FROM container_results r
                    WHERE r.job_name IS NOT NULL AND r.cntr_no IS NOT NULL
                    GROUP BY r.job_name, r.cntr_no
                    HAVING COUNT(DISTINCT r.job_id) > 1
                )
                UPDATE container_results cr
                SET job_id = dj.target_job_id
                FROM DuplicateJobs dj
                WHERE cr.job_name = dj.job_name 
                  AND cr.cntr_no = dj.cntr_no 
                  AND cr.job_id != dj.target_job_id;
            `);

            // 2. 사진 레코드 중 job_id가 다른 분할 job으로 매핑된 경우도 target_job_id로 자동 정렬
            await client.query(`
                WITH DuplicateJobs AS (
                    SELECT 
                        r.job_name,
                        r.cntr_no,
                        MAX(r.job_id) as target_job_id,
                        ARRAY_AGG(DISTINCT r.job_id) as all_job_ids
                    FROM container_results r
                    WHERE r.job_name IS NOT NULL AND r.cntr_no IS NOT NULL
                    GROUP BY r.job_name, r.cntr_no
                    HAVING COUNT(DISTINCT r.job_id) > 1
                )
                UPDATE container_photos cp
                SET job_id = dj.target_job_id
                FROM DuplicateJobs dj
                WHERE cp.cntr_no = dj.cntr_no 
                  AND cp.job_id = ANY(dj.all_job_ids) 
                  AND cp.job_id != dj.target_job_id;
            `);

            // 3. 외부 ERP/엑셀 연동 시 job_id가 NULL인 행들을 가장 최신 단일 job_id로 안전하게 복구
            await client.query(`
                UPDATE container_results r
                SET job_id = sub.id
                FROM (
                    SELECT DISTINCT ON (job_name) id, job_name
                    FROM container_jobs
                    ORDER BY job_name, id DESC
                ) sub
                WHERE r.job_name = sub.job_name AND r.job_id IS NULL;
            `);

            // 4. 품목이 완전히 비어버린 중복 container_jobs 행 자동 정리
            await client.query(`
                DELETE FROM container_jobs j
                WHERE NOT EXISTS (SELECT 1 FROM container_results r WHERE r.job_id = j.id)
                  AND NOT EXISTS (SELECT 1 FROM container_photos p WHERE p.job_id = j.id)
                  AND EXISTS (
                      SELECT 1 FROM container_jobs j2 
                      WHERE j2.job_name = j.job_name AND j2.id != j.id
                  );
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

            // 기본 조건: 필터가 아무것도 없을 경우 최근 30일 데이터만 조회 (서버 부하 및 OOM 방지)
            if (whereClauses.length === 0) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
                whereClauses.push(`j.saved_at >= $${paramIdx++}`);
                params.push(dateStr);
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
                        r.model_count,
                        r.total_qty,
                        r.db_remark,
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
                        (SELECT p.remark FROM container_photos p WHERE p.job_id = j.id AND (r.cntr_no IS NULL OR p.cntr_no = r.cntr_no) AND (p.is_deleted IS NOT TRUE) AND p.remark IS NOT NULL AND p.remark != '' ORDER BY p.id DESC LIMIT 1) as last_remark,
                        (SELECT json_agg(json_build_object('name', eb.box_name, 'qty', eb.qty)) FROM container_empty_boxes eb WHERE eb.job_id = j.id AND eb.cntr_no = r.cntr_no AND eb.qty > 0) as empty_boxes,
                        (SELECT MAX(eb.updated_at) FROM container_empty_boxes eb WHERE eb.job_id = j.id AND eb.cntr_no = r.cntr_no) as empty_boxes_updated_at
                    FROM container_jobs j
                    LEFT JOIN (
                        SELECT cr.job_id,
                               MAX(cntr_no) as cntr_no,
                               MAX(transporter) as transporter, 
                               MAX(cntr_type) as cntr_type,
                               COUNT(DISTINCT prod_name)::integer as model_count,
                               SUM(qty_plan)::integer as total_qty,
                               MAX(cr.remark) as db_remark
                        FROM container_results cr
                        GROUP BY cr.job_id
                    ) r ON r.job_id = j.id
                    ${whereSql}
                    ORDER BY COALESCE(r.cntr_no, j.id::text), j.job_name, j.saved_at DESC, j.id DESC
                ) sub
                ORDER BY saved_at DESC, id DESC 
                LIMIT 500
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
                db_remark: row.db_remark || undefined,
                empty_boxes: Array.isArray(row.empty_boxes) ? row.empty_boxes : [],
                empty_boxes_updated_at: row.empty_boxes_updated_at ? new Date(row.empty_boxes_updated_at).toISOString() : undefined,
                model_count: row.model_count ? Number(row.model_count) : undefined,
                total_qty: row.total_qty ? Number(row.total_qty) : undefined,
                work_date: (() => {
                    const savedAt = row.saved_at ? new Date(row.saved_at) : null;
                    if (savedAt && !isNaN(savedAt.getTime())) {
                        return savedAt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(' ', '');
                    }
                    // Fallback to ETD if saved_at is missing/invalid (e.g., "04월 21일" -> "04.21.")
                    if (row.etd && typeof row.etd === 'string') {
                        const etdMatch = row.etd.match(/(\\d{1,2})월\\s*(\\d{1,2})일/);
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
                    COALESCE(m.width, 0) as width,
                    COALESCE(m.depth, 0) as length,
                    COALESCE(m.height, 0) as height,
                    SUM(COALESCE(r.qty_plan, 0)) as quantity,
                    m.prod_type,
                    MAX(r.division) as division
                FROM container_results r
                LEFT JOIN product_master_sync m ON r.prod_name = m.prod_name
                WHERE r.job_id = $1
                  AND COALESCE(r.qty_plan, 0) > 0
                GROUP BY r.prod_name, m.width, m.depth, m.height, m.prod_type
            `;
            
            const res = await client.query(query, [jobId]);

            return res.rows.map(row => {
                const isDFZ = (row.division || '').toUpperCase().includes('DFZ');
                const modelName = row.model_name || row.id || '';
                return {
                    id: row.id || modelName,
                    name: modelName,
                    model_name: modelName,
                    division: row.division || '',
                    width: isDFZ ? Number(row.length) : Number(row.width),
                    length: isDFZ ? Number(row.width) : Number(row.length),
                    height: Number(row.height),
                    quantity: Number(row.quantity),
                    allow_rotate: true,
                    allow_lay_down: false,
                    prod_type: row.prod_type
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
