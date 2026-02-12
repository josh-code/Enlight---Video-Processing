import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
    getMembers,
    toggleAdminStatus,
    getMemberById,
    getMemberAndProgressById,
} from "@/services/member";
import {
    getReports,
    getReportById,
    blockUserFromChat,
    unblockUserFromChat,
} from "@/services/issueReports";

const initialState = {
    members: [],
    inactiveMembers: [],
    selectedMember: null,
    isLoading: false,
    isSelectedMemberLoading: false,
    error: null,
    reportsData: {
        reports: [],
        isLoading: false,
        error: null,
        pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit: 10,
            hasNextPage: false,
            hasPrevPage: false,
        },
    },
};

export const fetchMembersAsync = createAsyncThunk(
    "members/fetchInactiveMembers",
    async (query) => {
        const data = await getMembers(query);
        return data;
    }
);

export const toggleAdminStatusAsync = createAsyncThunk(
    "members/toggleAdminStatus",
    async (payload) => {
        const data = await toggleAdminStatus(payload);
        return data;
    }
);

export const getMemberByIdAsync = createAsyncThunk(
    "members/getMemberById",
    async (id) => {
        const data = await getMemberById(id);
        return data;
    }
);

export const getMemberAndProgressByIdAsync = createAsyncThunk(
    "members/getMemberAndProgressById",
    async (id) => {
        const data = await getMemberAndProgressById(id);
        return data;
    }
);

export const getReportsAsync = createAsyncThunk(
    "members/getReports",
    async (query) => {
        const data = await getReports(query);
        return data;
    }
);

export const getReportByIdAsync = createAsyncThunk(
    "members/getReportById",
    async (id) => {
        const data = await getReportById(id);
        return data;
    }
);

export const blockUserFromChatAsync = createAsyncThunk(
    "members/blockUserFromChat",
    async ({ userId, reason, adminNotes }) => {
        return await blockUserFromChat({ userId, reason, adminNotes });
    }
);

export const unblockUserFromChatAsync = createAsyncThunk(
    "members/unblockUserFromChat",
    async (userId) => {
        return await unblockUserFromChat(userId);
    }
);

const memebers = createSlice({
    name: "members",
    initialState,
    reducers: {
        clearMembers: (state) => {
            state.members = [];
        },
        clearSelectedMember: (state) => {
            state.selectedMember = null;
        },
        clearReportsData: (state) => {
            state.reportsData = {
                reports: [],
                isLoading: false,
                error: null,
                selectedReport: null,
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalCount: 0,
                    limit: 20,
                    hasNextPage: false,
                    hasPrevPage: false,
                },
            };
        },
        setSelectedReport: (state, action) => {
            state.reportsData.selectedReport = action.payload;
        },
        clearSelectedReport: (state) => {
            state.reportsData.selectedReport = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMembersAsync.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(fetchMembersAsync.fulfilled, (state, action) => {
                state.isLoading = false;
                state.members = action.payload;
            })
            .addCase(fetchMembersAsync.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.error;
            })
            .addCase(getMemberByIdAsync.pending, (state) => {
                state.isSelectedMemberLoading = true;
            })
            .addCase(getMemberByIdAsync.fulfilled, (state, action) => {
                state.isSelectedMemberLoading = false;
                state.selectedMember = action.payload;
            })
            .addCase(getMemberByIdAsync.rejected, (state, action) => {
                state.isSelectedMemberLoading = false;
                state.error = action.error;
            })
            .addCase(getMemberAndProgressByIdAsync.pending, (state) => {
                state.isSelectedMemberLoading = true;
            })
            .addCase(getMemberAndProgressByIdAsync.fulfilled, (state, action) => {
                state.isSelectedMemberLoading = false;
                state.selectedMember = action.payload;
            })
            .addCase(getMemberAndProgressByIdAsync.rejected, (state, action) => {
                state.isSelectedMemberLoading = false;
                state.error = action.error;
            })
            .addCase(getReportsAsync.pending, (state) => {
                state.reportsData.isLoading = true;
            })
            .addCase(getReportsAsync.fulfilled, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.reports = action.payload.reports;
                state.reportsData.pagination = action.payload.pagination;
            })
            .addCase(getReportsAsync.rejected, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.error = action.error;
            })
            .addCase(getReportByIdAsync.pending, (state) => {
                state.reportsData.isLoading = true;
            })
            .addCase(getReportByIdAsync.fulfilled, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.selectedReport = action.payload;
            })
            .addCase(getReportByIdAsync.rejected, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.error = action.error;
            })
            .addCase(blockUserFromChatAsync.pending, (state) => {
                state.reportsData.isLoading = true;
            })
            .addCase(blockUserFromChatAsync.fulfilled, (state, action) => {
                state.reportsData.isLoading = false;
                // Refresh reports to show updated chat block status
                // This will be handled by the component
            })
            .addCase(blockUserFromChatAsync.rejected, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.error = action.error;
            })
            .addCase(unblockUserFromChatAsync.pending, (state) => {
                state.reportsData.isLoading = true;
            })
            .addCase(unblockUserFromChatAsync.fulfilled, (state, action) => {
                state.reportsData.isLoading = false;
                // Refresh reports to show updated chat block status
                // This will be handled by the component
            })
            .addCase(unblockUserFromChatAsync.rejected, (state, action) => {
                state.reportsData.isLoading = false;
                state.reportsData.error = action.error;
            })
            .addCase(toggleAdminStatusAsync.pending, (state) => {
                state.isSelectedMemberLoading = true;
            })
            .addCase(toggleAdminStatusAsync.fulfilled, (state, action) => {
                state.isSelectedMemberLoading = false;
                // Update the selected member's admin status
                if (state.selectedMember?.user) {
                    state.selectedMember.user.isAdmin = !state.selectedMember.user.isAdmin;
                }
            })
            .addCase(toggleAdminStatusAsync.rejected, (state, action) => {
                state.isSelectedMemberLoading = false;
                state.error = action.error;
            });
    },
});

export const SelectInactiveMembers = (state) =>
    state.memberState.inactiveMembers;
export const SelectMembers = (state) => state.memberState.members;
export const SelectSelectedMember = (state) => state.memberState.selectedMember;
export const SelectIsLoading = (state) => state.memberState.isLoading;
export const SelectIsSelectedMemberLoading = (state) =>
    state.memberState.isSelectedMemberLoading;
export const SelectReportsData = (state) => state.memberState.reportsData;

export const {
    clearMembers,
    clearSelectedMember,
    clearReportsData,
    setSelectedReport,
    clearSelectedReport,
} = memebers.actions;

export default memebers.reducer;
