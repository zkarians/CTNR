export function generateJobType(products: { name: string; qty: number; division: string; height?: number }[]): string {
    if (!products || products.length === 0) return '';

    // Calculate total CDZ quantity
    let totalCdzQty = 0;
    let totalValidQty = 0;
    const uniqueModels = new Set<string>();

    for (const p of products) {
        if (p.division === 'ZZZ') continue; // ZZZ는 무시
        uniqueModels.add(p.name);
        totalValidQty += p.qty;
        if (p.division === 'CDZ') {
            totalCdzQty += p.qty;
        }
    }

    const isMultiModel = uniqueModels.size >= 6;
    const jobTypes = new Set<string>();

    for (const p of products) {
        if (p.division === 'ZZZ') continue; // ZZZ는 무시
        const nameUpper = (p.name || '').toUpperCase();
        let typeName = '';

        switch (p.division) {
            case 'DFZ':
                if (nameUpper.startsWith('WDP')) {
                    typeName = '페데스탈';
                } else {
                    typeName = '세탁기';
                }
                break;
            case 'CVZ':
                if (nameUpper.startsWith('SK')) {
                    typeName = 'SK오븐';
                } else if (p.height !== undefined && p.height > 0 && p.height <= 500) {
                    typeName = '쿡탑';
                } else {
                    typeName = '오븐';
                }
                break;
            case 'CNZ':
                if (nameUpper.startsWith('SK')) {
                    typeName = 'SK냉장고';
                } else {
                    typeName = '냉장고';
                }
                break;
            case 'CDZ':
                if (totalCdzQty > 150) {
                    typeName = '글로벌식기';
                } else {
                    typeName = '식기';
                }
                break;
            case 'DHZ':
                typeName = '콤프';
                break;
            case 'DMZ':
                typeName = '에어컨';
                break;
            default:
                typeName = p.division || '기타';
                break;
        }
        if (typeName) {
            jobTypes.add(typeName);
        }
    }

    if (jobTypes.has('SK오븐') && jobTypes.has('오븐')) {
        jobTypes.delete('오븐');
    }
    if (jobTypes.has('SK냉장고') && jobTypes.has('냉장고')) {
        jobTypes.delete('냉장고');
    }

    let finalType = '';
    const sortedTypes = Array.from(jobTypes);
    
    // Define a stable order just in case, but joining them as they appear is also fine.
    // The problem statement didn't specify order so we just concatenate.
    if (sortedTypes.length === 1 && sortedTypes[0] === '냉장고' && uniqueModels.size <= 3 && totalValidQty >= 48 && totalValidQty <= 51) {
        finalType = '횡적';
    } else if (sortedTypes.length >= 2) {
        finalType = sortedTypes.join('') + '혼적';
    } else if (sortedTypes.length === 1) {
        finalType = sortedTypes[0];
    }

    if (isMultiModel && finalType) {
        finalType = '다모델 ' + finalType;
    }

    // 일렉오븐 조건: ZZZ 제외 모든 제품이 CVZ(오븐)이고, 높이가 630이상 670이하이며, 총 수량이 180개 이상인 경우
    const isElecOvenContainer = totalValidQty >= 180 && products.length > 0 && products.filter(p => p.division !== 'ZZZ').every(p => {
        return p.division === 'CVZ' && p.height !== undefined && p.height >= 630 && p.height <= 670;
    });

    // 레이다운식기 조건: ZZZ 제외 모든 제품이 CDZ(식기)이고, 높이가 900이상이며, 총 수량이 128~135개 사이인 경우
    const isLaydownDishwasher = totalValidQty >= 128 && totalValidQty <= 135 && products.length > 0 && products.filter(p => p.division !== 'ZZZ').every(p => {
        return p.division === 'CDZ' && p.height !== undefined && p.height >= 900;
    });

    if (isElecOvenContainer) {
        finalType = isMultiModel ? '다모델 일렉오븐' : '일렉오븐';
    } else if (isLaydownDishwasher) {
        finalType = isMultiModel ? '다모델 레이다운식기' : '레이다운식기';
    }

    return finalType;
}
