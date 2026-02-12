import { configureStore } from "@reduxjs/toolkit";
import * as reducers from "@/redux/slices";
import { createLogger } from "redux-logger";

const store = configureStore({
    reducer: {
        memberState: reducers.member,
        courseState: reducers.course,
        userState: reducers.user,
        soldCoursesState: reducers.soldCourses,
        appVersionsState: reducers.appVersions,
        featureFlagState: reducers.featureFlag
    },

    devTools: import.meta.env.VITE_REDUX_LOGGER === "yes",
    middleware: (getDefaultMiddleware) =>
        import.meta.env.VITE_REDUX_LOGGER === "yes"
            ? getDefaultMiddleware().concat(createLogger())
            : getDefaultMiddleware().concat([]),
});

export default store;
