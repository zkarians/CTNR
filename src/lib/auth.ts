"use server";

import { cookies } from "next/headers";
import { pool } from "./db";
import bcrypt from "bcryptjs";

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
    try {
        const client = await pool.connect();
        const res = await client.query(
            `SELECT id, username, name, role, password, "isApproved" FROM "User" WHERE username = $1 LIMIT 1`,
            [username]
        );
        client.release();

        if (res.rows.length === 0) {
            return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
        }

        const user = res.rows[0];

        if (!user.isApproved) {
            return { success: false, error: "관리자 승인이 필요한 계정입니다." };
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
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
        cookieStore.set(SESSION_COOKIE, encodeSession(sessionUser), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 days if rememberMe, else 1 day
            path: "/",
        });

        return { success: true, user: sessionUser };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "서버 오류가 발생했습니다." };
    }
}

export async function logout(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE)?.value;
        if (!token) return null;
        return decodeSession(token);
    } catch {
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
