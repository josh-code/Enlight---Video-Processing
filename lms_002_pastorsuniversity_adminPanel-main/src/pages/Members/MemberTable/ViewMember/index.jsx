import { useEffect, useMemo, useState } from "react";

// Shadcn
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/ui/dialog";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/shadcn/ui/accordion";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/shadcn/ui/avatar";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import { Button } from "@/components/shadcn/ui/button";
import { Badge } from "@/components/shadcn/ui/badge";
import AlertDialogComponent from "@/components/misc/AlertDialog";

// Utils
import {
    cn,
    getInitials,
    getLast30Days,
    formatDate,
    formatPhoneNumber,
    getTranslation,
} from "@/lib/utils";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    SelectSelectedMember,
    clearSelectedMember,
    SelectIsSelectedMemberLoading,
    getMemberAndProgressByIdAsync,
    toggleAdminStatusAsync,
} from "@/redux/slices/member";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Custom
import Loader from "@/components/Loader";

// Icons
import { ChevronRight, ShieldOff, Users } from "lucide-react";
import { ProgressArc, TickCircle } from "@/assets/icons";
import { toast } from "sonner";

export default function ViewMember({ open, onClose, memberId }) {
    const selectedMember = useSelector(SelectSelectedMember);
    const isLoading = useSelector(SelectIsSelectedMemberLoading);
    const dispatch = useDispatch();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingAdminStatus, setPendingAdminStatus] = useState(false);

    useEffect(() => {
        if (memberId) {
            dispatch(getMemberAndProgressByIdAsync(memberId));
        }

        return () => dispatch(clearSelectedMember());
    }, [dispatch, memberId]);

    const handleToggleAdmin = async () => {
        const wasGroupLeader = selectedMember?.user?.isAdmin;
        try {
            const result = await dispatch(
                toggleAdminStatusAsync({ userId: selectedMember?.user?._id })
            ).unwrap();

            if (result) {
                toast.success(
                    wasGroupLeader
                        ? "Group leader access removed successfully"
                        : "User granted group leader access successfully"
                );
            }
        } catch (error) {
            toast.error(
                error?.message ||
                "Failed to update group leader status. Please try again."
            );
        } finally {
            setShowConfirmDialog(false);
            setPendingAdminStatus(false);
        }
    };

    const handleSwitchChange = (checked) => {
        // Always show confirmation dialog for both granting and removing group leader access
        setPendingAdminStatus(checked);
        setShowConfirmDialog(true);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent
                className={cn(
                    "w-full px-8 max-w-[80%] xl:max-w-[60%]",
                    isLoading ? "min-h-96" : "max-h-[90vh] overflow-y-scroll"
                )}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full w-full">
                        <Loader />
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-bold text-xl">
                                Member Details
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-12 py-5">
                            <UserDetails
                                user={selectedMember?.user}
                                streaks={selectedMember?.streaks}
                            />
                            <GroupLeaderSection
                                user={selectedMember?.user}
                                onToggleGroupLeader={handleSwitchChange}
                                isGroupLeader={selectedMember?.user?.isAdmin}
                                isLoading={isLoading}
                            />
                            {selectedMember?.courses?.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">Course Progress</h4>
                                    <CourseAccordian
                                        isLoading={isLoading}
                                        userCourse={selectedMember?.courses}
                                    />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>

            <AlertDialogComponent
                isDialogOpen={showConfirmDialog}
                heading={
                    pendingAdminStatus
                        ? "Grant Group Leader Access"
                        : "Remove Group Leader Access"
                }
                description={
                    <>
                        Are you sure you want to{" "}
                        {pendingAdminStatus
                            ? "grant group leader privileges"
                            : "revoke group leader privileges"}{" "}
                        for{" "}
                        <strong>
                            {selectedMember?.user?.firstName} {selectedMember?.user?.lastName}
                        </strong>
                        ?
                    </>
                }
                cancelAction={() => {
                    setShowConfirmDialog(false);
                    setPendingAdminStatus(false);
                }}
                confirmAction={handleToggleAdmin}
                confirmText={pendingAdminStatus ? "Grant Access" : "Remove Access"}
                cancelText="Cancel"
            />
        </Dialog>
    );
}

function UserDetails({ user, streaks }) {
    return (
        <div className="flex gap-16 flex-wrap">
            <div className="flex items-center gap-5">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={user?.image} />
                    <AvatarFallback className="text-site_primary">
                        {user && getInitials(user.firstName)}
                    </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                    <h6 className="font-normal">
                        <span>Name: </span> {user?.firstName + " " + user?.lastName}
                    </h6>
                    <h6 className="font-normal">
                        <span>Phone No: </span>
                        {user?.phonePin && user?.phone
                            ? formatPhoneNumber({
                                countryCode: user.phonePin,
                                phoneNumberString: user.phone,
                            }) || `${user.phonePin} ${user.phone}`
                            : "N/A"}
                    </h6>
                    {user?.email && (
                        <h6 className="font-normal">
                            <span>Email: </span> {user.email}
                        </h6>
                    )}
                </div>
            </div>

            <Streaks streaks={streaks} />
        </div>
    );
}

