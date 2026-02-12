import http from "@/services/httpServices";
import { buildUrlWithParams } from "@/lib/utils";

const tokenKey = "token";

const apiEndpoint = "admin/content/aws";

http.setJwt(localStorage.getItem(tokenKey));

const getSignedUrl = async (fileName, folderName) => {
  let url = `${apiEndpoint}/uploadUrl/${fileName}`;

  url = buildUrlWithParams(url, {
    folderName,
  });

  try {
    const res = await http.get(url);
    return res.data;
  } catch (err) {
    throw new Error(err.message);
  }
};

const compressVideo = async (object) => {
  const url = `${apiEndpoint}/compressVideo`;
  try {
    const res = await http.post(url, object);
    return res.data;
  } catch (err) {
    console.log(err);
    throw new Error(err.message);
  }
};

const getJobUpdate = async (jobId, key) => {
  const url = `${apiEndpoint}/getJobUpdate`;
  try {
    const res = await http.post(url, { jobId, key });
    return res.data;
  } catch (err) {
    throw new Error(err.message);
  }
};

const deleteObject = async (fileName) => {
  const url = `${apiEndpoint}/deleteFile`;
  try {
    const res = await http.put(url, { fileName });
    return res.data;
  } catch (err) {
    throw new Error(err.message);
  }
};

const startTranscription = async (payload) => {
  const url = `${apiEndpoint}/startTranscription`;
  try {
    const res = await http.post(url, payload);
    return res.data;
  } catch (err) {
    throw new Error(err.message);
  }
};

const startHlsConversion = async (payload) => {
  const url = `${apiEndpoint}/start-hls-conversion`;
  try {
    const res = await http.post(url, payload);
    return res.data
  } catch (error) {
    throw new Error(error.message);
  }
};

export {
  getSignedUrl,
  deleteObject,
  getJobUpdate,
  compressVideo,
  startTranscription,
  startHlsConversion
};
