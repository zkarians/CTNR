export function getNormalizedCarrier(transporter?: string | null, fallbackTeam?: string | null): string {
    const t = (transporter || '').trim();
    if (t) {
        if (t.includes('천마')) return '천마';
        if (t.includes('BNI') || t.includes('비엔아이')) return 'BNI';
        if (t.includes('재작업')) return '재작업';
        if (t.includes('기타') || t.includes('오류')) return '기타';
        return '기타';
    }
    const team = (fallbackTeam || '').trim();
    if (team.includes('천마')) return '천마';
    if (team.includes('BNI') || team.includes('비엔아이')) return 'BNI';
    return '기타';
}
