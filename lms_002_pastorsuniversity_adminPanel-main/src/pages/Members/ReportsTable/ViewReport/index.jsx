import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    SelectReportsData,
    getReportByIdAsync,
    clearSelectedReport,
    blockUserFromChatAsync,
    unblockUserFromChatAsync,
    getReportsAsync,
} from "@/redux/slices/member";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { Separator } from "@/components/shadcn/ui/separator";
import { User, Mail, MessageSquare, AlertTriangle, Shield, ShieldCheck } from "lucide-react";
import Loader from "@/components/Loader";
import {
    getStatusBadge,
    getReasonLabel,
    formatDate,
    formatMessageDate,
} from "../utils.jsx";
import ChatBlockDialog from "./ChatBlockDialog";

export default function ViewReport({ isOpen, onClose, reportId }) {
    const dispatch = useDispatch();
    const { selectedReport, isLoading } = useSelector(SelectReportsData);
    const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
    const [isBlockingUser, setIsBlockingUser] = useState(false);

    useEffect(() => {
        if (reportId && isOpen) {
            dispatch(getReportByIdAsync(reportId));
        }
        return () => {
            dispatch(clearSelectedReport());
        };
    }, [dispatch, reportId, isOpen]);

    const handleBlockUser = () => {
        setIsBlockDialogOpen(true);
    };

    const handleUnblockUser = () => {
        setIsBlockDialogOpen(true);
    };

    const handleBlockConfirm = async (data) => {
        if (!selectedReport?.reportedUser?._id) {
            console.error("No reported user ID found");
            return;
        }

        console.log("Starting block/unblock process:", {
            userId: selectedReport.reportedUser._id,
            isCurrentlyBlocked: selectedReport.chatBlockStatus === "blocked",
            data
        });

        setIsBlockingUser(true);
        try {
            const isCurrentlyBlocked = selectedReport.chatBlockStatus === "blocked";

            if (isCurrentlyBlocked) {
                console.log("Dispatching unblock action");
                await dispatch(unblockUserFromChatAsync(selectedReport.reportedUser._id));
            } else {
                console.log("Dispatching block action");
                await dispatch(blockUserFromChatAsync({
                    userId: selectedReport.reportedUser._id,
                    reason: data.reason,
                    adminNotes: data.adminNotes,
                }));
            }

            console.log("Action completed, refreshing data");
            // Refresh the current report and reports list
            dispatch(getReportByIdAsync(reportId));
            dispatch(getReportsAsync({}));

            setIsBlockDialogOpen(false);
        } catch (error) {
            console.error("Error blocking/unblocking user:", error);
        } finally {
            setIsBlockingUser(false);
        }
    };

    const handleBlockDialogClose = () => {
        setIsBlockDialogOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle className="text-xl font-semibold">
                        Report Details
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center h-96 w-full">
                        <Loader />
                    </div>
                ) : !selectedReport ? (
                    <div className="flex items-center justify-center h-96 w-full">
                        <h1>Report not found</h1>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Report Status and Basic Info */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-orange-500" />
                                <span className="font-medium">Report Status:</span>
                                {getStatusBadge(selectedReport.status || "pending", selectedReport.chatBlockStatus)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Reported on {formatDate(selectedReport.createdAt)}
                            </div>
                        </div>

                        <Separator />

                        {/* Reporter and Reported User Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Reporter */}
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                                    Reporter
                                </h3>
                                <div className="bg-muted p-4 rounded-lg space-y-2">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">
                                            {selectedReport.reporter?.firstName || ""}{" "}
                                            {selectedReport.reporter?.lastName || ""}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">
                                            {selectedReport.reporter?.email || ""}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Reported User */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                                        Reported User
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {selectedReport.chatBlockStatus === "blocked" ? (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-site-reject/10 text-site-reject rounded-md text-xs">
                                                <Shield className="h-3 w-3" />
                                                Blocked from Chat
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 px-2 py-1 bg-site-approve/10 text-site-approve rounded-md text-xs">
                                                <ShieldCheck className="h-3 w-3" />
                                                Active in Chat
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-destructive/5 p-4 rounded-lg space-y-2">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-destructive/50" />
                                        <span className="font-medium">
                                            {selectedReport.reportedUser?.firstName || ""}{" "}
                                            {selectedReport.reportedUser?.lastName || ""}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-destructive/50" />
                                        <span className="text-sm text-muted-foreground">
                                            {selectedReport.reportedUser?.email || ""}
                                        </span>
                                    </div>

                                    {/* Chat Block Status Details */}
                                    {selectedReport.chatBlockStatus === "blocked" && (
                                        <div className="mt-3 pt-3 border-t border-destructive/20">
                                            <div className="text-xs text-destructive/70">
                                                <p>Blocked from chat on {formatDate(selectedReport.chatBlockedAt)}</p>
                                                {selectedReport.chatBlockReason && (
                                                    <p>Reason: {selectedReport.chatBlockReason}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="mt-3 pt-3 border-t border-destructive/20">
                                        <div className="flex gap-2">
                                            {selectedReport.chatBlockStatus === "blocked" ? (
                                                <Button
                                                    onClick={handleUnblockUser}
                                                    disabled={isBlockingUser}
                                                    size="sm"
                                                    className="bg-site-approve hover:bg-site-approve/90 text-white"
                                                >
                                                    <ShieldCheck className="h-4 w-4 mr-1" />
                                                    {isBlockingUser ? "Unblocking..." : "Unblock from Chat"}
                                                </Button>
                                            ) : (
                                                <Button
                                                    onClick={handleBlockUser}
                                                    disabled={isBlockingUser}
                                                    size="sm"
                                                    variant="destructive"
                                                >
                                                    <Shield className="h-4 w-4 mr-1" />
                                                    {isBlockingUser ? "Blocking..." : "Block from Chat"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        {/* Report Details */}
                        <div className="space-y-4">
                            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                                Report Details
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600">
                                        Reason
                                    </label>
                                    <p className="mt-1 text-sm">
                                        {getReasonLabel(selectedReport.reason || "")}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600">
                                        Report ID
                                    </label>
                                    <p className="mt-1 text-sm font-mono text-gray-500">
                                        {selectedReport._id || ""}
                                    </p>
                                </div>
                            </div>

                            {selectedReport.comment && (
                                <div>
                                    <label className="text-sm font-medium text-gray-600">
                                        Additional Comment
                                    </label>
                                    <p className="mt-1 text-sm bg-gray-50 p-3 rounded-lg">
                                        {selectedReport.comment || ""}
                                    </p>
                                </div>
                            )}

                            {selectedReport.adminNotes && (
                                <div>
                                    <label className="text-sm font-medium text-gray-600">
                                        Admin Notes
                                    </label>
                                    <p className="mt-1 text-sm bg-blue-50 p-3 rounded-lg">
                                        {selectedReport.adminNotes || ""}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Context Messages */}
                        {selectedReport.contextMessages &&
                            selectedReport.contextMessages.length > 0 && (
                                <>
                                    <Separator />
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-2">
                                            <MessageSquare className="h-4 w-4" />
                                            Context Messages
                                        </h3>
                                        <div className="space-y-3 max-h-60 overflow-y-auto">
                                            {[...(selectedReport.contextMessages || [])]
                                                .sort(
                                                    (a, b) =>
                                                        new Date(a.createdAt) - new Date(b.createdAt)
                                                )
                                                .map((message, index) => (
                                                    <div
                                                        key={message._id || index}
                                                        className={`p-3 rounded-lg ${message.sender?._id ===
                                                            selectedReport.reporter?._id
                                                            ? "bg-blue-50 ml-8"
                                                            : "bg-gray-50 mr-8"
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-xs font-medium text-gray-600">
                                                                {message.sender?.firstName || ""}{" "}
                                                                {message.sender?.lastName || ""}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {formatMessageDate(message.createdAt || "")}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm">{message.message || ""}</p>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </>
                            )}

                        {/* Review Information */}
                        {selectedReport.reviewedBy && (
                            <>
                                <Separator />
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-sm text-text-main uppercase tracking-wide">
                                        Review Information
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-text-main">
                                                Reviewed By
                                            </label>
                                            <p className="mt-1 text-sm text-site-general">
                                                {selectedReport.reviewedBy?.firstName || ""}{" "}
                                                {selectedReport.reviewedBy?.lastName || ""}
                                            </p>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-text-main">
                                                Reviewed At
                                            </label>
                                            <p className="mt-1 text-sm text-site-general">
                                                {formatDate(selectedReport.reviewedAt || "")}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedReport.resolvedAt && (
                                        <div>
                                            <label className="text-sm font-medium text-text-main">
                                                Resolved At
                                            </label>
                                            <p className="mt-1 text-sm text-site-general">
                                                {formatDate(selectedReport.resolvedAt || "")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>

            {/* Chat Block Dialog */}
            <ChatBlockDialog
                isOpen={isBlockDialogOpen}
                onClose={handleBlockDialogClose}
                onConfirm={handleBlockConfirm}
                user={selectedReport?.reportedUser}
                isBlocked={selectedReport?.chatBlockStatus === "blocked"}
                isLoading={isBlockingUser}
            />
        </Dialog>
    );
}
