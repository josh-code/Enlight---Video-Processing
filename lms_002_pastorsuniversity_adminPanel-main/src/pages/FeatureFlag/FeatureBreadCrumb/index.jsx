import React from "react";

// Shadcn
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/shadcn/ui/breadcrumb";

// Icon
import { ChevronLeft } from "lucide-react";

export default function FeatureBreadCrumb({ path, onCrumbClick }) {
    return (
        <Breadcrumb>
            <BreadcrumbList className="font-medium">
                <BreadcrumbItem>
                    <BreadcrumbLink
                        onClick={() => onCrumbClick([])}
                        onKeyDown={(e) =>
                            (e.key === "Enter" || e.key === " ") && onCrumbClick([])
                        }
                        tabIndex={0}
                        className="cursor-pointer"
                    >
                        Features
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {path.map((crumb, index) => {
                    const isCurrent = index === path.length - 1;
                    return (
                        <React.Fragment key={index}>
                            <BreadcrumbSeparator>
                                <ChevronLeft />
                            </BreadcrumbSeparator>
                            <BreadcrumbItem>
                                {isCurrent ? (
                                    <BreadcrumbPage className="capitalize" aria-current="page">
                                        {crumb}
                                    </BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink
                                        className="capitalize cursor-pointer"
                                        onClick={() => onCrumbClick(path.slice(0, index + 1))}
                                        onKeyDown={(e) =>
                                            (e.key === "Enter" || e.key === " ") &&
                                            onCrumbClick(path.slice(0, index + 1))
                                        }
                                        tabIndex={0}
                                    >
                                        {crumb}
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </React.Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
