import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getAppVersions } from "@/services/content/appVersions";

const initialState = {
    appVersions: [],
    isAppVersionsLoading: false,
    appVersionsError: "",
};

export const getAppVersionsAsync = createAsyncThunk(
    "appVersions/getAppVersionsAsync",
    async (query) => {
        const data = await getAppVersions(query);
        return data;
    }
);

const appVersions = createSlice({
    name: "appVersions",
    initialState,
    reducers: {
        clearAppVersions: (state) => {
            state.appVersions = [];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getAppVersionsAsync.pending, (state) => {
                state.isAppVersionsLoading = true;
            })
            .addCase(getAppVersionsAsync.fulfilled, (state, action) => {
                state.isAppVersionsLoading = false;
                state.appVersions = action.payload;
            })
            .addCase(getAppVersionsAsync.rejected, (state, action) => {
                state.isAppVersionsLoading = false;
                state.appVersionsError = action.error.message;
            });
    },
});

export const SelectAppVersions = (state) => state.appVersionsState.appVersions;
export const SelectIsAppVersionsLoading = (state) =>
    state.appVersionsState.isAppVersionsLoading;
export const SelectAppVersionsError = (state) =>
    state.appVersionsState.appVersionsError;

export const { clearAppVersions } = appVersions.actions;

export default appVersions.reducer;
