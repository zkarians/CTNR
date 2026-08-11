const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'excel',
    password: 'z456qwe12!@',
    port: 5432,
});

async function run() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS manual_report_entries (
                id SERIAL PRIMARY KEY,
                work_date VARCHAR(20) NOT NULL,
                team_name VARCHAR(100) NOT NULL,
                cntr_no VARCHAR(100) NOT NULL,
                category VARCHAR(100),
                duration_minutes INTEGER DEFAULT 45,
                remark TEXT,
                products JSONB,
                empty_boxes JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('manual_report_entries table created successfully.');
    } catch(e) {
        console.error('Error creating table:', e);
    } finally {
        await pool.end();
    }
}

run();
