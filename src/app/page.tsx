import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import HomeClient from "@/components/HomeClient";

export default async function Page() {
    const user = await getSession();

    if (!user) {
        redirect("/login");
    }

    return <HomeClient user={user} />;
}
