import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "/admin/content/app-version";

export async function getAppVersions(query = {}) {
    const url = buildUrlWithParams(`${apiEndpoint}/all`, query);

    const { data } = await http.get(url);
    return data;
}

export async function addAppVersion(payload) {
    const url = `${apiEndpoint}/add-app`;

    const { data } = await http.post(url, payload);
    return data;
}

export async function chageVersionStatus(payload) {
    const url = `${apiEndpoint}/change-status`;

    const { data } = await http.put(url, payload);
    return data;
}
