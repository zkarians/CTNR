export const getCarrierColor = (transporter: string | undefined) => {
    if (!transporter) return "text-slate-300";
    if (transporter.includes("천마")) return "text-rose-500 font-black";
    if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-indigo-500 font-black";
    if (transporter.includes("재작업")) return "text-amber-500 font-black";
    if (transporter.includes("기타")) return "text-slate-500 font-black";
    return "text-emerald-500 font-black";
};
