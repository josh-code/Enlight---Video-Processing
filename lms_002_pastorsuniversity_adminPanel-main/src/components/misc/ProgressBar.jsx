import { cn } from "@/lib/utils";

export function ProgressBar({
    progress,
    className,
    showPercentage = true,
    size = "default",
    variant = "default",
}) {
    const sizeClasses = {
        sm: "h-1",
        default: "h-2",
        lg: "h-3",
    };

    const variantClasses = {
        default: "bg-primary",
        success: "bg-green-600",
        warning: "bg-yellow-600",
        danger: "bg-red-600",
    };

    return (
        <div className={cn("w-full", className)}>
            {showPercentage && (
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Upload Progress</span>
                    <span className="text-sm font-medium text-muted-foreground">
                        {Math.round(progress)}%
                    </span>
                </div>
            )}
            <div
                className={cn(
                    "w-full bg-muted rounded-full overflow-hidden",
                    sizeClasses[size]
                )}
            >
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-300 ease-out",
                        variantClasses[variant]
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
            </div>
        </div>
    );
}

export function CircularProgress({
    progress,
    size = 60,
    strokeWidth = 4,
    className,
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div
            className={cn(
                "relative inline-flex items-center justify-center",
                className
            )}
        >
            <svg className="transform -rotate-90" width={size} height={size}>
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    className="text-gray-200"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    className="text-blue-600 transition-all duration-300 ease-out"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-gray-700">
                    {Math.round(progress)}%
                </span>
            </div>
        </div>
    );
}
