const { Client } = require('pg');
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'container_completed',
    password: 'z456qwe12!@',
    port: 5432,
});

client.connect().then(async () => {
    const res = await client.query("SELECT * FROM completed_containers WHERE container_no = 'APHU6540790'");
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}).catch(err => {
    console.error(err);
    process.exit(1);
});
