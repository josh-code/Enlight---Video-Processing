import { Outlet } from "react-router-dom";

import Breadcrumbs from "@/components/misc/Breadcrumbs";
import DevSidebar from "@/components/layout/DevSidebar";

export default function DevContainer() {
    return (
        <main>
            <DevSidebar />
            <div className="px-28 min-h-screen">
                <Breadcrumbs />
                <Outlet />
            </div>
        </main>
    );
}
