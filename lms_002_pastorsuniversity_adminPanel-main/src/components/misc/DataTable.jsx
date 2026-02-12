import React, { useEffect, useState } from "react";

// Transtack react table
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";

// Icons
import { ChevronDown, Filter, Search } from "lucide-react";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/shadcn/ui/dropdown-menu";
import { Input } from "@/components/shadcn/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/shadcn/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/ui/select";
import { Badge } from "@/components/shadcn/ui/badge";

const PAGE_SIZES = [10, 25, 50, 100];

const generatePlaceholder = (searchColumns) => {
    if (!searchColumns || searchColumns.length === 0) return "Search...";

    const readableColumns = searchColumns.map(
        (col) => col.charAt(0).toUpperCase() + col.slice(1)
    );
    return `Search by ${readableColumns.join(", ")}...`;
};

// Custom Filter Component
function CustomFilter({
    filterKey,
    filterOptions,
    selectedFilters,
    onFilterChange,
    placeholder = "Filter by type",
    multiple = true,
}) {
    const [isOpen, setIsOpen] = useState(false);

    const handleFilterToggle = (value) => {
        if (multiple) {
            const newFilters = selectedFilters.includes(value)
                ? selectedFilters.filter((filter) => filter !== value)
                : [...selectedFilters, value];
            onFilterChange(filterKey, newFilters);
        } else {
            onFilterChange(filterKey, selectedFilters.includes(value) ? [] : [value]);
        }
    };

    const handleClearAll = () => {
        onFilterChange(filterKey, []);
    };

    const selectedCount = selectedFilters.length;

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 px-3">
                    <Filter className="h-4 w-4 mr-2" />
                    {placeholder}
                    {selectedCount > 0 && (
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                            {selectedCount}
                        </Badge>
                    )}
                    <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-between p-2 border-b">
                    <span className="text-sm font-medium">Filter Options</span>
                    {selectedCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearAll}
                            className="h-6 px-2 text-xs"
                        >
                            Clear all
                        </Button>
                    )}
                </div>
                {filterOptions.map((option) => (
                    <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={selectedFilters.includes(option.value)}
                        onCheckedChange={() => handleFilterToggle(option.value)}
                        className="cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            {option.icon && <span className={`text-sm ${option.color || ''}`}>{option.icon}</span>}
                            <span className={option.color || ''}>{option.label}</span>
                        </div>
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function DataTable({
    data,
    columns,
    initialSorting = [],
    initialFilters = [],
    searchColumns = [],
    initialVisibility = {},
    onSortingChange,
    onFiltersChange,
    onRowSelectionChange,
    onSelectedRowsChange,
    clearSelectionTrigger,
    customFilters = [], // New prop for custom filters
}) {
    const [sorting, setSorting] = useState(initialSorting);
    const [columnFilters, setColumnFilters] = useState(initialFilters);
    const [columnVisibility, setColumnVisibility] = useState(initialVisibility);
    const [rowSelection, setRowSelection] = useState({});
    const [pageSize, setPageSize] = useState(10);
    const [searchValue, setSearchValue] = useState("");
    const [customFilterValues, setCustomFilterValues] = useState({});

    // Initialize custom filter values
    useEffect(() => {
        const initialCustomFilters = {};
        customFilters.forEach((filter) => {
            initialCustomFilters[filter.key] = filter.initialValue || [];
        });
        setCustomFilterValues(initialCustomFilters);
    }, [customFilters]);

    const handleCustomFilterChange = (filterKey, values) => {
        setCustomFilterValues((prev) => ({
            ...prev,
            [filterKey]: values,
        }));
    };

    // Apply custom filters to data
    const filteredData = React.useMemo(() => {
        let filtered = data;

        // Apply custom filters
        customFilters.forEach((filter) => {
            const selectedValues = customFilterValues[filter.key] || [];
            if (selectedValues.length > 0) {
                filtered = filtered.filter((item) => {
                    const itemValue = filter.getValue
                        ? filter.getValue(item)
                        : item[filter.key];
                    return selectedValues.includes(itemValue);
                });
            }
        });

        return filtered;
    }, [data, customFilterValues, customFilters]);

    const table = useReactTable({
        data: filteredData, // Use filtered data instead of original data
        columns,
        onSortingChange: (newSorting) => {
            setSorting(newSorting);
            if (onSortingChange) onSortingChange(newSorting);
        },
        onColumnFiltersChange: (newFilters) => {
            setColumnFilters(newFilters);
            if (onFiltersChange) onFiltersChange(newFilters);
        },
        onRowSelectionChange: (newSelection) => {
            setRowSelection(newSelection);
            if (onRowSelectionChange) onRowSelectionChange(newSelection);
        },
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
        initialState: {
            pagination: {
                pageSize,
            },
        },
        globalFilterFn: (row, columnId, filterValue) => {
            return searchColumns.some((key) =>
                row.original[key]
                    ?.toString()
                    .toLowerCase()
                    .includes(filterValue.toLowerCase())
            );
        },
    });

    const clearSelectedRows = () => {
        setRowSelection({});
        table.setRowSelection({});
        if (onRowSelectionChange) onRowSelectionChange({});
        if (onSelectedRowsChange) onSelectedRowsChange([]);
    };

    useEffect(() => {
        if (clearSelectionTrigger) {
            clearSelectionTrigger(clearSelectedRows);
        }
    }, [clearSelectionTrigger]);

    useEffect(() => {
        if (onSelectedRowsChange) {
            const selectedRows = table
                .getFilteredSelectedRowModel()
                .rows.map((row) => row.original);
            onSelectedRowsChange(selectedRows);
        }
    }, [onSelectedRowsChange, rowSelection, table]);

    return (
        <div className="w-full">
            <div className="flex items-center pb-4 gap-4 flex-wrap">
                <div className="relative max-w-sm grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-site-general h-4 w-4" />
                    <Input
                        placeholder={generatePlaceholder(searchColumns)}
                        value={searchValue}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchValue(value);
                            table.setGlobalFilter(value);
                        }}
                        className="pl-10 pr-10 w-full border-site-table-border focus:border-site-approve/50"
                    />
                </div>

                <div className="ml-auto flex gap-4">
                    {/* Custom Filters */}
                    {customFilters.map((filter) => (
                        <CustomFilter
                            key={filter.key}
                            filterKey={filter.key}
                            filterOptions={filter.options}
                            selectedFilters={customFilterValues[filter.key] || []}
                            onFilterChange={handleCustomFilterChange}
                            placeholder={filter.placeholder}
                            multiple={filter.multiple !== false}
                        />
                    ))}

                    <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => {
                            const newPageSize = parseInt(value, 10);
                            setPageSize(newPageSize);
                            table.setPageSize(newPageSize);
                        }}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Rows per page" />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZES.map((size) => (
                                <SelectItem key={size} value={size.toString()}>
                                    {`${size} rows per page`}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                Columns <ChevronDown />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {table
                                .getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => {
                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            className="capitalize"
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) =>
                                                column.toggleVisibility(!!value)
                                            }
                                        >
                                            {column.id}
                                        </DropdownMenuCheckboxItem>
                                    );
                                })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                {table.getFilteredSelectedRowModel().rows.length > 0 ? (
                    <div className="flex-1 text-sm text-muted-foreground">
                        {table.getFilteredSelectedRowModel().rows.length} of{" "}
                        {table.getFilteredRowModel().rows.length} row(s) selected.
                    </div>
                ) : (
                    <div className="flex-1 text-sm text-muted-foreground">
                        Page {table.getState().pagination.pageIndex + 1} of{" "}
                        {table.getPageCount()}
                    </div>
                )}

                {filteredData.length > pageSize && (
                    <div className="space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
