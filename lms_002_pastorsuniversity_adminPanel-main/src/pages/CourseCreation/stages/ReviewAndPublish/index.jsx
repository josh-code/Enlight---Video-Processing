import { useNavigate } from "react-router-dom";

// React
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

// Icons
import { File, Module, Player } from "@/assets/icons";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    getCourseByIdAsync,
    SelectSelectedCourse,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Shadcn
import { toast } from "sonner";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/shadcn/ui/avatar";

// Service
import { toggleDraftStatus } from "@/services/content/course";

// Utils
import { getTranslation, getInitials } from "@/lib/utils";

const ReviewAndPublish = forwardRef((props, ref) => {
    const selectedCourse = useSelector(SelectSelectedCourse);
    const courseLang = useSelector(SelectCourseEditingLanguage);
    const dispatch = useDispatch();

    const navigate = useNavigate();

    const [fetchedCourseId, setFetchedCourseId] = useState(null);

    useEffect(() => {
        if (selectedCourse && selectedCourse._id !== fetchedCourseId) {
            dispatch(getCourseByIdAsync(selectedCourse._id));
            setFetchedCourseId(selectedCourse._id);
        }
    }, [selectedCourse, fetchedCourseId, dispatch]);

    useImperativeHandle(ref, () => ({
        publishCourse: async () => {
            try {
                const courseId = selectedCourse._id;
                if (courseId) {
                    await toggleDraftStatus({ courseId, isDraft: false });
                    toast.success("Success", {
                        description: "Course published successfully",
                    });

                    navigate("/course-management");
                }
            } catch (error) {
                console.log({ error });
                toast.error("Failed to publish course");
            }
        },
    }));

    if (!selectedCourse) return null;

    const {
        name,
        description,
        instructorImage,
        presentedBy,
        isModular,
        numberOfModules,
        numberOfSessions,
        numberOfQuizzes,
        image,
        introVideo,
    } = selectedCourse;

    const video =
        introVideo && introVideo[courseLang]
            ? Object.values(introVideo[courseLang])[0]
            : null;

    return (
        <section className="">
            <div className="grid grid-cols-[1fr_40%] gap-16 max-w-[1100px]">
                <div>
                    <h2 className="text-lg font-medium text-site-primary">
                        {getTranslation(name, courseLang)}
                    </h2>
                    <p className="mt-2 font-light max-w-2xl">
                        {getTranslation(description, courseLang)}
                    </p>
                    <div className="mt-8 grid grid-cols-2 items-center gap-7 max-w-lg">
                        <div className="flex items-center gap-3">
                            {/* <div className="w-8 h-8 rounded overflow-hidden border border-site-table-border">
                                <img
                                    src={instructorImage || "/default_profile.png"}
                                    alt="Instructor"
                                    className="h-full w-full object-cover"
                                />
                            </div> */}
                            <Avatar className="w-8 h-8">
                                <AvatarImage
                                    src={instructorImage}
                                    alt={presentedBy}
                                />
                                <AvatarFallback>{getInitials(presentedBy)}</AvatarFallback>
                            </Avatar>

                            <span className="font-medium text-sm">{presentedBy}</span>
                        </div>
                        {isModular && numberOfModules > 0 && (
                            <div className="flex items-center gap-3">
                                <Module className="fill-site-primary" />
                                <span className="font-medium text-sm">
                                    {numberOfModules} Modules
                                </span>
                            </div>
                        )}
                        {numberOfSessions > 0 && (
                            <div className="flex items-center gap-3">
                                <Player className="fill-site-primary" />
                                <span className="font-medium text-sm">
                                    {numberOfSessions} Lessons
                                </span>
                            </div>
                        )}

                        {numberOfQuizzes > 0 && (
                            <div className="flex items-center gap-3">
                                <File className="fill-site-primary" />
                                <span className="font-medium text-sm">
                                    {numberOfQuizzes} Quiz
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-4">
                    {image && (
                        <div className="relative aspect-video rounded-[5px] overflow-hidden">
                            <img
                                src={image}
                                alt="Course Preview 1"
                                className="w-full h-full"
                            />
                        </div>
                    )}
                    {video && (
                        <div className="relative aspect-video rounded-[5px] overflow-hidden">
                            <video src={video} controls />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
});

ReviewAndPublish.displayName = "ReviewAndPublish";

export default ReviewAndPublish;
