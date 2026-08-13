const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'excel',
  password: process.env.DB_PASSWORD || 'z456qwe12!@',
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: false,
});

async function run() {
  const res = await pool.query(`
    DELETE FROM container_results 
    WHERE cntr_no = 'TEMU8323535' 
    AND prod_name LIKE '%⚠️%'
    RETURNING id, prod_name
  `);
  console.log("Deleted rows:", res.rows);
  
  process.exit(0);
}
run().catch(console.error);
