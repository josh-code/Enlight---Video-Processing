import { forwardRef, useEffect, useImperativeHandle } from "react";

// React hook form
import { useForm } from "react-hook-form";

// zod
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Shadcn
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/shadcn/ui/form";
import { Input } from "@/components/shadcn/ui/input";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { toast } from "sonner";

// Utils
import { cn, getTranslation } from "@/lib/utils";

// Custom
import FileUpload from "@/components/misc/FileUpload";

// Services
import { createCourse } from "@/services/content/course";
import { compressVideo } from "@/services/content/awsServices";

// Custome hooks
import { useFileUpload } from "@/hooks";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
  getCourseByIdAsync,
  SelectSelectedCourse,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Constant
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_FILE_SIZE_MB,
} from "@/lib/constant";
import { AWS_FOLDER_NAME } from "@/lib/constant";
import InfoBadge from "@/components/misc/InfoBadge";

const formSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .max(75, { message: "Title should be less than 75 characters" })
    .min(4, { message: "Title should be more than 4 characters" }),
  description: z
    .string({ required_error: "Description is required" })
    .min(10, { message: "Description should be more than 10 characters" })
    .max(350, { message: "Description should be less than 350 characters" }),
  instructor: z
    .string({
      required_error: "Name of the Instructor is required",
    })
    .min(4, "Name of the Instructor should be more than 4 characters"),
  amount: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .min(0.01, { message: "Amount must be greater than $0.01" }),
  coverimage: z.any().refine((value) => value !== null && value !== undefined, {
    message: "Cover image is required",
  }),
  introductionvideo: z.any(),
  instructorimage: z.any(),
});

