'use server';

import { getWorkerPool } from '@/lib/workerDb';

function formatDateStr(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export interface RosterDayDetail {
    dateStr: string;
    day: number;
    weekday: string;
    rosterFound: boolean;
    totalAssignedWorkers: number;
    activeTeamCount: number;
    activeTeams: string[];
    message: string | null;
}

export interface UpcomingRosterResult {
    success: boolean;
    targetDate: string;
    messages: string[];
    formattedText: string;
    details: RosterDayDetail[];
    error?: string;
}

export async function getUpcoming3DaysRosterStatus(targetDateStr: string): Promise<UpcomingRosterResult> {
    try {
        const pool = getWorkerPool();
        const baseDate = new Date(targetDateStr);
        if (isNaN(baseDate.getTime())) {
            throw new Error(`유효하지 않은 날짜 형식입니다: ${targetDateStr}`);
        }

        const targetDates: Array<{ date: Date; dateStr: string; day: number; weekday: string }> = [];
        for (let i = 1; i <= 3; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            const dateStr = formatDateStr(d);
            targetDates.push({
                date: d,
                dateStr,
                day: d.getDate(),
                weekday: WEEKDAYS[d.getDay()]
            });
        }

        const startDateStr = targetDates[0].dateStr;
        const endDateStr = targetDates[targetDates.length - 1].dateStr;

        const query = `
            SELECT 
                r.id as roster_id,
                r.date::text as roster_date_text,
                ra.id as assignment_id,
                ra.team,
                ra.position,
                ra."userId",
                ra."tempWorkerName"
            FROM "Roster" r
            LEFT JOIN "RosterAssignment" ra ON r.id = ra."rosterId"
            WHERE (
                r.date::text >= $1 
                AND r.date::text <= $2 || ' 23:59:59'
            )
        `;

        const res = await pool.query(query, [startDateStr, endDateStr]);

        const dateMap = new Map<string, {
            dateStr: string;
            day: number;
            weekday: string;
            rosterFound: boolean;
            activeTeams: Set<string>;
            totalAssignedWorkers: number;
        }>();

        for (const item of targetDates) {
            dateMap.set(item.dateStr, {
                ...item,
                rosterFound: false,
                activeTeams: new Set<string>(),
                totalAssignedWorkers: 0
            });
        }

        for (const row of res.rows) {
            const rowDateStr = (row.roster_date_text || '').split(' ')[0];
            if (dateMap.has(rowDateStr)) {
                const info = dateMap.get(rowDateStr)!;
                if (row.roster_id) {
                    info.rosterFound = true;
                }
                const hasWorker = Boolean(row.userId || (row.tempWorkerName && row.tempWorkerName.trim()));
                if (hasWorker) {
                    info.totalAssignedWorkers++;
                    const teamName = (row.team || '').trim();
                    const pos = (row.position || '').trim();
                    // OP and 관리 without assigned work team are excluded from team count
                    if (teamName && pos !== 'OP' && pos !== '관리') {
                        info.activeTeams.add(teamName);
                    }
                }
            }
        }

        const messages: string[] = [];
        const details: RosterDayDetail[] = [];

        for (let idx = 0; idx < targetDates.length; idx++) {
            const item = targetDates[idx];
            const info = dateMap.get(item.dateStr)!;
            const activeTeamCount = info.activeTeams.size;
            let msg: string | null = null;

            const verb = idx === 0 ? '운영됩니다.' : '운영예정입니다.';

            if (!info.rosterFound || info.totalAssignedWorkers === 0) {
                msg = `${item.day}일(${item.weekday}) 근무편성내역 없음.`;
            } else if (activeTeamCount <= 2) {
                msg = `${item.day}일(${item.weekday}) 야간출하 ${activeTeamCount}개조 ${verb}`;
            }

            if (msg) {
                messages.push(msg);
            }

            details.push({
                dateStr: item.dateStr,
                day: item.day,
                weekday: item.weekday,
                rosterFound: info.rosterFound,
                totalAssignedWorkers: info.totalAssignedWorkers,
                activeTeamCount,
                activeTeams: Array.from(info.activeTeams),
                message: msg
            });
        }

        return {
            success: true,
            targetDate: targetDateStr,
            messages,
            formattedText: messages.join('\n'),
            details
        };
    } catch (err: any) {
        console.error('Error in getUpcoming3DaysRosterStatus:', err);
        return {
            success: false,
            targetDate: targetDateStr,
            error: err?.message || '알 수 없는 오류가 발생했습니다.',
            messages: [],
            formattedText: '',
            details: []
        };
    }
}
