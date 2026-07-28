"use server";

import { cookies } from "next/headers";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

import crypto from 'crypto';

function debugLog(message: string) {
    try {
        const logPath = path.resolve(process.cwd(), 'login_debug.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (e) {
        // ignore
    }
}

import { UserAccount } from "./types";

export interface SessionUser {
    id: string;
    username: string;
    name: string;
    role: string;
    teamId?: number;
    teamName?: string;
    teamSelectedAt?: string; // ISO String
}

/**
 * 조 선택의 유효성을 검사하는 함수
 * - 13시 이전 선택: 당일 13시 KST까지 유효
 * - 13시 이후 선택: 익일(다음날) 13시 KST까지 유효
 * - 만료되었거나 조 미선택 시 false 반환
 */
export async function isTeamSelectionValid(user: SessionUser | null): Promise<boolean> {
    if (!user || !user.teamId || !user.teamSelectedAt) {
        return false;
    }

    try {
        const selectedDate = new Date(user.teamSelectedAt);
        if (isNaN(selectedDate.getTime())) return false;

        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hour12: false
        });

        const parts = formatter.formatToParts(selectedDate);
        let year = 0, month = 0, day = 0, hour = 0;
        for (const part of parts) {
            if (part.type === 'year') year = parseInt(part.value, 10);
            if (part.type === 'month') month = parseInt(part.value, 10);
            if (part.type === 'day') day = parseInt(part.value, 10);
            if (part.type === 'hour') hour = parseInt(part.value, 10);
        }

        // KST 13:00 equals 04:00 UTC
        let expireUtc: Date;
        if (hour < 13) {
            expireUtc = new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
        } else {
            expireUtc = new Date(Date.UTC(year, month - 1, day + 1, 4, 0, 0, 0));
        }

        return Date.now() < expireUtc.getTime();
    } catch {
        return false;
    }
}

const SESSION_COOKIE = "ctnr_session";

function encodeSession(user: SessionUser): string {
    return Buffer.from(JSON.stringify(user)).toString("base64");
}

function decodeSession(token: string): SessionUser | null {
    try {
        return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    } catch {
        return null;
    }
}

export async function login(
    username: string,
    password: string,
    rememberMe: boolean = false
): Promise<{ success: boolean; error?: string; user?: SessionUser }> {
    debugLog(`login called with username: "${username}", rememberMe: ${rememberMe}`);
    try {
        debugLog(`connecting to DB pool...`);
        const client = await pool.connect();
        debugLog(`DB connection established`);
        const res = await client.query(
            `SELECT id, username, name, role, password, "isApproved" FROM "User" WHERE username = $1 LIMIT 1`,
            [username]
        );
        client.release();
        debugLog(`DB query finished. Rows found: ${res.rows.length}`);

        if (res.rows.length === 0) {
            debugLog(`Login failed: user not found`);
            return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }

        const user = res.rows[0];

        if (!user.isApproved) {
            debugLog(`Login failed: user "${username}" is not approved`);
            return { success: false, error: "관리자 승인이 필요한 계정입니다." };
        }

        debugLog(`comparing bcrypt passwords...`);
        const passwordMatch = await bcrypt.compare(password, user.password);
        debugLog(`password match: ${passwordMatch}`);
        if (!passwordMatch) {
            return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }

        const sessionUser: SessionUser = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
        };

        const cookieStore = await cookies();
        const cookieVal = encodeSession(sessionUser);
        debugLog(`setting cookie "${SESSION_COOKIE}"...`);
        cookieStore.set(SESSION_COOKIE, cookieVal, {
            httpOnly: true,
            secure: false, // Explicitly set to false for local debugging
            maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 days if rememberMe, else 1 day
            path: "/",
        });
        debugLog(`cookie set successfully`);

        return { success: true, user: sessionUser };
    } catch (error: any) {
        debugLog(`Login error: ${error?.message || error}`);
        console.error("Login error:", error);
        return { success: false, error: "서버 오류가 발생했습니다." };
    }
}

export async function logout(): Promise<void> {
    debugLog(`logout called`);
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
    debugLog(`getSession called`);
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE)?.value;
        debugLog(`getSession token present: ${!!token}`);
        if (!token) return null;
        const decoded = decodeSession(token);
        debugLog(`getSession decoded user: ${decoded ? decoded.username : "null"}`);
        return decoded;
    } catch (error: any) {
        debugLog(`getSession error: ${error?.message || error}`);
        return null;
    }
}

export async function updatePassword(
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: "세션이 만료되었습니다. 다시 로그인해주세요." };
        }

        const client = await pool.connect();
        try {
            const res = await client.query(
                `SELECT password FROM "User" WHERE id = $1 LIMIT 1`,
                [session.id]
            );

            if (res.rows.length === 0) {
                return { success: false, error: "사용자를 찾을 수 없습니다." };
            }

            const user = res.rows[0];
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) {
                return { success: false, error: "현재 비밀번호가 일치하지 않습니다." };
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await client.query(
                `UPDATE "User" SET password = $1 WHERE id = $2`,
                [hashedPassword, session.id]
            );

            return { success: true };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Update password error:", error);
        return { success: false, error: "비밀번호 변경 중 오류가 발생했습니다." };
    }
}

