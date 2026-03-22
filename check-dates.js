const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});

async function findJobsBetweenDates() {
    try {
        const client = await pool.connect();

        console.log("--- Querying container_jobs for 2026-03-19 to 2026-03-20 ---");
        const res = await client.query(`
            SELECT id, job_name, saved_at 
            FROM container_jobs 
            WHERE saved_at >= '2026-03-19' AND saved_at < '2026-03-21'
            ORDER BY saved_at DESC
        `);
        console.log(`Found ${res.rows.length} jobs.`);
        if (res.rows.length > 0) {
            console.log(JSON.stringify(res.rows, null, 2));
        }

        console.log("\n--- Checking latest 5 jobs in the entire table ---");
        const latest = await client.query(`SELECT job_name, saved_at FROM container_jobs ORDER BY saved_at DESC LIMIT 5`);
        console.table(latest.rows);

        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
findJobsBetweenDates();
