export function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getWorkDateString(d: Date = new Date()): string {
    const workDate = new Date(d);
    if (workDate.getHours() < 13) {
        workDate.setDate(workDate.getDate() - 1);
    }
    const year = workDate.getFullYear();
    const month = String(workDate.getMonth() + 1).padStart(2, '0');
    const day = String(workDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
