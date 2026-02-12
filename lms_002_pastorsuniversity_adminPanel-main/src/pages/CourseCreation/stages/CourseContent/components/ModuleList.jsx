import { useRef, useState } from "react";

// Icon
import { ChevronDown, Menu } from "lucide-react";
import { Edit, Trash } from "@/assets/icons";

// Utils
import { cn, getTranslation } from "@/lib/utils";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
  SelectSelectedCourse,
  getCourseModulesAsync,
} from "@/redux/slices/course";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Services
import { updateModuleOrder, deleteModuleById } from "@/services/content/module";
import {
  updateSessionOrder,
  deleteSessionById,
} from "@/services/content/session";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/shadcn/ui/accordion";

// Custom
import { ConfirmationDialog } from "@/components/misc/ConfirmationDialog";

export default function ModuleList({
  modules,
  setEditionModuleId,
  setIsAddModuleOpen,
  setEditingSessionId,
  setIsAddSessionOpen,
}) {
  const selectedCourse = useSelector(SelectSelectedCourse);
  const courseLang = useSelector(SelectCourseEditingLanguage);

  const dispatch = useDispatch();
  const [openModuleIds, setOpenModuleIds] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const lessonListsRefs = useRef({});

  const handleModuleSortEnd = async (newModuleOrder) => {
    if (!selectedCourse) return;
    const moduleOrder = newModuleOrder.map((module) => module._id);
    try {
      await updateModuleOrder({ courseId: selectedCourse._id, moduleOrder });
      toast.success("Module order updated successfully", {
        description: "The module order has been updated successfully.",
      });
      dispatch(getCourseModulesAsync({ courseId: selectedCourse?._id }));
    } catch (error) {
      console.error("Error updating module order", error);
      toast.error("Failed to update module order");
    }
  };

  const handleLessonSortEnd = async (
    newLessonOrder,
    fromModuleId,
    toModuleId,
    movedSessionId
  ) => {
    if (!selectedCourse) return;
    try {
      await updateSessionOrder({
        courseId: selectedCourse._id,
        fromModuleId,
        toModuleId,
        fromSessionOrder: newLessonOrder.fromSessions.map(
          (lesson) => lesson._id
        ),
        toSessionOrder: newLessonOrder.toSessions.map((lesson) => lesson._id),
        movedSessionId,
      });
      toast.success("Lesson order updated successfully", {
        description: "The lesson order has been updated successfully.",
      });
      dispatch(getCourseModulesAsync({ courseId: selectedCourse?._id }));
    } catch (error) {
      console.error("Error updating lesson order", error);
      toast.error("Failed to update lesson order");
    }
  };

  const handleModuleDeletion = async ({ moduleId, courseId }) => {
    if (!moduleId || !courseId) return;
    try {
      await deleteModuleById({ moduleId, courseId });
      dispatch(getCourseModulesAsync({ courseId: selectedCourse?._id }));
      toast.success("Module deleted successfully", {
        description: "The module has been deleted successfully.",
      });
    } catch (error) {
      console.log(error);
      toast.error("Failed to delete module");
    }
  };

  const handleSessionDeletion = async ({ sessionId, moduleId, courseId }) => {
    if (!sessionId || !moduleId || !courseId) return;
    try {
      await deleteSessionById({ sessionId, moduleId, courseId });
      dispatch(getCourseModulesAsync({ courseId: selectedCourse?._id }));
      toast.success("Session deleted successfully", {
        description: "The session has been deleted successfully.",
      });
    } catch (error) {
      console.log(error);
      toast.error("Failed to delete session");
    }
  };

  const handleDragStart = (event, item) => {
    event.dataTransfer.effectAllowed = "move";
    setDraggedItem(item);
  };

  const handleDragOver = (event, targetModuleId) => {
    event.preventDefault();

    if (!draggedItem) {
      return;
    }

    const { type, module } = draggedItem;

    if (type === "session" && module._id !== targetModuleId) {
      setOpenModuleIds((prev) => {
        if (!prev.includes(targetModuleId)) {
          const newOpenModuleIds = [...prev, targetModuleId];
          return newOpenModuleIds;
        }
        return prev;
      });
    }
  };

  const handleDrop = (event, targetModuleId, targetIndex = null) => {
    event.stopPropagation();
    if (!draggedItem) return;

    const { type, module, session } = draggedItem;

    if (type === "module") {
      const newOrder = [...modules];
      const oldIndex = newOrder.findIndex((m) => m._id === module._id);
      newOrder.splice(oldIndex, 1);
      newOrder.splice(targetIndex, 0, module);
      handleModuleSortEnd(newOrder);
    } else if (type === "session") {
      const fromModule = modules.find((m) => m._id === module._id);
      const toModule = modules.find((m) => m._id === targetModuleId);
      if (!fromModule || !toModule) return;

      const fromSessions = [...fromModule.sessions];
      const toSessions =
        fromModule._id === toModule._id ? fromSessions : [...toModule.sessions];
      const oldIndex = fromSessions.findIndex((s) => s._id === session._id);
      fromSessions.splice(oldIndex, 1);
      toSessions.splice(targetIndex, 0, session);

      handleLessonSortEnd(
        { fromSessions, toSessions },
        fromModule._id,
        toModule._id,
        session._id
      );
    }

    setDraggedItem(null);
  };

  return (
    <div className="px-9 pb-9">
      <h6 className="font-bold text-sm pb-5">Modules</h6>
      <Accordion
        id="module-list"
        type="multiple"
        collapsible
        value={openModuleIds}
        className="w-full space-y-6"
        onValueChange={(value) => setOpenModuleIds(value)}
      >
        {modules.map((module, moduleIndex) => (
          <AccordionItem
            key={module._id}
            value={module._id}
            className="bg-white shadow-card-shadow rounded"
            onDragOver={(event) => handleDragOver(event, module._id)}
            onDrop={(event) => handleDrop(event, module._id)}
          >
            <AccordionTrigger
              removeIcon={true}
              className="flex justify-between h-16 items-center p-3 hover:no-underline data-[state=open]:border-b border-site-general/30"
            >
              <div
                className="flex items-center"
                draggable
                onDragStart={(event) =>
                  handleDragStart(event, { type: "module", module })
                }
              >
                <Menu
                  size={18}
                  className="module-drag-handle mr-4 cursor-move fill-site-general/50"
                />
                <span className="text-sm font-medium text-black">
                  {getTranslation(module.name, courseLang)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-8 pr-9">
                {courseLang !== "es" && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAddSessionOpen(true);
                      setEditionModuleId(module._id);
                      setEditingSessionId(null);
                    }}
                    className={cn("site-primary-btn text-xs h-full")}
                  >
                    + Add a session
                  </Button>
                )}

                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditionModuleId(module._id);
                      setIsAddModuleOpen(true);
                    }}
                  >
                    <Edit
                      width={18}
                      height={18}
                      className="fill-site-general/50"
                    />
                  </button>
                  {courseLang !== "es" && (
                    <ConfirmationDialog
                      title="Confirm Deletion"
                      description="Are you sure you want to delete this module?"
                      onConfirm={(e) => {
                        e.stopPropagation();
                        handleModuleDeletion({
                          moduleId: module._id,
                          courseId: selectedCourse?._id,
                        });
                      }}
                      onCancel={(e) => {
                        console.log("Deletion cancelled");
                      }}
                      trigger={
                        <button>
                          <Trash
                            width={18}
                            height={18}
                            className="fill-site-reject"
                          />
                        </button>
                      }
                    />
                  )}
                </div>
                <ChevronDown
                  size={18}
                  className={cn(
                    "text-site-primary transition-all duration-300"
                  )}
                />
              </div>
            </AccordionTrigger>
            <AccordionContent className="py-6 px-8">
              <div
                className="space-y-6"
                id={`lesson-list-${module._id}`}
                ref={(el) => (lessonListsRefs.current[module._id] = el)}
                data-module-id={module._id}
              >
                {module.sessions.length > 0 ? (
                  module.sessions.map((lesson, sessionIndex) => (
                    <div
                      key={lesson.id}
                      className="shadow-card-shadow bg-[#F7F8FA] h-14 py-2 pl-3 pr-6 rounded flex justify-between items-center"
                      draggable
                      onDragStart={(event) =>
                        handleDragStart(event, {
                          type: "session",
                          module,
                          session: lesson,
                        })
                      }
                      onDragOver={handleDragOver}
                      onDrop={(event) =>
                        handleDrop(event, module._id, sessionIndex)
                      }
                    >
                      <div className="flex items-center">
                        <Menu
                          size={18}
                          className="lesson-drag-handle mr-4 cursor-move fill-site-general/50"
                        />
                        <div>
                          <h6 className="font-bold">
                            {getTranslation(lesson.name, courseLang)}
                          </h6>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAddSessionOpen(true);
                            setEditingSessionId(lesson._id);
                            setEditionModuleId(module._id);
                          }}
                        >
                          <Edit
                            width={18}
                            height={18}
                            className="fill-site-general/50"
                          />
                        </button>
                        {courseLang !== "es" && (
                          <ConfirmationDialog
                            title="Confirm Deletion"
                            description="Are you sure you want to delete this session?"
                            onConfirm={() =>
                              handleSessionDeletion({
                                courseId: selectedCourse?._id,
                                moduleId: module._id,
                                sessionId: lesson._id,
                              })
                            }
                            onCancel={() => console.log("Deletion cancelled")}
                            trigger={
                              <button>
                                <Trash
                                  width={18}
                                  height={18}
                                  className="fill-site-reject"
                                />
                              </button>
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center w-full border rounded-[5px] h-44 shadow-card-shadow flex justify-center items-center">
                    No lessons added
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
