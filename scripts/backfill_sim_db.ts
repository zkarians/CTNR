import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function backfill() {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'container_completed',
        password: 'z456qwe12!@',
        port: 5432,
    });

    await client.connect();
    console.log("Connected to DB for backfill.");

    const files = fs.readdirSync('.').filter(f => f.startsWith('packing_simulation_progress_shard_') && f.endsWith('.json'));
    console.log(`Found ${files.length} shard files.`);

    for (const file of files) {
        console.log(`Processing ${file}...`);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const failures = data.failures || [];

        // Note: The shard file only contains FAILURES. 
        // We also need to mark SUCCESSES for the containers that were processed but not in the failure list.
        // Wait, the shard file has "processed" count.
        // For backfill, we'll only update the failures for now, 
        // or we need the list of ALL processed container numbers.

        for (const fail of failures) {
            const { containerNo, unpacked, efficiency } = fail;
            const status = 'FAIL';

            // For each product in this container, update its sim results
            // We need to fetch the products for this container from DB to match them
            const productsRes = await client.query('SELECT product_name, quantity FROM completed_containers WHERE container_no = $1', [containerNo]);

            for (const row of productsRes.rows) {
                const unpackedItem = unpacked.find((u: any) => u.id === row.product_name);
                const unpackedQty = unpackedItem ? unpackedItem.quantity : 0;
                const packedQty = row.quantity - unpackedQty;

                await client.query(`
                    UPDATE completed_containers 
                    SET sim_status = $1, sim_packed_qty = $2, sim_unpacked_qty = $3, sim_efficiency = $4
                    WHERE container_no = $5 AND product_name = $6
                `, [status, packedQty, unpackedQty, efficiency, containerNo, row.product_name]);
            }
        }
    }

    await client.end();
    console.log("Backfill Complete.");
}

backfill().catch(console.error);
