import { useState, useMemo } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

function calculatePasswordStrength(password) {
    let strength = 0;

    // Check length
    if (password.length >= 8) strength += 1;

    // Check for uppercase letters
    if (/[A-Z]/.test(password)) strength += 1;

    // Check for lowercase letters
    if (/[a-z]/.test(password)) strength += 1;

    // Check for numbers
    if (/[0-9]/.test(password)) strength += 1;

    // Check for special characters (optional)
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;

    return strength;
}

function getStrengthMessage(strength) {
    switch (strength) {
        case 1:
            return "Too Weak";
        case 2:
            return "Weak";
        case 3:
            return "Fair";
        case 4:
            return "Strong";
        case 5:
            return "Very Strong";
        default:
            return "";
    }
}

function getBadgeClass(strength) {
    switch (strength) {
        case 1:
            return "bg-red-600";
        case 2:
            return "bg-orange-600";
        case 3:
            return "bg-yellow-500";
        case 4:
            return "bg-green-500";
        case 5:
            return "bg-green-700";
        default:
            return "bg-gray-400";
    }
}
export default function PasswordInput({
    field,
    placeholder,
    showPasswordStrength,
    className,
    inputClassName
}) {
    const [showPassword, setShowPassword] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);

    const togglePasswordVisibility = () => {
        setShowPassword((prevState) => !prevState);
    };

    const handlePaste = (event) => {
        event.preventDefault();
    };

    const handlePasswordChange = (event) => {
        const value = event.target.value;
        setPasswordStrength(calculatePasswordStrength(value));
        field.onChange(event);
    };

    const passwordIcon = useMemo(
        () => (showPassword ? <EyeOff size={18} /> : <Eye size={18} />),
        [showPassword]
    );

    return (
        <div className={cn("relative", className)}>
            <Input
                type={showPassword ? "text" : "password"}
                placeholder={placeholder}
                {...field}
                onPaste={handlePaste}
                onChange={handlePasswordChange}
                aria-label="Password input field"
                className={inputClassName}
            />
            <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
                aria-label={showPassword ? "Hide password" : "Show password"}
            >
                {passwordIcon}
            </button>
            {showPasswordStrength && getStrengthMessage(passwordStrength) !== "" && (
                <div
                    className={`mt-1.5 py-1 px-2 rounded-lg font-medium text-[10px] leading-4 text-white w-fit ml-auto absolute -top-9 right-0 ${getBadgeClass(
                        passwordStrength
                    )}`}
                >
                    {getStrengthMessage(passwordStrength)}
                </div>
            )}
        </div>
    );
}
