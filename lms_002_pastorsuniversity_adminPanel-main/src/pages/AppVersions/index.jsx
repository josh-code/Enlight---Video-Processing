import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    clearAppVersions,
    getAppVersionsAsync,
    SelectAppVersions,
} from "@/redux/slices/appVersions";

// Shadcn
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Button } from "@/components/shadcn/ui/button";

// Custom
import { DataTable } from "@/components/misc/DataTable";
import AddApp from "./AddApp";

// Service
import { chageVersionStatus } from "@/services/content/appVersions";

// Utils
import { arraysEqual } from "@/lib/utils";
import { toast } from "sonner";

export default function AppVersions() {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [selectedVersionIds, setselectedVersionIds] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const dispatch = useDispatch();

    const appVersions = useSelector(SelectAppVersions);

    const handleRowSelection = (selectedRows) => {
        const ids = selectedRows.map((row) => row._id);

        if (!arraysEqual(ids, selectedVersionIds)) {
            setselectedVersionIds(ids);
        }
    };

    const handleStatusChages = async (versionIds, isActive) => {
        setIsLoading(true);
        try {
            const response = await chageVersionStatus({ versionIds, isActive });
            const successMsg = response.message || "Status updated successfully";
            toast.success(successMsg);
            dispatch(getAppVersionsAsync());
        } catch (error) {
            const errMsg = error.response
                ? error.response.data.message
                : error.message;
            toast.error(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        dispatch(getAppVersionsAsync());

        return () => {
            dispatch(clearAppVersions());
            setselectedVersionIds([]);
        };
    }, [dispatch]);

    const columns = [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                    }
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                />
            ),
        },
        {
            accessorKey: "version",
            header: "App Versions",
        },
        {
            accessorKey: "platform",
            header: "Platform",
        },
        {
            accessorKey: "releaseDate",
            header: "Release Date",
            cell: ({ row }) => {
                return new Date(row.original.releaseDate).toLocaleDateString();
            },
        },
        {
            accessorKey: "isActive",
            header: "Status",
            cell: ({ row }) => {
                return row.original.isActive ? "Active" : "Inactive";
            },
        },
    ];

    return (
        <section>
            <div className="pt-2 pb-11">
                <div className=" flex justify-between gap-8 items-center">
                    <h4 className="text-3xl font-bold">App Version Management</h4>
                    <Button onClick={() => setIsAddOpen(true)}>Add App</Button>
                </div>
                <div className="mt-16">
                    <DataTable
                        onSelectedRowsChange={handleRowSelection}
                        searchColumns={["version", "platform"]}
                        columns={columns}
                        data={appVersions}
                    />
                    <div className="flex gap-4 mt-4">
                        <Button
                            disabled={selectedVersionIds.length === 0 || isLoading}
                            onClick={() => handleStatusChages(selectedVersionIds, true)}
                        >
                            Enable
                        </Button>
                        <Button
                            onClick={() => handleStatusChages(selectedVersionIds, false)}
                            disabled={selectedVersionIds.length === 0 || isLoading}
                        >
                            Disable
                        </Button>
                    </div>
                </div>
            </div>
            <AddApp open={isAddOpen} onClose={setIsAddOpen} />
        </section>
    );
}
