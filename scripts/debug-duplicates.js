require('dotenv').config();
const { Pool } = require('pg');

const config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    ssl: false,
};

async function debugData() {
    const pool = new Pool(config);
    try {
        console.log('🔍 Searching for jobs related to BMOU6300007...');
        
        // 1. Find jobs associated with this container number
        const jobsQuery = `
            SELECT j.id as job_id, j.job_name, j.saved_at, r.cntr_no, r.prod_name, r.qty_plan
            FROM container_jobs j
            JOIN container_results r ON j.id = r.job_id
            WHERE r.cntr_no = 'BMOU6300007'
            ORDER BY j.id, r.prod_name
        `;
        const res = await pool.query(jobsQuery);
        
        console.log(`Found ${res.rows.length} result rows.`);
        
        const jobs = {};
        res.rows.forEach(row => {
            if (!jobs[row.job_id]) {
                jobs[row.job_id] = {
                    name: row.job_name,
                    saved_at: row.saved_at,
                    products: []
                };
            }
            jobs[row.job_id].products.push({
                name: row.prod_name,
                qty: row.qty_plan
            });
        });

        Object.keys(jobs).forEach(jobId => {
            console.log(`\n📦 Job ID: ${jobId}`);
            console.log(`   Job Name: ${jobs[jobId].name}`);
            console.log(`   Saved At: ${jobs[jobId].saved_at}`);
            console.log(`   Products:`, jobs[jobId].products);
        });

    } catch (err) {
        console.error('❌ Debug failed:', err.message);
    } finally {
        await pool.end();
    }
}

debugData();
