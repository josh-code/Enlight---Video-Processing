import {
    InputOTP,
    InputOTPSlot,
    InputOTPGroup,
    InputOTPSeparator
} from "@/components/shadcn/ui/input-otp"

export default function CustomInputOTP({
    inputLength = 6,
    ...props
}) {
    const separatorIndex = Math.floor(inputLength / 2);
    return (
        <InputOTP {...props} maxLength={inputLength}>
            <InputOTPGroup>
                {Array.from({ length: separatorIndex }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
                {Array.from({ length: inputLength - separatorIndex }, (_, i) => (
                    <InputOTPSlot key={separatorIndex + i} index={separatorIndex + i} />
                ))}
            </InputOTPGroup>
        </InputOTP>
    )
}