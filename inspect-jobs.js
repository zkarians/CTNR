const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false,
});

async function inspectJobs() {
    try {
        const client = await pool.connect();

        console.log("\n--- Container Jobs (Sample 2) ---");
        const jobs = await client.query(`SELECT * FROM container_jobs LIMIT 2`);
        console.log(JSON.stringify(jobs.rows, null, 2));

        console.log("\n--- Container Results (Sample 2) ---");
        const results = await client.query(`SELECT * FROM container_results LIMIT 2`);
        console.log(JSON.stringify(results.rows, null, 2));

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
inspectJobs();
