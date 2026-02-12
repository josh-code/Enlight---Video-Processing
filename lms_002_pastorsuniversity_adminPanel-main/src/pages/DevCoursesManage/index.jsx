import { Link } from "react-router-dom";
import { useEffect } from "react";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    getPublishedCoursesAsync,
    SelectIsLoading,
    SelectCourses,
    clearCourses,
} from "@/redux/slices/course";

// Utils
import { getTranslation, convertSecondsToHoursMinutes } from "@/lib/utils";

// Redux
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Shadcn
import { Skeleton } from "@/components/shadcn/ui/skeleton";

// Icons
import { ArrowRight } from "lucide-react";

export default function DevCoursesManage() {
    const dispatch = useDispatch();

    const courses = useSelector(SelectCourses);
    const isLoading = useSelector(SelectIsLoading);
    const courseLang = useSelector(SelectCourseEditingLanguage);

    useEffect(() => {
        dispatch(getPublishedCoursesAsync({ isDraft: "false" }));

        return () => {
            dispatch(clearCourses());
        };
    }, [dispatch]);

    return (
        <div className="mt-8">
            <div className="flex flex-col gap-6">
                {isLoading
                    ? Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="w-full h-32 rounded-2xl" />
                    ))
                    : courses.map((course) => (
                        <Link key={course._id} to={course._id}>
                            <div className="group flex items-start gap-4 sm:gap-6 p-5 sm:p-6 bg-white border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary">
                                {/* Thumbnail */}
                                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border bg-muted/50">
                                    {course.image ? (
                                        <img
                                            src={course.image}
                                            alt="Course"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                            No Image
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <h5 className="text-lg sm:text-xl font-semibold text-primary group-hover:underline">
                                            {getTranslation(course.name, courseLang)}
                                        </h5>
                                        <ArrowRight
                                            className="text-muted-foreground group-hover:text-primary transition"
                                            size={18}
                                        />
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                        {getTranslation(course.description, courseLang)}
                                    </p>
                                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
                                        <span>🎓 {course.sessionCount} Sessions</span>
                                        <span>
                                            ⏱{" "}
                                            {convertSecondsToHoursMinutes(
                                                course.courseDuration?.[courseLang] || 0
                                            )}
                                        </span>
                                        {course.isDraft && (
                                            <span className="text-orange-500 font-medium ml-auto">
                                                Draft
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
            </div>
        </div>
    );
}
