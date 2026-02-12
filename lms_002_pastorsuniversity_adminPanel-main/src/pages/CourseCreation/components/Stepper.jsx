import { useDispatch, useSelector } from "react-redux";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/ui/button";
import LoadingButton from "@/components/misc/LoadingButton";
import { useEffect } from "react";
import {
    SelectCourseEditingLanguage,
    setCourseEditingLanguage,
} from "@/redux/slices/user";
import { APP_LANGUAGES } from "@/lib/constant";


export default function Stepper({
    steps,
    currentStep,
    onStepClick,
    className = "",
    mode,
    onSaveAndContinue,
    isLoading,
    ...props
}) {
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const dispatch = useDispatch();

    const handleLanguageChange = (lang) => {
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        params.set("lang", lang);

        window.history.replaceState(
            null,
            "",
            `${url.pathname}?${params.toString()}`
        );
        dispatch(setCourseEditingLanguage(lang));
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const lang = params.get("lang") || "en";
        dispatch(setCourseEditingLanguage(lang));

        return () => {
            handleLanguageChange("en");
        };
    }, [dispatch]);

    return (
        <>
            {mode === "edit" ? (
                <div className="flex items-center justify-between">
                    <div className={cn("flex items-center gap-4")}>
                        {steps.map((step, index) => (
                            <Button
                                key={index}
                                onClick={() => onStepClick(index)}
                                className={cn(
                                    "flex items-center border py-2 px-6 text-xs rounded-[5px] font-medium bg-transparent hover:border-site-primary hover:text-site-primary hover:bg-site-primary/15",
                                    index === currentStep - 1
                                        ? "border-site-primary text-site-primary bg-site-primary/15"
                                        : "border-site-general border-site-general/20 text-text-main/70"
                                )}
                                disabled={isLoading}
                            >
                                {step}
                            </Button>
                        ))}
                    </div>
                    <div className="flex items-center gap-5">
                        <div className="flex items-center relative space-x-2 p-1.5 rounded bg-white  shadow-sm">
                            {APP_LANGUAGES.map((lan) => (
                                <button
                                    className={cn(
                                        "flex z-10 items-center py-2 px-6 text-xs rounded-[5px] font-medium bg-transparent hover:border-site-primary hover:text-site-primary hover:bg-site-primary/15",
                                        courseLang === lan.value
                                            ? "border border-site-primary text-site-primary bg-site-primary/15"
                                            : " text-text-main/70"
                                    )}
                                    onClick={() => handleLanguageChange(lan.value)}
                                    key={lan.value}
                                >
                                    {lan.label}
                                </button>
                            ))}
                        </div>
                        <LoadingButton
                            onClick={() => {
                                if (mode === "edit" && onSaveAndContinue) onSaveAndContinue();
                            }}
                            className="bg-site-primary text-white text-sm px-5"
                            loading={isLoading}
                        >
                            Save
                        </LoadingButton>
                    </div>
                </div>
            ) : (
                <div className={cn("flex items-center mb-8", className)} {...props}>
                    {steps.map((step, index) => (
                        <button
                            onClick={() => index <= currentStep - 1 && onStepClick(index)}
                            key={index}
                            className={cn(
                                "flex items-center",
                                index <= currentStep - 1
                                    ? "cursor-pointer"
                                    : "cursor-not-allowed"
                            )}
                            disabled={isLoading}
                        >
                            <div
                                className={`flex items-center justify-center w-5 h-5 text-[10px] leading-3 rounded-full font-bold cursor-pointer ${currentStep === index + 1
                                    ? "bg-site-primary text-white"
                                    : "bg-transparent border border-site-general text-site-general"
                                    }`}
                            >
                                {index + 1}
                            </div>
                            <div
                                className={`ml-2 font-nanumGothic text-xs font-semibold ${currentStep === index + 1
                                    ? "font-bold text-site-primary"
                                    : "text-site-general"
                                    }`}
                            >
                                {step}
                            </div>
                            {index < steps.length - 1 && (
                                <div className="flex items-center mx-2 text-site-general">
                                    <ChevronRight size={20} />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}
