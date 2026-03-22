const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});

async function testFilter() {
    try {
        const client = await pool.connect();

        console.log("--- TEST: Product Search ---");
        const prodSearch = await client.query(`
            SELECT id, job_name FROM container_jobs 
            WHERE id IN (SELECT job_id FROM container_results WHERE prod_name ILIKE '%ABG0%')
            LIMIT 5
        `);
        console.log("Prod Search Results:", prodSearch.rows.length);
        console.log(prodSearch.rows);

        console.log("\n--- TEST: Date Search (Sample) ---");
        const dateSample = await client.query(`SELECT saved_at FROM container_jobs LIMIT 1`);
        console.log("Sample saved_at:", dateSample.rows[0].saved_at);

        const dateSearch = await client.query(`
            SELECT id, job_name FROM container_jobs 
            WHERE saved_at >= '2026-03-01'
            LIMIT 5
        `);
        console.log("Date Search Results:", dateSearch.rows.length);

        console.log("\n--- TEST: Container No Search ---");
        const cntrSearch = await client.query(`
            SELECT id, job_name FROM container_jobs 
            WHERE id IN (SELECT job_id FROM container_results WHERE cntr_no IS NOT NULL AND cntr_no != '')
            LIMIT 5
        `);
        console.log("Jobs with Cntr No:", cntrSearch.rows.length);

        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
testFilter();
