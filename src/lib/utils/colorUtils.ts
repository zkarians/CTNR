export const getCarrierColor = (transporter: string | undefined) => {
    if (!transporter) return "text-slate-300";
    if (transporter.includes("천마")) return "text-rose-500 font-black";
    if (transporter.includes("BNI") || transporter.includes("비엔아이")) return "text-indigo-500 font-bold";
    return "text-emerald-500 font-bold";
};
