
const { Pool } = require('pg');

const config = {
    user: 'root',
    host: 'localhost',
    database: 'worker_db',
    password: '',
    port: 26257,
    ssl: false
};

async function check() {
    const pool = new Pool(config);
    try {
        console.log("Connecting to CockroachDB...");
        const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log("Tables found:", res.rows.map(r => r.table_name));
        
        for (const tableRow of res.rows) {
            const table = tableRow.table_name;
            const columns = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
            console.log(`Columns for ${table}:`, columns.rows.map(c => `${c.column_name}(${c.data_type})`));
            
            // Try to see data sample
            const data = await pool.query(`SELECT * FROM ${table} LIMIT 3`);
            console.log(`Data for ${table}:`, data.rows);
        }
    } catch (err) {
        console.error("Connection failed:", err.message);
    } finally {
        await pool.end();
    }
}

check();
