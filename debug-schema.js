const { Pool } = require('pg');
const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false
});

async function checkSchema() {
    try {
        const query = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'container_results'
            ORDER BY ordinal_position
        `;
        const res = await pool.query(query);
        console.log('--- container_results schema ---');
        console.log(JSON.stringify(res.rows, null, 2));

        const query2 = `SELECT * FROM container_results WHERE cntr_no = 'FFAU7551332' LIMIT 1`;
        const res2 = await pool.query(query2);
        console.log('\n--- Sample Row for FFAU7551332 ---');
        console.log(JSON.stringify(res2.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSchema();
