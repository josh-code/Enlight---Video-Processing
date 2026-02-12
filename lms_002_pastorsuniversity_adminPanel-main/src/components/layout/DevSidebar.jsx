import { cloneElement } from "react";
import { NavLink, useLocation } from "react-router-dom";

// Icons
import { Signout } from "@/assets/icons";

// Constant
import { DEV_NAVIGATION } from "@/lib/constant";

// custom
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";

// Service
import { logOut } from "@/services/authServie";

// Shadcn
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/shadcn/ui/hover-card";
import { Gauge } from "lucide-react";

export default function DevSidebar() {
    const location = useLocation();

    return (
        <aside
            style={{
                boxShadow: "0px 0px 6px 0px #0000001A",
            }}
            className="z-50 fixed top-0 left-0 flex justify-between items-center w-fit flex-col min-h-screen text-[#6B6D75] bg-background px-3 py-7"
        >
            <div className="flex flex-col gap-24 items-center">
                <div className="h-7 w-7">
                    <img src="/logo_colored.png" className="h-full w-full" alt="Site logo" />
                </div>

                <div className="flex flex-col items-center gap-6">
                    {DEV_NAVIGATION.map((link) => {
                        const isActive =
                            link.to === "/"
                                ? location.pathname === "/"
                                : location.pathname.includes(link.to);
                        return (
                            <HoverCard key={link.to}>
                                <HoverCardTrigger asChild>
                                    <NavLink
                                        to={link.to}
                                        className={`p-2 rounded transition-all flex items-center ${isActive ? "bg-primary" : ""
                                            }`}
                                    >
                                        {cloneElement(link.icon, {
                                            className: isActive
                                                ? "stroke-white"
                                                : "stroke-site_stroke",
                                        })}
                                        <span className="sr-only">{link.label}</span>
                                    </NavLink>
                                </HoverCardTrigger>
                                <HoverCardContent
                                    side="right"
                                    align="center"
                                    className="w-fit py-1 px-2 bg-background"
                                >
                                    <span className="text-sm text-muted-foreground">
                                        {link.label}
                                    </span>
                                </HoverCardContent>
                            </HoverCard>
                        );
                    })}
                </div>
            </div>
            <div className="flex flex-col items-center gap-6">
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <NavLink
                            to="/"
                            className="p-2 rounded transition-all flex items-center "
                        >
                            <Gauge />
                            <span className="sr-only">Admin Dashboard</span>
                        </NavLink>
                    </HoverCardTrigger>
                    <HoverCardContent
                        side="right"
                        align="center"
                        className="w-fit py-1 px-2 bg-background"
                    >
                        <span className="text-sm text-muted-foreground">Admin Dashboard</span>
                    </HoverCardContent>
                </HoverCard>
                <ConfirmationDialog
                    title="Confirm Logout"
                    description="Are you sure you want to log out?"
                    onConfirm={() => logOut()}
                    onCancel={() => { }}
                    confirmButtonText="Logout"
                    trigger={
                        <button className="p-2 rounded transition-all flex items-center">
                            <Signout className="stroke-site_stroke" />
                            <span className="sr-only">Logout</span>
                        </button>
                    }
                />
            </div>
        </aside>
    );
}