function GroupLeaderSection({
    user,
    onToggleGroupLeader,
    isGroupLeader,
    isLoading,
}) {
    const isGroupLeaderStatus = isGroupLeader || false;

    if (!user?._id) return null;

    return (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
                <Users
                    className={cn(
                        "h-4 w-4",
                        isGroupLeaderStatus ? "text-site-primary" : "text-muted-foreground"
                    )}
                />
                <div>
                    <p className="text-sm font-medium">
                        Group Leader Access
                        {isGroupLeaderStatus && (
                            <Badge
                                variant="default"
                                className="ml-2 bg-site-primary text-white text-xs"
                            >
                                Active
                            </Badge>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {isGroupLeaderStatus
                            ? "User has group leader privileges"
                            : "User does not have group leader privileges"}
                    </p>
                </div>
            </div>
            <Button
                variant={isGroupLeaderStatus ? "destructive" : "outline"}
                size="sm"
                onClick={() => onToggleGroupLeader(!isGroupLeaderStatus)}
                disabled={isLoading}
                className={cn(
                    "gap-2",
                    !isGroupLeaderStatus &&
                    "border-site-primary text-site-primary hover:bg-site-primary hover:text-white"
                )}
            >
                {isGroupLeaderStatus ? (
                    <>
                        <ShieldOff className="h-3.5 w-3.5" />
                        Remove
                    </>
                ) : (
                    <>
                        <Users className="h-3.5 w-3.5" />
                        Grant
                    </>
                )}
            </Button>
        </div>
    );
}

function CourseAccordian({ userCourse }) {
    const courseLang = useSelector(SelectCourseEditingLanguage);
    return (
        <Accordion Accordion type="single" collapsible className="w-full space-y-4">
            {userCourse.map((item, index) => (
                <AccordionItem value={item._id} key={index}>
                    <AccordionTrigger
                        style={{
                            boxShadow: `0px 3px 4px 0px #0000001A`,
                        }}
                        removeIcon={true}
                        className="bg-muted text-accent-foreground font-medium flex gap-4 lg:gap-16 items-center justify-between rounded-[10px] p-5"
                    >
                        <h4 className="grow text-left overflow-ellipsis line-clamp-1">
                            {getTranslation(item.name, courseLang)}
                        </h4>
                        {item.options.completedPercentage !== undefined &&
                            item.options.completedPercentage !== null ? (
                            <div className="flex items-center gap-1">
                                <p className="text-extra-small font-bold">
                                    {`${String(item.options.completedPercentage).padStart(
                                        2,
                                        "0"
                                    )}%`}
                                </p>
                                <ProgressArc className="fill-site-primary" />
                            </div>
                        ) : null}
                        <ChevronRight
                            className="shrink-0 transition-transform duration-200 text-site_primary"
                            aria-hidden="true"
                        />
                    </AccordionTrigger>
                    <AccordionContent className="p-0 border border-t-0 rounded-bl-[10px] rounded-br-[10px] border-[#34343480] max-w-[90%] lg:max-w-[95%] mx-auto ">
                        {item.sessions &&
                            item.sessions.map((session, index) => (
                                <div
                                    className={cn(
                                        "p-4 lg:pr-20 grid grid-cols-[auto_1fr] gap-2 lg:gap-4 justify-between border-[#34343480]",
                                        "border-b",
                                        item.sessions.length - 1 === index && "border-b-0"
                                    )}
                                    key={index}
                                >
                                    <div className="flex items-center gap-2 lg:gap-4">
                                        <TickCircle
                                            width={18}
                                            height={18}
                                            className={
                                                session.completed
                                                    ? "fill-site-primary shrink-0"
                                                    : "fill-site-general shrink-0"
                                            }
                                            aria-hidden="true"
                                        />
                                        <p className="text-extra-small leading-5 overflow-ellipsis line-clamp-1 ">
                                            {getTranslation(session.name, courseLang)}
                                        </p>
                                    </div>

                                    {session?.quizAttemptScore && (
                                        <p className="QuizAttempt score text-extra-small font-medium text-end whitespace-nowrap">
                                            Quiz Score {session.quizAttemptScore}
                                        </p>
                                    )}
                                </div>
                            ))}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}

function Streaks({ streaks }) {
    const last30Days = getLast30Days();

    const streakDates = useMemo(
        () =>
            streaks?.map((userStreak) => {
                const userStreakDate = new Date(userStreak.date);
                userStreakDate.setHours(0, 0, 0, 0);
                return Number(userStreakDate);
            }),
        [streaks]
    );

    return (
        <TooltipProvider>
            <div>
                <p className="text-small font-medium mb-3">Streaks</p>
                <div className="grid grid-cols-10 gap-2 w-fit">
                    {last30Days?.map((day) => (
                        <Tooltip key={day}>
                            <TooltipTrigger asChild>
                                <button
                                    className={cn(
                                        "w-[14px] h-[14px] bg-accent rounded-sm",
                                        streakDates?.includes(Number(day)) && "bg-accent-foreground"
                                    )}
                                    aria-label={`Streak for ${formatDate(day)}`}
                                ></button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs">{formatDate(day)}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </div>
        </TooltipProvider>
    );
}
