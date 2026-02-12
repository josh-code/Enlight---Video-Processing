import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/content/statics";

export async function currentlyWatchingStats() {
    try {
        const { data } = await http.get(`${apiEndpoint}/currentlyWatchingStats`);

        return data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getAppLaunchData(query) {
    let url = apiEndpoint + "/getAppLaunchStats";
    url = buildUrlWithParams(url, query);
    try {
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

export async function getTimeSpentStats(query) {
    let url = apiEndpoint + "/getTimeSpentStats";
    url = buildUrlWithParams(url, query);
    try {
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

export async function getCurrentlyWatchingStats(query) {
    try {
        const url = buildUrlWithParams(
            `${apiEndpoint}/currentlyWatchingStats`,
            query
        );

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

export async function getMostEngageUsersData(query) {
    try {
        const url = buildUrlWithParams(
            `${apiEndpoint}/getMostEngagedPeople`,
            query
        );
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
