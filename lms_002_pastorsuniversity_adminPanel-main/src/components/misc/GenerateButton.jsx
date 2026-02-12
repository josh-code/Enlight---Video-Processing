import { useState } from "react";
import { Button } from "@/components/shadcn/ui/button";
import { Loader2, Sparkles } from "lucide-react";

const GenerateButton = ({
    onClick,
    disabled = false,
    loading = false,
    children,
    className = "",
    variant = "outline",
    size = "sm",
    ...props
}) => {
    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            onClick={onClick}
            disabled={disabled || loading}
            className={`gap-2 ${className}`}
            {...props}
        >
            {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Sparkles className="h-4 w-4" />
            )}
            {children || "Generate"}
        </Button>
    );
};

export default GenerateButton; 