import { getPool, getProductsForJob } from './src/lib/db';
import { packContainer } from './src/lib/packer';
import { CONTAINER_DATA } from './src/lib/types';

async function main() {
  const pool = getPool();
  try {
    const resJuly = await pool.query(`
      SELECT DISTINCT job_id, cntr_no, etd 
      FROM container_results 
      WHERE etd ILIKE '%07월%' OR etd ILIKE '%2026-07%'
      ORDER BY job_id, cntr_no
    `);
    console.log(`Found ${resJuly.rows.length} July containers in the database:\n`);

    for (const row of resJuly.rows) {
      const jobId = row.job_id;
      const cntrNo = row.cntr_no;
      const etd = row.etd;

      const products = await getProductsForJob(jobId);
      
      // Run the packer with 10 passes (production UI default)
      const container = CONTAINER_DATA['40hc']; 
      const result = packContainer(container, products, 10);

      // Filter out NONASSET.ITEM from unpacked items count
      const realUnpacked = result.unpacked.filter(p => p.id !== 'NONASSET.ITEM');
      const unpackedCount = realUnpacked.reduce((acc, p) => acc + p.quantity, 0);

      console.log(`Job ${jobId} (Container: ${cntrNo}, ETD: ${etd}):`);
      console.log(`  - Total Products (excl. virtual): ${products.filter(p=>p.id!=='NONASSET.ITEM').reduce((acc, p) => acc + p.quantity, 0)}`);
      console.log(`  - Packed: ${result.items.filter(it=>it.product.id!=='NONASSET.ITEM').length}`);
      console.log(`  - Unpacked (real): ${unpackedCount}`);
      if (unpackedCount > 0) {
        console.log(`  - [WARNING] UNPACKED PRODUCTS:`, realUnpacked);
      } else {
        console.log(`  - [SUCCESS] All items packed successfully!`);
      }
      console.log("-".repeat(50));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
