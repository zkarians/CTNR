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
            SELECT prod_name as model_name, CAST(width AS INTEGER) as width, CAST(depth AS INTEGER) as length, CAST(height AS INTEGER) as height, prod_type
            FROM product_master_sync
            WHERE prod_name ILIKE $1
            LIMIT 10
        `, [`%${query}%`]);
        client.release();
        return res.rows.map((row: any, idx: number) => ({
            id: `search_${idx}`,
            model_name: row.model_name,
            width: row.width,
            length: row.length,
            height: row.height,
            quantity: 1,
            allow_rotate: true,
            allow_lay_down: (row.model_name && (row.model_name.includes('PSM') || row.model_name.includes('LT'))) || row.prod_type === 'CDZ' || (row.width <= 150 || row.length <= 150 || row.height <= 150)
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
