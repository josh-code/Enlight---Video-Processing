import axios from "axios";

axios.interceptors.response.use(null, (error) => {
  return Promise.reject(error);
});

export async function uploadtoAws(url, data, onProgress) {
  try {
    let res = await axios.put(url, data, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });
    if (res.status === 200) {
      return true;
    }
  } catch (err) {
    throw new Error(err.message);
  }
}
