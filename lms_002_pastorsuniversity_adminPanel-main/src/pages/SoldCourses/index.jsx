import { useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    clearSoldCourses,
    fetchSoldCoursesAsync,
    SelectSoldCourses,
    SelectTotalSoldCourses,
} from "@/redux/slices/soldCourses";

// Custom
import SoldCoursesTable from "./SoldCoursesTable";

// Shadcn
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/ui/select";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/shadcn/ui/button";

// Custom hooks
import { useDebounce } from "@/hooks";

const tableHeader = [
    "Date",
    "Course Name",
    "Customer Name",
    "Customer Phone",
    "Amount",
    "Payment Status",
];

const TIME_FRAMES = [
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "Last 3 Month", value: "last_3_months" },
    { label: "Last 6 Month", value: "last_6_months" },
    { label: "All Time", value: "all_time" },
];

const SORTING_ORDER = [
    { label: "Newest First", value: "desc" },
    { label: "Oldest First", value: "asc" },
];

const PAGE_SIZES = [
    { label: "10 rows per page", value: "10" },
    { label: "25 rows per page", value: "25" },
    { label: "50 rows per page", value: "50" },
    { label: "100 rows per page", value: "100" },
];

export default function SoldCourses() {
    const dispatch = useDispatch();
    const ref = useRef(null);
    const soldCourses = useSelector(SelectSoldCourses);
    const totalCoursesCount = useSelector(SelectTotalSoldCourses);

    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get("search") || "";
    const selectedTimeFrame =
        searchParams.get("timeFrame") || TIME_FRAMES[0].value;
    const selectedSortingOrder =
        searchParams.get("sortOrder") || SORTING_ORDER[0].value;
    const currentPage = parseInt(searchParams.get("page")) || 1;
    const itemsPerPage =
        parseInt(searchParams.get("limit")) || PAGE_SIZES[0].value;

    const [debouncedSearchTerm, setDebouncedInputValue] = useDebounce(
        searchTerm,
        1000
    );

    const updateSearchParams = (key, value) => {
        const updatedParams = new URLSearchParams(searchParams);
        updatedParams.set(key, value);
        setSearchParams(updatedParams);
    };

    const handlePagination = (newPage) => {
        updateSearchParams("page", newPage);
    };

    useEffect(() => {
        if (
            !searchParams.has("timeFrame") ||
            !searchParams.has("sortOrder") ||
            !searchParams.has("page") ||
            !searchParams.has("limit") ||
            !searchParams.has("search")
        ) {
            const defaultParams = new URLSearchParams(searchParams);
            if (!searchParams.has("timeFrame")) {
                defaultParams.set("timeFrame", TIME_FRAMES[0].value);
            }
            if (!searchParams.has("sortOrder")) {
                defaultParams.set("sortOrder", SORTING_ORDER[0].value);
            }
            if (!searchParams.has("page")) {
                defaultParams.set("page", "1");
            }
            if (!searchParams.has("limit")) {
                defaultParams.set("limit", PAGE_SIZES[0].value);
            }
            if (!searchParams.has("search")) {
                defaultParams.set("search", "");
            }
            setSearchParams(defaultParams);
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (ref.current) {
            ref.current.value = debouncedSearchTerm;
        }
        updateSearchParams("search", debouncedSearchTerm);
    }, [debouncedSearchTerm]);

    useEffect(() => {
        dispatch(
            fetchSoldCoursesAsync({
                timeFrame: selectedTimeFrame,
                sortOrder: selectedSortingOrder,
                page: currentPage,
                limit: itemsPerPage,
                courseName: debouncedSearchTerm,
            })
        );

        return () => {
            dispatch(clearSoldCourses());
        };
    }, [
        dispatch,
        selectedTimeFrame,
        selectedSortingOrder,
        currentPage,
        itemsPerPage,
        debouncedSearchTerm,
    ]);

    return (
        <section>
            <div className="pt-2 pb-11">
                <h4 className="text-3xl font-bold">Transactions</h4>
                <div className="mt-16">
                    <div className="flex pb-4 gap-4 items-center justify-between">
                        <Input
                            ref={ref}
                            onChange={(e) => setDebouncedInputValue(e.target.value)}
                            className="max-w-sm"
                            placeholder="Search by course name"
                        />
                        <div className="flex items-center gap-4">
                            <ItemSelector
                                value={itemsPerPage.toString()}
                                label="Rows per page"
                                options={PAGE_SIZES}
                                onSelect={(value) => updateSearchParams("limit", value)}
                            />
                            <ItemSelector
                                value={selectedTimeFrame}
                                onSelect={(value) => updateSearchParams("timeFrame", value)}
                                label={selectedTimeFrame}
                                options={TIME_FRAMES}
                            />
                            <ItemSelector
                                value={selectedSortingOrder}
                                onSelect={(value) => updateSearchParams("sortOrder", value)}
                                label={selectedSortingOrder}
                                options={SORTING_ORDER}
                            />
                        </div>
                    </div>
                    <SoldCoursesTable tableHead={tableHeader} tableData={soldCourses} />

                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            onClick={() => handlePagination(currentPage - 1)}
                            disabled={currentPage <= 1}
                            variant="outline"
                            size="sm"
                        >
                            Previous
                        </Button>
                        <Button
                            onClick={() => handlePagination(currentPage + 1)}
                            disabled={currentPage * itemsPerPage >= totalCoursesCount}
                            variant="outline"
                            size="sm"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ItemSelector({ value, options, onSelect, label }) {
    return (
        <Select value={value} onValueChange={onSelect}>
            <SelectTrigger>
                <SelectValue placeholder={label || "Select an Option"} />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
