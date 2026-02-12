import http from "@/services/httpServices";

const apiEndpoint = "/admin/content/ai";

export const generateSessionContent = async (
    transcription,
    language = "en"
) => {
    try {
        const { data: response } = await http.post(
            `${apiEndpoint}/generate-session-content`,
            {
                transcription,
                language,
            }
        );

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.message || "Failed to generate content");
        }
    } catch (error) {
        console.error("AI Generation Service Error:", error);
        throw new Error(error.message || "Failed to generate content");
    }
};
