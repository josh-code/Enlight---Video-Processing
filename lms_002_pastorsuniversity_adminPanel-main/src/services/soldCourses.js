import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/purchase";

export async function getSoldCourses(query) {
    try {
        const url = buildUrlWithParams(`${apiEndpoint}/getSoldCourses`, query);
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
