import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// Components
import Courses from "./components/Courses";
import Draft from "./components/Draft";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";

// Utils
import { cn, buildUrlWithParams } from "@/lib/utils";

// Icons
import { LayoutGrid, List, Plus } from "lucide-react";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
  SelectDraftCourses,
  getDraftCoursesAsync,
  clearDraftCourses,
  getPublishedCoursesAsync,
  clearCourses,
} from "@/redux/slices/course";

// Custom hook
import { useQueryParams } from "@/hooks";

export default function CourseManagement() {
  const draftCourses = useSelector(SelectDraftCourses);

  const dispatch = useDispatch();

  const [getQueryParams, setQueryParams] = useQueryParams();

  const [layout, setLayout] = useState("grid");

  useEffect(() => {
    const queryParams = getQueryParams();
    const layoutParam = queryParams.get("layout");

    if (layoutParam) {
      setLayout(layoutParam === "list" ? "list" : "grid");
    } else {
      setLayout("grid");
      queryParams.set("layout", "grid");
    }

    setQueryParams(Object.fromEntries(queryParams.entries()));
  }, [getQueryParams, setQueryParams]);

  const toggleLayout = (newLayout) => {
    setLayout(newLayout);
    setQueryParams({ layout: newLayout });
  };

  useEffect(() => {
    dispatch(getDraftCoursesAsync({ isDraft: "true" }));

    return () => {
      dispatch(clearDraftCourses());
    };
  }, [dispatch]);

  useEffect(() => {
    dispatch(getPublishedCoursesAsync({ isDraft: "false" }));

    return () => {
      dispatch(clearCourses());
    };
  }, [dispatch]);

  return (
    <section>
      <div className="pt-2 pb-11">
        <h4 className="text-3xl font-bold">Course Management</h4>
        <div className="flex justify-end gap-4 items-center mt-16">
          <div className="flex gap-8 items-center">
            <Link to={buildUrlWithParams("course-creation", {})}>
              <Button className="text-xs font-medium h-10 !px-4 items-center !py-2 rounded-[10px] border border-site-primary bg-transparent text-site-primary hover:text-white hover:bg-site-primary">
                <Plus className="mr-1" size={13} /> Add Course
              </Button>
            </Link>
            <LayoutButtons layout={layout} toggleLayout={toggleLayout} />
          </div>
        </div>

        <div className="mt-8">
          <Courses layout={layout} />
        </div>

        {draftCourses.length > 0 && (
          <div className="mt-16">
            <h5 className="font-bold my-8">Your drafts</h5>
            <Draft />
          </div>
        )}
      </div>
    </section>
  );
}

function LayoutButtons({ layout, toggleLayout }) {
  return (
    <div className="w-fit flex items-center">
      <button
        onClick={() => toggleLayout("grid")}
        disabled={layout === "grid"}
        className={cn(
          "border border-site-general-50 p-2 h-10 rounded-tl rounded-bl border-r-0",
          layout === "grid"
            ? "text-site-primary bg-site-primary/15"
            : "text-site-general"
        )}
      >
        <LayoutGrid size={25} />
      </button>
      <button
        onClick={() => toggleLayout("list")}
        disabled={layout === "list"}
        className={cn(
          "border border-site-general-50 p-2 h-10 rounded-tr rounded-br",
          layout === "list"
            ? "text-site-primary bg-site-primary/15"
            : "text-site-general"
        )}
      >
        <List size={25} />
      </button>
    </div>
  );
}
