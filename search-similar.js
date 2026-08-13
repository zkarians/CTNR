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
  const res1 = await pool.query(`
    SELECT DISTINCT cntr_no FROM container_results 
    WHERE cntr_no LIKE '%8391%' OR cntr_no LIKE '%5368%' OR cntr_no LIKE '%FESU%'
  `);
  console.log("Similar to FESU5368391 in results:", res1.rows);

  const res2 = await pool.query(`
    SELECT DISTINCT cntr_no FROM container_results 
    WHERE cntr_no LIKE '%6414%' OR cntr_no LIKE '%6606%' OR cntr_no LIKE '%YMMU%'
  `);
  console.log("Similar to YMMU6606414 in results:", res2.rows);

  process.exit(0);
}
run().catch(console.error);
