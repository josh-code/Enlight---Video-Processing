import { useState, useEffect, forwardRef, useImperativeHandle } from "react";

// Icons
import { Trash, Edit } from "@/assets/icons";
import { Plus } from "lucide-react";

// Shadcn
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/shadcn/ui/button";
import { toast } from "sonner";

// Services
import { updateQuiz } from "@/services/content/session";

// Redux
import { useSelector } from "react-redux";
import { SelectSelectedCourse } from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Hook
import { useQueryParams } from "@/hooks";

const Quiz = forwardRef((props, ref) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [feedback, setFeedback] = useState("");
  const [correctOptionId, setCorrectOptionId] = useState(null);
  const [isAddButtonDisabled, setIsAddButtonDisabled] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editQuestionIndex, setEditQuestionIndex] = useState(null);

  const selectedCourse = useSelector(SelectSelectedCourse);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const [getQueryParams] = useQueryParams();
  const queryParams = getQueryParams();
  const mode = queryParams.get("mode");

  const { existingSession, setExistingSession, isLoading } = props;

  useImperativeHandle(ref, () => ({
    saveSessionQuiz: async () => {
      try {
        if (!props.createdSessionId || !selectedCourse) {
          return;
        }

        // allow to remove all questions when updating
        if (
          mode !== "edit" &&
          (!existingSession?.quiz?.questions ||
            existingSession.quiz.questions.length === 0) &&
          questions.length === 0
        ) {
          toast.error("Error", {
            description: "Please add at least one question",
          });
          return;
        }

        const obj = {
          sessionId: props.createdSessionId,
          courseId: selectedCourse._id,
          quiz: {
            questions: questions,
          },
        };

        if (selectedCourse.isModular && props.moduleId) {
          obj.moduleId = props.moduleId;
        }

        const session = await updateQuiz(obj);

        // Reset states
        setQuestions([]);
        setCurrentQuestion("");
        setOptions(["", ""]);
        setFeedback("");
        setCorrectOptionId(null);
        setIsAddButtonDisabled(true);

        toast.success("Quiz Saved", {
          description: "Quiz has been saved successfully.",
        });

        if (props.onChange) {
          props.onChange(false);
          setExistingSession(null);
        }
      } catch (error) {
        console.log(error);
      }
    },
  }));

  const generateId = () =>
    String(new Date().valueOf() + Math.floor(Math.random() * 1000));

  const addOption = () => {
    if (courseLang === "es") return;
    setOptions([...options, ""]);
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddQuestion = () => {
    const optionIds = options.map(() => generateId());

    if (editMode) {
      const existingQuestion = questions[editQuestionIndex];

      const updatedQuestion = {
        ...existingQuestion,
        title: {
          en: courseLang === "en" ? currentQuestion : existingQuestion.title.en,
          es: courseLang === "es" ? currentQuestion : existingQuestion.title.es,
        },
        feedback: {
          en: courseLang === "en" ? feedback : existingQuestion.feedback.en,
          es: courseLang === "es" ? feedback : existingQuestion.feedback.es,
        },
        options: options.map((option, idx) => {
          const existingOption = existingQuestion.options[idx] || {};
          return {
            _id: existingOption._id || optionIds[idx],
            title: {
              en:
                courseLang === "en"
                  ? option
                  : (existingOption.title && existingOption.title.en) || "",
              es:
                courseLang === "es"
                  ? option
                  : (existingOption.title && existingOption.title.es) || "",
            },
          };
        }),
        correctOptionId:
          existingQuestion.options[correctOptionId]?._id ||
          optionIds[correctOptionId],
      };

      const updatedQuestions = [...questions];
      updatedQuestions[editQuestionIndex] = updatedQuestion;
      setQuestions(updatedQuestions);
      setEditMode(false);
      setEditQuestionIndex(null);
    } else {
      if (courseLang === "es") return;

      const questionId = generateId();

      const newQuestion = {
        _id: questionId,
        title: {
          en: courseLang === "en" ? currentQuestion : "",
          es: courseLang === "es" ? currentQuestion : "",
        },
        feedback: {
          en: courseLang === "en" ? feedback : "",
          es: courseLang === "es" ? feedback : "",
        },
        options: options.map((option, index) => ({
          _id: optionIds[index],
          title: {
            en: courseLang === "en" ? option : "",
            es: courseLang === "es" ? option : "",
          },
        })),
        correctOptionId: optionIds[correctOptionId],
      };

      setQuestions([...questions, newQuestion]);
    }

    // Reset fields after adding/updating the question
    setCurrentQuestion("");
    setOptions(["", ""]);
    setFeedback("");
    setCorrectOptionId(null);
  };

  const handleDeleteOption = (index) => {
    if (courseLang === "es") return;
    if (options.length <= 2) {
      toast.info("Cannot Delete", {
        description: "At least two options are required.",
      });
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleEditQuestion = (index) => {
    const question = questions[index];
    setCurrentQuestion(question.title[courseLang]);
    setOptions(question.options.map((option) => option.title[courseLang]));
    setFeedback(question.feedback[courseLang]);
    setCorrectOptionId(
      question.options.findIndex(
        (option) => option._id === question.correctOptionId
      )
    );
    setEditMode(true);
    setEditQuestionIndex(index);
  };

  useEffect(() => {
    const isFormValid =
      currentQuestion?.trim() !== "" &&
      feedback?.trim() !== "" &&
      options?.length >= 2 &&
      options?.every((option) => option?.trim() !== "") &&
      correctOptionId !== null;

    setIsAddButtonDisabled(!isFormValid);
  }, [currentQuestion, options, feedback, correctOptionId]);

  useEffect(() => {
    if (existingSession?.quiz?.questions?.length > 0) {
      setQuestions(existingSession.quiz.questions);
    }

    return () => {
      setQuestions([]);
      setCurrentQuestion("");
      setOptions(["", ""]);
      setFeedback("");
    };
  }, [existingSession]);

  if (!props.createdSessionId) {
    toast.info("Error", {
      description: "Please create a session first",
    });
    return props.onStageChange(0);
  }

  return (
    <div className=" w-full flex gap-5">
      <div className="w-1/2 rounded-[5px] p-5 pb-11 shadow-card-shadow">
        <div className="mb-12">
          <label className="block font-bold text-xs mb-2">Question</label>
          <Input
            type="text"
            value={currentQuestion}
            onChange={(e) => setCurrentQuestion(e.target.value)}
            className="bg-input-bg"
            disabled={isLoading}
          />
        </div>
        <div className="mb-12">
          <label className="block font-bold text-xs mb-2">Add an option</label>
          {options.map((option, index) => (
            <div
              key={index}
              className="flex items-center space-x-2 mb-2 relative"
            >
              <div className="rounded-[5px] bg-site-primary text-white h-10 w-10 inline-flex justify-center items-center shrink-0 text-sm">
                {index + 1}.
              </div>
              <Input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                className="bg-input-bg grow pr-10"
                disabled={isLoading}
              />
              <input
                type="radio"
                name="correctOption"
                checked={correctOptionId === index}
                onChange={() => setCorrectOptionId(index)}
                disabled={isLoading || courseLang === "es"}
                className="absolute right-10 transform top-1/2 -translate-y-1/2 h-4 w-4 text-site-primary focus:ring-site-primary border-gray-300"
              />
              {courseLang !== "es" && (
                <button
                  className="shrink-0"
                  onClick={() => handleDeleteOption(index)}
                  disabled={isLoading || courseLang === "es"}
                >
                  <Trash className="fill-site-reject" width={16} height={16} />
                </button>
              )}
            </div>
          ))}
          {courseLang !== "es" && (
            <button
              disabled={courseLang === "es"}
              onClick={addOption}
              className="text-site-primary text-sm flex gap-2 items-center"
            >
              <div className="rounded-[5px] bg-site-primary text-white h-10 w-10 inline-flex justify-center items-center shrink-0">
                <Plus size={14} />
              </div>
              <span>Add option</span>
            </button>
          )}
        </div>
        <div className="mb-4">
          <label className="block font-bold text-xs mb-2">Feedback</label>
          <Input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="bg-input-bg"
            disabled={isLoading}
          />
        </div>
        <Button
          onClick={handleAddQuestion}
          className="site-primary-btn w-full"
          disabled={isAddButtonDisabled || isLoading}
        >
          {editMode ? "Update Question" : "Add Question"}
        </Button>
      </div>
      {questions.length > 0 && (
        <div className="w-1/2 rounded-[5px] shadow-card-shadow">
          <ul>
            {questions.map((question, index) => (
              <li
                key={question._id}
                className="flex justify-between items-center gap-8 border-b border-site-general/10 font-medium px-4 py-3 text-sm"
              >
                <span>
                  {index + 1}. {question.title[courseLang]}
                </span>
                <div className="flex items-center gap-5 shrink-0">
                  <button
                    className="text-gray-500"
                    disabled={isLoading}
                    onClick={() => handleEditQuestion(index)}
                  >
                    <Edit
                      className="fill-site-general/50"
                      width={16}
                      height={16}
                    />
                  </button>
                  {courseLang !== "es" && (
                    <button
                      disabled={isLoading || courseLang === "es"}
                      onClick={() =>
                        setQuestions(questions.filter((_, i) => i !== index))
                      }
                    >
                      <Trash
                        width={16}
                        height={16}
                        className="fill-site-reject"
                      />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

Quiz.displayName = "Quiz";
export default Quiz;
