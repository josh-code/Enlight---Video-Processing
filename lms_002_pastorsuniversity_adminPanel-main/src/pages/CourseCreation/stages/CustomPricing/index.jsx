import { useEffect, useState, useMemo, useRef } from "react";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    getCourseCustomPricingAsync,
    SelectCoursePricesData,
    SelectSelectedCourse,
    clearCoursePricesData,
    updateCustomPricingAsync,
    deleteCustomPricingAsync,
    getCourseByIdAsync,
} from "@/redux/slices/course";

// Misc
import { DataTable } from "@/components/misc/DataTable";
import AlertDialogComponent from "@/components/misc/AlertDialog";

// Shadcn Components
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import { Badge } from "@/components/shadcn/ui/badge";
import { Skeleton } from "@/components/shadcn/ui/skeleton";

// Lucide Icons
import { Edit, X, Save, RotateCcw } from "lucide-react";

// Sonner Toast
import { toast } from "sonner";

// Utils
import { PRICE_TYPE, zeroDecimalCurrencies } from "@/lib/constant";
import { formatCurrency } from "@/lib/utils";

// Services
import { createCourse } from "@/services/content/course";

// Utility Functions
const parsePriceInput = (input, currencyCode) => {
    const isZeroDecimal = zeroDecimalCurrencies.includes(currencyCode);
    const numericValue = parseFloat(input.replace(/[^\d.]/g, ""));

    if (isNaN(numericValue)) return 0;

    if (isZeroDecimal) {
        return Math.round(numericValue);
    } else {
        return Math.round(numericValue * 100);
    }
};

// Price type filter options
const getPriceTypeFilterOptions = () => [
    {
        value: PRICE_TYPE.PPP,
        label: "PPP Calculated",
        icon: "💰",
        color: "text-green-600",
    },
    {
        value: PRICE_TYPE.CUSTOM,
        label: "Custom Price",
        icon: "✏️",
        color: "text-blue-600",
    },
    {
        value: PRICE_TYPE.FALLBACK,
        label: "Fallback Price",
        icon: "🔄",
        color: "text-gray-600",
    },
];

function PriceCell({ row }) {
    const { price, currencyCode, isCustom, priceType, usdEquivalent } =
        row.original;
    return (
        <div className="flex items-center gap-2">
            <span className="font-mono">{formatCurrency(price, currencyCode)}</span>
            {usdEquivalent && (
                <span className="font-mono text-muted-foreground">
                    ({formatCurrency(usdEquivalent, "USD")})
                </span>
            )}
        </div>
    );
}

