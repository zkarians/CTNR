'use server';

import { pool, getJobsFromDB, getProductsForJob } from '@/lib/db';
import { Job, JobFilters, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';

export async function fetchJobs(filters?: JobFilters): Promise<Job[]> {
    return await getJobsFromDB(filters);
}

export async function searchProducts(query: string): Promise<Product[]> {
    try {
        const client = await pool.connect();
        try {
            const sql = `
                SELECT DISTINCT ON (prod_name)
                    prod_name as id,
                    prod_name as model_name,
                    width,
                    depth as length,
                    height
                FROM product_master_sync
                WHERE prod_name ILIKE $1
                LIMIT 20
            `;
            const res = await client.query(sql, [`%${query}%`]);
            return res.rows.map(row => ({
                id: row.id,
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
    } catch (error) {
        console.error('searchProducts error:', error);
        return [];
    }
}

export async function fetchProductsByJob(jobId: number): Promise<Product[]> {
    return await getProductsForJob(jobId);
}

export async function deleteContainerResult(jobId: string, prodName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(
                'DELETE FROM container_results WHERE job_id = $1 AND prod_name = $2',
                [jobId, prodName]
            );
            revalidatePath('/');
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('deleteContainerResult error:', error);
        return { success: false, error: error.message || '삭제 실패' };
    }
}
