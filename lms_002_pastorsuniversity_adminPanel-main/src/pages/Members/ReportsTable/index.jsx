import { useDispatch, useSelector } from "react-redux";
import {
    SelectReportsData,
    clearReportsData,
    clearSelectedReport,
} from "@/redux/slices/member";
import { getReportsAsync } from "@/redux/slices/member";
import { useEffect, useState } from "react";
import SimpleDataTable from "@/components/misc/SimpleDataTable";
import { Button } from "@/components/shadcn/ui/button";
import { Eye, Search } from "lucide-react";
import { Input } from "@/components/shadcn/ui/input";
import { useDebounce } from "@/hooks";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/ui/select";
import ViewReport from "./ViewReport";
import {
    getStatusBadgeSimple,
    getReasonLabel,
    formatDateShort,
} from "./utils.jsx";
import { useSearchParams } from "react-router-dom";

const PAGE_SIZES = [
    { label: "10 rows per page", value: "10" },
    { label: "25 rows per page", value: "25" },
    { label: "50 rows per page", value: "50" },
    { label: "100 rows per page", value: "100" },
];

const STATUS_OPTIONS = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Reviewed", value: "reviewed" },
    { label: "Resolved", value: "resolved" },
    { label: "Dismissed", value: "dismissed" },
];

export default function ReportsTable() {
    const dispatch = useDispatch();
    const { reports, pagination, isLoading } = useSelector(SelectReportsData);
    const [searchParams, setSearchParams] = useSearchParams();
    const [debouncedSearch, setDebouncedSearch] = useDebounce("", 500);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0].value);
    const [status, setStatus] = useState("all");

    const reportId = searchParams.get("reportId");

    useEffect(() => {
        dispatch(getReportsAsync({}));
        return () => {
            dispatch(clearReportsData());
        };
    }, [dispatch]);

    // Handle search, page size, and status changes
    useEffect(() => {
        dispatch(
            getReportsAsync({
                page: 1, // Reset to first page when filtering
                limit: pageSize,
                search: debouncedSearch,
                status: status === "all" ? "" : status,
            })
        );
    }, [debouncedSearch, pageSize, status, dispatch]);

    const handlePageChange = (page) => {
        dispatch(
            getReportsAsync({
                page,
                limit: pageSize,
                search: debouncedSearch,
                status: status === "all" ? "" : status,
            })
        );
    };

    const handleViewReport = (reportId) => {
        setSearchParams((prev) => ({
            ...Object.fromEntries(prev),
            reportId: reportId,
        }));
    };

    const handleCloseDialog = () => {
        setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("reportId");
            return newParams;
        });
        dispatch(clearSelectedReport());
    };

    const columns = [
        {
            key: "reporter",
            header: "Reporter",
            render: (value) => (
                <div className="space-y-1">
                    <div className="font-medium text-text-main">
                        {value.firstName} {value.lastName}
                    </div>
                    <div className="text-sm text-site-general">{value.email}</div>
                </div>
            ),
        },
        {
            key: "reportedUser",
            header: "Reported User",
            render: (value) => (
                <div className="space-y-1">
                    <div className="font-medium text-text-main">
                        {value.firstName} {value.lastName}
                    </div>
                    <div className="text-sm text-site-general">{value.email}</div>
                </div>
            ),
        },
        {
            key: "reason",
            header: "Reason",
            render: (value) => (
                <span className="text-sm text-site-general">
                    {getReasonLabel(value)}
                </span>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (value, row) => getStatusBadgeSimple(value, row.chatBlockStatus),
        },
        {
            key: "createdAt",
            header: "Reported At",
            render: (value) => (
                <span className="text-sm text-site-general">
                    {formatDateShort(value)}
                </span>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            render: (value, row) => (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 border-site-table-border text-text-main hover:bg-site-approve/10 hover:border-site-approve/20"
                    onClick={() => {
                        handleViewReport(row._id);
                    }}
                >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative max-w-sm grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-site-general h-4 w-4" />
                    <Input
                        placeholder="Search reports..."
                        onChange={(e) => setDebouncedSearch(e.target.value)}
                        className="pl-10 pr-10 w-full border-site-table-border focus:border-site-approve/50"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Select
                        value={status}
                        onValueChange={(value) => {
                            setStatus(value);
                        }}
                    >
                        <SelectTrigger className="w-[180px] border-site-table-border focus:border-site-approve/50">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => {
                            const newPageSize = parseInt(value, 10);
                            setPageSize(newPageSize);
                        }}
                    >
                        <SelectTrigger className="w-[180px] border-site-table-border focus:border-site-approve/50">
                            <SelectValue placeholder="Rows per page" />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZES.map((size) => (
                                <SelectItem key={size.value} value={size.value}>
                                    {size.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <SimpleDataTable
                data={reports || []}
                columns={columns}
                pagination={pagination}
                onPageChange={handlePageChange}
                itemsPerPage={pageSize}
                emptyMessage="No reports found"
                isLoading={isLoading}
            />

            {/* View Report Dialog */}
            {Boolean(reportId) && (
                <ViewReport
                    isOpen={Boolean(reportId)}
                    onClose={handleCloseDialog}
                    reportId={reportId}
                />
            )}
        </div>
    );
}
