/**
 * 컨테이너 작업 타임라인 계산 유틸리티
 * 
 * 근무 및 휴식/식사 시간 규칙 (KST 기준):
 * - Shift 시작: 19:00 (1140분)
 * - 휴식 1: 21:00 ~ 21:10 (10분) -> 1260분 ~ 1270분
 * - 식사 : 23:00 ~ 24:00 (60분) -> 1380분 ~ 1440분 (00:00)
 * - 휴식 2: 02:00 ~ 02:10 (10분) -> 익일 120분 ~ 130분 (1560분 ~ 1570분)
 */

export interface WorkTimeBreak {
    name: string;
    startMin: number; // 19:00 = 0분 기준 분 offset (예: 21:00 = 120분)
    endMin: number;   // 예: 21:10 = 130분
}

// 19:00를 0분으로 보았을 때의 offset
// 19:00 = 0분
// 21:00 ~ 21:10 = 120분 ~ 130분 (휴식 10분)
// 23:00 ~ 24:00 = 240분 ~ 300분 (식사 60분)
// 02:00 ~ 02:10 = 420분 ~ 430분 (휴식 10분)
const SHIFT_START_HOUR = 19; // 19시 시작

const BREAK_TIMES = [
    { start: 120, end: 130, name: '휴식' },  // 21:00 ~ 21:10
    { start: 240, end: 300, name: '식사' },  // 23:00 ~ 24:00
    { start: 420, end: 430, name: '휴식' },  // 02:00 ~ 02:10
];

/**
 * 19:00 시작 0분 오프셋을 HH:MM 시각 문자열로 변환
 */
export function formatOffsetToTime(offsetMinutes: number): string {
    const totalMinutes = (SHIFT_START_HOUR * 60 + offsetMinutes) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * 특정 시작 오프셋(분)에서 지정된 순 작업시간(durationMinutes)만큼 작업을 수행했을 때의
 * 종료 오프셋(분) 및 시간 경과 정보 계산
 */
export function advanceWorkTime(startOffsetMinutes: number, durationMinutes: number): {
    endOffsetMinutes: number;
    startTimeStr: string;
    endTimeStr: string;
    durationMinutes: number;
    hasBreak: boolean;
} {
    let currentOffset = startOffsetMinutes;
    let remainingWorkMins = Math.max(1, durationMinutes);

    // 만약 시작 시각이 휴식/식사 시간 내부이면 비작업시간 종료 후부터 시작
    while (true) {
        let insideBreak = false;
        for (const b of BREAK_TIMES) {
            if (currentOffset >= b.start && currentOffset < b.end) {
                currentOffset = b.end;
                insideBreak = true;
                break;
            }
        }
        if (!insideBreak) break;
    }

    const actualStartOffset = currentOffset;
    let hasBreak = false;

    // 1분씩 전진하면서 휴식/식사 시간이면 순 작업 시간 차감 안 함
    while (remainingWorkMins > 0) {
        let isBreak = false;
        for (const b of BREAK_TIMES) {
            if (currentOffset >= b.start && currentOffset < b.end) {
                isBreak = true;
                hasBreak = true;
                break;
            }
        }

        if (!isBreak) {
            remainingWorkMins--;
        }
        currentOffset++;
    }

    // 작업 끝난 직후가 만약 휴식 시작시각이면 휴식은 다음 컨테이너로 넘김
    const actualEndOffset = currentOffset;

    return {
        endOffsetMinutes: actualEndOffset,
        startTimeStr: formatOffsetToTime(actualStartOffset),
        endTimeStr: formatOffsetToTime(actualEndOffset),
        durationMinutes,
        hasBreak
    };
}

export interface ContainerWorkTimelineItem {
    cntrNo: string;
    durationMinutes: number;
    startTimeStr: string;
    endTimeStr: string;
    hasBreak: boolean;
}

/**
 * 컨테이너 목록(작업순서)에 대해 타임라인을 일괄 계산
 */
export function calculateTeamTimeline<T extends { cntrNo: string; durationMinutes?: number }>(
    containers: T[]
): (T & ContainerWorkTimelineItem)[] {
    let currentOffset = 0; // 19:00 시작

    return containers.map((item) => {
        const duration = item.durationMinutes && item.durationMinutes > 0 ? item.durationMinutes : 45; // 기본값 45분
        const result = advanceWorkTime(currentOffset, duration);
        currentOffset = result.endOffsetMinutes;

        return {
            ...item,
            durationMinutes: duration,
            startTimeStr: result.startTimeStr,
            endTimeStr: result.endTimeStr,
            hasBreak: result.hasBreak,
        };
    });
}
