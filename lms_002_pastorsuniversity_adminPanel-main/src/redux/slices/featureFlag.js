import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getFeatures } from "@/services/content/featureFlag";

const initialState = {
    isLoading: true,
    featureFlag: null,
};

export const fetchFeatureFlagAsync = createAsyncThunk(
    "featureFlag/fetchFeatureFlag",
    async () => {
        const res = await getFeatures();
        return res;
    }
);

const featureFlagSlice = createSlice({
    name: "featureFlag",
    initialState,
    reducers: {
        clearFeatureFlag: (state) => {
            state.featureFlag = null;
        },
        setFeatureFlag: (state, action) => {
            state.featureFlag = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchFeatureFlagAsync.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(fetchFeatureFlagAsync.fulfilled, (state, action) => {
                state.isLoading = false;
                state.featureFlag = action.payload.data;
            })
            .addCase(fetchFeatureFlagAsync.rejected, (state) => {
                state.isLoading = false;
            });
    },
});

export const { clearFeatureFlag } = featureFlagSlice.actions;

export const SelectFeatureFlag = (state) => state.featureFlagState.featureFlag;

export default featureFlagSlice.reducer;
