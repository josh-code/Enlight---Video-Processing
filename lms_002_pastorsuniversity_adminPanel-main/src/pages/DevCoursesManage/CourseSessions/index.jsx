import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// Dispatch
import { useDispatch, useSelector } from "react-redux";
import {
    getSessioForNonModularCourseAsync,
    SelectSelectedCourseSessions,
    clearSelectedCourseSessions,
    setSelectedSession,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Utils
import { getTranslation, convertSecondsToHoursMinutes } from "@/lib/utils";

// Custom
import ManageSessionVideo from "./ManageSessionVideo";

// Icons
import { PencilLine, Video } from "lucide-react";

export default function CourseSessions() {
    const [open, setOpen] = useState(false);

    const { courseId } = useParams();
    const dispatch = useDispatch();

    const selectedCourseSession = useSelector(SelectSelectedCourseSessions);
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const handleKeyDown = (event, session) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSessionSelection(session);
        }
    };

    const handleSessionSelection = (session) => {
        dispatch(setSelectedSession(session));
        setOpen(true);
    };

    useEffect(() => {
        if (courseId) {
            dispatch(getSessioForNonModularCourseAsync({ courseId }));
            return () => {
                dispatch(clearSelectedCourseSessions());
            };
        }
    }, [courseId, dispatch]);

    return (
        <div className="mt-8">
            <div className="flex flex-col gap-5 sm:gap-6">
                {selectedCourseSession.map((session) => (
                    <div
                        key={session._id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSessionSelection(session)}
                        onKeyDown={(event) => handleKeyDown(event, session)}
                        className="group flex items-start gap-4 sm:gap-6 p-5 sm:p-6 bg-white border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={`Select session ${getTranslation(
                            session.name,
                            courseLang
                        )}`}
                    >
                        {/* Video Icon */}
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-muted flex items-center justify-center border text-primary">
                            <Video size={20} />
                        </div>

                        {/* Session Details */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <h5 className="text-lg sm:text-xl font-semibold text-primary group-hover:underline">
                                    {getTranslation(session.name, courseLang)}
                                </h5>
                                <PencilLine
                                    className="text-muted-foreground group-hover:text-primary"
                                    size={18}
                                />
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {getTranslation(session.description, courseLang)}
                            </p>
                            <div className="mt-2 text-xs text-muted-foreground flex gap-4">
                                <span>
                                    ⏱{" "}
                                    {convertSecondsToHoursMinutes(
                                        session.duration?.[courseLang] || 0
                                    )}
                                </span>
                                <span>📝 {session.quiz?.questions?.length || 0} Questions</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <ManageSessionVideo open={open} setOpen={setOpen} />
        </div>
    );
}
