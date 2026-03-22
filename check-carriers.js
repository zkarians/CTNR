const { Pool } = require('pg');
const pool = new Pool({ user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false });
async function run() {
    try {
        const client = await pool.connect();
        console.log("--- carrier_mappings content ---")
        const res = await client.query(`SELECT * FROM carrier_mappings LIMIT 10`);
        console.table(res.rows);

        console.log("\n--- container_jobs sample again ---")
        const res2 = await client.query(`SELECT * FROM container_jobs LIMIT 5`);
        console.table(res2.rows);

        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
