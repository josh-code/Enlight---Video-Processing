import { Loader2 } from "lucide-react";
import { Button } from "@/components/shadcn/ui/button";
import { cn } from "@/lib/utils";

export default function LoadingButton({
    children,
    loading,
    className,
    ...props
}) {
    return (
        <Button
            className={cn("", className)}
            {...props}
            disabled={props.disabled || loading}
        >
            <span className="flex items-center justify-center gap-1">
                {loading && <Loader2 size={16} className="animate-spin" />}
                {children}
            </span>
        </Button>
    );
}
