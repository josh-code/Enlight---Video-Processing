import React from "react";
import { Link, useLocation } from "react-router-dom";

// Shadcn
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/shadcn/ui/breadcrumb";

// Icons
import { ChevronLeft } from "lucide-react";

export default function Breadcrumbs() {
    const { pathname } = useLocation();
    const pathArray = pathname.split("/").filter(Boolean);

    const formatPath = (path) => {
        return path
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    if (pathname === "/") {
        return null;
    }

    return (
        <Breadcrumb>
            <BreadcrumbList className="py-5 font-medium">
                <BreadcrumbItem>
                    <BreadcrumbLink>
                        <Link to="/"> Dashboard</Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {pathArray.map((path, index) => (
                    <React.Fragment key={index}>
                        <BreadcrumbSeparator>
                            <ChevronLeft />
                        </BreadcrumbSeparator>
                        {index === pathArray.length - 1 ? (
                            <BreadcrumbItem>
                                <BreadcrumbPage>{formatPath(path)}</BreadcrumbPage>
                            </BreadcrumbItem>
                        ) : (
                            <BreadcrumbItem>
                                <BreadcrumbLink>
                                    <Link to={`/${pathArray.slice(0, index + 1).join("/")}`}>
                                        {formatPath(path)}
                                    </Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                        )}
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
