import { useEffect, useRef, useState } from "react";

// Shadcn
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";

import Quiz from "./stages/Quiz";
import StageHeader from "./StageHeader";
import CourseContent from "./stages/CourseContent";

// Redux
import { useSelector } from "react-redux";
import { SelectSelectedCourse } from "@/redux/slices/course";

// Services
import { getSessionById } from "@/services/content/session";

const stages = [
  { component: CourseContent, title: "Course Content", value: 0 },
  { component: Quiz, title: "Quiz", value: 1, optional: true },
];

export default function AddSession({
  open,
  onChange,
  editingSessionId,
  editiongModuleId,
}) {
  const [currentStage, setCurrentStage] = useState(stages[0].value);
  const formRefs = useRef([]);
  const StageComponent = stages[currentStage].component;
  const [createdSessionId, setCreatedSessionId] = useState(null);
  const [existingSession, setExistingSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const selectedCourse = useSelector(SelectSelectedCourse);

  const resetState = () => {
    setCurrentStage(stages[0].value);
    setCreatedSessionId(null);
    formRefs.current = [];
  };

  const handleNext = async () => {
    setIsLoading(true);
    const currentFormRef = formRefs.current[currentStage];
    if (currentFormRef && currentFormRef.submit) {
      await currentFormRef.submit();
    }
    setIsLoading(false);
  };

  const handleSaveQuiz = async () => {
    setIsLoading(true);
    const currentFormRef = formRefs.current[currentStage];
    if (currentFormRef && currentFormRef.saveSessionQuiz) {
      await currentFormRef.saveSessionQuiz();
    }
    setIsLoading(false);
  };

  const handleStageChange = (stageIndex) => {
    setCurrentStage(stageIndex);
  };

  const getCurrentButtonText = () => {
    return currentStage === stages.length - 1 ? "Submit" : "Next";
  };

  const handleSkip = () => {
    if (currentStage < stages.length - 1) {
      setCurrentStage(currentStage + 1);
    } else {
      onChange(false);
    }
  };

  const getCurrentButtonHandler = () => {
    switch (currentStage) {
      case 0:
        return handleNext;
      case 1:
        return handleSaveQuiz;
      default:
        return handleNext;
    }
  };

  useEffect(() => {
    async function getSession({ sessionId, moduleId, courseId }) {
      try {
        setIsSessionLoading(true);
        const session = await getSessionById({ sessionId, moduleId, courseId });
        if (session) {
          setExistingSession(session);
        }
      } catch (error) {
        console.log(error);
      } finally {
        setIsSessionLoading(false);
      }
    }

    if (editingSessionId && selectedCourse && selectedCourse.isModular) {
      getSession({
        courseId: selectedCourse._id,
        moduleId: editiongModuleId,
        sessionId: editingSessionId,
      });
    } else if (
      editingSessionId &&
      selectedCourse &&
      !selectedCourse.isModular
    ) {
      getSession({
        courseId: selectedCourse._id,
        sessionId: editingSessionId,
      });
    } else {
      setExistingSession(null);
    }
  }, [editingSessionId, editiongModuleId, selectedCourse]);

  useEffect(() => {
    if (existingSession) {
      setCreatedSessionId(existingSession._id);
    }
  }, [existingSession]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onChange(isOpen);
        if (!isOpen) {
          resetState();
          setExistingSession(null);
        }
      }}
    >
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
        className="p-0 w-full max-w-[70%] max-h-[90vh] overflow-y-scroll gap-0"
      >
        <DialogHeader className="shadow-header-shadow py-4 px-7 h-fit">
          <DialogTitle className="font-bold text-xl">
            {existingSession ? "Update a Lesson" : "Add a Lesson"}
          </DialogTitle>
        </DialogHeader>
        <div className="py-5 px-7 space-y-6 pb-8">
          <StageHeader
            currentStage={currentStage}
            onNext={getCurrentButtonHandler()}
            onStageChange={handleStageChange}
            buttonText={getCurrentButtonText()}
            isLoading={isLoading}
            optional={stages[currentStage]?.optional}
            onSkip={handleSkip}
          />
          <div>
            <StageComponent
              moduleId={editiongModuleId}
              existingSession={existingSession}
              createdSessionId={createdSessionId}
              setCreatedSessionId={setCreatedSessionId}
              ref={(el) => (formRefs.current[currentStage] = el)}
              onStageChange={handleStageChange}
              onChange={onChange}
              isLoading={isLoading}
              setExistingSession={setExistingSession}
              isSessionLoading={isSessionLoading}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
