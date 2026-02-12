import { cloneElement } from "react";
import { NavLink, useLocation } from "react-router-dom";

// Icons
import { Signout } from "@/assets/icons";
import { CodeXml } from "lucide-react";

// Constant
import { SITE_NAVIGATION } from "@/lib/constant";

// custom
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";
import RoleGate from "@/components/misc/RoleGate";

// Service
import { logOut } from "@/services/authServie";

// Shadcn
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/shadcn/ui/hover-card";

// Redux
import { useSelector } from "react-redux";
import { SelectUser } from "@/redux/slices/user";

export default function Sidebar() {
    const location = useLocation();

    const user = useSelector(SelectUser);

    return (
        <aside
            style={{
                boxShadow: "0px 0px 6px 0px #0000001A",
            }}
            className="z-50 fixed top-0 left-0 flex justify-between items-center w-fit flex-col min-h-screen text-[#6B6D75] bg-white px-3 py-7"
        >
            <div className="flex flex-col gap-24 items-center">
                <div className="h-7 w-7">
                    <img
                        src="/logo_colored.png"
                        className="h-full w-full"
                        alt="Site logo"
                    />
                </div>

                <div className="flex flex-col items-center gap-6">
                    {SITE_NAVIGATION.map((link) => {
                        const isActive =
                            link.to === "/"
                                ? location.pathname === "/"
                                : location.pathname.includes(link.to);
                        return (
                            <HoverCard key={link.to}>
                                <HoverCardTrigger asChild>
                                    <NavLink
                                        to={link.to}
                                        className={`p-2 rounded transition-all flex items-center ${isActive ? "bg-site-primary" : ""
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
                {user ? (
                    <RoleGate allowedRoles={["isDev"]} user={user}>
                        <HoverCard>
                            <HoverCardTrigger asChild>
                                <NavLink
                                    to="/dev"
                                    className="p-2 rounded transition-all flex items-center "
                                >
                                    <CodeXml />
                                    <span className="sr-only">Developer Dashboard</span>
                                </NavLink>
                            </HoverCardTrigger>
                            <HoverCardContent
                                side="right"
                                align="center"
                                className="w-fit py-1 px-2 bg-background"
                            >
                                <span className="text-sm text-muted-foreground">
                                    Developer Dashboard
                                </span>
                            </HoverCardContent>
                        </HoverCard>
                    </RoleGate>
                ) : (
                    <div />
                )}
                <ConfirmationDialog
                    title="Confirm Logout"
                    description="Are you sure you want to log out?"
                    onConfirm={() => logOut()}
                    onCancel={() => { }}
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
