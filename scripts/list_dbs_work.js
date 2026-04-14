const { Client } = require('pg');

const config = {
  host: 'work',
  port: 5432,
  user: 'postgres',
  password: 'z456qwe12!@', // standard password used before
  database: 'postgres', // default db
  connectionTimeoutMillis: 5000,
};

async function checkDbs() {
  const client = new Client(config);
  try {
    await client.connect();
    const dbs = await client.query('SELECT datname FROM pg_database');
    console.log("Databases on 'work':", dbs.rows.map(r => r.datname).join(', '));
  } catch (err) {
    console.log("Could not connect to 'work':", err.message);
  } finally {
    await client.end();
  }
}

checkDbs();
