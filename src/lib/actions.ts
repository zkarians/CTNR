"use server";

import {
    getJobsFromDB,
    getProductsForJob,
    pool
} from "./db";
import { Product, Job, JobFilters } from "./types";


export async function fetchJobs(filters?: JobFilters): Promise<Job[]> {
    try {
        return await getJobsFromDB(filters);
    } catch (error) {
        console.error("Failed to fetch jobs:", error);
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
