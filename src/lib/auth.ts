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
    password: string
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
            maxAge: 60 * 60 * 24 * 7, // 7 days
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
