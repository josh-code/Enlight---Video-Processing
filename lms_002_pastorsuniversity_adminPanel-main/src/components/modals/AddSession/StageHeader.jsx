import { Quiz, Content } from "@/assets/icons";
import { cloneElement } from "react";
import { Button } from "@/components/shadcn/ui/button";
import LoadingButton from "@/components/misc/LoadingButton";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const STAGES = [
  {
    label: "Course Content",
    value: 0,
    icon: <Content />,
  },
  {
    label: "Quiz",
    value: 1,
    icon: <Quiz />,
  },
];

export default function StageHeader({
  currentStage,
  onNext,
  onStageChange,
  buttonText,
  isLoading,
  onSkip,
  optional,
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {STAGES.map((stage, index) => (
          <>
            <Button
              type="button"
              disabled={isLoading}
              key={stage.value}
              className={cn(
                "rounded-[10px] border gap-2 items-center",
                currentStage === stage.value
                  ? "border-site-primary bg-site-primary/15 text-site-primary hover:bg-site-primary/15"
                  : "border-site-general/20 bg-transparent text-site-general/70 hover:bg-site-general/20"
              )}
              onClick={() => onStageChange(stage.value)}
            >
              {cloneElement(stage.icon, {
                className:
                  currentStage === stage.value
                    ? "fill-site-primary"
                    : "fill-site-general/20",
              })}
              <p>{stage.label}</p>
            </Button>
            {index < STAGES.length - 1 && (
              <div className="flex items-center text-site-general">
                <ChevronRight size={20} />
              </div>
            )}
          </>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {optional && (
          <Button variant={"ghost"} onClick={onSkip}>
            Skip
          </Button>
        )}
        <LoadingButton
          loading={isLoading}
          className="site-primary-btn"
          onClick={onNext}
        >
          {buttonText}
        </LoadingButton>
      </div>
    </div>
  );
}
