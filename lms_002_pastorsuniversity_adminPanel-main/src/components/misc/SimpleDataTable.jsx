import { useState, useMemo } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/shadcn/ui/table";
import PaginationControls from "./PaginationControls";

export default function SimpleDataTable({
    data,
    itemsPerPage = 10,
    className = "",
    emptyMessage = "No data available",
    pagination,
    onPageChange,
    columns,
}) {
    const [currentPage, setCurrentPage] = useState(1);

    const isServerSidePagination = pagination && onPageChange;

    // Calculate pagination
    let totalPages, currentData;

    if (isServerSidePagination) {
        // Server-side pagination
        totalPages = Math.ceil(pagination.totalCount / itemsPerPage);
        currentData = data || [];
        // Use the current page from pagination prop
        const serverCurrentPage = pagination.currentPage || 1;
        if (serverCurrentPage !== currentPage) {
            setCurrentPage(serverCurrentPage);
        }
    } else {
        // Client-side pagination
        totalPages = Math.ceil(data.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        currentData = data.slice(startIndex, endIndex);
    }

    // Reset to first page when data changes
    useMemo(() => {
        if (!isServerSidePagination) {
            setCurrentPage(1);
        }
    }, [data.length, isServerSidePagination]);

    const handlePageChange = (page) => {
        if (isServerSidePagination) {
            onPageChange(page);
        } else {
            setCurrentPage(page);
        }
    };

    if (!data || data.length === 0) {
        return (
            <div className={`text-center py-8 text-gray-500 ${className}`}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((column) => (
                            <TableHead
                                key={column.key}
                                className={column.headerClassName || ""}
                            >
                                {column.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {currentData.map((row, rowIndex) => (
                        <TableRow key={row.id || rowIndex}>
                            {columns.map((column) => (
                                <TableCell
                                    key={column.key}
                                    className={column.cellClassName || ""}
                                >
                                    {column.render
                                        ? column.render(row[column.key], row, rowIndex)
                                        : row[column.key] || "-"}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center">
                    <PaginationControls
                        currentPage={
                            isServerSidePagination ? pagination.currentPage || 1 : currentPage
                        }
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                    />
                </div>
            )}
        </div>
    );
}