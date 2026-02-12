import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/reports";

export async function getReports(query) {
    try {
        const url = buildUrlWithParams(`${apiEndpoint}/getAllReports`, query);
        const { data } = await http.get(url);
        return data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getReportById(id) {
    try {
        const { data } = await http.get(`${apiEndpoint}/getReport/${id}`);
        return data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function blockUserFromChat({ userId, reason, adminNotes }) {
    try {
        console.log("Service: blockUserFromChat called with:", { userId, reason, adminNotes });
        const { data } = await http.post(`${apiEndpoint}/blockUserFromChat/${userId}`, {
            reason,
            adminNotes,
        });
        console.log("Service: blockUserFromChat success:", data);
        return data;
    } catch (err) {
        console.error("Service: blockUserFromChat error:", err);
        let error = err.response?.data?.message || "Failed to block user from chat";
        throw new Error(error);
    }
}

export async function unblockUserFromChat(userId) {
    try {
        console.log("Service: unblockUserFromChat called with:", userId);
        const { data } = await http.post(`${apiEndpoint}/unblockUserFromChat/${userId}`);
        console.log("Service: unblockUserFromChat success:", data);
        return data;
    } catch (err) {
        console.error("Service: unblockUserFromChat error:", err);
        let error = err.response?.data?.message || "Failed to unblock user from chat";
        throw new Error(error);
    }
}
