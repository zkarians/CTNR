'use server';

import { pool } from '@/lib/db';

export async function exportDatabaseDump(): Promise<{ success: boolean; dump?: any; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const tables = ['teams', 'users', 'container_jobs', 'container_results', 'container_photos', 'container_comments', 'daily_work_reports', 'db_config'];
            const dumpData: any = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                tables: {}
            };

            for (const table of tables) {
                try {
                    const res = await client.query(`SELECT * FROM ${table}`);
                    dumpData.tables[table] = res.rows;
                } catch (e) {
                    dumpData.tables[table] = [];
                }
            }

            return { success: true, dump: dumpData };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("exportDatabaseDump Error:", err);
        return { success: false, error: `DB 백업 추출 오류: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function restoreDatabaseDump(dumpData: any): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!dumpData || !dumpData.tables) {
        return { success: false, error: '유효하지 않은 백업 데이터 파일입니다.' };
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const tables = dumpData.tables;

            // Restore teams
            if (Array.isArray(tables.teams)) {
                for (const row of tables.teams) {
                    await client.query(`
                        INSERT INTO teams (id, name, created_at)
                        VALUES ($1, $2, COALESCE($3::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
                    `, [row.id, row.name, row.created_at]);
                }
            }

            // Restore users
            if (Array.isArray(tables.users)) {
                for (const row of tables.users) {
                    await client.query(`
                        INSERT INTO users (id, username, password_hash, name, role, team_name, is_active, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), COALESCE($8::timestamp, NOW()))
                        ON CONFLICT (username) DO UPDATE SET
                            name = EXCLUDED.name,
                            role = EXCLUDED.role,
                            team_name = EXCLUDED.team_name,
                            is_active = EXCLUDED.is_active;
                    `, [row.id, row.username, row.password_hash, row.name, row.role, row.team_name, row.is_active, row.created_at]);
                }
            }

            // Restore container_jobs
            if (Array.isArray(tables.container_jobs)) {
                for (const row of tables.container_jobs) {
                    await client.query(`
                        INSERT INTO container_jobs (id, job_name, original_filename, saved_at)
                        VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET
                            job_name = EXCLUDED.job_name,
                            original_filename = EXCLUDED.original_filename;
                    `, [row.id, row.job_name, row.original_filename, row.saved_at]);
                }
            }

            // Restore container_results
            if (Array.isArray(tables.container_results)) {
                for (const row of tables.container_results) {
                    await client.query(`
                        INSERT INTO container_results (id, job_id, cntr_no, prod_name, qty_plan, division, transporter, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW()))
                        ON CONFLICT (id) DO UPDATE SET
                            qty_plan = EXCLUDED.qty_plan,
                            division = EXCLUDED.division,
                            transporter = EXCLUDED.transporter;
                    `, [row.id, row.job_id, row.cntr_no, row.prod_name, row.qty_plan, row.division, row.transporter, row.created_at]);
                }
            }

            // Restore container_photos
            if (Array.isArray(tables.container_photos)) {
                for (const row of tables.container_photos) {
                    await client.query(`
                        INSERT INTO container_photos (
                            id, job_id, cntr_no, photo_path, original_name, uploader_username, uploader_name, team_id, team_name,
                            uploaded_at, file_created_at, is_completed, completed_at, is_deleted, deleted_at, gdrive_file_id,
                            gdrive_view_link, work_duration_minutes, remark
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamp, NOW()), $11, $12, $13, $14, $15, $16, $17, $18, $19)
                        ON CONFLICT (id) DO UPDATE SET
                            is_completed = EXCLUDED.is_completed,
                            completed_at = EXCLUDED.completed_at,
                            is_deleted = EXCLUDED.is_deleted,
                            deleted_at = EXCLUDED.deleted_at,
                            gdrive_file_id = EXCLUDED.gdrive_file_id,
                            gdrive_view_link = EXCLUDED.gdrive_view_link,
                            work_duration_minutes = EXCLUDED.work_duration_minutes,
                            remark = EXCLUDED.remark;
                    `, [
                        row.id, row.job_id, row.cntr_no, row.photo_path, row.original_name, row.uploader_username, row.uploader_name, row.team_id, row.team_name,
                        row.uploaded_at, row.file_created_at, row.is_completed, row.completed_at, row.is_deleted, row.deleted_at, row.gdrive_file_id,
                        row.gdrive_view_link, row.work_duration_minutes, row.remark
                    ]);
                }
            }

            // Restore container_comments
            if (Array.isArray(tables.container_comments)) {
                for (const row of tables.container_comments) {
                    const wDate = row.work_date || '';
                    await client.query(`
                        INSERT INTO container_comments (work_date, cntr_no, admin_comment, updated_at)
                        VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()))
                        ON CONFLICT (work_date, cntr_no) DO UPDATE SET
                            admin_comment = EXCLUDED.admin_comment,
                            updated_at = NOW();
                    `, [wDate, row.cntr_no, row.admin_comment, row.updated_at]);
                }
            }

            // Restore daily_work_reports
            if (Array.isArray(tables.daily_work_reports)) {
                for (const row of tables.daily_work_reports) {
                    await client.query(`
                        INSERT INTO daily_work_reports (work_date, report_text, report_data, saved_by, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()), COALESCE($6::timestamp, NOW()))
                        ON CONFLICT (work_date) DO UPDATE SET
                            report_text = EXCLUDED.report_text,
                            report_data = EXCLUDED.report_data,
                            saved_by = EXCLUDED.saved_by,
                            updated_at = EXCLUDED.updated_at;
                    `, [row.work_date, row.report_text, JSON.stringify(row.report_data || []), row.saved_by, row.created_at, row.updated_at]);
                }
            }

            await client.query('COMMIT');
            return { success: true, message: 'DB 백업 데이터가 성공적으로 복구되었습니다.' };
        } catch (err: any) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("restoreDatabaseDump Error:", err);
        return { success: false, error: `DB 복구 실패: ${err?.message || '알 수 없는 오류'}` };
    }
}

export async function getAutoSyncConfig(): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS db_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            const res = await client.query("SELECT value FROM db_config WHERE key = 'auto_remote_sync_enabled'");
            const enabled = res.rows.length > 0 ? res.rows[0].value === 'true' : true;
            return { success: true, enabled };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("getAutoSyncConfig Error:", err);
        return { success: false, enabled: true, error: err?.message };
    }
}

export async function updateAutoSyncConfig(enabled: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO db_config (key, value, updated_at)
                VALUES ('auto_remote_sync_enabled', $1, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
            `, [enabled ? 'true' : 'false']);
            return { success: true, message: `매일 13:00 DB 자동 백업 & 원격 동기화가 ${enabled ? '활성화(ON)' : '비활성화(OFF)'} 되었습니다.` };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("updateAutoSyncConfig Error:", err);
        return { success: false, error: err?.message };
    }
}

