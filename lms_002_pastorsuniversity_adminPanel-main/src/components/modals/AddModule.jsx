import { useEffect, useState } from "react";

// Shadcn
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { Input } from "@/components/shadcn/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/shadcn/ui/form";
import { toast } from "sonner";

// Hook form
import { useForm } from "react-hook-form";

// Zod
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Redux
import { useSelector, useDispatch } from "react-redux";
import {
  SelectSelectedCourse,
  getCourseModulesAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Service
import { createModule, getModuleById } from "@/services/content/module";

import { getTranslation } from "@/lib/utils";

const addModuleSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

export default function AddModule({ open, onChange, editiongModuleId }) {
  const [existingModule, setExistingModule] = useState(null);
  const form = useForm({
    resolver: zodResolver(addModuleSchema),
    defaultValues: {
      title: "",
    },
  });

  const dispatch = useDispatch();
  const selectedCourse = useSelector(SelectSelectedCourse);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const handleSubmit = async (values) => {
    if (selectedCourse) {
      try {
        const obj = {
          courseId: selectedCourse._id,
        };

        if (existingModule) {
          obj.moduleId = existingModule._id;
        }

        if (courseLang === "en") {
          obj.name = { en: values.title };
        } else if (courseLang === "es") {
          obj.name = { es: values.title };
        }

        if (values.description) {
          if (courseLang === "en") {
            obj.description = { en: values.description };
          } else if (courseLang === "es") {
            obj.description = { es: values.description };
          }
        }

        const data = await createModule(obj);

        const toastMessage = existingModule
          ? "Module Updated"
          : "Module Created";
        const toastDescription = existingModule
          ? "Module has been updated successfully."
          : "Module has been created successfully.";

        toast.success(toastMessage, {
          description: toastDescription,
        });
        setExistingModule(null);
        form.reset();
        onChange(false);
        dispatch(getCourseModulesAsync({ courseId: selectedCourse._id }));
      } catch (error) {
        console.log(error);
        toast.error("Failed to submit form. Please try again later.", {});
      }
    }
  };

  useEffect(() => {
    async function getModule() {
      try {
        const module = await getModuleById({ moduleId: editiongModuleId });
        if (module) {
          setExistingModule(module);
        }
      } catch (error) {
        console.log(error);
      }
    }

    if (editiongModuleId) {
      getModule();
    } else {
      setExistingModule(null);
      form.reset();
    }
  }, [editiongModuleId, form]);

  useEffect(() => {
    if (existingModule) {
      form.setValue(
        "title",
        getTranslation(existingModule.name, courseLang)
      );
    }
  }, [existingModule, form, courseLang]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onChange(isOpen);
        if (!isOpen) {
          setExistingModule(null);
          form.reset({ title: "" });
        }
      }}
    >
      <DialogContent className="p-0 gap-0">
        <DialogHeader className="shadow-header-shadow gap-0 py-4 px-7">
          <DialogTitle className="font-bold text-xl">
            {existingModule ? "Update Module" : "Add Module"}
          </DialogTitle>
        </DialogHeader>
        <div className="py-5 px-7">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-8"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-sm">Title</FormLabel>
                    <FormControl>
                      <Input className="site-input" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="sm:justify-between">
                <Button
                  className="site-secondary-btn"
                  onClick={() => onChange(false)}
                  type="button"
                >
                  Cancel
                </Button>
                <Button className="site-primary-btn" type="submit">
                  Submit
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
