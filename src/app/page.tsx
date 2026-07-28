import { redirect } from "next/navigation";
import { getSession, isTeamSelectionValid } from "@/lib/auth";
import ClientOnlyHome from "@/components/ClientOnlyHome";

export default async function Page() {
    const user = await getSession();

    if (!user) {
        redirect("/login");
    }

    // 관리자/매니저는 조 선택 없이도 메인 접근 허용
    const isAdminOrManager = user.role?.toUpperCase() === 'ADMIN' || user.role?.toUpperCase() === 'MANAGER';

    // 일반 근무자는 조가 선택되지 않았거나, 조 선택 유효기간(익일 13시)이 경과한 경우 조 선택 페이지로 이동
    if (!isAdminOrManager && !(await isTeamSelectionValid(user))) {
        redirect("/select-team");
    }

    return <ClientOnlyHome user={user} />;
}
