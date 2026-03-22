const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});

async function findCols() {
    try {
        const client = await pool.connect();
        const res = await client.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND (column_name ILIKE '%no%' OR column_name ILIKE '%prod%')
            ORDER BY table_name
        `);
        console.log(JSON.stringify(res.rows, null, 2));
        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
findCols();
