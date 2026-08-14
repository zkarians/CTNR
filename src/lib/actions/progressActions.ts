'use server';

import { pool } from '@/lib/db';
import { getWorkDateString } from '@/lib/utils/dateUtils';
import { calculateTeamTimeline } from '@/lib/timeline';

export interface TeamWorkProgress {
    teamName: string;
    completedCount: number;
    totalDurationMinutes: number;
    startTimeStr: string;
    endTimeStr: string;
    lastCntrNo?: string;
    containers: {
        cntrNo: string;
        durationMinutes: number;
        startTimeStr: string;
        endTimeStr: string;
        isManual?: boolean;
        manualEntryId?: number;
        firstUploadedAt?: string;
    }[];
}

export async function fetchTeamWorkProgress(targetWorkDate?: string): Promise<Record<string, TeamWorkProgress>> {
    try {
        const client = await pool.connect();
        try {
            const workDate = targetWorkDate || getWorkDateString(new Date());

            const query = `
                WITH Combined AS (
                    SELECT 
                        COALESCE(t.name, '미지정 조') as team_name,
                        COALESCE(p.cntr_no, j.job_name, '미지정') as cntr_no,
                        COALESCE(MAX(p.work_duration_minutes), 45) as duration_minutes,
                        MIN(p.uploaded_at) as first_uploaded_at,
                        false as is_manual,
                        NULL::integer as manual_entry_id
                    FROM container_photos p
                    LEFT JOIN teams t ON p.team_id = t.id
                    LEFT JOIN container_jobs j ON p.job_id = j.id
                    WHERE (p.is_deleted IS NOT TRUE)
                      AND (p.is_completed IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (p.uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((p.uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (p.uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                    GROUP BY t.name, p.cntr_no, j.job_name
                    
                    UNION ALL
                      
                    SELECT 
                        team_name,
                        cntr_no,
                        duration_minutes,
                        first_uploaded_at,
                        true as is_manual,
                        id as manual_entry_id
                    FROM manual_report_entries
                    WHERE work_date = $2
                )
                SELECT * FROM Combined ORDER BY first_uploaded_at ASC
            `;

            const res = await client.query(query, [workDate, workDate]);

            const teamContainersMap = new Map<string, Map<string, { durationMinutes: number; firstUploadedAt: Date; isManual?: boolean; manualEntryId?: number }>>();

            for (const row of res.rows) {
                const uploadedAt = row.first_uploaded_at ? new Date(row.first_uploaded_at) : new Date();
                const teamName = row.team_name;
                const cntrNo = row.cntr_no;
                const durationMinutes = Number(row.duration_minutes) || 45;

                if (!teamContainersMap.has(teamName)) {
                    teamContainersMap.set(teamName, new Map());
                }
                const cntrMap = teamContainersMap.get(teamName)!;
                if (!cntrMap.has(cntrNo)) {
                    cntrMap.set(cntrNo, { 
                        durationMinutes, 
                        firstUploadedAt: uploadedAt,
                        isManual: row.is_manual,
                        manualEntryId: row.manual_entry_id
                    });
                }
            }

            const result: Record<string, TeamWorkProgress> = {};

            teamContainersMap.forEach((cntrMap, teamName) => {
                const cntrList = Array.from(cntrMap.entries()).map(([cntrNo, data]) => ({
                    cntrNo,
                    ...data
                })).sort((a, b) => a.firstUploadedAt.getTime() - b.firstUploadedAt.getTime());

                const timelineList = calculateTeamTimeline(cntrList);

                if (timelineList.length > 0) {
                    const last = timelineList[timelineList.length - 1];
                    const totalDuration = timelineList.reduce((sum, c) => sum + c.durationMinutes, 0);
                    result[teamName] = {
                        teamName,
                        completedCount: timelineList.length,
                        totalDurationMinutes: totalDuration,
                        startTimeStr: '19:00',
                        endTimeStr: last.endTimeStr,
                        lastCntrNo: last.cntrNo,
                        containers: timelineList.map(c => ({
                            cntrNo: c.cntrNo,
                            durationMinutes: c.durationMinutes,
                            startTimeStr: c.startTimeStr,
                            endTimeStr: c.endTimeStr,
                            isManual: (c as any).isManual,
                            manualEntryId: (c as any).manualEntryId,
                            firstUploadedAt: (c as any).firstUploadedAt ? (c as any).firstUploadedAt.toISOString() : undefined
                        }))
                    };
                }
            });

            return result;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("fetchTeamWorkProgress Error:", error);
        return {};
    }
}

export async function updateContainerWorkDuration(
    jobId: number,
    cntrNo: string,
    durationMinutes: number,
    remark?: string,
    emptyBoxes?: { name: string; qty: number }[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            await client.query(`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = $2
                WHERE job_id = $3 
                  AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) 
                  AND (is_deleted IS NOT TRUE)
            `, [durationMinutes, remark || '', jobId, cntrNo]);

            if (emptyBoxes) {
                if (emptyBoxes.length > 0) {
                    for (const box of emptyBoxes) {
                        await client.query(`
                            INSERT INTO container_empty_boxes (job_id, cntr_no, box_name, qty, is_worker_edited)
                            VALUES ($1, $2, $3, $4, true)
                            ON CONFLICT (job_id, cntr_no, box_name) DO UPDATE 
                            SET qty = EXCLUDED.qty, is_worker_edited = true, updated_at = CURRENT_TIMESTAMP
                        `, [jobId, cntrNo, box.name, box.qty]);
                    }
                    const boxNames = emptyBoxes.map(b => b.name);
                    await client.query(`
                        DELETE FROM container_empty_boxes 
                        WHERE job_id = $1 AND cntr_no = $2 AND box_name != ALL($3)
                    `, [jobId, cntrNo, boxNames]);
                } else {
                    await client.query(`
                        DELETE FROM container_empty_boxes 
                        WHERE job_id = $1 AND cntr_no = $2
                    `, [jobId, cntrNo]);
                }
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerWorkDuration Error:", error);
        return { success: false, error: `서버 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}

export async function updateContainerAdminComment(
    cntrNo: string,
    comment: string,
    workDate?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const todayStr = getWorkDateString(new Date());
            const targetWorkDate = workDate || todayStr;
            await client.query(`
                UPDATE container_comments
                SET admin_comment = $2, updated_at = NOW()
                WHERE cntr_no = $1
            `, [cntrNo, comment]);

            await client.query(`
                INSERT INTO container_comments (work_date, cntr_no, admin_comment, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (work_date, cntr_no)
                DO UPDATE SET admin_comment = EXCLUDED.admin_comment, updated_at = NOW()
            `, [targetWorkDate, cntrNo, comment]);
            await client.query('COMMIT');
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("updateContainerAdminComment Error:", error);
        return { success: false, error: `코멘트 저장 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}

export async function resetTeamWorkProgress(
    actionType: 'COMPLETE_RESET' | 'TRASH_RESET' = 'COMPLETE_RESET',
    targetDateStr?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const client = await pool.connect();
        try {
            const dateStr = targetDateStr || getWorkDateString(new Date());

            if (actionType === 'COMPLETE_RESET') {
                await client.query(`
                    UPDATE container_photos
                    SET is_completed = false, completed_at = NULL
                    WHERE (is_deleted IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                `, [dateStr]);
                return {
                    success: true,
                    message: `오늘(${dateStr}) 작업의 완료 상태가 모두 '진행 중'으로 초기화되었습니다.`
                };
            } else {
                await client.query(`
                    UPDATE container_photos
                    SET is_deleted = true, deleted_at = NOW()
                    WHERE (is_deleted IS NOT TRUE)
                      AND (
                        CASE
                          WHEN EXTRACT(HOUR FROM (uploaded_at AT TIME ZONE 'Asia/Seoul')) < 13
                          THEN ((uploaded_at AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '1 day')::date
                          ELSE (uploaded_at AT TIME ZONE 'Asia/Seoul')::date
                        END
                      ) = $1::date
                `, [dateStr]);
                return {
                    success: true,
                    message: `오늘(${dateStr}) 작업 사진이 휴지통으로 이동되어 조별 근무시간이 초기화되었습니다.`
                };
            }
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error("resetTeamWorkProgress Error:", error);
        return { success: false, error: `근무시간 초기화 오류: ${error?.message || '알 수 없는 오류'}` };
    }
}
