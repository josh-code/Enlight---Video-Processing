import { Link } from "react-router-dom";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
  SelectDraftCourses,
  getDraftCoursesAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Shadcn
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import { toast } from "sonner";

// Utils
import { convertSecondsToHoursMinutes, buildUrlWithParams, getTranslation } from "@/lib/utils";

// Icons
import { ArrowRight } from "lucide-react";
import { Trash } from "@/assets/icons";

// Custom
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";

// Services
import { deleteCourseById } from "@/services/content/course";

const headings = [
  "",
  "Course Name",
  "Modules",
  "Lessons",
  "Duration",
  "Manage",
];

export default function Draft() {
  const dispatch = useDispatch();

  const draftCourses = useSelector(SelectDraftCourses);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const handleDeleteCourse = async (courseId) => {
    try {
      await deleteCourseById({ courseId });
      dispatch(getDraftCoursesAsync());
      toast.success("Course deleted successfully");
    } catch (error) {
      console.log(error);
      toast.error("Error deleting course");
    }
  };

  if (draftCourses.length === 0) {
    return (
      <div className="">
        <h1 className=" font-bold text-text-main">No Draft Courses</h1>
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
        <TableBody>
          {draftCourses.map((course, index) => (
            <TableRow
              key={index}
              className="border-b-2 border-site-table-border"
            >
              <TableCell className="text-center text-black">
                {index + 1}
              </TableCell>
              <TableCell className="flex items-center gap-4">
                <div className="w-16 h-9 overflow-hidden rounded">
                  <img
                    src={course.image}
                    alt={getTranslation(course.name, courseLang)}
                    className="h-full w-full"
                  />
                </div>
                <span className="text-black">{getTranslation(course.name, courseLang)}</span>
              </TableCell>
              <TableCell className="text-center text-black">
                {course.moduleCount}
              </TableCell>
              <TableCell className="text-center  text-black">
                {course.sessionCount}
              </TableCell>
              <TableCell className="text-center  text-black">
                {convertSecondsToHoursMinutes(course.courseDuration)}
              </TableCell>

              <TableCell className="text-center">
                <div className=" flex justify-center gap-2">
                  <Link
                    to={buildUrlWithParams("course-creation", {
                      courseId: course._id,
                    })}
                  >
                    <button className="bg-site-primary text-white px-4 py-1.5 text-xs rounded-md inline-flex items-center gap-1">
                      Continue
                      <ArrowRight size={14} />
                    </button>
                  </Link>
                  <ConfirmationDialog
                    title="Confirm Deletion"
                    description="Are you sure you want to delete this course?"
                    onConfirm={(e) => {
                      e.stopPropagation();
                      handleDeleteCourse(course?._id);
                    }}
                    onCancel={(e) => {
                      console.log("Deletion cancelled");
                    }}
                    trigger={
                      <button className="bg-site-reject text-white px-4 py-1.5 text-xs rounded-md inline-flex items-center gap-1">
                        Delete
                        <Trash width={14} height={14} className="fill-white" />
                      </button>
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
