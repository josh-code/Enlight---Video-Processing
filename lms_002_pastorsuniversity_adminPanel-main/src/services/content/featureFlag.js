import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/content/feature";

export async function addFeature(payload = {}) {
    const url = `${apiEndpoint}/add-feature`;

    const { data } = await http.post(url, payload);
    return data;
}

export async function deleteFeature(payload) {
    const url = `${apiEndpoint}/delete-feature`;
    const { data } = await http.delete(url, { data: payload });
    return data;
}

export async function getFeatures(query = {}) {
    const url = buildUrlWithParams(`${apiEndpoint}/get-feature`, query);

    const { data } = await http.get(url);
    return data;
}

export async function updateFeature(payload) {
    console.log("Updating Feature:", payload);
    const url = `${apiEndpoint}/update-feature`;

    const { data } = await http.patch(url, payload);
    return data;
}
