import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Shadcn
import {
    Form,
    FormField,
    FormControl,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/shadcn/ui/form";
import { Input } from "@/components/shadcn/ui/input";
import { toast } from "sonner";

// Custom
import LoadingButton from "@/components/misc/LoadingButton";

// Services
import { login } from "@/services/authServie";
import { Link } from "react-router-dom";

const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

export default function Login() {
    const form = useForm({
        resolver: zodResolver(loginSchema),
    });

    const onSubmit = async (data) => {
        try {
            await login(data);

            toast.success("Login successful",);
            window.location.reload();
        } catch (error) {
            toast.error(error.message,);
        }
    };

    return (
        <div className="min-h-screen flex">
            <div className="w-1/2 bg-gray-50 flex items-center justify-center">
                <div>
                    <img src="/logo_colored.png" alt="Logo" className="mb-8 h-32 w-32" />
                    {/* <div className="text-center">
                        <img src="/path/to/illustration.png" alt="Illustration" />
                    </div> */}
                </div>
            </div>
            <div className="w-1/2 text-site-primary bg-site-primary text-foreground flex items-center justify-center">
                <div className="max-w-md border w-full rounded-lg p-8 bg-gray-50">
                    <h2 className="text-3xl font-bold text-center mb-1">Admin Login</h2>
                    <p className="text-center  text-sm mb-6">
                        Enter credentials to continue
                    </p>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm text-site-primary ">
                                            Enter Email
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                className="bg-transparent"
                                                placeholder="abc@example.com"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm">
                                            Enter Password
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                className="bg-transparent"
                                                placeholder="********"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="flex justify-between items-center">
                                <Link to="/forgot-password" className="text-sm">
                                    Forgot Password?
                                </Link>
                            </div>
                            <LoadingButton
                                loading={form.formState.isSubmitting}
                                type="submit"
                                className="bg-site-gradient w-full"
                            >
                                Login
                            </LoadingButton>
                        </form>
                    </Form>
                </div>
            </div>
        </div>
    );
}
