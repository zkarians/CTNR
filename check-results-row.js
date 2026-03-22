const { Pool } = require('pg');
const pool = new Pool({ user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false });
async function run() {
    try {
        const client = await pool.connect();
        const res = await client.query(`SELECT * FROM container_results LIMIT 1`);
        console.log(JSON.stringify(res.rows[0], null, 2));
        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
run();
