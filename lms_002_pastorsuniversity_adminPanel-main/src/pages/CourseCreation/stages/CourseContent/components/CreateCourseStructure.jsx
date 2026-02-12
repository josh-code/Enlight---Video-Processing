import { useEffect, useState } from "react";

// Icons
import { SolidTickCircle } from "@/assets/icons";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";

// Components
import ModuleList from "./ModuleList";

// Modals
import AddModule from "@/components/modals/AddModule";
import AddSession from "@/components/modals/AddSession";

// Utils
import { cn } from "@/lib/utils";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    getCourseModulesAsync,
    SelectSelectedCourse,
    SelectSelectedCourseModules,
    getSessioForNonModularCourseAsync,
    SelectSelectedCourseSessions,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Component
import SessionList from "./SessionList";

export default function CreateCourseStructure({ selectedType }) {
    const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
    const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editiongModuleId, setEditionModuleId] = useState(null);

    const selecteCourseModules = useSelector(SelectSelectedCourseModules);
    const selectedCourseSession = useSelector(SelectSelectedCourseSessions);
    const selectedCourse = useSelector(SelectSelectedCourse);

    const courseLang = useSelector(SelectCourseEditingLanguage);

    const dispatch = useDispatch();

    useEffect(() => {
        if (selectedCourse) {
            if (selectedCourse.isModular) {
                dispatch(getCourseModulesAsync({ courseId: selectedCourse._id }));
            } else {
                dispatch(
                    getSessioForNonModularCourseAsync({ courseId: selectedCourse._id })
                );
            }
        }
    }, [dispatch, selectedCourse]);

    const handleAddModuleOpenChange = (isOpen) => {
        setIsAddModuleOpen(isOpen);
        if (!isOpen) {
            setEditionModuleId(null);
        }
    };

    const handleAddSessionOpenChange = (isOpen) => {
        setIsAddSessionOpen(isOpen);
        if (!isOpen) {
            setEditingSessionId(null);
            setEditionModuleId(null);
        }
    };

    return (
        <div className="flex items-start gap-6">
            <SolidTickCircle
                width={25}
                height={25}
                className={cn(
                    "mt-4",
                    selectedCourse?.isModular
                        ? selecteCourseModules.length > 0
                            ? "fill-site-approve"
                            : "fill-site-general/40"
                        : selectedCourseSession.length > 0
                            ? "fill-site-approve"
                            : "fill-site-general/40"
                )}
            />
            <div className="rounded-[10px] bg-white grow shadow-card-shadow">
                <div className="flex items-center justify-between pt-5 pb-3 px-9 border-b border-site-general/30 mb-7">
                    <h5 className="font-bold">Create course structure</h5>

                    {courseLang !== "es" && (
                        <Button
                            disabled={!selectedType}
                            className="rounded-[7px] bg-site-primary text-white font-medium"
                            onClick={() => {
                                selectedType === "module"
                                    ? setIsAddModuleOpen(true)
                                    : setIsAddSessionOpen(true);
                            }}
                        >
                            {selectedType === "module" ? "+ Add Module" : "+ Add Session"}
                        </Button>
                    )}
                </div>

                {selectedCourse?.isModular ? (
                    selecteCourseModules.length > 0 ? (
                        <ModuleList
                            modules={selecteCourseModules}
                            setIsAddModuleOpen={setIsAddModuleOpen}
                            setEditionModuleId={setEditionModuleId}
                            setEditingSessionId={setEditingSessionId}
                            setIsAddSessionOpen={setIsAddSessionOpen}
                        />
                    ) : (
                        <div className="px-9 py-6">
                            <div className="text-center w-full border rounded-[5px] h-56 shadow-card-shadow flex justify-center items-center">
                                <p>No modules added</p>
                            </div>
                        </div>
                    )
                ) : selectedCourseSession.length > 0 ? (
                    <SessionList
                        sessions={selectedCourseSession}
                        setEditingSessionId={setEditingSessionId}
                        setIsAddSessionOpen={setIsAddSessionOpen}
                    />
                ) : (
                    <div className="px-9 py-6">
                        <div className="text-center w-full border rounded-[5px] h-56 shadow-card-shadow flex justify-center items-center">
                            <p>No sessions added</p>
                        </div>
                    </div>
                )}
            </div>
            <AddModule
                editiongModuleId={editiongModuleId}
                open={isAddModuleOpen}
                onChange={handleAddModuleOpenChange}
            />
            <AddSession
                editingSessionId={editingSessionId}
                onChange={handleAddSessionOpenChange}
                editiongModuleId={editiongModuleId}
                open={isAddSessionOpen}
            />
        </div>
    );
}
