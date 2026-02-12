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

const AlertDialogComponent = ({
    isDialogOpen,
    heading,
    description,
    cancelAction,
    confirmAction,
    hideCancelButton = false,
    confirmText = "Confirm",
    cancelText = "Cancel",
}) => {
    return (
        <AlertDialog open={isDialogOpen}>
            <AlertDialogContent className="w-[90%] max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {heading || "Are you absolutely sure?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {!hideCancelButton && (
                        <AlertDialogCancel onClick={() => cancelAction()}>
                            {cancelText}
                        </AlertDialogCancel>
                    )}
                    <AlertDialogAction
                        className="hover:bg-primary hover:opacity-80"
                        onClick={() => confirmAction()}
                    >
                        {confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default AlertDialogComponent;
