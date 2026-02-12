import { useEffect, useRef, useState } from "react";

// Components
import StageHeader from "./components/StageHeader";
import TitleWithBack from "@/components/misc/TitleWithBack";
import Stepper from "./components/Stepper";

// Stage components
import CourseInformation from "./stages/CourseInformation";
import CourseContent from "./stages/CourseContent";
import ReviewAndPublish from "./stages/ReviewAndPublish";
import CustomPricing from "./stages/CustomPricing";

// Redux
import { useDispatch } from "react-redux";
import { getCourseByIdAsync } from "@/redux/slices/course";
import { clearSelectedCourse } from "@/redux/slices/course";

// Hook
import { useQueryParams } from "@/hooks";

const allStages = [
  {
    component: CourseInformation,
    title: "Course Information",
    description: "Fill in the details",
    value: 0,
  },
  {
    component: CourseContent,
    title: "Course Content",
    description: "Add course modules and lessons",
    value: 1,
  },
  {
    component: CustomPricing,
    title: "Custom Pricing",
    description: "Add custom pricing for each country",
    value: 2,
  },
  {
    component: ReviewAndPublish,
    title: "Review and Publish",
    description: "Finalize and publish the course",
    value: 3,
    confirm: true,
    message: "Are you sure you want to publish the course?"
  },
];

export default function CourseCreation() {
  const [currentStage, setCurrentStage] = useState(0);
  const [stages, setStages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const formRefs = useRef([]);

  const [getQueryParams] = useQueryParams();
  const queryParams = getQueryParams();
  const courseId = queryParams.get("courseId");
  const mode = queryParams.get("mode");

  const handleStageChange = (stageIndex) => {
    setCurrentStage(stageIndex);
  };

  const handleSkip = () => {
    const nextStage = currentStage + 1;
    if (nextStage < stages.length) {
      setCurrentStage(nextStage);
    }
  };

  const getButtonText = () => {
    switch (currentStage) {
      case 0:
      case 1:
      case 2:
        return "Save and Continue";
      case 3:
        return "Publish";
      default:
        return "Save and Continue";
    }
  };

  const handleSaveAsDraft = async () => {
    setIsLoading(true);
    setIsLoading(false);
  };

  const handleSaveAndContinueCourseInfo = async () => {
    setIsLoading(true);
    const currentFormRef = formRefs.current[currentStage];
    if (currentFormRef && currentFormRef.submit) {
      await currentFormRef.submit();
    }
    setIsLoading(false);
  };

  const handleSaveAndContinueCourseContent = async () => {
    setIsLoading(true);
    handleStageChange(2);
    setIsLoading(false);
  };

  const handleSaveAndContinueCustomPricing = async () => {
    setIsLoading(true);
    handleStageChange(3);
    setIsLoading(false);
  };

  const handlePublish = async () => {
    setIsLoading(true);
    const currentRef = formRefs.current[currentStage];
    if (currentRef && currentRef.publishCourse) {
      await currentRef.publishCourse();
    }
    setIsLoading(false);
  };

  const getCurrentSaveAndContinueHandler = () => {
    switch (currentStage) {
      case 0:
        return handleSaveAndContinueCourseInfo;
      case 1:
        return handleSaveAndContinueCourseContent;
      case 2:
        return handleSaveAndContinueCustomPricing;
      case 3:
        return handlePublish;
      default:
        return handleSaveAndContinueCourseInfo;
    }
  };

  const dispatch = useDispatch();

  useEffect(() => {
    if (courseId) {
      dispatch(getCourseByIdAsync(courseId));
    } else {
      dispatch(clearSelectedCourse());
    }

    // Add cleanup function to clear the course state
    return () => {
      dispatch(clearSelectedCourse());
    };
  }, [courseId, dispatch]);

  useEffect(() => {
    if (mode === "edit") {
      setStages(
        allStages.filter((stage) => stage.title !== "Review and Publish")
      );
    } else {
      setStages(allStages);
    }
  }, [mode]);

  const StageComponent = stages[currentStage]?.component;

  return (
    <section>
      <div className="pt-2 pb-11 space-y-7">
        <TitleWithBack title={mode ? "Update Course" : "Course Creation"} />
        <Stepper
          steps={stages.map((stage) => stage?.title)}
          currentStep={currentStage + 1}
          onStepClick={handleStageChange}
          onSaveAndContinue={getCurrentSaveAndContinueHandler()}
          mode={mode}
          isLoading={isLoading}
        />

        <StageHeader
          buttonText={getButtonText()}
          stageName={stages[currentStage]?.title}
          stageDescription={stages[currentStage]?.description}
          onSaveAsDraft={handleSaveAsDraft}
          onSaveAndContinue={getCurrentSaveAndContinueHandler()}
          mode={mode}
          isLoading={isLoading}
          onSkip={stages[currentStage]?.optional ? handleSkip : null}
          optional={stages[currentStage]?.optional}
          confirm={stages[currentStage]?.confirm}
          confirmationMessage={stages[currentStage]?.message}
        />

        <div>
          {StageComponent && (
            <StageComponent
              mode={mode}
              onStageChange={handleStageChange}
              isLoading={isLoading}
              ref={(el) => (formRefs.current[currentStage] = el)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
