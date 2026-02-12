import { Outlet } from "react-router-dom";

import Sidebar from "@/components/layout/Sidebar";
import Breadcrumbs from "@/components/misc/Breadcrumbs";

export default function Container() {
    return (
        <main>
            <Sidebar />
            <div className="px-28 min-h-screen">
                <Breadcrumbs />
                <Outlet />
            </div>
        </main>
    );
}
