const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const config = {
    host: 'work',
    port: 5432,
    user: 'postgres',
    password: 'z456qwe12!@',
    database: 'excel',
    connectionTimeoutMillis: 5000,
};

const backupDir = path.join('f:', 'Gemini', 'CTNR', 'data', 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function backup() {
    const client = new Client(config);
    try {
        console.log('Connecting to database...');
        await client.connect();

        // 1. Export Tables
        const tables = ['container_results', 'container_jobs'];
        for (const table of tables) {
            console.log(`Exporting table: ${table}...`);
            const res = await client.query(`SELECT * FROM ${table}`);
            const filePath = path.join(backupDir, `${table}_${timestamp}.json`);
            fs.writeFileSync(filePath, JSON.stringify(res.rows, null, 2));
            console.log(`Saved to ${filePath}`);
        }

        // 2. Backup Excel File
        const excelFile = '26.03.13(주간)웅동수출작업시트.xlsx';
        const excelPath = path.join('f:', 'Gemini', 'CTNR', 'data', excelFile);
        if (fs.existsSync(excelPath)) {
            const parsed = path.parse(excelFile);
            const targetExcelPath = path.join(backupDir, `${parsed.name}_${timestamp}${parsed.ext}`);
            fs.copyFileSync(excelPath, targetExcelPath);
            console.log(`Excel file backed up to ${targetExcelPath}`);
        } else {
            console.warn(`Excel file not found at ${excelPath}`);
        }

        console.log('Backup process completed successfully!');
    } catch (err) {
        console.error('Backup error:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

backup();
