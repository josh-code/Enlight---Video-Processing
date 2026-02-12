import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
import CustomInputOTP from "@/components/misc/CustomInputOTP";
import PasswordInput from "@/components/misc/PasswordInput";

// Services
import {
    forgotPassword,
    verifyOtp,
    resetPassword,
} from "@/services/authServie";

const emailSchema = z.object({
    email: z.string().email("Invalid email address"),
});

const otpSchema = z.object({
    otp: z.string().min(6, "OTP is required").max(6, "OTP must be 6 digits"),
});

const passwordSchema = z
    .object({
        newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters long"),
        confirmPassword: z
            .string()
            .min(8, "Password must be at least 8 characters long"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

export default function ForgotPassword() {
    const [stage, setStage] = useState(1);
    const [email, setEmail] = useState("");
    const [resetToken, setResetToken] = useState(null);

    const navigate = useNavigate();

    const emailForm = useForm({
        resolver: zodResolver(emailSchema),
    });

    const otpForm = useForm({
        resolver: zodResolver(otpSchema),
    });

    const passwordForm = useForm({
        resolver: zodResolver(passwordSchema),
    });

    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (stage > 1) {
                const message =
                    "You have unsaved changes, are you sure you want to leave?";
                event.preventDefault();
                event.returnValue = message;
                return message;
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [stage]);

    const handleEmailSubmit = async (data) => {
        try {
            const response = await forgotPassword({ email: data.email });
            if (response.otpSent) {
                setEmail(data.email);
                toast.success("OTP sent to your email");
                setStage(2);
            } else {
                toast.error("Failed to send OTP");
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleOtpSubmit = async (data) => {
        if (!email) {
            otpForm.reset();
            return setStage(1);
        }
        try {
            const obj = {
                email,
                otp: data.otp,
            };
            const res = await verifyOtp(obj);

            if (res.otpVerified) {
                setResetToken(res.resetToken);
                toast.success("OTP verified");
                setStage(3);
            } else {
                toast.error("Invalid OTP");
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handlePasswordSubmit = async (data) => {
        if (!email) {
            otpForm.reset();
            return setStage(1);
        }
        try {
            const obj = {
                email,
                password: data.newPassword,
                confirmPassword: data.confirmPassword,
                resetToken,
            };

            await resetPassword(obj);

            toast.success("Password has been reset");
            navigate("/login");
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <div className="min-h-screen flex">
            <div className="w-1/2 bg-gray-50 flex items-center justify-center">
                <div>
                    <img src="/logo_colored.png" alt="Logo" className="mb-8 w-32 h-32" />
                    {/* <div className="text-center">
                        <img src="/path/to/illustration.png" alt="Illustration" />
                    </div> */}
                </div>
            </div>
            <div className="w-1/2 bg-site-primary text-site-primary flex items-center justify-center">
                <div className="max-w-md bg-gray-50 border w-full rounded-lg p-8">
                    {stage === 1 && (
                        <>
                            <h2 className="text-3xl font-bold text-center mb-1">
                                Forgot Password
                            </h2>
                            <p className="text-center text-sm mb-6">Enter your email</p>
                            <Form {...emailForm}>
                                <form
                                    onSubmit={emailForm.handleSubmit(handleEmailSubmit)}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={emailForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm">
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
                                    <LoadingButton
                                        loading={emailForm.formState.isSubmitting}
                                        type="submit"
                                        className="bg-site-gradient w-full"
                                    >
                                        Send OTP
                                    </LoadingButton>
                                </form>
                            </Form>
                        </>
                    )}
                    {stage === 2 && (
                        <>
                            <h2 className="text-3xl font-bold text-center mb-1">
                                Verify OTP
                            </h2>
                            <p className="text-center text-sm mb-6">
                                Enter the OTP sent to email
                            </p>
                            <Form {...otpForm}>
                                <form
                                    onSubmit={otpForm.handleSubmit(handleOtpSubmit)}
                                    className="space-y-4 flex items-center flex-col"
                                >
                                    <FormField
                                        control={otpForm.control}
                                        name="otp"
                                        render={({ field }) => (
                                            <FormItem>
                                                {/* <FormLabel>Enter OTP</FormLabel> */}
                                                <FormControl>
                                                    <CustomInputOTP {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <LoadingButton
                                        loading={otpForm.formState.isSubmitting}
                                        type="submit"
                                        className="bg-site-gradient w-full"
                                    >
                                        Verify OTP
                                    </LoadingButton>
                                </form>
                            </Form>
                        </>
                    )}
                    {stage === 3 && (
                        <>
                            <h2 className="text-3xl font-bold text-center mb-1">
                                Reset Password
                            </h2>
                            <p className="text-center text-sm mb-6">
                                Enter your new password
                            </p>
                            <Form {...passwordForm}>
                                <form
                                    onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={passwordForm.control}
                                        name="newPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm">
                                                    New Password
                                                </FormLabel>
                                                <FormControl>
                                                    <PasswordInput
                                                        className="bg-transparent"
                                                        inputClassName="bg-transparent"
                                                        showPasswordStrength={true}
                                                        placeholder="New Password"
                                                        field={field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={passwordForm.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm">
                                                    Confirm New Password
                                                </FormLabel>
                                                <FormControl>
                                                    <PasswordInput
                                                        className="bg-transparent"
                                                        inputClassName="bg-transparent"
                                                        placeholder="Confirm New Password"
                                                        field={field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <LoadingButton
                                        loading={passwordForm.formState.isSubmitting}
                                        type="submit"
                                        className="bg-site-gradient w-full"
                                    >
                                        Reset Password
                                    </LoadingButton>
                                </form>
                            </Form>
                        </>
                    )}
                    {stage === 1 && (
                        <Link className="text-sm mt-4 block" to="/login">
                            Back to Login
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
