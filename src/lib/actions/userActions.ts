'use server';

import fs from 'fs';
import path from 'path';
import { pool, resetPool } from '@/lib/db';
import { DbConfig } from '@/lib/types';
import { updatePassword as updatePass } from '@/lib/auth';

export async function getDbConfig(): Promise<DbConfig> {
    return {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'excel',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '5432'),
        trash_retention_days: parseInt(process.env.TRASH_RETENTION_DAYS || '15', 10),
        upload_dir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    };
}

export async function updateDbConfig(config: DbConfig): Promise<{ success: boolean; message: string }> {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const lines = envContent.split('\n');
        const newLines = lines.map(line => {
            const [key] = line.split('=');
            if (key === 'DB_USER') return `DB_USER=${config.user}`;
            if (key === 'DB_HOST') return `DB_HOST=${config.host}`;
            if (key === 'DB_NAME') return `DB_NAME=${config.database}`;
            if (key === 'DB_PASSWORD' && config.password) return `DB_PASSWORD=${config.password}`;
            if (key === 'DB_PORT') return `DB_PORT=${config.port}`;
            if (key === 'TRASH_RETENTION_DAYS') return `TRASH_RETENTION_DAYS=${config.trash_retention_days || 15}`;
            if (key === 'UPLOAD_DIR') return `UPLOAD_DIR=${config.upload_dir || ''}`;
            return line;
        });

        // Add missing keys
        const keys = newLines.map(l => l.split('=')[0]);
        if (!keys.includes('DB_USER')) newLines.push(`DB_USER=${config.user}`);
        if (!keys.includes('DB_HOST')) newLines.push(`DB_HOST=${config.host}`);
        if (!keys.includes('DB_NAME')) newLines.push(`DB_NAME=${config.database}`);
        if (!keys.includes('DB_PASSWORD') && config.password) newLines.push(`DB_PASSWORD=${config.password}`);
        if (!keys.includes('DB_PORT')) newLines.push(`DB_PORT=${config.port}`);
        if (!keys.includes('TRASH_RETENTION_DAYS')) newLines.push(`TRASH_RETENTION_DAYS=${config.trash_retention_days || 15}`);
        if (!keys.includes('UPLOAD_DIR')) newLines.push(`UPLOAD_DIR=${config.upload_dir || ''}`);

        fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

        // Refresh process.env
        process.env.DB_USER = config.user;
        process.env.DB_HOST = config.host;
        process.env.DB_NAME = config.database;
        if (config.password) process.env.DB_PASSWORD = config.password;
        process.env.DB_PORT = config.port.toString();
        process.env.TRASH_RETENTION_DAYS = (config.trash_retention_days || 15).toString();
        process.env.UPLOAD_DIR = config.upload_dir || '';

        await resetPool();

        return { success: true, message: '설정이 성공적으로 저장되었으며 DB 연결 풀이 재설정되었습니다.' };
    } catch (error: any) {
        console.error('updateDbConfig Error:', error);
        return { success: false, message: `설정 저장 실패: ${error.message}` };
    }
}

export async function updatePassword(currentPassword: string, newPassword: string) {
    return await updatePass(currentPassword, newPassword);
}

import { 
    getAllUsers as getAuthUsers,
    createUserAccount as createAuthUser,
    updateUserAccount as updateAuthUser,
    deleteUserAccount as deleteAuthUser,
    deleteMultipleUserAccounts as deleteAuthMultipleUsers
} from '@/lib/auth';

export async function fetchAllUsers() {
    return await getAuthUsers();
}

export async function getAllUsers() {
    return await getAuthUsers();
}

export async function createUserAccount(data: {
    username: string;
    name: string;
    password: string;
    role: string;
    isApproved: boolean;
}) {
    return await createAuthUser(data);
}

export async function updateUserAccount(
    id: string,
    data: { name?: string; role?: string; isApproved?: boolean; password?: string }
) {
    return await updateAuthUser(id, data);
}

export async function deleteUserAccount(id: string) {
    return await deleteAuthUser(id);
}

export async function deleteMultipleUserAccounts(ids: string[]) {
    return await deleteAuthMultipleUsers(ids);
}

export async function fetchUsers(): Promise<{ id: string; name: string; username: string }[]> {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT id, name, username FROM "User" ORDER BY name');
            return res.rows;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("fetchUsers Error:", error);
        return [];
    }
}
