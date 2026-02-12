import { getCurrentUser } from "@/services/authServie";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const initialState = {
    user: null,
    isLoading: false,
    error: null,
    isSessionExpired: false,
    courseEditingLanguage: "en",
};

export const getCurrentUserAsync = createAsyncThunk(
    "user/getCurrentUser",
    async () => {
        try {
            const response = await getCurrentUser();
            return response;
        } catch (error) {
            throw new Error(error.response.data.message);
        }
    }
);

const user = createSlice({
    name: "user",
    initialState,
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
        clearUser: (state) => {
            state.user = null;
        },
        setSessionExpired: (state, action) => {
            state.isSessionExpired = action.payload;
        },
        setCourseEditingLanguage: (state, action) => {
            state.courseEditingLanguage = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getCurrentUserAsync.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(getCurrentUserAsync.fulfilled, (state, action) => {
                state.isLoading = false;
                state.user = action.payload;
            })
            .addCase(getCurrentUserAsync.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.error.message;
            });
    },
});

export const SelectUser = (state) => state.userState.user;
export const SelectIsFetching = (state) => state.userState.isLoading;
export const SelectError = (state) => state.userState.error;
export const SelectIsSessionExpired = (state) =>
    state.userState.isSessionExpired;
export const SelectCourseEditingLanguage = (state) =>
    state.userState.courseEditingLanguage;

export const {
    clearError,
    clearUser,
    setSessionExpired,
    setCourseEditingLanguage,
} = user.actions;

export default user.reducer;
