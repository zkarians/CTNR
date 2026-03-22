const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false,
    connectionTimeoutMillis: 5000,
});

async function inspectSchema() {
    try {
        const client = await pool.connect();
        console.log("✅ Connected. Listing all tables...");

        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log("Tables:", tablesRes.rows.map(r => r.table_name).join(', '));

        for (const table of tablesRes.rows) {
            if (table.table_name.includes('job') || table.table_name.includes('order') || table.table_name.includes('plan')) {
                console.log(`\n--- Structure of ${table.table_name} ---`);
                const cols = await client.query(`
                   SELECT column_name, data_type 
                   FROM information_schema.columns 
                   WHERE table_name = $1
               `, [table.table_name]);
                console.table(cols.rows);

                console.log(`\n--- Sample data from ${table.table_name} ---`);
                const data = await client.query(`SELECT * FROM ${table.table_name} LIMIT 3`);
                console.table(data.rows);
            }
        }

        client.release();
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

inspectSchema();
