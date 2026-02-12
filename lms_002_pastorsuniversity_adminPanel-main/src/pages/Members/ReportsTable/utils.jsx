import { Badge } from "@/components/shadcn/ui/badge";
import { Clock, CheckCircle, XCircle } from "lucide-react";

export const getStatusBadge = (status, chatBlockStatus = "none") => {
    const statusConfig = {
        pending: {
            variant: "secondary",
            label: "Pending",
            icon: Clock,
            className: "bg-site-general/10 text-site-general border-site-general/20",
        },
        reviewed: {
            variant: "default",
            label: "Reviewed",
            icon: CheckCircle,
            className: "bg-site-approve/10 text-site-approve border-site-approve/20",
        },
        resolved: {
            variant: "success",
            label: "Resolved",
            icon: CheckCircle,
            className: "bg-site-approve/10 text-site-approve border-site-approve/20",
        },
        dismissed: {
            variant: "destructive",
            label: "Dismissed",
            icon: XCircle,
            className: "bg-site-reject/10 text-site-reject border-site-reject/20",
        },
    };

    const config = statusConfig[status] || {
        variant: "secondary",
        label: status,
        icon: Clock,
        className: "bg-site-general/10 text-site-general border-site-general/20",
    };
    const IconComponent = config.icon;

    // Add chat block indicator to the label
    const displayLabel = chatBlockStatus === "blocked"
        ? `${config.label} (Chat Blocked)`
        : config.label;

    return (
        <Badge
            variant={config.variant}
            className={`flex items-center gap-1 ${config.className}`}
        >
            <IconComponent className="h-3 w-3" />
            {displayLabel}
        </Badge>
    );
};

export const getStatusBadgeSimple = (status, chatBlockStatus = "none") => {
    const statusConfig = {
        pending: {
            variant: "secondary",
            label: "Pending",
            className: "bg-site-general/10 text-site-general border-site-general/20",
        },
        reviewed: {
            variant: "default",
            label: "Reviewed",
            className: "bg-site-approve/10 text-site-approve border-site-approve/20",
        },
        resolved: {
            variant: "success",
            label: "Resolved",
            className: "bg-site-approve/10 text-site-approve border-site-approve/20",
        },
        dismissed: {
            variant: "destructive",
            label: "Dismissed",
            className: "bg-site-reject/10 text-site-reject border-site-reject/20",
        },
    };

    const config = statusConfig[status] || {
        variant: "secondary",
        label: status,
        className: "bg-site-general/10 text-site-general border-site-general/20",
    };

    // Add chat block indicator to the label
    const displayLabel = chatBlockStatus === "blocked"
        ? `${config.label} (Chat Blocked)`
        : config.label;

    return (
        <Badge variant={config.variant} className={config.className}>
            {displayLabel}
        </Badge>
    );
};

export const getReasonLabel = (reason) => {
    const reasonLabels = {
        inappropriate_content: "Inappropriate Content",
        harassment: "Harassment",
        spam: "Spam",
        fake_profile: "Fake Profile",
        other: "Other",
    };
    return reasonLabels[reason] || reason;
};

export const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (error) {
        return "Invalid Date";
    }
};

export const formatDateShort = (dateString) => {
    if (!dateString) return "N/A";
    try {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (error) {
        return "Invalid Date";
    }
};

export const formatMessageDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch (error) {
        return "Invalid Date";
    }
};
