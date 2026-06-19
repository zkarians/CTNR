"use server";

import fs from 'fs';
import path from 'path';
import {
    getJobsFromDB,
    getProductsForJob,
    pool,
    resetPool,
    getRemotePool,
    resetRemotePool
} from "./db";
import { Product, Job, JobFilters, DbConfig } from "./types";
import { updatePassword as updatePass } from "./auth";

export async function getDbConfig(): Promise<DbConfig> {
    return {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'excel',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '5432'),
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
            return line;
        });

        // Add missing keys
        const keys = newLines.map(l => l.split('=')[0]);
        if (!keys.includes('DB_USER')) newLines.push(`DB_USER=${config.user}`);
        if (!keys.includes('DB_HOST')) newLines.push(`DB_HOST=${config.host}`);
        if (!keys.includes('DB_NAME')) newLines.push(`DB_NAME=${config.database}`);
        if (!keys.includes('DB_PASSWORD') && config.password) newLines.push(`DB_PASSWORD=${config.password}`);
        if (!keys.includes('DB_PORT')) newLines.push(`DB_PORT=${config.port}`);

        fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

        // Refresh process.env
        process.env.DB_USER = config.user;
        process.env.DB_HOST = config.host;
        process.env.DB_NAME = config.database;
        if (config.password) process.env.DB_PASSWORD = config.password;
        process.env.DB_PORT = config.port.toString();

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
    } catch (error) {
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
    } catch (error) {
        console.error("Failed to fetch products for job:", error);
        return [];
    }
}

export async function updatePassword(currentPassword: string, newPassword: string) {
    return await updatePass(currentPassword, newPassword);
}

