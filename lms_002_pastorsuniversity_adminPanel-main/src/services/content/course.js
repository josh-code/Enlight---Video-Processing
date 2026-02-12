import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const apiEndpoint = "admin/content/course";

export async function getCourses(query) {
  const url = buildUrlWithParams(`${apiEndpoint}/getCourses`, query);
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

export async function updateCourseOrder({ semesterId, courseOrder }) {
  try {
    const res = await http.post(`${apiEndpoint}/updateCourseOrder`, {
      semesterId,
      courseOrder,
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

export async function createCourse(data) {
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

export async function changeCourseStructure({ courseId, isModular }) {
  try {
    const res = await http.put(`${apiEndpoint}/changeCourseStructure`, {
      courseId,
      isModular,
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

export async function getCourseById(id) {
  try {
    const res = await http.get(`${apiEndpoint}/${id}`);
    return res.data;
  } catch (err) {
    console.log(err);
    let error = err.response.data
      ? err.response.data
      : "Error occurred. Please try again later.";
    throw new Error(error);
  }
}

export async function toggleDraftStatus({ courseId, isDraft }) {
  try {
    const res = await http.put(`${apiEndpoint}/toggleDraftStatus`, {
      courseId,
      isDraft,
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

export async function deleteCourseById({ courseId }) {
  try {
    const res = await http.delete(`${apiEndpoint}/${courseId}`);
    return res.data;
  } catch (err) {
    console.log(err);
    let error = err.response.data
      ? err.response.data
      : "Error occurred. Please try again later.";
    throw new Error(error);
  }
}


export async function getCourseCustomPricing({ courseId }) {
  try {
    const res = await http.get(`${apiEndpoint}/${courseId}/prices`);
    return res.data;
  } catch (err) {
    console.log(err);
    let error = err.response.data
      ? err.response.data
      : "Error occurred. Please try again later.";
    throw new Error(error);
  }
}

export async function updateCustomPricing({ courseId, countryCode, customPrice }) {
  try {
    const res = await http.post(`${apiEndpoint}/${courseId}/prices`, {
      countryCode,
      customPrice,
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

export async function deleteCustomPricing({ courseId, countryCode }) {
  try {
    const res = await http.delete(`${apiEndpoint}/${courseId}/prices/${countryCode}`);
    return res.data;
  } catch (err) {
    console.log(err);
    let error = err.response.data
      ? err.response.data
      : "Error occurred. Please try again later.";
    throw new Error(error);
  }
}