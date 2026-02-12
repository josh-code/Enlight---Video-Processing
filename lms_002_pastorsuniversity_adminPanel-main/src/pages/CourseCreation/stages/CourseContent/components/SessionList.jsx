import { useState, useRef } from "react";

// Icons
import { Menu } from "lucide-react";
import { Edit, Trash } from "@/assets/icons";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    SelectSelectedCourse,
    getSessioForNonModularCourseAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Services
import {
    updateSessionOrder,
    deleteSessionById,
} from "@/services/content/session";

// Shadcn
import { toast } from "sonner";

// Custom
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";
import { getTranslation } from "@/lib/utils";

export default function SessionList({
    sessions,
    setEditingSessionId,
    setIsAddSessionOpen,
}) {
    const selectedCourse = useSelector(SelectSelectedCourse);
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const dispatch = useDispatch();
    const [draggedSession, setDraggedSession] = useState(null);
    const sessionListRef = useRef(null);

    const handleSortEnded = async (newOrders) => {
        if (!selectedCourse) return;

        try {
            await updateSessionOrder({
                courseId: selectedCourse._id,
                fromSessionOrder: newOrders.map((lesson) => lesson._id),
            });

            toast.success("Session order updated successfully", {
                description: "The session order has been updated successfully.",
            });

            dispatch(
                getSessioForNonModularCourseAsync({ courseId: selectedCourse?._id })
            );
        } catch (error) {
            console.log(error);
            toast.error("Failed to update session order");
        }
    };

    const handleSessionDeletion = async ({ sessionId, courseId }) => {
        if (!sessionId || !courseId) return;
        try {
            await deleteSessionById({ sessionId, courseId });
            dispatch(
                getSessioForNonModularCourseAsync({ courseId: selectedCourse?._id })
            );
            toast.success("Session deleted successfully", {
                description: "The session has been deleted successfully.",
            });
        } catch (error) {
            console.log(error);
            toast.error("Failed to delete session");
        }
    };

    const handleDragStart = (event, session) => {
        event.dataTransfer.effectAllowed = "move";
        setDraggedSession(session);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
    };

    const handleDrop = (event, targetIndex) => {
        event.stopPropagation();
        if (!draggedSession) return;

        const newOrder = [...sessions];
        const oldIndex = newOrder.findIndex((s) => s._id === draggedSession._id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(targetIndex, 0, draggedSession);

        handleSortEnded(newOrder);
        setDraggedSession(null);
    };

    return (
        <div className="px-9 pb-9">
            <h6 className="font-bold text-sm pb-5">Sessions</h6>
            <div className="space-y-6 w-full" id="session-list" ref={sessionListRef}>
                {sessions.map((session, index) => (
                    <div
                        key={session._id}
                        className="flex-1 font-medium rounded bg-white shadow-card-shadow flex justify-between h-16 items-center p-3"
                        draggable
                        onDragStart={(event) => handleDragStart(event, session)}
                        onDragOver={handleDragOver}
                        onDrop={(event) => handleDrop(event, index)}
                    >
                        <div className="flex items-center">
                            <Menu
                                size={18}
                                className="session-drag-handle mr-4 cursor-move fill-site-general/50"
                            />
                            <span className="text-sm font-medium text-black">
                                {getTranslation(session.name, courseLang)}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 pr-9">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAddSessionOpen(true);
                                    setEditingSessionId(session._id);
                                }}
                            >
                                <Edit width={18} height={18} className="fill-site-general/50" />
                            </button>
                            {courseLang !== "es" && (
                                <ConfirmationDialog
                                    title="Confirm Deletion"
                                    description="Are you sure you want to delete this session?"
                                    onConfirm={() =>
                                        handleSessionDeletion({
                                            courseId: selectedCourse?._id,
                                            sessionId: session?._id,
                                        })
                                    }
                                    onCancel={() => console.log("Deletion cancelled")}
                                    trigger={
                                        <button>
                                            <Trash
                                                width={18}
                                                height={18}
                                                className="fill-site-reject"
                                            />
                                        </button>
                                    }
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
