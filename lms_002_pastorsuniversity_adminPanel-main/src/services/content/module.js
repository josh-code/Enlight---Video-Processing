import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/content/modules";

export async function createModule(data) {
    try {
        const res = await http.post(`${apiEndpoint}/createModule`, data);
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getCourseModules({ courseId }) {
    try {
        const res = await http.get(
            buildUrlWithParams(`${apiEndpoint}/getModules`, {
                courseId,
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

export async function updateModuleOrder({ courseId, moduleOrder }) {
    try {
        const res = await http.post(`${apiEndpoint}/updateModuleOrder`, {
            courseId,
            moduleOrder,
        });
        return res.data;
    } catch (err) {
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}

export async function getModuleById({ moduleId }) {
    try {
        const res = await http.get(
            buildUrlWithParams(`${apiEndpoint}/getModuleById`, {
                moduleId,
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

export async function deleteModuleById({ moduleId, courseId }) {
    try {
        const res = await http.delete(
            buildUrlWithParams(`${apiEndpoint}/deleteModuleById`, {
                moduleId,
                courseId,
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

export async function updateModule({ moduleId, moduleName, courseId }) {
    try {
        const res = await http.put(`${apiEndpoint}/updateModuleById`, {
            moduleId,
            moduleName,
            courseId,
        });
        return res.data;
    } catch (err) {
        console.log(err);
        let error = err.response.data
            ? err.response.data
            : "Error occurred. Please try again later.";
        throw new Error(error);
    }
}
