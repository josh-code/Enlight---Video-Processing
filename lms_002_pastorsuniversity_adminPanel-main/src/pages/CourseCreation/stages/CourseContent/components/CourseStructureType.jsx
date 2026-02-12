import { useDispatch } from "react-redux";
import { useEffect, useState } from "react";

// constant
import { COURSE_STRUCTURE_TYPES } from "@/lib/constant";
import { cn } from "@/lib/utils";

// Icons
import { SolidTickCircle } from "@/assets/icons";

// Shadcn
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";

// Services
import { changeCourseStructure } from "@/services/content/course";

// Redux
import { useSelector } from "react-redux";
import {
    SelectSelectedCourse,
    getCourseByIdAsync,
} from "@/redux/slices/course";

const CourseStructureType = ({ selectedType, setSelectedType, className, ...props }) => {
    const dispatch = useDispatch();
    const selectedCourse = useSelector(SelectSelectedCourse);
    const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] =
        useState(false);
    const [pendingSelectedType, setPendingSelectedType] = useState(null);
    const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);

    useEffect(() => {
        // console.log("Selected course: ", selectedCourse);
        if (selectedCourse && selectedCourse.isModular !== undefined) {
            setSelectedType(selectedCourse.isModular ? "module" : "non-module");
        } else {
            setIsFirstTimeSetup(true);
        }
    }, [selectedCourse, setSelectedType]);

    const handleConfirmChange = async (type) => {
        if (selectedCourse) {
            const isModular = type === "module";
            const obj = {
                courseId: selectedCourse._id,
                isModular: isModular,
            };

            try {
                // console.log("Updating course structure with: ", obj);
                setSelectedType(type);
                const data = await changeCourseStructure(obj);
                // console.log("Course structure changed successfully: ", data);
                toast.success(
                    isFirstTimeSetup
                        ? "Course Structure Set Successfully"
                        : "Course Structure Type Changed Successfully", {

                }
                );
                dispatch(getCourseByIdAsync(selectedCourse._id));
            } catch (error) {
                console.log(error);
                toast.error("Failed to change course structure type",);
            } finally {
                setIsConfirmationDialogOpen(false);
                setPendingSelectedType(null);
            }
        }
    };

    const handleCancelChange = () => {
        // console.log("Change cancelled");
        setIsConfirmationDialogOpen(false);
        setPendingSelectedType(null);
    };

    const handleChange = (value) => {
        if (selectedCourse) {
            const isModular = value === "module";
            // console.log("Selected type change: ", value);
            if (
                selectedCourse.isModular !== undefined &&
                selectedCourse.isModular !== isModular
            ) {
                setPendingSelectedType(value);
                setIsConfirmationDialogOpen(true);
            } else {
                handleConfirmChange(value);
            }
        }
    };

    const getTitle = () => {
        if (pendingSelectedType === "module") {
            return "Confirm Change to Modular Type";
        } else if (pendingSelectedType === "non-module") {
            return "Confirm Change to Non-Modular Type";
        }
        return "Confirm Change";
    };

    const getDescription = () => {
        if (pendingSelectedType === "module") {
            return "Are you sure you want to change the course structure to Modular type? All existing sessions will be grouped into a single module.";
        } else if (pendingSelectedType === "non-module") {
            return "Are you sure you want to change the course structure to Non-Modular type? All existing modules will be deleted and their sessions will become standalone sessions.";
        }
        return "Are you sure you want to change the course structure type? This action may affect existing data.";
    };

    return (
        <div className={cn("flex items-start gap-6", className)}>
            <SolidTickCircle
                width={25}
                height={25}
                className={
                    selectedType ? "fill-site-approve mt-4" : "fill-site-general/40 mt-4"
                }
            />
            <div className="rounded-[10px] bg-white py-6 px-9 shadow-card-shadow flex items-start justify-between grow max-w-[1000px]">
                <h5 className="font-bold">Select a course structure type</h5>

                <div className="flex items-center gap-4">
                    {COURSE_STRUCTURE_TYPES.map((type) => (
                        <div key={type.value}>
                            <input
                                className="hidden"
                                type="radio"
                                name="course-structure"
                                id={type.value}
                                value={type.value}
                                checked={selectedType === type.value}
                                onChange={() => handleChange(type.value)}
                            />
                            <label
                                htmlFor={type.value}
                                className={`cursor-pointer text-xs inline-block border rounded-md px-4 py-2 ${selectedType === type.value
                                    ? "bg-site-primary text-white"
                                    : "border-site-primary text-site-primary"
                                    }`}
                            >
                                {type.label}
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            <ConfirmationDialog
                title={getTitle()}
                description={getDescription()}
                isOpen={isConfirmationDialogOpen}
                onConfirm={() => handleConfirmChange(pendingSelectedType)}
                onCancel={handleCancelChange}
            />
        </div>
    );
};

function ConfirmationDialog({
    title,
    description,
    onConfirm,
    onCancel,
    isOpen,
    confirmButtonText = "Continue",
    cancelButtonText = "Cancel",
}) {
    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onConfirm}>
                        {confirmButtonText}
                    </AlertDialogCancel>
                    <AlertDialogAction className="bg-site-primary" onClick={onCancel}>
                        {cancelButtonText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default CourseStructureType;
