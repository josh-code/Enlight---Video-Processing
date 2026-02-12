import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/member";
const tokenKey = "token";

http.setJwt(localStorage.getItem(tokenKey));

export async function getMembers(query) {
    let url = apiEndpoint + "/getMembers";
    url = buildUrlWithParams(url, query);
    try {
        const res = await http.get(url);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function toggleAdminStatus(data) {
    const url = `${apiEndpoint}/toggleAdmin`;

    try {
        const res = await http.put(url, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getMemberById(id) {
    const url = `${apiEndpoint}/${id}`;
    try {
        const res = await http.get(url);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getMemberAndProgressById(id) {
    const url = `${apiEndpoint}/getMemberDetails/${id}`;
    try {
        const res = await http.get(url);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function updateMember({ userId, data }) {
    const url = `${apiEndpoint}/${userId}`;
    try {
        const res = await http.put(url, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function authorizeUsers({ usersIds, enable }) {
    let url = `${apiEndpoint}/authorize`;
    url = buildUrlWithParams(url, { enable });
    try {
        const res = await http.put(url, { users: usersIds });
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getUserStreakList({ userId }) {
    try {
        const url = buildUrlWithParams(`/app/user/getUserStreaksDates`, {
            userId,
        });
        const { data } = await http.get(url);
        return data;
    } catch (error) {
        return { error };
    }
}
