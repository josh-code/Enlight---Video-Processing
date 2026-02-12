import { Link } from "react-router-dom";

// Shadcn
import { Skeleton } from "@/components/shadcn/ui/skeleton";

// Custom hook
import { useSortable } from "@/hooks";

// Utils
import { cn, getTranslation, buildUrlWithParams } from "@/lib/utils";

// Redux
import { useSelector } from "react-redux";
import { SelectCourses, SelectIsCourseLoading } from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

import { toast } from "sonner";

// Service
import { updateCourseOrder } from "@/services/content/course";

export default function CourseGridView() {
    const courses = useSelector(SelectCourses);
    const isLoading = useSelector(SelectIsCourseLoading);

    const handleSortEnd = async (newCourseOrder) => {
        const courseOrder = newCourseOrder.map((course) => course._id);

        try {
            await updateCourseOrder({
                courseOrder,
            });
            toast.success("Course order updated successfully", {
                description: "The course order has been updated successfully.",
            });
        } catch (error) {
            console.error("Error updating course order", error);
            toast.error("Failed to update course order");
        }
    };

    const courseLang = useSelector(SelectCourseEditingLanguage);

    useSortable({
        elementId: "course-grid-body",
        items: courses,
        onSortEnd: handleSortEnd,
        classSelector: ".course-card-drag-handle",
    });

    if (isLoading) {
        return (
            <div className="grid gap-7 auto-fill-[350px]">
                {Array.from({ length: 9 }).map((_, index) => (
                    <Skeleton key={index} className="aspect-[2/1.2] rounded-[10px]" />
                ))}
            </div>
        );
    }

    if (courses.length === 0) {
        return (
            <div className="text-center text-lg mt-32">
                Oops! No courses to display. Check back later for more learning
                adventures!
            </div>
        );
    }

    return (
        <div id="course-grid-body" className="grid auto-fill-[350px] gap-7">
            {courses.map((course) => {
                return (
                    <Link
                        key={course._id}
                        to={buildUrlWithParams("update-course", {
                            courseId: course._id,
                            mode: "edit",
                        })}
                    >
                        <div
                            className={cn(
                                "relative rounded-[10px] overflow-hidden aspect-[2/1.2] course-card-drag-handle"
                            )}
                        >
                            <img
                                className="w-full h-full"
                                src={course.image}
                                alt={`${getTranslation(course.name, courseLang)} thumbnail`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent flex flex-col justify-between">
                                <div className="flex justify-end">
                                    <div className="h-9 w-9 text-white bg-site-primary inline-flex justify-center items-center rounded-bl-[13px] font-bold text-sm">
                                        {course.index}
                                    </div>
                                </div>
                                <div className="px-4 py-6">
                                    <h6 className="text-white font-bold">{getTranslation(course.name, courseLang)}</h6>
                                </div>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