const CourseInformation = forwardRef(({ className = "", ...props }, ref) => {
  const selectedCourse = useSelector(SelectSelectedCourse);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const { uploadFile } = useFileUpload();

  const dispatch = useDispatch();

  const { isLoading } = props;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      instructor: "",
      coverimage: null,
      introductionvideo: null,
      instructorimage: null,
      amount: 0.01,
    },
  });

  useEffect(() => {
    if (selectedCourse) {
      let introVideoDefault = null;

      if (selectedCourse.introVideo && selectedCourse.introVideo[courseLang]) {
        const currentIntroVideo = selectedCourse.introVideo[courseLang];
        if (typeof currentIntroVideo === "object") {
          introVideoDefault = Object.values(currentIntroVideo)[0] || null;
        } else {
          introVideoDefault = currentIntroVideo || null;
        }
      }

      form.reset({
        title: getTranslation(selectedCourse.name, courseLang) || "",
        description:
          getTranslation(selectedCourse.description, courseLang) || "",
        instructor: selectedCourse.presentedBy || "",
        coverimage: selectedCourse.image ? selectedCourse.image : null,
        introductionvideo: introVideoDefault,
        instructorimage: selectedCourse.instructorImage
          ? selectedCourse.instructorImage
          : null,
        amount: selectedCourse.amount ? selectedCourse.amount / 100 : 1,
      });
    }
  }, [selectedCourse, form, courseLang]);

  useImperativeHandle(ref, () => ({
    submit: form.handleSubmit(async (data) => {
      try {
        // Build payload for create/update
        const payload = {};
        if (selectedCourse) payload.courseId = selectedCourse._id;

        // Text fields
        payload.presentedBy = data.instructor;
        payload.amount = Math.round(data.amount * 100); // Convert dollars to cents

        if (courseLang === "en") {
          payload.name = { en: data.title };
          payload.description = { en: data.description };
        } else if (courseLang === "es") {
          payload.name = { es: data.title };
          payload.description = { es: data.description };
        }

        const createdCourse = await createCourse(payload);

        if (createCourse) {
          payload.courseId = createdCourse._id;
        }

        // Cover image
        if (data.coverimage === null) {
          payload.image = null;
        } else if (data.coverimage) {
          const cover = await uploadFile(
            data.coverimage,
            AWS_FOLDER_NAME.COVER_IMAGE,
            "cover image"
          );
          if (cover && typeof cover !== "string") payload.image = cover.key;
        }

        // Intro video
        if (data.introductionvideo === null) {
          payload.introVideo = { [courseLang]: null };
        } else if (data.introductionvideo) {
          const intro = await uploadFile(
            data.introductionvideo,
            AWS_FOLDER_NAME.UPLOADED_VIDEO,
            "introduction video"
          );
          let keys = null;
          if (intro && typeof intro !== "string") {
            const comp = await compressVideo({
              key: intro.key,
              courseId: createdCourse._id,
              lang: courseLang,
            });
            keys = comp.keys;
          }
          if (keys) {
            payload.introVideo = {
              [courseLang]: {
                "360p": keys["360"],
                "480p": keys["480"],
                "720p": keys["720"],
                "1080p": keys["1080"],
              },
            };
          } else if (intro && typeof intro !== "string") {
            payload.introVideo = { [courseLang]: intro.key };
          }
        }

        // Instructor image
        if (data.instructorimage === null) {
          payload.instructorImage = null;
        } else if (data.instructorimage) {
          const instr = await uploadFile(
            data.instructorimage,
            AWS_FOLDER_NAME.INSTRUCTOR_IMAGE,
            "instructor image"
          );
          if (instr && typeof instr !== "string")
            payload.instructorImage = instr.key;
        }

        // Submit to API
        const result = await createCourse(payload);
        if (result) {
          dispatch(getCourseByIdAsync(result._id)).then(() => {
            form.reset();
            toast.success("Course Information Saved", {
              description: "Course information has been saved successfully.",
            });
            if (props.mode !== "edit") props.onStageChange(1);
          });
        }
      } catch (error) {
        console.error("Error submitting form", error);
        toast.error("Failed to save course information");
      }
    }),
  }));

  return (
    <div className={cn("space-y-9", className)} {...props}>
      <Form {...form}>
        <form ref={ref} className="space-y-6">
          <div className="max-w-[1000px] space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-sm">
                    Title{" "}
                    <span className="font-light">(Max 75 characters)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={isLoading}
                      className="bg-input-bg border-none"
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
                  <FormLabel className="font-bold text-sm">
                    Description{" "}
                    <span className="font-light">(Max 350 characters)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={isLoading}
                      className="bg-input-bg h-48 border-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="instructor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm">
                      Name of the Instructor
                    </FormLabel>
                    <FormControl>
                      <Input
                        disabled={isLoading}
                        className="bg-input-bg border-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm">
                      Course Amount (In dollars)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01" // Allow cents
                        disabled={isLoading}
                        className="bg-input-bg border-none"
                        value={field.value || ""}
                        onChange={(e) => {
                          const parsedValue = parseFloat(e.target.value);
                          field.onChange(
                            isNaN(parsedValue) ? null : parsedValue
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="coverimage"
              render={({ field }) => (
                <FormItem>
                  <FileUpload
                    label="Cover Image"
                    fileTypes={ACCEPTED_IMAGE_TYPES}
                    control={form.control}
                    name="coverimage"
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <div className="flex justify-center items-center w-full gap-2 flex-col">
                      <div>
                        <h6 className="text-site-general font-bold text-center">
                          Drag & Drop Your Cover Image
                        </h6>
                        <p className="text-site-general text-center">
                          File Format:{" "}
                          {ACCEPTED_IMAGE_TYPES.map((type) => type.label).join(
                            ", "
                          )}
                        </p>
                        {MAX_IMAGE_FILE_SIZE_MB && (
                          <p className="text-site-general text-center text-xs">
                            Max Size: {MAX_IMAGE_FILE_SIZE_MB} MB
                          </p>
                        )}
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
              name="introductionvideo"
              render={({ field }) => (
                <FormItem>
                  <FileUpload
                    label="Upload an Introduction video"
                    fileTypes={ACCEPTED_VIDEO_TYPES}
                    control={form.control}
                    name="introductionvideo"
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <div className="flex justify-center items-center w-full gap-2 flex-col">
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
                        <p className="text-site-general text-center text-xs">
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
              name="instructorimage"
              render={({ field }) => (
                <FormItem>
                  <FileUpload
                    label="Upload an Image of the Instructor"
                    fileTypes={ACCEPTED_IMAGE_TYPES}
                    control={form.control}
                    name="instructorimage"
                    defaultValue={field.value}
                    disabled={isLoading}
                  >
                    <div className="flex justify-center items-center w-full gap-2 flex-col">
                      <div>
                        <h6 className="text-site-general font-bold text-center">
                          Drag & Drop Your Image
                        </h6>
                        <p className="text-site-general text-center">
                          File Format:{" "}
                          {ACCEPTED_IMAGE_TYPES.map((type) => type.label).join(
                            ", "
                          )}
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

CourseInformation.displayName = "CourseInformation";

export default CourseInformation;
