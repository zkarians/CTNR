const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false,
});

async function inspectColumns() {
    try {
        const client = await pool.connect();

        console.log("\n--- container_jobs Columns ---");
        const cols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'container_jobs'
            OR table_name = 'container_results'
        `);
        console.log(JSON.stringify(cols.rows, null, 2));

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
inspectColumns();
