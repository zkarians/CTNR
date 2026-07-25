export function isSameTeam(t1?: string, t2?: string): boolean {
    if (!t1 || !t2) return false;
    if (t1 === t2) return true;
    const clean1 = t1.replace(/\s*\([^)]*\)/g, '').trim();
    const clean2 = t2.replace(/\s*\([^)]*\)/g, '').trim();
    if (clean1 && clean2 && clean1 === clean2) return true;
    return t1.includes(t2) || t2.includes(t1);
}
