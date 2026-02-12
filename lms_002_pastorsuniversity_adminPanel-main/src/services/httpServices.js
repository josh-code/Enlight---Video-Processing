import axios from "axios";

axios.defaults.baseURL = import.meta.env.VITE_SERVER_URL + "/api";

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            const { status } = error.response;

            // Lazy import store to prevent circular dependency
            if (status === 401) {
                import("@/redux/index").then(({ default: store }) => {
                    import("@/redux/slices/user").then(({ setSessionExpired }) => {
                        store.dispatch(setSessionExpired(true));
                    });
                });
            }

            // console.error(
            //     "API Error:",
            //     error.response.data || error.response.statusText
            // );
        } else {
            console.error("Network Error:", error.message);
        }

        return Promise.reject(error);
    }
);

export const setJwt = (jwt) => {
    axios.defaults.headers.common["x-auth-token"] = jwt;
};

export default {
    get: axios.get,
    post: axios.post,
    put: axios.put,
    delete: axios.delete,
    patch: axios.patch,
    setJwt,
};
