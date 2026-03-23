const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a354',
    host: 'maizen.iptime.org',
    database: 'u0_a354',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false,
    connectionTimeoutMillis: 5000,
});

async function testConnection() {
    console.log("Attempting to connect to DB at maizen.iptime.org:5432...");
    try {
        const client = await pool.connect();
        console.log("✅ Connection Successful!");
        const res = await client.query('SELECT NOW()');
        console.log("Current time from DB:", res.rows[0].now);

        const tableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('product_master_sync', 'container_results')
        `);
        console.log("Found tables:", tableCheck.rows.map(r => r.table_name));

        client.release();
    } catch (err) {
        console.error("❌ Connection Failed:", err.message);
    } finally {
        await pool.end();
    }
}

testConnection();
