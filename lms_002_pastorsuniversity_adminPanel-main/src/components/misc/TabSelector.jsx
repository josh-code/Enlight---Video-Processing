import { useState } from "react";

// Utils
import { cn } from "@/lib/utils";

// Shadcn
import { Skeleton } from "@/components/shadcn/ui/skeleton";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/shadcn/ui/popover";

export default function TabSelector({
    tabs,
    selectedTabId,
    handleTabSelect,
    isLoading,
    popoverContent = null,
    ...props
}) {
    const [popoverTabId, setPopoverTabId] = useState(null);

    const handleRightClick = (e, tabId) => {
        if (!popoverContent) return;
        e.preventDefault();
        setPopoverTabId(tabId);
    };

    const handlePopoverContentClick = (tab, itemOnClick) => {
        itemOnClick(tab);
        setPopoverTabId(null);
    };

    return (
        <div className={cn("flex-grow overflow-hidden", props.className)}>
            <div className={cn("flex gap-4 overflow-x-auto hide-scrollbar")}>
                {isLoading
                    ? Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="w-24 h-10 rounded-md" />
                    ))
                    : tabs?.map((tab) =>
                        popoverContent ? (
                            <Popover
                                key={tab.value}
                                open={popoverTabId === tab.value}
                                onOpenChange={(isOpen) => !isOpen && setPopoverTabId(null)}
                            >
                                <PopoverTrigger asChild>
                                    <button
                                        onClick={() => handleTabSelect(tab)}
                                        onContextMenu={(e) => handleRightClick(e, tab.value)}
                                        className={`px-6 h-10 py-2 text-xs rounded-md ${selectedTabId === tab.value
                                            ? "bg-site-primary text-white border border-site-primary"
                                            : "bg-transparent border border-text-main/40 text-text-main/70 hover:shadow-card-shadow duration-300"
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-fit p-2">
                                    {popoverContent.map((item) => (
                                        <button
                                            key={item.value}
                                            onClick={() =>
                                                handlePopoverContentClick(tab, item.onClick)
                                            }
                                            className="flex items-center gap-2 text-sm p-2 hover:bg-accent w-full rounded text-text-main"
                                        >
                                            <item.icon className="w-4 h-4" />
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </PopoverContent>
                            </Popover>
                        ) : (
                            <button
                                key={tab.value}
                                onClick={() => handleTabSelect(tab)}
                                className={`px-6 h-10 py-2 text-xs rounded-md ${selectedTabId === tab.value
                                    ? "bg-site-primary text-white border border-site-primary"
                                    : "bg-transparent border border-text-main/40 text-text-main/70 hover:shadow-card-shadow duration-300"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        )
                    )}
            </div>
        </div>
    );
}