export async function getAutoGdriveSyncConfig(): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS db_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value TEXT,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            const res = await client.query("SELECT value FROM db_config WHERE key = 'auto_gdrive_sync_enabled'");
            return { success: true, enabled: res.rows.length > 0 ? res.rows[0].value === 'true' : true };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("getAutoGdriveSyncConfig Error:", err);
        return { success: false, enabled: true, error: err?.message };
    }
}

export async function updateAutoGdriveSyncConfig(enabled: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO db_config (key, value, updated_at)
                VALUES ('auto_gdrive_sync_enabled', $1, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
            `, [enabled ? 'true' : 'false']);
            return { success: true, message: `낮 12:30 GDrive 자동 백업 및 용량 정리가 ${enabled ? '활성화(ON)' : '비활성화(OFF)'} 되었습니다.` };
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("updateAutoGdriveSyncConfig Error:", err);
        return { success: false, error: err?.message };
    }
}

export async function triggerManualBackupAndSync(): Promise<{ success: boolean; message?: string; report?: any; error?: string }> {
    try {
        const { performBackupAndRemoteSync } = await import('@/lib/remoteSyncScheduler');
        return await performBackupAndRemoteSync();
    } catch (err: any) {
        console.error("triggerManualBackupAndSync Error:", err);
        return { success: false, error: err?.message || '실행 중 오류가 발생했습니다.' };
    }
}
