import { Switch } from "@/components/shadcn/ui/switch";
import { Button } from "@/components/shadcn/ui/button";
import { Label } from "@/components/shadcn/ui/label";
import { ChevronRight, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";

export default function Features({
    data,
    onSelect,
    onToggle,
    onDelete,
    pathValid,
}) {
    const keys = Object.keys(data);

    return (
        <>
            {pathValid ? (
                <div className="grid grid-cols-1 gap-4">
                    {keys.length > 0 ? (
                        keys.map((key) => {
                            const feature = data[key];

                            const isObject = typeof feature === "object" && feature !== null;

                            const isFeature =
                                isObject &&
                                ("enabled" in feature ||
                                    "abTesting" in feature ||
                                    "description" in feature);

                            const childKeys = isObject
                                ? Object.keys(feature).filter(
                                    (childKey) =>
                                        ![
                                            "enabled",
                                            "abTesting",
                                            "description",
                                            "keyName",
                                        ].includes(childKey)
                                )
                                : [];

                            return (
                                <button
                                    key={key}
                                    className="p-4 bg-muted rounded focus:outline-none text-left group"
                                    onClick={() => isObject && onSelect(key)}
                                    onKeyDown={(e) => {
                                        if (isObject && (e.key === "Enter" || e.key === " ")) {
                                            onSelect(key);
                                        }
                                    }}
                                    aria-label={`View feature details for ${feature.keyName}`}
                                >
                                    {/* Feature Name */}
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <h5 className="font-bold capitalize group-hover:underline">
                                                {feature.keyName}
                                            </h5>
                                            {/* Conditionally show the nested feature icon */}
                                            {childKeys.length > 0 && (
                                                <ChevronRight className="text-inherit" />
                                            )}
                                        </div>
                                        {isFeature && (
                                            <div className="flex gap-6">
                                                {"enabled" in feature && (
                                                    <div className="flex items-center gap-2">
                                                        <Label
                                                            htmlFor={`${key}-enabled`}
                                                            className="text-sm"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Enabled
                                                        </Label>
                                                        <Switch
                                                            id={`${key}-enabled`}
                                                            checked={feature.enabled}
                                                            onCheckedChange={() => onToggle(key, "enabled")}
                                                            aria-pressed={feature.enabled}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </div>
                                                )}
                                                {"abTesting" in feature && (
                                                    <div className="flex items-center gap-2">
                                                        <Label
                                                            htmlFor={`${key}-abTesting`}
                                                            className="text-sm"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            AB Testing
                                                        </Label>
                                                        <Switch
                                                            id={`${key}-abTesting`}
                                                            checked={feature.abTesting}
                                                            onCheckedChange={() => onToggle(key, "abTesting")}
                                                            aria-pressed={feature.abTesting}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </div>
                                                )}
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <ConfirmationDialog
                                                        title={`Are you sure you want to delete this key ${key}?`}
                                                        description="This action cannot be undone."
                                                        onConfirm={() => onDelete(key)}
                                                        confirmButtonText="Delete"
                                                        trigger={
                                                            <Button
                                                                className="text-destructive p-0 w-10 duration-300 hover:bg-destructive hover:text-destructive-foreground"
                                                                variant="icon"
                                                            >
                                                                <Trash2 />
                                                            </Button>
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Show description if present */}
                                    {isObject && "description" in feature && (
                                        <p className="text-sm text-gray-700 mt-1">
                                            {feature.description || "No description provided"}
                                        </p>
                                    )}

                                    {childKeys.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Click to explore deeper features
                                        </p>
                                    )}
                                </button>
                            );
                        })
                    ) : (
                        <p>No further nested feature flags</p>
                    )}
                </div>
            ) : (
                <p className="text-destructive ">
                    The current URL path is invalid. Please use the breadcrumb to navigate
                    to a valid feature path.
                </p>
            )}
        </>
    );
}
