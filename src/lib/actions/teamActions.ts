'use server';

import { pool } from '@/lib/db';
import { Team } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

export async function fetchTeams(): Promise<Team[]> {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT id, name FROM teams ORDER BY name ASC');
            return res.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('fetchTeams error:', error);
        return [];
    }
}

export async function createTeam(name: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || session.role.toUpperCase() !== 'ADMIN') {
            return { success: false, error: '관리자 권한이 필요합니다.' };
        }

        const trimmed = name.trim();
        if (!trimmed) {
            return { success: false, error: '조 이름을 입력해주세요.' };
        }

        const client = await pool.connect();
        try {
            await client.query('INSERT INTO teams (name) VALUES ($1)', [trimmed]);
            revalidatePath('/');
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('createTeam error:', error);
        return { success: false, error: error.message || '조 생성 실패' };
    }
}

export async function updateTeam(id: number, name: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || session.role.toUpperCase() !== 'ADMIN') {
            return { success: false, error: '관리자 권한이 필요합니다.' };
        }

        const trimmed = name.trim();
        if (!trimmed) {
            return { success: false, error: '조 이름을 입력해주세요.' };
        }

        const client = await pool.connect();
        try {
            await client.query('UPDATE teams SET name = $1 WHERE id = $2', [trimmed, id]);
            revalidatePath('/');
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('updateTeam error:', error);
        return { success: false, error: error.message || '조 수정 실패' };
    }
}

export async function deleteTeam(id: number): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || session.role.toUpperCase() !== 'ADMIN') {
            return { success: false, error: '관리자 권한이 필요합니다.' };
        }

        const client = await pool.connect();
        try {
            await client.query('UPDATE "User" SET "teamId" = NULL WHERE "teamId" = $1', [id]);
            await client.query('UPDATE container_photos SET team_id = NULL WHERE team_id = $1', [id]);
            await client.query('DELETE FROM teams WHERE id = $1', [id]);
            revalidatePath('/');
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('deleteTeam error:', error);
        return { success: false, error: error.message || '조 삭제 실패' };
    }
}

export async function selectTeam(teamId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: '로그인이 필요합니다.' };
        }

        const client = await pool.connect();
        try {
            await client.query('UPDATE "User" SET "teamId" = $1 WHERE id = $2', [teamId, session.id]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('selectTeam error:', error);
        return { success: false, error: error.message || '조 선택 실패' };
    }
}
