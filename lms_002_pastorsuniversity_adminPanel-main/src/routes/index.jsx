import { useEffect, useState } from "react";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";

// Container
import App from "@/container/App";
import DevContainer from "@/container/Dev";

// Pages
import Overview from "@/pages/Overview";
import CourseManagement from "@/pages/CourseManagement";
import CourseCreation from "@/pages/CourseCreation";
import Login from "@/pages/Login";
import Supports from "@/pages/Supports";
import Reports from "@/pages/Reports";
import Members from "@/pages/Members";
import ForgotPassword from "@/pages/ForgotPassword";
import SoldCourses from "@/pages/SoldCourses";
import AppVersions from "@/pages/AppVersions";
import DevCoursesManage from "@/pages/DevCoursesManage";
import CourseSessions from "@/pages/DevCoursesManage/CourseSessions";
import FeatureFlag from "@/pages/FeatureFlag";

// Components
import Loader from "@/components/Loader";
import AlertDialogComponent from "@/components/misc/AlertDialog";
import DevCoursesLayout from "@/components/layout/DevCoursesLayout";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    getCurrentUserAsync,
    SelectUser,
    SelectIsSessionExpired,
} from "@/redux/slices/user";

// Returns boolean based on value received
const isUserLoggedIn = () => {
    return !!localStorage.getItem("token");
};

const ProtectedRoute = ({ children, check, to = "/" }) => {
    if (check) return children;
    return <Navigate to={to} />;
};

export default function AppRoutes() {
    const [appReady, setAppReady] = useState(false);

    const { pathname } = useLocation();
    const pathArray = pathname.split("/").filter(Boolean);

    const formatPath = (path) => {
        return path
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    const dispatch = useDispatch();

    const isSessionExpired = useSelector(SelectIsSessionExpired);
    const user = useSelector(SelectUser);

    useEffect(() => {
        if (isSessionExpired) {
            localStorage.clear();
        }
    }, [isSessionExpired]);

    useEffect(() => {
        const initializeApp = async () => {
            if (isUserLoggedIn()) {
                await dispatch(getCurrentUserAsync());
            }
            setAppReady(true);
        };

        initializeApp();
    }, [dispatch]);

    useEffect(() => {
        const baseTitle = "Pastor University Admin Dashboard";
        const formattedPath = pathArray.map(formatPath).reverse().join(" - ");
        document.title = pathArray.length
            ? `${formattedPath} | ${baseTitle}`
            : baseTitle;
    }, [pathname, pathArray]);

    if (!appReady) {
        return (
            <div className="min-h-screen flex justify-center items-center">
                <Loader />
            </div>
        );
    }

    return (
        <>
            <Routes>
                <Route
                    path="login"
                    element={
                        <ProtectedRoute check={!isUserLoggedIn()} to="/">
                            <Login />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="forgot-password"
                    element={
                        <ProtectedRoute check={!isUserLoggedIn()} to="/">
                            <ForgotPassword />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/"
                    element={
                        <ProtectedRoute check={isUserLoggedIn()} to="login">
                            <App />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Overview />} />
                    <Route path="course-management">
                        <Route index element={<CourseManagement />} />
                        <Route path="course-creation" element={<CourseCreation />} />
                        <Route path="update-course" element={<CourseCreation />} />
                    </Route>
                    <Route path="members-management" element={<Members />} />
                    <Route path="transactions" element={<SoldCourses />} />
                    <Route path="reports-and-analytics" element={<Reports />} />
                    <Route path="help" element={<Supports />} />
                </Route>

                <Route
                    path="dev"
                    element={
                        <ProtectedRoute check={isUserLoggedIn() && user?.isDev} to="/">
                            <DevContainer />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Navigate to="app-versions" replace />} />
                    <Route path="app-versions" element={<AppVersions />} />
                    <Route path="dev-courses-manage" element={<DevCoursesLayout />}>
                        <Route index element={<DevCoursesManage />} />
                        <Route path=":courseId" element={<CourseSessions />} />
                    </Route>
                    <Route path="features" element={<FeatureFlag />} />
                </Route>
            </Routes>
            <AlertDialogComponent
                heading="Session Expired"
                description="Your session has expired. Please login again."
                isDialogOpen={isSessionExpired}
                hideCancelButton={true}
                confirmAction={() => {
                    window.location.href = "/login";
                }}
                confirmText="Login"
            />
        </>
    );
}
