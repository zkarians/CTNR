import { Client } from 'pg';
import { packContainer } from '../src/lib/packer';
import { CONTAINER_DATA, mapContainerType, Product } from '../src/lib/types';
import * as fs from 'fs';

async function runSimulation() {
    const shard = parseInt(process.argv[2]) || 0;
    const totalShards = parseInt(process.argv[3]) || 1;
    console.log(`Running Shard ${shard}/${totalShards}`);

    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'container_completed',
        password: 'z456qwe12!@',
        port: 5432,
    });

    try {
        await client.connect();
        console.log('Fetching container data...');

        // Fetch all data grouped by container_no
        // Fetch only containers that haven't been simulated yet
        const res = await client.query('SELECT * FROM completed_containers WHERE sim_status IS NULL ORDER BY container_no');
        const rows = res.rows;

        const containerGroups: Record<string, any[]> = {};
        rows.forEach(r => {
            const key = r.container_no;
            if (!containerGroups[key]) containerGroups[key] = [];
            containerGroups[key].push(r);
        });

        const allCntrNumbers = Object.keys(containerGroups);
        const cntrNumbers = allCntrNumbers.filter((_, idx) => idx % totalShards === shard);
        console.log(`Analyzing ${cntrNumbers.length} unique containers (Shard ${shard})...`);

        const failures: any[] = [];
        let totalProcessed = 0;

        for (const cntrNo of cntrNumbers) {
            const items = containerGroups[cntrNo];
            const spec = items[0].container_spec;
            const containerType = mapContainerType(spec);
            const containerDim = CONTAINER_DATA[containerType];

            const products: Product[] = items.map(i => ({
                id: i.product_name,
                model_name: i.product_name,
                width: Number(i.width),
                length: Number(i.depth), // Using depth as length in packer
                height: Number(i.height),
                quantity: Number(i.quantity),
                allow_rotate: true,
                allow_lay_down: false
            }));

            // Run packer
            const result = packContainer(containerDim, products, 1); // 1 pass for speed in large scale

            // Update DB in real-time
            const isSuccess = result.unpacked.length === 0;
            const status = isSuccess ? 'SUCCESS' : 'FAIL';

            for (const item of items) {
                const unpackedItem = result.unpacked.find(u => u.id === item.product_name);
                const unpackedQty = unpackedItem ? unpackedItem.quantity : 0;
                const packedQty = Number(item.quantity) - unpackedQty;

                await client.query(`
                    UPDATE completed_containers 
                    SET sim_status = $1, sim_packed_qty = $2, sim_unpacked_qty = $3, sim_efficiency = $4
                    WHERE id = $5
                `, [status, packedQty, unpackedQty, result.efficiency, item.id]);
            }

            if (!isSuccess) {
                failures.push({
                    containerNo: cntrNo,
                    spec,
                    totalItems: products.reduce((acc, p) => acc + p.quantity, 0),
                    packedCount: products.reduce((acc, p) => acc + p.quantity, 0) - result.unpacked.reduce((acc, u) => acc + u.quantity, 0),
                    unpacked: result.unpacked.map(u => ({ id: u.id, quantity: u.quantity })),
                    efficiency: result.efficiency
                });
            }

            totalProcessed++;
            if (totalProcessed % 500 === 0) {
                console.log(`Processed ${totalProcessed} / ${cntrNumbers.length} containers...`);
                // Save progress
                fs.writeFileSync(`packing_simulation_progress_shard_${shard}.json`, JSON.stringify({
                    summary: {
                        totalContainers: cntrNumbers.length,
                        processed: totalProcessed,
                        failedCount: failures.length,
                    },
                    failures: failures
                }, null, 2));
            }
        }

        console.log(`\nSimulation Complete (Shard ${shard})!`);
        console.log(`Total Failures: ${failures.length} / ${cntrNumbers.length}`);

        const reportFile = `packing_simulation_results_shard_${shard}.json`;
        fs.writeFileSync(reportFile, JSON.stringify({
            summary: {
                totalContainers: cntrNumbers.length,
                failedCount: failures.length,
                successRate: ((cntrNumbers.length - failures.length) / cntrNumbers.length * 100).toFixed(2) + '%'
            },
            failures: failures
        }, null, 2));

        console.log(`✅ Results saved to ${reportFile}`);

    } catch (err: any) {
        console.error('❌ Simulation Error:', err.message);
    } finally {
        await client.end();
    }
}

runSimulation();
