import { useEffect } from "react";

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/ui/dialog";
import { Button } from "@/components/shadcn/ui/button";
import { useForm } from "react-hook-form";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/shadcn/ui/form";
import { Input } from "@/components/shadcn/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/ui/select";
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { toast } from "sonner";

import formField from "./formfield";

import { addAppVersion } from "@/services/content/appVersions";

import { useDispatch } from "react-redux";
import { getAppVersionsAsync } from "@/redux/slices/appVersions";

const appVersionSchema = z.object({
    platform: z.string().min(1, { message: "Platform is required" }),
    version: z.string().min(1, { message: "Version is required" }),
    isActive: z.boolean(),
    releaseDate: z.preprocess((arg) => {
        if (typeof arg === "string" || arg instanceof Date) return new Date(arg);
    }, z.date({ required_error: "Release Date is required" })),
});

export default function AddApp({ open, onClose }) {
    const dispatch = useDispatch();

    const form = useForm({
        resolver: zodResolver(appVersionSchema),
        defaultValues: {
            platform: "",
            version: "",
            isActive: false,
            releaseDate: "",
        },
    });

    const onSubmit = async (data) => {
        try {
            const response = await addAppVersion(data);
            const successMsg = response.message || "App version added successfully";
            toast.success(successMsg);
            onClose(false);
            dispatch(getAppVersionsAsync());
        } catch (error) {
            const errMsg = error.response
                ? error.response.data.message
                : error.message;
            console.log(errMsg);
            toast.error(errMsg);
        }
    };

    useEffect(() => {
        return () => {
            if (!open) {
                form.reset();
            }
        };
    }, [open, form]);

    const renderField = (field) => {
        switch (field.type) {
            case "text":
                return (
                    <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: formFieldProps }) => (
                            <FormItem>
                                <FormLabel>{field.label}</FormLabel>
                                <FormControl>
                                    <Input
                                        type="text"
                                        placeholder={field.placeholder}
                                        {...formFieldProps}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                );
            case "selection":
                return (
                    <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: formFieldProps }) => (
                            <FormItem>
                                <FormLabel>{field.label}</FormLabel>
                                <FormControl>
                                    <Select
                                        value={formFieldProps.value}
                                        onValueChange={formFieldProps.onChange}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={field.placeholder} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ios">iOS</SelectItem>
                                            <SelectItem value="android">Android</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                );
            case "checkbox":
                return (
                    <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: formFieldProps }) => (
                            <FormItem className="flex flex-row items-center space-x-2">
                                <FormControl>
                                    <Checkbox
                                        className="mr-1"
                                        checked={formFieldProps.value}
                                        onCheckedChange={(checked) =>
                                            formFieldProps.onChange(checked)
                                        }
                                    />
                                </FormControl>
                                <FormLabel>{field.label}</FormLabel>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                );
            case "date":
                return (
                    <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: formFieldProps }) => (
                            <FormItem>
                                <FormLabel>{field.label}</FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        placeholder={field.placeholder}
                                        {...formFieldProps}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                );
            default:
                return null;
        }
    };
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add App Version</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {formField.map((field) => renderField(field))}
                        <DialogFooter className="mt-4">
                            <Button type="submit">Submit</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
