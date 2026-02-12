import { useEffect } from "react";
import { useParams } from "react-router-dom";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    clearSelectedSession,
    SelectSelectedSession,
    getSessioForNonModularCourseAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Shadcn
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import {
    FormItem,
    FormMessage,
    FormField,
    Form,
} from "@/components/shadcn/ui/form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

// Custom Hooks
import { useFileUpload } from "@/hooks";

// Custom
import FileUpload from "@/components/misc/FileUpload";

// Constants
import { ACCEPTED_VIDEO_TYPES, AWS_FOLDER_NAME } from "@/lib/constant";

// Service
import { updateSessionVideo } from "@/services/content/session";

// Utils
import { getVideoDuration } from "@/lib/utils";

// Component
import { AlertComponent } from "@/components/misc/AlertComponent";

const formSchema = z.object({
    video: z.object({
        "360p": z.any().nullable(),
        "480p": z.any().nullable(),
        "720p": z.any().nullable(),
        "1080p": z.any().nullable(),
    }),
});

const qualities = ["1080p", "720p", "480p", "360p"];

export default function ManageSessionVideo({ open, setOpen }) {
    const selectedSession = useSelector(SelectSelectedSession);
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const dispatch = useDispatch();

    const { courseId } = useParams();
    const { uploadFile, isUploading } = useFileUpload();

    const initialVideos =
        selectedSession?.video && selectedSession.video[courseLang]
            ? selectedSession.video[courseLang]
            : {
                "360p": null,
                "480p": null,
                "720p": null,
                "1080p": null,
            };

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            video: initialVideos,
        },
    });

    const onSubmit = async (data) => {
        const { video } = data;

        const updatedVideos = {};
        let newDuration = null;

        for (const quality of qualities) {
            const fileOrUrl = video[quality];

            const filePath = `${AWS_FOLDER_NAME.COMPRESSED}/${courseLang}/${quality}`;

            // If a new file was provided, upload it.
            if (fileOrUrl instanceof File) {
                try {
                    if (quality === "1080p") {
                        newDuration = await getVideoDuration(fileOrUrl);
                    }
                    const result = await uploadFile(
                        fileOrUrl,
                        filePath,
                        `${quality} video`
                    );
                    // Only include if successfully uploaded (i.e. we now have a URL)
                    updatedVideos[quality] = result.key;
                } catch (error) {
                    console.error(`Error uploading ${quality} video:`, error);
                    toast.error(`Failed to upload ${quality} video.`);
                    return; // Return early on error, or decide how you want to handle partial failures.
                }
            }
            // If the field holds a string and it's changed from the initial URL, include it.
            else if (typeof fileOrUrl === "string") {
                if (fileOrUrl !== initialVideos[quality]) {
                    updatedVideos[quality] = fileOrUrl;
                }
            }
        }

        try {
            // Only dispatch the update if there is at least one updated quality.
            if (Object.keys(updatedVideos).length > 0) {
                await updateSessionVideo({
                    sessionId: selectedSession._id,
                    language: courseLang,
                    video: updatedVideos,
                    duration:
                        newDuration !== null
                            ? Number(newDuration)
                            : selectedSession.duration?.[courseLang],
                });
                toast.success("Session videos updated successfully!");
                if (courseId) {
                    dispatch(getSessioForNonModularCourseAsync({ courseId }));
                }
            } else {
                toast.info("No changes detected.");
            }
            setOpen(false);
        } catch (error) {
            console.error("Error updating session videos", error);
            toast.error("Failed to update session videos.");
        }
    };

    useEffect(() => {
        if (!open) {
            dispatch(clearSelectedSession());
        }
    }, [open, dispatch]);

    useEffect(() => {
        if (selectedSession) {
            const newVideos =
                selectedSession?.video && selectedSession.video[courseLang]
                    ? selectedSession.video[courseLang]
                    : {
                        "360p": null,
                        "480p": null,
                        "720p": null,
                        "1080p": null,
                    };

            form.reset({
                video: newVideos,
                duration: selectedSession?.duration?.[courseLang]?.toString?.() || "",
            });
        }
    }, [selectedSession, courseLang, form]);

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-full max-w-[70%] max-h-[90vh] overflow-y-scroll">
                <DialogHeader>
                    <DialogTitle>Manage Session Videos</DialogTitle>
                </DialogHeader>
                <div>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            <AlertComponent
                                title="Note"
                                descirption="Only 1080p video will trigger transcript and duration update."
                            />

                            <div className="grid grid-cols-2 gap-8">
                                {qualities.map((quality) => (
                                    <FormField
                                        key={quality}
                                        control={form.control}
                                        name={`video.${quality}`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FileUpload
                                                    label={`Upload ${quality} Video`}
                                                    fileTypes={ACCEPTED_VIDEO_TYPES}
                                                    control={form.control}
                                                    name={`video.${quality}`}
                                                    defaultValue={field.value}
                                                    disabled={isUploading}
                                                    onChange={(file) => field.onChange(file)}
                                                    allowDragAndDrop={true}
                                                >
                                                    <div className="flex justify-center items-center w-full gap-2 flex-col">
                                                        <h6 className="text-site-general font-bold text-center">
                                                            Drag &amp; Drop Your Video
                                                        </h6>
                                                        <p className="text-site-general text-center">
                                                            File Format:{" "}
                                                            {ACCEPTED_VIDEO_TYPES.map(
                                                                (type) => type.label
                                                            ).join(", ")}
                                                        </p>
                                                        <span className="text-site-general text-center">
                                                            Or click to browse
                                                        </span>
                                                    </div>
                                                </FileUpload>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isUploading}>
                                    Save Changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
