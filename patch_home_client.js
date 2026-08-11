const fs = require('fs');

let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const targetImport = `eamWorkProgress, updateContainerWorkDuration, updateContainerAdminComment, resetTeamWorkProgress, deleteContainerResult } from '@/lib/actions';`;
const replacementImport = `eamWorkProgress, updateContainerWorkDuration, updateContainerAdminComment, resetTeamWorkProgress, deleteContainerResult, addManualReportEntry, deleteManualReportEntry } from '@/lib/actions';`;

const targetSubmit = `    const handleAddManualSubmit = () => {
        if (!manualCntrNo.trim()) {
            alert("컨테이너 번호를 입력해주세요.");
            return;
        }
        const validProducts = manualProducts.filter(p => p.name.trim() && p.qty > 0);
        if (validProducts.length === 0) {
            alert("최소 1개 이상의 제품 모델을 수량과 함께 입력해 주세요.");
            return;
        }

        const parsedDuration = parseInt(manualDuration, 10);
        const duration = isNaN(parsedDuration) ? 45 : parsedDuration;
        const totalQty = validProducts.reduce((sum, p) => sum + p.qty, 0);

        const adminCommentStr = isManualCancelled 
            ? (manualCategory.trim() ? \`\${manualCategory.trim()} [취소]\` : '[취소]')
            : manualCategory.trim();

        const newRawContainer = {
            cntrNo: manualCntrNo.trim().toUpperCase(),
            isCompleted: true,
            isCancelled: isManualCancelled,
            division: validProducts[0]?.division || 'DFZ',
            durationMinutes: duration,
            hasBreak: false,
            remark: manualRemark.trim(),
            adminComment: adminCommentStr,
            products: validProducts,
            emptyBoxes: manualEmptyBoxes.filter(eb => eb.name.trim() && eb.qty > 0)
        };

        setReportData((prevData: any[]) => {
            if (!prevData || prevData.length === 0) return prevData;
            const nextData = JSON.parse(JSON.stringify(prevData));
            
            // editingReportItem이 있으면 기존 것 수정
            if (editingReportItem) {
                const targetDateGroupIdx = editingReportItem.dateGroupIdx !== undefined ? editingReportItem.dateGroupIdx : 0;
                const targetDateGroup = nextData[targetDateGroupIdx];
                if (!targetDateGroup) return nextData;
                const tIndex = targetDateGroup.teams.findIndex((t: any) => t.teamName === editingReportItem.teamName);
                if (tIndex !== -1) {
                    targetDateGroup.teams[tIndex].containers[editingReportItem.cntrIdx] = newRawContainer;
                }
            } else {
                const targetDateGroupIdx = 0; // 항상 첫번째 날짜 그룹에 추가
                const targetDateGroup = nextData[targetDateGroupIdx];
                if (!targetDateGroup) return nextData;
                let tIndex = targetDateGroup.teams.findIndex((t: any) => t.teamName === manualTeamName);
                if (tIndex === -1) {
                    targetDateGroup.teams.push({ teamName: manualTeamName, containers: [] });
                    tIndex = targetDateGroup.teams.length - 1;
                }
                
                if (manualInsertIndex === 'end') {
                    targetDateGroup.teams[tIndex].containers.push(newRawContainer);
                } else {
                    targetDateGroup.teams[tIndex].containers.splice(manualInsertIndex, 0, newRawContainer);
                }
            }

            return nextData;
        });

        setIsAddManualOpen(false);
        setManualCntrNo('');
        setManualCategory('');
        setManualRemark('');
        setManualInsertIndex('end');
        setManualProducts([{ division: 'DFZ', name: '', qty: 0 }]);
        setIsManualCancelled(false);
    };`;

const replacementSubmit = `    const handleAddManualSubmit = async () => {
        if (!manualCntrNo.trim()) {
            alert("컨테이너 번호를 입력해주세요.");
            return;
        }
        const validProducts = manualProducts.filter(p => p.name.trim() && p.qty > 0);
        if (validProducts.length === 0) {
            alert("최소 1개 이상의 제품 모델을 수량과 함께 입력해 주세요.");
            return;
        }

        const parsedDuration = parseInt(manualDuration, 10);
        const duration = isNaN(parsedDuration) ? 45 : parsedDuration;

        const adminCommentStr = isManualCancelled 
            ? (manualCategory.trim() ? \`\${manualCategory.trim()} [취소]\` : '[취소]')
            : manualCategory.trim();

        // 1. DB에 영구 저장 (보고서 전용)
        const res = await addManualReportEntry({
            workDate: reportStartDate,
            teamName: manualTeamName,
            cntrNo: manualCntrNo.trim().toUpperCase(),
            category: adminCommentStr,
            durationMinutes: duration,
            remark: manualRemark.trim(),
            products: validProducts,
            emptyBoxes: manualEmptyBoxes.filter(eb => eb.name.trim() && eb.qty > 0)
        });

        if (!res.success) {
            alert("수기 입력 저장 중 오류가 발생했습니다: " + res.error);
            return;
        }

        // 2. 모달 닫고 리셋
        setIsAddManualOpen(false);
        setManualCntrNo('');
        setManualCategory('');
        setManualRemark('');
        setManualInsertIndex('end');
        setManualProducts([{ division: 'DFZ', name: '', qty: 0 }]);
        setIsManualCancelled(false);

        // 3. 보고서 새로고침 (DB에서 최신 병합 데이터 다시 가져옴)
        alert("수기 작업 내역이 안전하게 영구 저장되었습니다! 보고서를 다시 불러옵니다.");
        handleGenerateReport();
    };`;

if (content.includes(targetImport)) {
    content = content.replace(targetImport, replacementImport);
    content = content.replace(targetSubmit, replacementSubmit);
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log('HomeClient.tsx patched successfully for Add.');
} else {
    console.log('Target import not found.');
}
