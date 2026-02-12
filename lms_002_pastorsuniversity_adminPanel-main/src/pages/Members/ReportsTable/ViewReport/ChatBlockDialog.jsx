import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";
import { Input } from "@/components/shadcn/ui/input";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Label } from "@/components/shadcn/ui/label";
import { AlertTriangle, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ChatBlockDialog = ({
    isOpen,
    onClose,
    onConfirm,
    user,
    isBlocked = false,
    isLoading = false,
}) => {
    const [reason, setReason] = useState("");
    const [adminNotes, setAdminNotes] = useState("");

    const handleConfirm = () => {
        if (!reason && !isBlocked) {
            toast.error(
                "Please enter a reason for blocking/unblocking the user from chat."
            );
            return;
        }
        onConfirm({
            reason:
                reason.trim() || (isBlocked ? "" : "Blocked from chat due to report"),
            adminNotes: adminNotes.trim(),
        });
    };

    const handleClose = () => {
        setReason("");
        setAdminNotes("");
        onClose();
    };

    const actionText = isBlocked ? "Unblock" : "Block";
    const actionColor = isBlocked
        ? "bg-site-approve hover:bg-site-approve/90"
        : "bg-site-reject hover:bg-site-reject/90";
    const icon = isBlocked ? ShieldCheck : Shield;
    const IconComponent = icon;

    return (
        <AlertDialog open={isOpen} onOpenChange={handleClose}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <IconComponent className="h-5 w-5" />
                        {actionText} User from Chat
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>
                            {isBlocked
                                ? `Are you sure you want to unblock ${user?.firstName} ${user?.lastName} from chat functionality?`
                                : `Are you sure you want to block ${user?.firstName} ${user?.lastName} from chat functionality?`}
                        </p>
                        <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm font-medium">User Details:</p>
                            <p className="text-sm text-muted-foreground">
                                {user?.firstName} {user?.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground">{user?.email}</p>
                        </div>
                        {!isBlocked && (
                            <div className="space-y-2">
                                <div>
                                    <Label htmlFor="reason" className="text-sm font-medium">
                                        Reason for blocking
                                    </Label>
                                    <Input
                                        id="reason"
                                        placeholder="Enter reason for blocking from chat..."
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="adminNotes" className="text-sm font-medium">
                                        Admin Notes (Optional)
                                    </Label>
                                    <Textarea
                                        id="adminNotes"
                                        placeholder="Add any additional notes..."
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        className="mt-1"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        )}
                        {isBlocked && (
                            <div className="flex items-center gap-2 p-3 bg-site-approve/10 rounded-lg">
                                <ShieldCheck className="size-4 text-site-approve" />
                                <p className="text-sm text-site-approve">
                                    This will restore the user&apos;s ability to send and receive
                                    messages.
                                </p>
                            </div>
                        )}
                        {!isBlocked && (
                            <div className="flex items-center gap-2 p-3 bg-destructive/5 rounded-lg">
                                <AlertTriangle className="size-4 text-destructive" />
                                <p className="text-sm text-destructive">
                                    This will prevent the user from sending or receiving messages.
                                </p>
                            </div>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={handleClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={isLoading || (!reason && !isBlocked)}
                        className={`${actionColor} text-white`}
                    >
                        {isLoading ? "Processing..." : `${actionText} from Chat`}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default ChatBlockDialog;
