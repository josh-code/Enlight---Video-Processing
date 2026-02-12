import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/shadcn/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/shadcn/ui/form";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Input } from "@/components/shadcn/ui/input";
import { Checkbox } from "@/components/shadcn/ui/checkbox";
import { Button } from "@/components/shadcn/ui/button";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import {
    fetchFeatureFlagAsync,
    SelectFeatureFlag,
} from "@/redux/slices/featureFlag";
import { addFeature } from "@/services/content/featureFlag";

const camelCaseRegex = /^[a-z]+(?:[A-Z0-9][a-z0-9]*)*$/;

const toCamelCase = (str) => {
    return str
        .trim()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^\d+/, "")
        .replace(/^([A-Z])/, (match) => match.toLowerCase());
};

const addFeatureSchema = (featureData) =>
    z.object({
        newKey: z
            .string({
                required_error: "Key is required",
                invalid_type_error: "Key must be a string",
            })
            .min(1, "Key is required")
            .refine((value) => camelCaseRegex.test(value), {
                message: "Key must be in camelCase format (e.g., myFeatureKey).",
            })
            .refine((value) => !featureData[value], {
                message: "This key already exists",
            }),
        keyName: z
            .string({
                required_error: "Key is required",
                invalid_type_error: "Key must be a string",
            })
            .min(1, "Key is required"),
        enabled: z.boolean().default(false),
        abTesting: z.boolean().default(false),
        description: z
            .string({
                required_error: "Description is required",
                invalid_type_error: "Description must be a string",
            })
            .min(1, "Description is required"),
    });

export default function AddFeature({ open, onChange, path }) {
    const [isLoading, setIsLoading] = useState(false);

    const dispatch = useDispatch();
    const featureData = useSelector(SelectFeatureFlag);

    const form = useForm({
        resolver: zodResolver(addFeatureSchema(featureData)),
    });

    const keyName = useWatch({ control: form.control, name: "keyName" });
    const newKey = useWatch({ control: form.control, name: "newKey" });

    useEffect(() => {
        if (keyName) {
            const generatedKey = toCamelCase(keyName);
            form.setValue("newKey", generatedKey, { shouldValidate: true });
        }
    }, [keyName, form]);

    useEffect(() => {
        if (newKey) {
            if (form.formState.isValid) {
                form.clearErrors("newKey");
            }
        }
    }, [newKey, form.formState.isValid, form]);

    useEffect(() => {
        if (open) {
            form.reset();
        }
    }, [open, form]);

    const addFeatureAsync = async (data) => {
        setIsLoading(true);
        try {
            const payload = {
                newKey: data.newKey,
                path,
                newValue: {
                    enabled: data.enabled,
                    abTesting: data.abTesting,
                    description: data.description,
                    keyName: data.keyName,
                },
            };

            await addFeature(payload);
            onChange(false);
            toast.success("Feature added successfully");
            dispatch(fetchFeatureFlagAsync());
            form.reset();
        } catch (error) {
            console.log(error);
            toast.error(error.message || "Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Feature</DialogTitle>
                </DialogHeader>
                <div>
                    <Form {...form}>
                        <form
                            onSubmit={form.handleSubmit(addFeatureAsync)}
                            className="space-y-5"
                        >
                            <FormField
                                control={form.control}
                                name="keyName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Key Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Key name of the feature" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="newKey"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Key Field</FormLabel>
                                        <FormControl>
                                            <Input placeholder="This will be generated" {...field} />
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
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Short description of the feature"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex items-center gap-8">
                                <FormField
                                    control={form.control}
                                    name="enabled"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormLabel>Enabled</FormLabel>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="abTesting"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormLabel>AB Testing</FormLabel>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <DialogFooter>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? "Submitting..." : "Submit"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
