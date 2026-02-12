import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/content/session";

export async function createSession(data) {
    try {
        const res = await http.post(`${apiEndpoint}`, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function updateQuiz(data) {
    try {
        const res = await http.put(`${apiEndpoint}/updateQuiz`, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function updateSessionOrder(data) {
    try {
        const res = await http.put(`${apiEndpoint}/updateSessionOrder`, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getSessioForNonModularCourse({ courseId }) {
    try {
        const res = await http.get(
            buildUrlWithParams(`${apiEndpoint}`, { courseId })
        );
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getSessionById({ sessionId, moduleId, courseId }) {
    try {
        const res = await http.get(
            buildUrlWithParams(`${apiEndpoint}/getSession`, {
                courseId,
                moduleId,
                sessionId,
            })
        );
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function deleteSessionById({ sessionId, moduleId, courseId }) {
    try {
        const res = await http.delete(
            buildUrlWithParams(`${apiEndpoint}/deleteSessionById`, {
                courseId,
                moduleId,
                sessionId,
            })
        );
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function updateSessionVideo(payload) {
    try {
        const res = await http.patch(
            `${apiEndpoint}/updateSessionLessons`,
            payload
        );
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}
