const fs = require('fs');
let content = fs.readFileSync('src/components/AddManualModal.tsx', 'utf8');

// The block starts with `{!isEditMode && (` and ends with `)}` after `</select>`
// I will just replace the `{!isEditMode && (` and the trailing `)}` using regex.

content = content.replace(/\{\!isEditMode && \(\s*(<div[^>]*>[\s\S]*?<label[^>]*>).*?(<\/label>[\s\S]*?<select[\s\S]*?<\/select>\s*<\/div>)\s*\)\}/, (match, p1, p2) => {
    return `<div>
                        <label className="block font-black text-slate-700 mb-1">
                            {isEditMode ? "작업 위치 수정 *" : "작업 위치 (몇 번째 작업인지) *"}
                        </label>
                        <select
                            value={manualInsertIndex}
                            onChange={e => setManualInsertIndex(e.target.value === 'end' ? 'end' : parseInt(e.target.value))}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-bold focus:outline-none focus:border-sky-500 bg-slate-50 focus:bg-white text-slate-900 cursor-pointer"
                        >
                            <option value="end">
                                {currentTeamContainers.length === 0 ? '첫 번째 작업입니다' : (isEditMode ? '맨 마지막 위치로 이동' : '맨 끝 작업으로 추가 (기본)')}
                            </option>
                            
                            {currentTeamContainers.length > 0 && (
                                <option value={0}>1번째 (맨 앞으로 이동)</option>
                            )}
                            
                            {currentTeamContainers.map((cntr: any, idx: number) => (
                                <option key={cntr.cntrNo + '_' + idx} value={idx + 1}>
                                    {idx + 1}번째 ({cntr.cntrNo}) 작업 뒤로
                                </option>
                            ))}
                        </select>
                    </div>`;
});

fs.writeFileSync('src/components/AddManualModal.tsx', content);
console.log("Regex patch completed.");
