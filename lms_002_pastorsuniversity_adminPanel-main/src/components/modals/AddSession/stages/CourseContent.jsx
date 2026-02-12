import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

// Hook form
import { useForm } from "react-hook-form";

// Shadcn
import {
  Form,
  FormControl,
  FormField,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/shadcn/ui/form";
import { Input } from "@/components/shadcn/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/shadcn/ui/button";
import { Alert, AlertDescription } from "@/components/shadcn/ui/alert";
import { Info, AlertTriangle, Undo2 } from "lucide-react";

// Zod
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Custom
import FileUpload from "@/components/misc/FileUpload";
import GenerateButton from "@/components/misc/GenerateButton";

// Services
import {
  startHlsConversion,
  startTranscription,
} from "@/services/content/awsServices";
import { createSession } from "@/services/content/session";
import { generateSessionContent } from "@/services/content/aiGeneration";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
  SelectSelectedCourse,
  getSessioForNonModularCourseAsync,
  getCourseModulesAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Custome hooks
import { useFileUpload } from "@/hooks";

// Editor
import RichTextEditor from "@/components/Editor/RichTextEditor";

// Constant
import {
  ACCEPTED_VIDEO_TYPES,
  ACCEPTED_ATTACHMENT_TYPES,
  AI_GENERATION,
} from "@/lib/constant";

// Utils
import { getTranslation, getVideoDuration } from "@/lib/utils";
import { AWS_FOLDER_NAME } from "@/lib/constant";
import Loader from "../../../Loader";
import {
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  Tooltip,
} from "@/components/shadcn/ui/tooltip";
import InfoBadge from "@/components/misc/InfoBadge";

const addModuleSchema = z.object({
  title: z
    .string({
      required_error: "Title is required",
    })
    .min(4, { message: "Title should be more than 4 characters" })
    .max(AI_GENERATION.MAX_TITLE_LENGTH, {
      message: `Title should be less than ${AI_GENERATION.MAX_TITLE_LENGTH} characters`,
    }),
  description: z
    .string({
      required_error: "Description is required",
    })
    .min(AI_GENERATION.MIN_DESCRIPTION_LENGTH, {
      message: `Description should be more than ${AI_GENERATION.MIN_DESCRIPTION_LENGTH} characters`,
    }),
  video: z.any(),
  // video: z.any().refine((value) => value !== null && value !== undefined, {
  //   message: "Video is required",
  // }),
  attachment: z.any(),
});

const CourseContent = forwardRef((props, ref) => {
  const { existingSession, setExistingSession, isLoading, isSessionLoading } =
    props;

  const form = useForm({
    resolver: zodResolver(addModuleSchema),
    defaultValues: {
      title: "",
      description: "",
      video: null,
      attachment: null,
    },
  });

  // AI generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [originalContent, setOriginalContent] = useState({
    title: "",
    description: "",
  });
  const [isContentGenerated, setIsContentGenerated] = useState({
    title: false,
    description: false,
  });

  const selectedCourse = useSelector(SelectSelectedCourse);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const { uploadFile } = useFileUpload();

  const dispatch = useDispatch();

  // AI generation function - single API call for both title and description
  const handleGenerateContent = async () => {
    try {
      if (!existingSession?.transcribe?.[courseLang]) {
        toast.error("No transcription available for the current language");
        return;
      }

      setIsGenerating(true);

      // Store original content before generation
      setOriginalContent({
        title: form.getValues("title"),
        description: form.getValues("description"),
      });

      // Get transcription text from the URL
      const transcriptionUrl = existingSession.transcribe[courseLang];
      let transcriptionText = await fetchTranscriptionText(transcriptionUrl);

      if (!transcriptionText) {
        toast.error("Failed to fetch transcription text");
        return;
      }

      // Validate transcription length based on OpenAI's context limit
      // Safe limit to ensure AI generation works properly
      if (transcriptionText.length > AI_GENERATION.MAX_TRANSCRIPTION_CHARS) {
        toast.warning(
          `Transcription is very long. Using first ${AI_GENERATION.MAX_TRANSCRIPTION_CHARS} characters for generation.`
        );
        transcriptionText = transcriptionText.substring(
          0,
          AI_GENERATION.MAX_TRANSCRIPTION_CHARS
        );
      }

      // Single API call that returns both title and description
      const generatedContent = await generateSessionContent(
        transcriptionText,
        courseLang
      );

      // Update form with both generated title and description
      form.setValue("title", generatedContent.title);
      form.setValue("description", generatedContent.description);

      // Force form to re-render
      form.trigger(["title", "description"]);

      setIsContentGenerated({
        title: true,
        description: true,
      });
      toast.success("Title and description generated successfully!");
    } catch (error) {
      console.error("Content generation error:", error);
      toast.error(error.message || "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  // Undo AI generated content for specific field
  const handleUndoContent = (field) => {
    if (field === "title") {
      form.setValue("title", originalContent.title);
      setIsContentGenerated((prev) => ({ ...prev, title: false }));
      toast.success("Title has been reverted");
    } else if (field === "description") {
      form.setValue("description", originalContent.description);
      setIsContentGenerated((prev) => ({ ...prev, description: false }));
      toast.success("Description has been reverted");
    }
  };

  // Helper function to fetch transcription text from URL
  const fetchTranscriptionText = async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Parse the JSON response
      const transcriptionData = await response.json();

      // Extract only the actual transcription text from the complex JSON structure
      if (
        transcriptionData?.results?.transcripts &&
        transcriptionData.results.transcripts.length > 0
      ) {
        // Combine all transcript segments into one text
        const fullText = transcriptionData.results.transcripts
          .map((segment) => segment.transcript)
          .join(" ")
          .trim();

        return fullText;
      } else {
        console.error(
          "Invalid transcription data structure:",
          transcriptionData
        );
        return null;
      }
    } catch (error) {
      console.error("Error fetching transcription:", error);
      return null;
    }
  };

  useImperativeHandle(ref, () => ({
    submit: form.handleSubmit(async (data) => {
      try {
        if (!selectedCourse) throw new Error("Course not selected");

        // Build the base payload
        const payload = { courseId: selectedCourse._id };
        if (selectedCourse.isModular && props.moduleId) {
          payload.moduleId = props.moduleId;
        }

        // Handle sessionId for edit
        if (existingSession) {
          payload.sessionId = existingSession._id;
        }

        // Localized name/description
        if (data.title?.trim()) {
          payload.name = { [courseLang]: data.title.trim() };
        }
        if (data.description?.trim()) {
          payload.description = { [courseLang]: data.description.trim() };
        }

        // First API call: partial create/update without media
        let session = await createSession(payload);
        const sid = payload.sessionId || session._id;
        payload.sessionId = sid;

        // Attachment handling
        if (data.attachment === null) {
          payload.attachment = null;
        } else if (data.attachment) {
          const uploaded = await uploadFile(
            data.attachment,
            AWS_FOLDER_NAME.ATTACHMENT,
            "attachment"
          );
          if (uploaded && typeof uploaded !== "string") {
            payload.attachment = {
              key: uploaded.key,
              name: data.attachment.name,
              size: data.attachment.size,
              type: data.attachment.type,
            };
          }
        }

        // Video and duration handling
        if (data.video === null) {
          payload.video = { [courseLang]: null };
          payload.duration = { [courseLang]: null };
        } else if (data.video) {
          // upload
          const vid = await uploadFile(
            data.video,
            AWS_FOLDER_NAME.UPLOADED_VIDEO,
            "video"
          );

          if (vid && typeof vid !== "string") {
            // Start HLS conversion (do not wait for it)
            const res = await startHlsConversion({
              sessionId: sid,
              videoKey: vid.key,
              language: courseLang,
            });

            // Preserve existing HLS data and add new language data
            const existingHls = existingSession?.hls || {};
            payload.hls = {
              ...existingHls,
              [courseLang]: {
                jobId: res.jobId,
                status: res.status,
                outputPrefix: res.outputPrefix,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            };

            const transcriptionRes = await startTranscription({
              key: vid.key,
              sessionId: sid,
              lang: courseLang,
            });

            // Store only the uploaded video key
            payload.video = { [courseLang]: vid.key };
            // Optionally, calculate duration
            let dur = 0;
            try {
              dur = Math.round(await getVideoDuration(data.video));
            } catch {
              console.warn("Failed to calculate video duration");
              dur = null;
            }
            payload.duration = { [courseLang]: dur };
          }
        }

        // Final API call to apply media and deletions
        session = await createSession(payload);
        props.setCreatedSessionId(session._id);
        setExistingSession(session);

        toast.success(existingSession ? "Session Updated" : "Session Created", {
          description: existingSession
            ? "Session has been updated successfully."
            : "Session has been created successfully.",
        });

        // Refresh list
        if (selectedCourse.isModular) {
          dispatch(getCourseModulesAsync({ courseId: selectedCourse._id }));
        } else {
          dispatch(
            getSessioForNonModularCourseAsync({ courseId: selectedCourse._id })
          );
        }

        form.reset();
        props.onStageChange(1);
      } catch (error) {
        console.error("Session submit error", error);
        toast.error("Failed to submit session. Please try again.");
      }
    }),
  }));

  useEffect(() => {
    if (existingSession) {
      let videoDefault = null;

      if (existingSession.video && existingSession.video[courseLang]) {
        const currentVideo = existingSession.video[courseLang];
        if (typeof currentVideo === "object") {
          videoDefault = Object.values(currentVideo)[0] || null;
        } else {
          videoDefault = currentVideo || null;
        }
      }

      const title = getTranslation(existingSession.name, courseLang);
      const description = getTranslation(
        existingSession.description,
        courseLang
      );

      form.reset({
        title,
        description,
        attachment: existingSession.attachment,
        video: videoDefault,
      });

      // Set original content for undo functionality
      setOriginalContent({
        title,
        description,
      });

      // Reset generated flags
      setIsContentGenerated({
        title: false,
        description: false,
      });
    }
  }, [existingSession, form, courseLang]);

  // Check if video exists for current language
  const hasVideoForCurrentLang = existingSession?.video?.[courseLang];

  if (isSessionLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader />
      </div>
    );
  }

  return (
    <div>
      <Form {...form}>
        <form ref={ref} className="space-y-6">
          {/* AI Generation Section */}
          <TooltipProvider>
            <div className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-4 flex items-center justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent
                      className="max-w-xs"
                      side="left"
                      align="center"
                      sideOffset={8}
                      avoidCollisions={true}
                      collisionPadding={16}
                    >
                      <p>
                        AI analyzes your video transcription to generate
                        engaging titles and descriptions
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-sm font-medium text-gray-700">
                    AI Content Generation
                  </span>
                </div>
              </div>

              {/* Video requirement warning */}
              {!hasVideoForCurrentLang && (
                <div className="text-xs text-orange-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Upload a video first to enable AI generation
                </div>
              )}

              {/* AI Generation Button */}
              {existingSession?.transcribe?.[courseLang] &&
                hasVideoForCurrentLang && (
                  <GenerateButton
                    onClick={handleGenerateContent}
                    loading={isGenerating}
                    disabled={isLoading}
                    className="text-[#BB923D]"
                    title="Generate title and description using AI"
                  >
                    {isGenerating ? "Generating..." : "Generate with AI"}
                  </GenerateButton>
                )}

              {/* Status messages */}
              {!existingSession?.transcribe?.[courseLang] &&
                hasVideoForCurrentLang && (
                  <div className="text-xs text-yellow-600 flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                    Transcription in progress...
                  </div>
                )}
            </div>
          </TooltipProvider>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm font-bold">
                    Title{" "}
                    <span className="font-light">
                      (Max {AI_GENERATION.MAX_TITLE_LENGTH} characters)
                    </span>
                  </FormLabel>
                  {isContentGenerated.title && (
                    <Button
                      onClick={() => handleUndoContent("title")}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Undo generated Title
                    </Button>
                  )}
                </div>
                <FormControl>
                  <Input
                    disabled={isLoading}
                    className="site-input"
                    type="text"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm font-bold">
                    Description
                  </FormLabel>
                  {isContentGenerated.description && (
                    <Button
                      onClick={() => handleUndoContent("description")}
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Undo generated Description
                    </Button>
                  )}
                </div>
                <FormControl>
                  <RichTextEditor
                    defaultValue={field.value}
                    onChange={field.onChange}
                    editorClassName="site-input min-h-[150px] max-h-[300px] overflow-y-scroll"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="video"
              render={({ field }) => (
                <FormItem>
                  <FileUpload
                    labelClassName="!text-xs"
                    placeholderClassname="bg-input-bg"
                    label={"Video Source"}
                    control={form.control}
                    fileTypes={ACCEPTED_VIDEO_TYPES}
                    name="video"
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <div className="flex justify-center items-center w-full flex-col gap-2">
                      <div>
                        <h6 className="text-site-general font-bold text-center">
                          Drag & Drop Your Video
                        </h6>
                        <p className="text-site-general text-center">
                          File Format:{" "}
                          {ACCEPTED_VIDEO_TYPES.map((type) => type.label).join(
                            ", "
                          )}
                        </p>
                        <p className="text-site-general text-center text-xs mt-1">
                          Max Size: 2GB (2048 MB)
                        </p>
                      </div>
                      <span className="text-site-general text-center">Or</span>
                    </div>
                  </FileUpload>
                  {field.value && field.value instanceof File && (
                    <InfoBadge>Ready to upload</InfoBadge>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attachment"
              render={({ field }) => (
                <FormItem>
                  <FileUpload
                    labelClassName="!text-xs"
                    placeholderClassname="bg-input-bg"
                    label="Upload exercise files to the lesson"
                    control={form.control}
                    fileTypes={ACCEPTED_ATTACHMENT_TYPES}
                    name="attachment"
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <div className="flex justify-center items-center w-full gap-2 flex-col">
                      <div>
                        <h6 className="text-site-general font-bold text-center">
                          Drag & Drop Your Document
                        </h6>
                        <p className="text-site-general text-center">
                          File Format:{" "}
                          {ACCEPTED_ATTACHMENT_TYPES.map(
                            (type) => type.label
                          ).join(", ")}
                        </p>
                      </div>
                      <span className="text-site-general text-center">Or</span>
                    </div>
                  </FileUpload>
                  {field.value && field.value instanceof File && (
                    <InfoBadge>Ready to upload</InfoBadge>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </div>
  );
});

CourseContent.displayName = "CourseContent";

export default CourseContent;
