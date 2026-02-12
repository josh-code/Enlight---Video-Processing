import { createSlice } from "@reduxjs/toolkit";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { getSoldCourses } from "@/services/soldCourses";

const initialState = {
    soldCourses: [],
    selectedSoldCourses: null,
    isLoading: false,
    error: null,
    totalSoldCourses: 0,
};

export const fetchSoldCoursesAsync = createAsyncThunk(
    "soldCourses/getSoldCourses",
    async (query) => {
        const data = await getSoldCourses(query);
        return data;
    }
);

const soldCourses = createSlice({
    name: "soldCourses",
    initialState,
    reducers: {
        clearSoldCourses: (state) => {
            state.soldCourses = [];
            state.totalSoldCourses = 0;
        },
        clearError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSoldCoursesAsync.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(fetchSoldCoursesAsync.fulfilled, (state, action) => {
                state.isLoading = false;
                state.soldCourses = action.payload.courses;
                state.totalSoldCourses = action.payload.totalCount;
            })
            .addCase(fetchSoldCoursesAsync.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.error.message;
            });
    },
});

export const SelectSoldCourses = (state) => state.soldCoursesState.soldCourses;
export const SelectIsLoading = (state) => state.soldCoursesState.isLoading;
export const SelectError = (state) => state.soldCoursesState.error;
export const SelectTotalSoldCourses = (state) =>
    state.soldCoursesState.totalSoldCourses;
export const SelectSelectedSoldCourses = (state) =>
    state.soldCoursesState.selectedSoldCourses;

export const { clearSoldCourses, clearError } = soldCourses.actions;

export default soldCourses.reducer;
