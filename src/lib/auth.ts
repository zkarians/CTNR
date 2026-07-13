"use server";

import { cookies } from "next/headers";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

function debugLog(message: string) {
    try {
        const logPath = path.resolve(process.cwd(), 'login_debug.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (e) {
        // ignore
    }
}

export interface SessionUser {
    id: string;
    username: string;
    name: string;
    role: string;
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
