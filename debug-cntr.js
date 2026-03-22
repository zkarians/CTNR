const { Pool } = require('pg');
const pool = new Pool({
    user: 'u0_a286',
    host: 'maizen.iptime.org',
    database: 'u0_a286',
    password: 'z456qwe12!@',
    port: 5432,
    ssl: false
});

async function checkContainer() {
    try {
        const query = `
            SELECT cntr_no, job_id, prod_name, qty_plan
            FROM container_results 
            WHERE cntr_no = 'FFAU7551332'
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.log('--- Container Info for FFAU7551332 ---');
        console.log(JSON.stringify(res.rows, null, 2));

        if (res.rows.length > 0) {
            const jobId = res.rows[0].job_id;
            const jobQuery = `SELECT id, job_name FROM container_jobs WHERE id = $1`;
            const jobRes = await pool.query(jobQuery, [jobId]);
            console.log('\n--- Job Info ---');
            console.log(JSON.stringify(jobRes.rows, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkContainer();