export async function syncDb(): Promise<{ success: boolean; message: string; stats?: { jobs: number; results: number; products: number } }> {
    const localClient = await pool.connect();
    const remotePool = getRemotePool();
    const remoteClient = await remotePool.connect();

    try {
        console.log("Starting Remote ➔ Local Database Sync...");
        
        // 1. Sync container_jobs
        const jobsRes = await remoteClient.query(`
            SELECT id, job_name, eta, etd, remark, saved_at 
            FROM container_jobs
        `);
        
        await localClient.query('BEGIN');
        
        console.log("Truncating local tables...");
        await localClient.query('TRUNCATE TABLE container_results, container_jobs, product_master_sync CASCADE');
        
        const jobBatchSize = 500;
        for (let i = 0; i < jobsRes.rows.length; i += jobBatchSize) {
            const batch = jobsRes.rows.slice(i, i + jobBatchSize);
            let queryText = 'INSERT INTO container_jobs (id, job_name, eta, etd, remark, saved_at) VALUES ';
            const values: any[] = [];
            let valIdx = 1;
            
            batch.forEach((row, rowIdx) => {
                if (rowIdx > 0) queryText += ', ';
                queryText += `($${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++})`;
                values.push(row.id, row.job_name, row.eta, row.etd, row.remark, row.saved_at);
            });
            
            await localClient.query(queryText, values);
        }
        
        // 2. Sync container_results
        const resultsRes = await remoteClient.query(`
            SELECT 
                id, job_name, cntr_no, seal_no, prod_name, qty_plan, qty_load, cntr_type, 
                carrier, destination, weight_mixed, etd, eta, remark, saved_at, prod_type, 
                division, dims, weight_orig, weight_down, transporter, adj1, adj1_color, 
                job_id, adj2, qty_pending, qty_remain, qty_packing, work_date 
            FROM container_results
        `);
        
        const resBatchSize = 500;
        const columns = [
            'id', 'job_name', 'cntr_no', 'seal_no', 'prod_name', 'qty_plan', 'qty_load', 'cntr_type', 
            'carrier', 'destination', 'weight_mixed', 'etd', 'eta', 'remark', 'saved_at', 'prod_type', 
            'division', 'dims', 'weight_orig', 'weight_down', 'transporter', 'adj1', 'adj1_color', 
            'job_id', 'adj2', 'qty_pending', 'qty_remain', 'qty_packing', 'work_date'
        ];

        for (let i = 0; i < resultsRes.rows.length; i += resBatchSize) {
            const batch = resultsRes.rows.slice(i, i + resBatchSize);
            let queryText = `INSERT INTO container_results (${columns.join(', ')}) VALUES `;
            const values: any[] = [];
            let valIdx = 1;

            batch.forEach((row, rowIdx) => {
                if (rowIdx > 0) queryText += ', ';
                queryText += '(' + columns.map(() => `$${valIdx++}`).join(', ') + ')';
                
                values.push(
                    row.id,
                    row.job_name,
                    row.cntr_no,
                    row.seal_no,
                    row.prod_name,
                    row.qty_plan !== null ? String(row.qty_plan) : null,
                    row.qty_load !== null ? String(row.qty_load) : null,
                    row.cntr_type,
                    row.carrier,
                    row.destination,
                    row.weight_mixed !== null ? String(row.weight_mixed) : null,
                    row.etd,
                    row.eta,
                    row.remark,
                    row.saved_at !== null ? (row.saved_at instanceof Date ? row.saved_at.toISOString() : String(row.saved_at)) : null,
                    row.prod_type,
                    row.division,
                    row.dims,
                    row.weight_orig !== null ? String(row.weight_orig) : null,
                    row.weight_down !== null ? String(row.weight_down) : null,
                    row.transporter,
                    row.adj1,
                    row.adj1_color,
                    row.job_id,
                    row.adj2,
                    row.qty_pending !== null ? String(row.qty_pending) : null,
                    row.qty_remain !== null ? String(row.qty_remain) : null,
                    row.qty_packing !== null ? String(row.qty_packing) : null,
                    row.work_date
                );
            });

            await localClient.query(queryText, values);
        }

        // 3. Sync product_master_sync
        const pmCountRes = await remoteClient.query('SELECT count(*) FROM product_master_sync');
        const totalPmRows = parseInt(pmCountRes.rows[0].count);
        
        const pmBatchSize = 10000;
        let offset = 0;
        
        while (offset < totalPmRows) {
            const pmRes = await remoteClient.query(`
                SELECT prod_name, width, depth, height, prod_type 
                FROM product_master_sync 
                ORDER BY prod_name
                LIMIT $1 OFFSET $2
            `, [pmBatchSize, offset]);
            
            if (pmRes.rows.length === 0) break;
            
            let queryText = 'INSERT INTO product_master_sync (prod_name, width, depth, height, prod_type) VALUES ';
            const values: any[] = [];
            let valIdx = 1;
            
            pmRes.rows.forEach((row, rowIdx) => {
                if (rowIdx > 0) queryText += ', ';
                queryText += `($${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++}, $${valIdx++})`;
                values.push(
                    row.prod_name,
                    row.width !== null ? String(row.width) : null,
                    row.depth !== null ? String(row.depth) : null,
                    row.height !== null ? String(row.height) : null,
                    row.prod_type
                );
            });
            
            await localClient.query(queryText, values);
            offset += pmRes.rows.length;
        }

        await localClient.query('COMMIT');
        console.log("Remote ➔ Local Database Sync Completed Successfully.");
        
        return {
            success: true,
            message: "성공적으로 원격 DB의 제품 정보 및 컨테이너 작업 데이터가 로컬 DB에 동기화되었습니다.",
            stats: {
                jobs: jobsRes.rows.length,
                results: resultsRes.rows.length,
                products: totalPmRows
            }
        };
    } catch (err: any) {
        await localClient.query('ROLLBACK');
        console.error("Database Sync Error:", err);
        return {
            success: false,
            message: `동기화 실패: ${err.message}`
        };
    } finally {
        localClient.release();
        remoteClient.release();
    }
}

