import { useNavigate } from "react-router-dom";
import { Button } from "@/components/shadcn/ui/button";

export default function TitleWithBack({ title, className = "", ...props }) {
    const navigate = useNavigate();

    const handleGoBack = () => {
        navigate(-1);
    };
    return (
        <div className={`flex items-center gap-4 ${className}`} {...props}>
            <Button
                className="text-white bg-black rounded-[7px] h-full px-7 py-1 text-sm font-medium"
                onClick={handleGoBack}
            >
                Back
            </Button>
            <h4 className="text-black font-bold text-lg">{title}</h4>
        </div>
    );
}
