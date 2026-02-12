import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

// Services
import {
  getCourses,
  getCourseById,
  getCourseCustomPricing,
  updateCustomPricing,
  deleteCustomPricing,
} from "@/services/content/course";
import { getCourseModules } from "@/services/content/module";
import { getSessioForNonModularCourse } from "@/services/content/session";

const initialState = {
  courses: [],
  isCourseLoading: false,
  selectedCourse: null,
  selectedCourseModules: [],
  selectedCourseSessions: [],
  allDraftCourses: [],
  isLoading: false,
  error: null,
  selectedSession: null,
  coursePricesData: {
    baseUSDPrice: 0,
    coursePrices: [],
    totalCountries: 0,
    customPricingCount: 0,
    fallbackCountriesCount: 0,
    pppCountriesCount: 0,
    isLoading: false,
    error: null,
  },
};

export const getPublishedCoursesAsync = createAsyncThunk(
  "course/getPublishedCoursesAsync",
  async (query) => {
    const data = await getCourses(query);
    return data;
  }
);

export const getCourseByIdAsync = createAsyncThunk(
  "course/getCourseById",
  async (courseId) => {
    const data = await getCourseById(courseId);
    return data;
  }
);

export const getCourseModulesAsync = createAsyncThunk(
  "course/getCourseModules",
  async ({ courseId }) => {
    const data = await getCourseModules({ courseId });
    return data;
  }
);

export const getSessioForNonModularCourseAsync = createAsyncThunk(
  "course/getSessioForNonModularCourse",
  async ({ courseId }) => {
    const data = await getSessioForNonModularCourse({ courseId });
    return data;
  }
);

export const getDraftCoursesAsync = createAsyncThunk(
  "course/getCourses",
  async (query) => {
    const data = await getCourses(query);
    return data;
  }
);

export const getCourseCustomPricingAsync = createAsyncThunk(
  "course/getCourseCustomPricing",
  async ({ courseId }) => {
    const data = await getCourseCustomPricing({ courseId });
    return data;
  }
);

export const updateCustomPricingAsync = createAsyncThunk(
  "course/updateCustomPricing",
  async ({ courseId, countryCode, customPrice }) => {
    const data = await updateCustomPricing({
      courseId,
      countryCode,
      customPrice,
    });
    return data;
  }
);

export const deleteCustomPricingAsync = createAsyncThunk(
  "course/deleteCustomPricing",
  async ({ courseId, countryCode }) => {
    const data = await deleteCustomPricing({ courseId, countryCode });
    return data;
  }
);

const course = createSlice({
  name: "course",
  initialState,
  reducers: {
    setSelectedCourse: (state, action) => {
      state.selectedCourse = action.payload;
    },
    clearSelectedCourse: (state) => {
      state.selectedCourse = null;
      state.selectedCourseModules = [];
      state.selectedCourseSessions = [];
    },
    clearDraftCourses: (state) => {
      state.allDraftCourses = [];
    },
    clearCourses: (state) => {
      state.courses = [];
    },
    clearError: (state) => {
      state.error = null;
    },
    setSelectedSession: (state, action) => {
      state.selectedSession = action.payload;
    },
    clearSelectedSession: (state) => {
      state.selectedSession = null;
    },
    clearSelectedCourseModules: (state) => {
      state.selectedCourseModules = [];
    },
    clearSelectedCourseSessions: (state) => {
      state.selectedCourseSessions = [];
    },
    clearCoursePricesData: (state) => {
      state.coursePricesData = initialState.coursePricesData;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getPublishedCoursesAsync.pending, (state) => {
        state.isCourseLoading = true;
      })
      .addCase(getPublishedCoursesAsync.fulfilled, (state, action) => {
        state.courses = action.payload;
        state.isCourseLoading = false;
      })
      .addCase(getPublishedCoursesAsync.rejected, (state, action) => {
        state.isCourseLoading = false;
        state.error = action.error.message;
      })
      .addCase(getCourseByIdAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getCourseByIdAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedCourse = action.payload;
      })
      .addCase(getCourseByIdAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      })
      .addCase(getCourseModulesAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getCourseModulesAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedCourseModules = action.payload;
      })
      .addCase(getCourseModulesAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      })
      .addCase(getSessioForNonModularCourseAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getSessioForNonModularCourseAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedCourseSessions = action.payload;
      })
      .addCase(getSessioForNonModularCourseAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      })
      .addCase(getDraftCoursesAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getDraftCoursesAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.allDraftCourses = action.payload;
      })
      .addCase(getDraftCoursesAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message;
      })
      .addCase(getCourseCustomPricingAsync.pending, (state) => {
        state.coursePricesData.isLoading = true;
      })
      .addCase(getCourseCustomPricingAsync.fulfilled, (state, action) => {
        state.coursePricesData.baseUSDPrice = action.payload?.baseUSDPrice || 0;
        state.coursePricesData.coursePrices =
          action.payload?.countryPrices || [];
        state.coursePricesData.totalCountries =
          action.payload?.totalCountries || 0;
        state.coursePricesData.customPricingCount =
          action.payload?.customPricingCount || 0;
        state.coursePricesData.fallbackCountriesCount =
          action.payload?.fallbackCountriesCount || 0;
        state.coursePricesData.pppCountriesCount =
          action.payload?.pppCountriesCount || 0;
        state.coursePricesData.isLoading = false;
      })
      .addCase(getCourseCustomPricingAsync.rejected, (state, action) => {
        state.coursePricesData.isLoading = false;
        state.coursePricesData.error =
          action.error?.message || "Error fetching course prices";
      })
      .addCase(updateCustomPricingAsync.fulfilled, (state, action) => {
        // Refresh the course prices data after successful update
        // This will trigger a refetch of the pricing data
      })
      .addCase(updateCustomPricingAsync.rejected, (state, action) => {
        state.coursePricesData.error =
          action.error?.message || "Error updating custom pricing";
      })
      .addCase(deleteCustomPricingAsync.fulfilled, (state, action) => {
        // Refresh the course prices data after successful deletion
        // This will trigger a refetch of the pricing data
      })
      .addCase(deleteCustomPricingAsync.rejected, (state, action) => {
        state.coursePricesData.error =
          action.error?.message || "Error deleting custom pricing";
      });
  },
});

export const SelectCourses = (state) => state.courseState.courses;
export const SelectIsLoading = (state) => state.courseState.isLoading;
export const SelectIsCourseLoading = (state) => state.courseState.isCourseLoading;
export const SelectError = (state) => state.courseState.error;
export const SelectSelectedCourse = (state) => state.courseState.selectedCourse;
export const SelectSelectedCourseModules = (state) =>
  state.courseState.selectedCourseModules;
export const SelectSelectedCourseSessions = (state) =>
  state.courseState.selectedCourseSessions;
export const SelectDraftCourses = (state) => state.courseState.allDraftCourses;
export const SelectSelectedSession = (state) =>
  state.courseState.selectedSession;
export const SelectCoursePricesData = (state) =>
  state.courseState.coursePricesData;

export const {
  setSelectedCourse,
  clearSelectedCourse,
  clearDraftCourses,
  clearCourses,
  clearError,
  setSelectedSession,
  clearSelectedSession,
  clearSelectedCourseModules,
  clearSelectedCourseSessions,
  clearCoursePricesData,
} = course.actions;

export default course.reducer;
