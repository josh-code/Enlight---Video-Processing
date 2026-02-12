import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    clearMembers,
    fetchMembersAsync,
    SelectMembers,
} from "@/redux/slices/member";

// Custom
import { DataTable } from "@/components/misc/DataTable";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";

// Icons
import { ArrowUpDown } from "lucide-react";

// Modal
import ViewMember from "./ViewMember";

// Utils
import { arraysEqual, formatPhoneNumber } from "@/lib/utils";

export default function MembersTable() {
    const [selectedMemberIds, setSelectedMemberIds] = useState([]);

    const members = useSelector(SelectMembers);
    const [searchParams, setSearchParams] = useSearchParams();
    const dispatch = useDispatch();

    const viewMemberId = searchParams.get("viewMember");

    const clearSelectionHandler = useRef(null);

    const handleEditClick = (memberId) => {
        setSearchParams((prev) => ({
            ...Object.fromEntries(prev),
            viewMember: memberId,
        }));
    };

    const handleCloseModal = () => {
        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("viewMember");
            return newParams;
        });
    };

    const handleRowSelection = (selectedRows) => {
        const ids = selectedRows.map((row) => row._id);

        if (!arraysEqual(ids, selectedMemberIds)) {
            setSelectedMemberIds(ids);
        }
    };

    useEffect(() => {
        return () => {
            setSelectedMemberIds([]);
        };
    }, [members]);

    useEffect(() => {
        dispatch(fetchMembersAsync({ isUser: true }));

        return () => {
            dispatch(clearMembers());
        };
    }, [dispatch]);

    const columns = [
        // {
        //     id: "select",
        //     header: ({ table }) => (
        //         <Checkbox
        //             checked={
        //                 table.getIsAllPageRowsSelected() ||
        //                 (table.getIsSomePageRowsSelected() && "indeterminate")
        //             }
        //             onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        //             aria-label="Select all"
        //         />
        //     ),
        //     cell: ({ row }) => (
        //         <Checkbox
        //             checked={row.getIsSelected()}
        //             onCheckedChange={(value) => row.toggleSelected(!!value)}
        //             aria-label="Select row"
        //         />
        //     ),
        //     enableSorting: false,
        //     enableHiding: false,
        // },
        {
            accessorKey: "name",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Name
                    <ArrowUpDown size={16} />
                </Button>
            ),
        },
        {
            accessorKey: "email",
            header: "Email Address",
            cell: ({ row }) => (
                <div className="lowercase">{row.original.email || "N/A"}</div>
            ),
        },
        {
            accessorKey: "phone",
            header: "Phone Number",
            cell: ({ row }) => (
                <div className="lowercase">
                    {row.original.phonePin && row.original.phone
                        ? formatPhoneNumber({ countryCode: row.original.phonePin, phoneNumberString: row.original.phone }) ||
                        `${row.original.phonePin} ${row.original.phone}`
                        : "N/A"}
                </div>
            ),
        },
        // {
        //     accessorKey: "status",
        //     header: "Status",
        //     cell: ({ row }) => (
        //         <div className="">
        //             {row.original.isEnabled ? "Enabled" : "Disabled"}
        //         </div>
        //     ),
        // },
        {
            accessorKey: "actions",
            header: "",
            cell: ({ row }) => (
                <button
                    className="underline"
                    onClick={() => handleEditClick(row.original._id)}
                >
                    View
                </button>
            ),
        },
    ];

    return (
        <>
            <DataTable
                onSelectedRowsChange={handleRowSelection}
                searchColumns={["name", "email", "phone"]}
                data={members?.map((member) => ({
                    ...member,
                    name: `${member.firstName} ${member.lastName}`,
                }))}
                columns={columns}
                clearSelectionTrigger={(clearFn) => {
                    clearSelectionHandler.current = clearFn;
                }}
            />
            {viewMemberId && (
                <ViewMember
                    memberId={viewMemberId}
                    open={Boolean(viewMemberId)}
                    onClose={handleCloseModal}
                />
            )}
        </>
    );
}
