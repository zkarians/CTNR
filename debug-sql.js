const { Pool } = require('pg');
const pool = new Pool({
    user: 'u0_a286', host: 'maizen.iptime.org', database: 'u0_a286', password: 'z456qwe12!@', port: 5432, ssl: false,
});
async function test() {
    try {
        const client = await pool.connect();
        const filters = { startDate: '2026-03-19', endDate: '2026-03-20' };

        let whereClauses = [];
        let params = [];
        let paramIdx = 1;

        if (filters.startDate) {
            whereClauses.push(`saved_at >= $${paramIdx++}`);
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            whereClauses.push(`saved_at <= $${paramIdx++}::timestamp + interval '1 day'`);
            params.push(filters.endDate);
        }

        const whereSql = "WHERE " + whereClauses.join(" AND ");
        const query = `
            SELECT 
                id, 
                job_name, 
                container_type, 
                etd,
                (SELECT cntr_no FROM container_results WHERE job_id = container_jobs.id LIMIT 1) as cntr_no
            FROM container_jobs 
            ${whereSql}
            ORDER BY saved_at DESC 
            LIMIT 100
        `;

        console.log("SQL:", query);
        console.log("PARAMS:", params);

        const res = await client.query(query, params);
        console.log("COUNT:", res.rows.length);
        if (res.rows.length > 0) {
            console.log("FIRST ROW Sample:", res.rows[0]);
        }

        client.release();
    } catch (err) { console.error("TEST ERROR:", err); } finally { await pool.end(); }
}
test();
