import { Outlet, useMatch } from "react-router-dom";

// Constant
import { APP_LANGUAGES } from "@/lib/constant";

// Utils
import { cn } from "@/lib/utils";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    SelectCourseEditingLanguage,
    setCourseEditingLanguage,
} from "@/redux/slices/user";

export default function DevCoursesLayout() {
    const courseLang = useSelector(SelectCourseEditingLanguage);

    const dispatch = useDispatch();

    const courseSessionMatch = useMatch("/dev/dev-courses-manage/:courseId");
    const title = courseSessionMatch
        ? "Manage Course Sessions"
        : "Manage Courses";

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

    return (
        <section>
            <div className="pt-2 pb-11">
                <div className="flex items-center justify-between">
                    <h4 className="text-3xl font-bold tracking-tight">{title}</h4>
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
                </div>
            </div>
            <Outlet />
        </section>
    );
}
