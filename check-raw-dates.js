const { Pool } = require('pg');
const pool = new Pool({ user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false });
async function run() {
    try {
        const client = await pool.connect();
        const res = await client.query(`SELECT id, job_name, saved_at FROM container_jobs WHERE saved_at >= '2026-03-19' AND saved_at < '2026-03-21' ORDER BY saved_at DESC`);
        console.log(`FOUND_COUNT: ${res.rows.length}`);
        console.log("DATA_JSON_START");
        console.log(JSON.stringify(res.rows, null, 2));
        console.log("DATA_JSON_END");
        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
