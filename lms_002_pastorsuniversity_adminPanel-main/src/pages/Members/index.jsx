import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/shadcn/ui/button";
import { cn } from "@/lib/utils";
import MembersTable from "./MemberTable";
import ReportsTable from "./ReportsTable";

const options = [
    { label: "All Members", value: "members" },
    { label: "Reported Issues", value: "reports" },
];
export default function Members() {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedTab = searchParams.get("tab");

    useEffect(() => {
        if (!selectedTab) {
            setSearchParams({ tab: options[0].value });
        }
    }, [selectedTab, setSearchParams]);

    const tabComponent = useMemo(() => {
        switch (selectedTab) {
            case "members":
                return <MembersTable />;
            case "reports":
                return <ReportsTable />;
        }
    }, [selectedTab]);

    return (
        <section>
            <div className="pt-2 pb-11">
                <h4 className="text-3xl font-bold">Members Management</h4>

                <div className="flex items-center gap-4 mt-4">
                    {options.map((option) => (
                        <Button
                            key={option.value}
                            onClick={() => setSearchParams({ tab: option.value })}
                            className={cn(
                                "flex items-center border py-2 px-6 text-xs rounded-[5px] font-medium bg-transparent hover:border-site-primary hover:text-site-primary hover:bg-site-primary/15",
                                option.value === selectedTab
                                    ? "border-site-primary text-site-primary bg-site-primary/15"
                                    : "border-site-general border-site-general/20 text-text-main/70"
                            )}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>

                <div className="mt-16">
                    {tabComponent}
                </div>
            </div>
        </section>
    );
}
