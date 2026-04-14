const { Client } = require('pg');
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'container_completed',
    password: 'z456qwe12!@',
    port: 5432,
});

client.connect().then(async () => {
    console.log("Connected to DB. Altering table...");
    await client.query(`
        ALTER TABLE completed_containers 
        ADD COLUMN IF NOT EXISTS sim_status VARCHAR(10), 
        ADD COLUMN IF NOT EXISTS sim_packed_qty INTEGER, 
        ADD COLUMN IF NOT EXISTS sim_unpacked_qty INTEGER, 
        ADD COLUMN IF NOT EXISTS sim_efficiency DECIMAL
    `);
    console.log("Table Altered Successfully");
    await client.end();
}).catch(e => {
    console.error(e);
    process.exit(1);
});
