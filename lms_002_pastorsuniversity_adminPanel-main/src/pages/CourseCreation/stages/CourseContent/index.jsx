import { useState } from "react";

// components
import CourseStructureType from "./components/CourseStructureType";
import CreateCourseStructure from "./components/CreateCourseStructure";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

import { cn } from "@/lib/utils";
import { useSelector } from "react-redux";

export default function CourseContent() {
  const [selectedType, setSelectedType] = useState(null);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  return (
    <div className="space-y-10">
      <CourseStructureType
        className={cn(
          courseLang === "es" && "opacity-0 h-0 pointer-events-none"
        )}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />
      {selectedType && <CreateCourseStructure selectedType={selectedType} />}
    </div>
  );
}
