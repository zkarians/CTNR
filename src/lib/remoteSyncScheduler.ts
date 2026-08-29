import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db';
import { uploadToGoogleDrive, findGoogleDriveFileByName } from './gdrive';

const localPool = getPool();
const remotePool = new Pool({
    host: 'idlezero.iptime.org',
    port: 5432,
    database: 'excel',
    user: 'postgres',
    password: 'z456qwe12!@',
    connectionTimeoutMillis: 15000
});

let isSchedulerRunning = false;
let lastAutoSyncDate = '';
let lastAutoGdriveSyncDate = '';

export async function performBackupAndRemoteSync(): Promise<{ success: boolean; message?: string; report?: any; error?: string }> {
    console.log("==========================================");
    console.log("🚀 DB 자동 백업 및 원격 DB 동기화 실행");
    console.log("==========================================");

    let localClient;
    let remoteClient;

    try {
        localClient = await localPool.connect();
        remoteClient = await remotePool.connect();
    } catch (err: any) {
        console.error("❌ DB 연결 실패:", err?.message);
        return { success: false, error: `DB 연결 오류: ${err?.message}` };
    }

    try {
        const tables = [
            'teams',
            'users',
            'container_jobs',
            'container_results',
            'container_photos',
            'container_comments',
            'daily_work_reports',
            'db_config',
            'container_empty_boxes'
        ];

        // 1단계: 로컬 PC DB 백업 파일 생성
        const localBackupData: Record<string, any[]> = {};
        for (const tableName of tables) {
            try {
                const res = await localClient.query(`SELECT * FROM "${tableName}"`);
                localBackupData[tableName] = res.rows;
            } catch (e: any) {
                localBackupData[tableName] = [];
            }
        }

        const backupDir = path.join(process.cwd(), 'scratch', 'auto_backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
        const backupFileName = `ctnr_db_backup_${dateStr}_${timeStr}.json`;
        const backupFilePath = path.join(backupDir, backupFileName);
        fs.writeFileSync(backupFilePath, JSON.stringify(localBackupData, null, 2), 'utf-8');
        console.log(`💾 1단계: 로컬 PC DB 백업 보존 완료 -> ${backupFilePath}`);

        // 2단계: 원격 DB (idlezero.iptime.org) 덮어쓰기 동기화
        await remoteClient.query('BEGIN');

        await remoteClient.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'WORKER',
                team_name VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS container_jobs (
                id VARCHAR(100) PRIMARY KEY,
                job_name VARCHAR(255),
                original_filename VARCHAR(255),
                saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS container_results (
                id VARCHAR(100) PRIMARY KEY,
                job_id VARCHAR(100),
                cntr_no VARCHAR(100),
                prod_name VARCHAR(255),
                qty_plan INT DEFAULT 0,
                division VARCHAR(100),
                transporter VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS container_photos (
                id VARCHAR(100) PRIMARY KEY,
                job_id VARCHAR(100),
                cntr_no VARCHAR(100),
                photo_path TEXT,
                original_name TEXT,
                uploader_username VARCHAR(100),
                uploader_name VARCHAR(100),
                team_id VARCHAR(100),
                team_name VARCHAR(100),
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                file_created_at TIMESTAMP WITH TIME ZONE,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMP WITH TIME ZONE,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                gdrive_file_id VARCHAR(255),
                gdrive_view_link TEXT,
                gdrive_url TEXT,
                work_duration_minutes INT,
                remark TEXT
            );
            CREATE TABLE IF NOT EXISTS container_comments (
                work_date VARCHAR(20) NOT NULL DEFAULT '',
                cntr_no VARCHAR(100) NOT NULL,
                admin_comment TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (work_date, cntr_no)
            );
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS work_date VARCHAR(20) NOT NULL DEFAULT '';
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS cntr_no VARCHAR(100);
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS job_id VARCHAR(100);
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS admin_comment TEXT;
            ALTER TABLE container_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

            CREATE TABLE IF NOT EXISTS daily_work_reports (
                work_date VARCHAR(20) PRIMARY KEY,
                report_text TEXT NOT NULL,
                report_data JSONB,
                saved_by VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS container_empty_boxes (
                job_id VARCHAR(100),
                cntr_no VARCHAR(100),
                box_name VARCHAR(100),
                qty INTEGER NOT NULL DEFAULT 0,
                is_worker_edited BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (job_id, cntr_no, box_name)
            );
            CREATE TABLE IF NOT EXISTS db_config (
                id SERIAL PRIMARY KEY,
                key VARCHAR(100) UNIQUE NOT NULL,
                value TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS file_created_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS gdrive_file_id VARCHAR(255);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS gdrive_view_link TEXT;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS gdrive_url TEXT;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS work_duration_minutes INT;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS remark TEXT;
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploader_username VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS uploader_name VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS team_id VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS team_name VARCHAR(100);
            ALTER TABLE container_photos ADD COLUMN IF NOT EXISTS photo_type VARCHAR(20) DEFAULT 'normal';

            ALTER TABLE container_results ADD COLUMN IF NOT EXISTS transporter VARCHAR(100);
            ALTER TABLE container_results ADD COLUMN IF NOT EXISTS division VARCHAR(100);
        `);

        for (const tableName of tables) {
            const rows = localBackupData[tableName];
            if (!rows || rows.length === 0) continue;

            // Get valid columns that actually exist in the remote table
            const remoteColRes = await remoteClient.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [tableName]);
            const remoteColSet = new Set(remoteColRes.rows.map((r: any) => r.column_name.toLowerCase()));

            const allLocalKeys = Object.keys(rows[0]);
            const columns = allLocalKeys.filter(c => remoteColSet.has(c.toLowerCase()));
            if (columns.length === 0) continue;

            const colNamesSql = columns.map(c => `"${c}"`).join(', ');

            let conflictClause = 'ON CONFLICT DO NOTHING';
            if (tableName === 'daily_work_reports') {
                conflictClause = 'ON CONFLICT (work_date) DO UPDATE SET report_text = EXCLUDED.report_text, report_data = EXCLUDED.report_data, saved_by = EXCLUDED.saved_by, updated_at = EXCLUDED.updated_at';
            } else if (tableName === 'container_comments') {
                conflictClause = 'ON CONFLICT (work_date, cntr_no) DO UPDATE SET admin_comment = EXCLUDED.admin_comment, updated_at = EXCLUDED.updated_at';
            } else if (tableName === 'container_empty_boxes') {
                conflictClause = 'ON CONFLICT (job_id, cntr_no, box_name) DO UPDATE SET qty = EXCLUDED.qty, is_worker_edited = EXCLUDED.is_worker_edited, updated_at = EXCLUDED.updated_at';
            } else if (columns.includes('id')) {
                const updateCols = columns.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
                if (updateCols) {
                    conflictClause = `ON CONFLICT (id) DO UPDATE SET ${updateCols}`;
                }
            } else if (tableName === 'users' && columns.includes('username')) {
                conflictClause = 'ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, team_name = EXCLUDED.team_name';
            }

            const batchSize = 100;
            for (let i = 0; i < rows.length; i += batchSize) {
                const chunk = rows.slice(i, i + batchSize);
                const values: any[] = [];
                const valueTuples: string[] = [];

                chunk.forEach(row => {
                    const rowPlaceholders: string[] = [];
                    columns.forEach(col => {
                        let val = row[col];
                        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
                            val = JSON.stringify(val);
                        }
                        values.push(val);
                        rowPlaceholders.push(`$${values.length}`);
                    });
                    valueTuples.push(`(${rowPlaceholders.join(', ')})`);
                });

                const batchInsertSql = `
                    INSERT INTO "${tableName}" (${colNamesSql})
                    VALUES ${valueTuples.join(', ')}
                    ${conflictClause};
                `;

                await remoteClient.query(batchInsertSql, values);
            }
        }

        await remoteClient.query('COMMIT');
        console.log("🎉 2단계: 원격 DB 고속 동기화 성공!");

        const report: Record<string, { local: number; remote: number }> = {};
        for (const tableName of tables) {
            const localCount = localBackupData[tableName].length;
            const remoteRes = await remoteClient.query(`SELECT COUNT(*) FROM "${tableName}"`);
            const remoteCount = parseInt(remoteRes.rows[0].count, 10);
            report[tableName] = { local: localCount, remote: remoteCount };
        }

        return {
            success: true,
            message: `로컬 DB 백업(${backupFileName}) 및 원격 DB 동기화 완료!`,
            report
        };

    } catch (err: any) {
        if (remoteClient) await remoteClient.query('ROLLBACK');
        console.error("❌ performBackupAndRemoteSync 오류:", err);
        return { success: false, error: `자동 백업 & 동기화 실패: ${err?.message || '알 수 없는 오류'}` };
    } finally {
        if (localClient) localClient.release();
        if (remoteClient) remoteClient.release();
    }
}

export function initRemoteSyncScheduler() {
    if (isSchedulerRunning) return;
    isSchedulerRunning = true;
    console.log("⏰ [스케줄러] 자동 백업 및 동기화 스케줄러 기능이 사용자 요청으로 비활성화되었습니다.");
}
