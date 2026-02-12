// Shadcn
import { Button } from "@/components/shadcn/ui/button";

// Custom
import LoadingButton from "@/components/misc/LoadingButton";
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";

export default function StageHeader({
    stageName,
    onSaveAsDraft,
    onSaveAndContinue,
    stageDescription,
    buttonText,
    mode,
    isLoading,
    optional,
    onSkip,
    confirm,
    confirmationMessage = "Are you sure you want to continue? Please confirm your action."
}) {
    return (
        <div className="flex justify-between items-center mt-8">
            <div>
                <h5 className="text-black text-lg font-bold">{stageName}</h5>
                {stageDescription && mode !== "edit" && (
                    <p className="text-sm font-light mt-2">{stageDescription}</p>
                )}
            </div>
            {mode !== "edit" && (
                <div className="flex items-center gap-4">
                    {/* <Button
                        onClick={onSaveAsDraft}
                        className="bg-transparent text-sm border border-site-primary/40 text-site-primary/70 rounded-[10px]"
                        disabled={isLoading}
                    >
                        Save as draft
                    </Button> */}
                    {optional && (
                        <Button
                            onClick={onSkip}
                            className="bg-transparent text-sm border border-site-primary/40 text-site-primary/70 rounded-[10px]"
                            disabled={isLoading}
                        >
                            Skip
                        </Button>
                    )}


                    {confirm ? (
                        <ConfirmationDialog
                            title="Are you sure?"
                            description={confirmationMessage}
                            onConfirm={onSaveAndContinue}
                            confirmButtonText={buttonText}
                            cancelButtonText="Cancel"
                            trigger={
                                <LoadingButton
                                    className="border border-site-primary text-sm bg-site-primary text-white rounded-[10px]"
                                    loading={isLoading}
                                >
                                    {buttonText}
                                </LoadingButton>
                            }
                        />
                    ) : (
                        <LoadingButton
                            onClick={onSaveAndContinue}
                            className="border border-site-primary text-sm bg-site-primary text-white rounded-[10px]"
                            loading={isLoading}
                        >
                            {buttonText}
                        </LoadingButton>
                    )}
                </div>
            )}
        </div>
    );
}
