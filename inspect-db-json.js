const { Pool } = require('pg');

const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});

async function findJobRelated() {
    try {
        const client = await pool.connect();
        const tablesRes = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        const tableNames = tablesRes.rows.map(r => r.table_name);
        console.log("Found Tables:", tableNames.join(', '));

        const interesting = tableNames.filter(t => t.toLowerCase().includes('job') || t.toLowerCase().includes('order') || t.toLowerCase().includes('plan') || t.toLowerCase().includes('work') || t.toLowerCase().includes('item') || t.toLowerCase().includes('product'));
        console.log("Interesting Tables:", interesting.join(', '));

        for (const t of interesting) {
            console.log(`\n\n--- TABLE: ${t} (Sample 2) ---`);
            const data = await client.query(`SELECT * FROM ${t} LIMIT 2`);
            if (data.rows.length > 0) {
                console.log(JSON.stringify(data.rows, null, 2));
            } else {
                console.log("[EMPTY]");
            }
        }
        client.release();
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
findJobRelated();
