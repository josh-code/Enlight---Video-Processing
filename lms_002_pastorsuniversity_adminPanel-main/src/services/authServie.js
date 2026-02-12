import http from "@/services/httpServices";

const apiEndpoint = "admin/auth";

export async function login({ email, password }) {
    try {
        const url = `${apiEndpoint}/login`;
        const { data } = await http.post(url, { email, password });
        localStorage.setItem("token", data);
        return data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export function logOut() {
    localStorage.removeItem("token");
    location.reload();
}

export async function getCurrentUser() {
    try {
        const url = `${apiEndpoint}/verify-admin`;
        const { data } = await http.get(url);
        return data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function forgotPassword(data) {
    try {
        const res = await http.post(`${apiEndpoint}/forgotPassword`, data);
        return res.data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function verifyOtp(data) {
    try {
        const res = await http.post(`${apiEndpoint}/verifyOtp`, data);
        return res.data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function resetPassword(data) {
    try {
        const res = await http.post(`${apiEndpoint}/resetPassword`, data);
        return res.data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}
