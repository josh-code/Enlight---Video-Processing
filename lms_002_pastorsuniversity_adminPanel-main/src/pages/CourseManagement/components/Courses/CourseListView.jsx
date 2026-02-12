import { Link } from "react-router-dom";
import { useMemo } from "react";

// Shadcn
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
    TableHead,
} from "@/components/shadcn/ui/table";

// Icon
import { Edit } from "@/assets/icons";
import { Check, Menu } from "lucide-react";

// Custom hook
import { useSortable } from "@/hooks";

// Service
import { updateCourseOrder } from "@/services/content/course";

// Redux
import { useSelector } from "react-redux";
import { SelectCourses } from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Utils
import {
    buildUrlWithParams,
    getTranslation,
    convertSecondsToHoursMinutes,
} from "@/lib/utils";

// Toast
import { toast } from "sonner";

const headings = [
    "",
    "Course Name",
    "Modules",
    "Lessons",
    "Duration",
    "Manage",
];

export default function CourseListView() {
    const courses = useSelector(SelectCourses);
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const modifiedCourses = useMemo(() => {
        if (courses.length > 0) {
            return courses.map((course) => {
                return {
                    ...course,
                    modules: course.isModular ? course.moduleCount : "NA",
                    lessons: course?.sessionCount || 0,
                };
            });
        }
    }, [courses]);

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
        }
    };

    useSortable({
        elementId: "course-list-body",
        items: courses,
        onSortEnd: handleSortEnd,
        classSelector: ".table-row-drag-handle",
    });

    if (courses.length == 0) {
        return (
            <div className="text-center text-lg mt-32">
                Oops! No courses to display. Check back later for more learning
                adventures!
            </div>
        );
    }

    return (
        <div className="border-2 border-site-table-border overflow-hidden rounded-[10px]">
            <Table className="min-w-full">
                <TableHeader className="border-b-2 border-site-table-border">
                    <TableRow>
                        {headings.map((heading, index) => (
                            <TableHead
                                className="text-sm font-bold text-text-main text-center"
                                key={index}
                            >
                                {heading}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody id="course-list-body">
                    {modifiedCourses.map((course) => (
                        <TableRow
                            key={course._id}
                            className="border-b-2 border-site-table-border"
                        >
                            <TableCell className="text-center table-row-drag-handle cursor-move text-black">
                                <Menu size={16} />
                            </TableCell>
                            <TableCell className="flex items-center gap-4">
                                <span className="font-bold">{course.index}.</span>
                                <div className="w-16 h-9 overflow-hidden rounded">
                                    <img
                                        src={course.image}
                                        alt={`${getTranslation(course.name, courseLang)} thumbnail`}
                                        className="h-full w-full"
                                    />
                                </div>
                                <span className="text-black">
                                    {getTranslation(course.name, courseLang)}
                                </span>
                            </TableCell>
                            <TableCell className="text-center text-site-general">
                                {course.modules}
                            </TableCell>
                            <TableCell className="text-center text-site-general">
                                {course.lessons}
                            </TableCell>
                            <TableCell className="text-center text-site-general">
                                {convertSecondsToHoursMinutes(
                                    getTranslation(course.courseDuration, courseLang)
                                )}
                            </TableCell>

                            <TableCell className="text-center text-site-general flex justify-center">
                                <Link
                                    key={course._id}
                                    to={buildUrlWithParams("update-course", {
                                        courseId: course._id,
                                        mode: "edit",
                                    })}
                                >
                                    <Edit className="fill-site-general" />
                                </Link>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
