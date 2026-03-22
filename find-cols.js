const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});

async function findColumns() {
    try {
        const client = await pool.connect();

        console.log("--- TABLES ---");
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(tables.rows.map(r => r.table_name).join(', '));

        console.log("\n--- SEARCHING FOR COLS ---");
        const cols = await client.query(`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE column_name ILIKE '%cntr%' 
               OR column_name ILIKE '%container%no%' 
               OR column_name ILIKE '%prod%'
               OR column_name ILIKE '%item%'
            AND table_schema = 'public'
        `);
        console.table(cols.rows);

        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
findColumns();