export async function getAllUsers(): Promise<{ success: boolean; users?: UserAccount[]; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }
        const client = await pool.connect();
        try {
            const res = await client.query(
                `SELECT id, username, name, role, "isApproved" FROM "User" ORDER BY name`
            );
            return { success: true, users: res.rows };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("getAllUsers error:", error);
        return { success: false, error: "사용자 목록을 불러오는 중 오류가 발생했습니다." };
    }
}

export async function createUserAccount(data: {
    username: string;
    name: string;
    password: string;
    role: string;
    isApproved: boolean;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }
        if (!data.username || !data.password || !data.name) {
            return { success: false, error: "아이디, 이름, 비밀번호를 모두 입력해주세요." };
        }

        const client = await pool.connect();
        try {
            const dupRes = await client.query(
                `SELECT id FROM "User" WHERE username = $1 LIMIT 1`,
                [data.username.trim()]
            );
            if (dupRes.rows.length > 0) {
                return { success: false, error: "이미 존재하는 아이디입니다." };
            }

            const id = crypto.randomUUID();
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const role = data.role || 'USER';
            const isApproved = data.isApproved ?? true;

            await client.query(
                `INSERT INTO "User" (id, username, name, password, role, "isApproved") VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, data.username.trim(), data.name.trim(), hashedPassword, role, isApproved]
            );

            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("createUserAccount error:", error);
        return { success: false, error: "사용자 추가 중 오류가 발생했습니다." };
    }
}

export async function updateUserAccount(
    id: string,
    data: { name?: string; role?: string; isApproved?: boolean; password?: string }
): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }

        const client = await pool.connect();
        try {
            const userRes = await client.query(`SELECT id FROM "User" WHERE id = $1 LIMIT 1`, [id]);
            if (userRes.rows.length === 0) {
                return { success: false, error: "해당 사용자를 찾을 수 없습니다." };
            }

            if (data.name !== undefined) {
                await client.query(`UPDATE "User" SET name = $1 WHERE id = $2`, [data.name.trim(), id]);
            }
            if (data.role !== undefined) {
                await client.query(`UPDATE "User" SET role = $1 WHERE id = $2`, [data.role, id]);
            }
            if (data.isApproved !== undefined) {
                await client.query(`UPDATE "User" SET "isApproved" = $1 WHERE id = $2`, [data.isApproved, id]);
            }
            if (data.password && data.password.trim() !== '') {
                const hashedPassword = await bcrypt.hash(data.password, 10);
                await client.query(`UPDATE "User" SET password = $1 WHERE id = $2`, [hashedPassword, id]);
            }

            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateUserAccount error:", error);
        return { success: false, error: "사용자 정보 수정 중 오류가 발생했습니다." };
    }
}

export async function deleteUserAccount(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }

        if (session.id === id) {
            return { success: false, error: "현재 로그인된 본인 계정은 삭제할 수 없습니다." };
        }

        const client = await pool.connect();
        try {
            await client.query(`DELETE FROM "User" WHERE id = $1`, [id]);
            return { success: true };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("deleteUserAccount error:", error);
        return { success: false, error: "사용자 계정 삭제 중 오류가 발생했습니다." };
    }
}

export async function deleteMultipleUserAccounts(ids: string[]): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    try {
        const session = await getSession();
        if (!session || (session.role.toUpperCase() !== 'ADMIN' && session.role.toUpperCase() !== 'MANAGER')) {
            return { success: false, error: "관리자 권한이 필요합니다." };
        }

        if (!ids || ids.length === 0) {
            return { success: false, error: "삭제할 사용자를 선택해주세요." };
        }

        const validIds = ids.filter(id => id !== session.id);
        if (validIds.length === 0) {
            return { success: false, error: "현재 로그인된 본인 계정은 삭제할 수 없습니다." };
        }

        const client = await pool.connect();
        try {
            const res = await client.query(`DELETE FROM "User" WHERE id = ANY($1::uuid[])`, [validIds]);
            return { success: true, deletedCount: res.rowCount || validIds.length };
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("deleteMultipleUserAccounts error:", error);
        return { success: false, error: "사용자 일괄 삭제 중 오류가 발생했습니다." };
    }
}

export async function selectTeam(teamId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: "세션이 만료되었습니다. 다시 로그인해주세요." };
        }

        const client = await pool.connect();
        let teamName = '';
        try {
            const res = await client.query(`SELECT name FROM teams WHERE id = $1 LIMIT 1`, [teamId]);
            if (res.rows.length === 0) {
                return { success: false, error: "존재하지 않는 조입니다." };
            }
            teamName = res.rows[0].name;
        } finally {
            client.release();
        }

        const updatedSession: SessionUser = {
            ...session,
            teamId,
            teamName,
            teamSelectedAt: new Date().toISOString(),
        };

        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE, encodeSession(updatedSession), {
            httpOnly: true,
            secure: false,
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
        });

        return { success: true };
    } catch (error: any) {
        console.error("selectTeam error:", error);
        return { success: false, error: "조 선택 중 오류가 발생했습니다." };
    }
}