function EditableBasePrice({
    baseUSDPrice,
    selectedCourse,
    dispatch,
    onShowDialog,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef();

    const handleEditStart = () => {
        setEditValue((baseUSDPrice / 100).toFixed(2));
        setIsEditing(true);
        setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 0);
    };

    const handleEditSave = async () => {
        const numericValue = parseFloat(editValue);
        if (isNaN(numericValue) || numericValue <= 0) {
            toast.error("Please enter a valid price greater than $0");
            return;
        }

        onShowDialog({
            heading: "Update Base Price",
            description: `Are you sure you want to update the base price to ${formatCurrency(
                parseFloat(editValue) * 100,
                "USD"
            )}? This will affect all country pricing calculations.`,
            confirmText: "Update",
            confirmAction: handleConfirmSave,
        });
    };

    const handleConfirmSave = async () => {
        setIsSaving(true);

        try {
            const numericValue = parseFloat(editValue);
            const newAmountInCents = Math.round(numericValue * 100);

            await createCourse({
                courseId: selectedCourse._id,
                amount: newAmountInCents,
            });

            // Refresh the course data and custom pricing
            await dispatch(getCourseByIdAsync(selectedCourse._id));
            await dispatch(
                getCourseCustomPricingAsync({ courseId: selectedCourse._id })
            );

            setIsEditing(false);
            toast.success("Base price updated successfully");
        } catch (error) {
            console.error("Error updating base price:", error);
            toast.error("Failed to update base price");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditCancel = () => {
        setIsEditing(false);
        setEditValue("");
    };

    if (isEditing) {
        return (
            <>
                <div className="flex items-center gap-2">
                    <Input
                        ref={inputRef}
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="text-2xl font-bold"
                        disabled={isSaving}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !isSaving) {
                                handleEditSave();
                            } else if (e.key === "Escape") {
                                handleEditCancel();
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        onClick={handleEditSave}
                        className="h-8 px-2"
                        disabled={isSaving}
                    >
                        <Save size={16} />
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEditCancel}
                        className="h-8 px-2"
                        disabled={isSaving}
                    >
                        <X size={16} />
                    </Button>
                </div>
            </>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <p className="text-2xl font-bold">
                {formatCurrency(baseUSDPrice, "USD")}
            </p>
            <Button
                size="sm"
                variant="ghost"
                onClick={handleEditStart}
                className="h-8 px-2"
            >
                <Edit size={16} />
            </Button>
        </div>
    );
}

function ActionsCell({ row, dispatch, selectedCourse, onShowDialog }) {
    const { countryCode, isCustom, price, currencyCode, countryName } =
        row.original;
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef();

    const handleEditStart = () => {
        setIsEditing(true);
        setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 0);
    };

    const handleEditSave = () => {
        const value = inputRef.current.value;
        const parsedPrice = parsePriceInput(value, currencyCode);
        if (parsedPrice <= 0) {
            toast.error("Price must be greater than 0");
            return;
        }

        onShowDialog({
            heading: "Save Custom Price",
            description: `Are you sure you want to save the custom price for ${countryName}? This will override the PPP-calculated price.`,
            confirmText: "Save",
            confirmAction: async () => {
                try {
                    const value = inputRef.current.value;
                    const parsedPrice = parsePriceInput(value, currencyCode);

                    await dispatch(
                        updateCustomPricingAsync({
                            courseId: selectedCourse._id,
                            countryCode,
                            customPrice: parsedPrice,
                        })
                    ).unwrap();

                    setIsEditing(false);
                    toast.success("Custom price saved successfully");
                    dispatch(
                        getCourseCustomPricingAsync({ courseId: selectedCourse._id })
                    );
                } catch (error) {
                    toast.error("Failed to update price");
                }
            },
        });
    };

    const handleDeleteCustomPrice = () => {
        onShowDialog({
            heading: "Remove Custom Price",
            description: `Are you sure you want to remove the custom price for ${countryName}? This will reset to the PPP-calculated price.`,
            confirmText: "Remove",
            confirmAction: async () => {
                try {
                    await dispatch(
                        deleteCustomPricingAsync({
                            courseId: selectedCourse._id,
                            countryCode,
                        })
                    ).unwrap();

                    toast.success("Custom price removed successfully");
                    dispatch(
                        getCourseCustomPricingAsync({
                            courseId: selectedCourse._id,
                        })
                    );
                } catch (error) {
                    toast.error("Failed to remove custom price");
                }
            },
        });
    };

    const handleEditCancel = () => {
        setIsEditing(false);
    };

    return (
        <>
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <>
                        <Input
                            ref={inputRef}
                            defaultValue={
                                zeroDecimalCurrencies.includes(currencyCode)
                                    ? price.toString()
                                    : (price / 100).toFixed(2)
                            }
                            className="w-24"
                            placeholder="0.00"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleEditSave();
                                if (e.key === "Escape") handleEditCancel();
                            }}
                        />
                        <Button size="sm" onClick={handleEditSave} className="h-8 w-8 p-0">
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleEditCancel}
                            className="h-8 w-8 p-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                ) : (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEditStart}
                        className="h-8 w-8 p-0"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                )}
                {isCustom && !isEditing && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDeleteCustomPrice}
                        className="h-8 w-8 p-0"
                        title="Reset to PPP price"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </>
    );
}

function CustomPricingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header Information Skeleton */}
            <div className="bg-muted/50 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-32" />
                    </div>
                    <div>
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                    <div>
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                </div>
            </div>

            {/* Instructions Skeleton */}
            <div className="rounded-lg p-4">
                <Skeleton className="h-5 w-32 mb-2" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </div>

            {/* Table Skeleton */}
            <div className="border rounded-lg">
                {/* Table Header */}
                <div className="border-b p-4">
                    <div className="flex justify-between items-center mb-4">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-8 w-24" />
                    </div>
                    <div className="grid grid-cols-6 gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                </div>

                {/* Table Rows */}
                <div className="divide-y">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className="p-4">
                            <div className="grid grid-cols-6 gap-4 items-center">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-12" />
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-6 w-16 rounded-full" />
                                <div className="flex gap-2">
                                    <Skeleton className="h-8 w-8 rounded" />
                                    <Skeleton className="h-8 w-8 rounded" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CustomPricing() {
    const dispatch = useDispatch();
    const selectedCourse = useSelector(SelectSelectedCourse);
    const [showDialog, setShowDialog] = useState(false);
    const [dialogConfig, setDialogConfig] = useState({});
    const coursePricesData = useSelector(SelectCoursePricesData);

    const {
        isLoading,
        error,
        coursePrices,
        baseUSDPrice,
        totalCountries,
        customPricingCount,
        fallbackCountriesCount,
        pppCountriesCount,
    } = coursePricesData;

    const handleShowDialog = (config) => {
        // Wrap the confirm action to close dialog immediately and then execute action
        const wrappedConfirmAction = async () => {
            setShowDialog(false);
            setDialogConfig({});
            try {
                await config.confirmAction();
            } catch (error) {
                // Error handling is already done in the individual actions
            }
        };

        setDialogConfig({
            ...config,
            confirmAction: wrappedConfirmAction,
        });
        setShowDialog(true);
    };

    const handleCloseDialog = () => {
        setShowDialog(false);
        setDialogConfig({});
    };

    const badgeColor = (priceType) => {
        if (priceType === PRICE_TYPE.CUSTOM) return "bg-blue-500 hover:bg-blue-600";
        if (priceType === PRICE_TYPE.FALLBACK)
            return "bg-gray-500 hover:bg-gray-600";
        return "bg-green-500 hover:bg-green-600";
    };

    // Table columns configuration
    const columns = useMemo(
        () => [
            {
                accessorKey: "countryName",
                header: "Country",
                cell: ({ row }) => (
                    <div className="font-medium flex items-center gap-2">
                        <div className="size-6 rounded-full overflow-hidden border">
                            <img
                                src={row.original.countryFlag}
                                alt={row.original.countryName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {row.original.countryName}
                    </div>
                ),
            },
            {
                accessorKey: "currencyCode",
                header: "Currency",
                cell: ({ row }) => (
                    <span className="font-mono">{row.original.currencyCode}</span>
                ),
            },
            {
                accessorKey: "price",
                header: "Price",
                cell: ({ row }) => <PriceCell row={row} />,
            },
            {
                accessorKey: "priceType",
                header: "Type",
                cell: ({ row }) => (
                    <Badge className={`text-xs  ${badgeColor(row.original.priceType)}`}>
                        {row.original.priceType}
                    </Badge>
                ),
            },
            {
                accessorKey: "actions",
                header: "",
                cell: ({ row }) => (
                    <ActionsCell
                        row={row}
                        dispatch={dispatch}
                        selectedCourse={selectedCourse}
                        onShowDialog={handleShowDialog}
                    />
                ),
            },
        ],
        [dispatch, selectedCourse?._id]
    );

    useEffect(() => {
        if (selectedCourse?._id) {
            dispatch(getCourseCustomPricingAsync({ courseId: selectedCourse._id }));
        }

        return () => {
            dispatch(clearCoursePricesData());
        };
    }, [dispatch, selectedCourse?._id]);

    if (isLoading) {
        return <CustomPricingSkeleton />;
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg text-red-600">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Information */}
            <div className="bg-muted/50 p-4 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            Base USD Price
                        </h3>
                        <EditableBasePrice
                            baseUSDPrice={baseUSDPrice}
                            selectedCourse={selectedCourse}
                            dispatch={dispatch}
                            onShowDialog={handleShowDialog}
                        />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            Total Countries
                        </h3>
                        <p className="text-2xl font-bold">{totalCountries}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            PPP Calculated
                        </h3>
                        <p className="text-2xl font-bold">{pppCountriesCount}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            Fallback Prices
                        </h3>
                        <p className="text-2xl font-bold">{fallbackCountriesCount}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            Custom Prices
                        </h3>
                        <p className="text-2xl font-bold">{customPricingCount}</p>
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">How to use:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>
                        • Click the edit icon next to Base USD Price to modify the base
                        price
                    </li>
                    <li>• Click the edit icon to set a custom price for any country</li>
                    <li>• Custom prices override the automatic PPP calculation</li>
                    <li>
                        • Use the reset icon to remove custom pricing and revert to PPP
                    </li>
                </ul>
            </div>

            {/* DataTable */}
            <DataTable
                data={coursePrices}
                columns={columns}
                searchColumns={["countryName", "currencyCode"]}
                initialSorting={[{ id: "countryName", desc: false }]}
                initialVisibility={{
                    currencyCode: true,
                    actions: true,
                }}
                customFilters={[
                    {
                        key: "priceType",
                        placeholder: "Filter by type",
                        options: getPriceTypeFilterOptions(),
                        initialValue: [
                            PRICE_TYPE.PPP,
                            PRICE_TYPE.CUSTOM,
                            PRICE_TYPE.FALLBACK,
                        ], // Show all types initially
                        multiple: true,
                        getValue: (item) => item.priceType,
                    },
                ]}
            />

            {/* Shared Confirmation Dialog */}
            <AlertDialogComponent
                isDialogOpen={showDialog}
                heading={dialogConfig.heading || ""}
                description={dialogConfig.description || ""}
                confirmText={dialogConfig.confirmText || "Confirm"}
                cancelText="Cancel"
                confirmAction={dialogConfig.confirmAction || (() => { })}
                cancelAction={handleCloseDialog}
            />
        </div>
    );
}
