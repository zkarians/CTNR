const { Pool } = require('pg');
const pool = new Pool({ user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false });
async function checkCols() {
    try {
        const client = await pool.connect();
        const res = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name = 'container_jobs'`);
        console.table(res.rows);

        const res2 = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name = 'container_results'`);
        console.table(res2.rows);

        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
checkCols();
