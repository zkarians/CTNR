const { Pool } = require('pg');
const pool = new Pool({ user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false });
async function run() {
    try {
        const client = await pool.connect();
        console.log("--- container_jobs columns ---")
        const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'container_jobs'`);
        console.log(res.rows.map(r => r.column_name).join(', '));

        console.log("\n--- container_results columns ---")
        const res2 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'container_results'`);
        console.log(res2.rows.map(r => r.column_name).join(', '));
        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
