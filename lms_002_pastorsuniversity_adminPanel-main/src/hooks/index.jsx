import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSignedUrl } from "@/services/content/awsServices";
import { uploadtoAws } from "@/services/content/uploadService";
import Sortable from "sortablejs";
import { ProgressBar } from "@/components/misc/ProgressBar";

export function useQueryParams() {
    const location = useLocation();
    const navigate = useNavigate();

    const getQueryParams = useCallback(() => {
        return new URLSearchParams(location.search);
    }, [location.search]);

    const setQueryParams = useCallback(
        (params) => {
            const queryParams = new URLSearchParams(location.search);
            Object.keys(params).forEach((key) => {
                if (params[key] !== undefined && params[key] !== null) {
                    queryParams.set(key, params[key]);
                } else {
                    queryParams.delete(key);
                }
            });
            navigate(`?${queryParams.toString()}`, { replace: true });
        },
        [location.search, navigate]
    );

    return [getQueryParams, setQueryParams];
}

export function useSortable({ elementId, items, onSortEnd, classSelector }) {
    useEffect(() => {
        const el = document.getElementById(elementId);
        if (el) {
            const sortable = Sortable.create(el, {
                animation: 150,
                ghostClass: "sortable-ghost",
                handle: classSelector,
                onEnd: (evt) => {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;

                    // Check if the position has actually changed
                    if (oldIndex === newIndex) {
                        return;
                    }

                    const newItemsOrder = [...items];
                    const movedItem = newItemsOrder.splice(oldIndex, 1)[0];
                    newItemsOrder.splice(newIndex, 0, movedItem);

                    onSortEnd(newItemsOrder);
                },
            });

            return () => sortable.destroy();
        }
    }, [elementId, items, onSortEnd, classSelector]);
}

export function useFileUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const uploadFile = (file, fileType, message) => {
        if (!file || typeof file === "string") return Promise.resolve(file);

        setIsUploading(true);
        setUploadProgress(0);

        // Create a unique toast ID for this upload
        const toastId = `upload-${Date.now()}`;

        const uploadPromise = new Promise((resolve, reject) => {
            (async () => {
                try {
                    const { signedUrl, key, downloadUrl } = await getSignedUrl(
                        file.name,
                        fileType
                    );

                    await uploadtoAws(signedUrl, file, (progress) => {
                        setUploadProgress(progress);
                        // Update the toast with current progress
                        toast.loading(
                            <div className="flex flex-col gap-3" style={{ width: "100%" }}>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">Uploading {message}...</span>
                                    <span className="text-muted-foreground">{progress}%</span>
                                </div>
                                <ProgressBar
                                    progress={progress}
                                    size="sm"
                                    showPercentage={false}
                                    className="w-full"
                                />
                            </div>,
                            {
                                id: toastId,
                                duration: Infinity,
                            }
                        );
                    });

                    resolve({ key, downloadUrl });
                } catch (error) {
                    reject(error);
                }
            })();
        });

        // Show initial loading toast
        toast.loading(
            <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center justify-between">
                    <span className="font-medium">Uploading {message}...</span>
                    <span className="text-sm text-muted-foreground">0%</span>
                </div>
                <ProgressBar
                    progress={0}
                    size="sm"
                    showPercentage={false}
                    className="w-full"
                />
            </div>,
            {
                id: toastId,
                duration: Infinity,
            }
        );

        return uploadPromise
            .then((result) => {
                // Show success toast
                toast.success(`${message} uploaded successfully!`, { id: toastId });
                return result;
            })
            .catch((error) => {
                // Show error toast
                toast.error(`Failed to upload ${message}`, { id: toastId });
                throw error;
            })
            .finally(() => {
                setIsUploading(false);
                setUploadProgress(0);
            });
    };

    return { uploadFile, isUploading, uploadProgress };
}

export function useDebounce(initialValue, delay) {
    const [value, setValue] = useState(initialValue);
    const [debouncedValue, setDebouncedValue] = useState(initialValue);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    const setDebouncedInputValue = useCallback((inputValue) => {
        setValue(inputValue);
    }, []);

    return [debouncedValue, setDebouncedInputValue];
}
