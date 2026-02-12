import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

// Redux
import { useDispatch, useSelector } from "react-redux";
import {
    fetchFeatureFlagAsync,
    clearFeatureFlag,
    SelectFeatureFlag,
} from "@/redux/slices/featureFlag";

// Service
import { deleteFeature, updateFeature } from "@/services/content/featureFlag";

// Shadcn
import { Button } from "@/components/shadcn/ui/button";

// Custom
import FeatureBreadCrumb from "./FeatureBreadCrumb";
import Features from "./Features";
import AddFeature from "./AddFeature";

export default function FeatureFlag() {
    const dispatch = useDispatch();
    const featureData = useSelector(SelectFeatureFlag);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const initialPath = searchParams.get("path")
        ? searchParams.get("path").split(",")
        : [];

    const [currentPath, setCurrentPath] = useState(initialPath);

    const isPathValid = () => {
        if (!featureData) return true; // if not loaded yet, assume valid
        let current = featureData;
        for (const key of currentPath) {
            if (current[key] && typeof current[key] === "object") {
                current = current[key];
            } else {
                return false;
            }
        }
        return true;
    };

    useEffect(() => {
        dispatch(fetchFeatureFlagAsync());
        return () => dispatch(clearFeatureFlag());
    }, [dispatch]);

    useEffect(() => {
        setSearchParams(currentPath.length ? { path: currentPath.join(",") } : {});
    }, [currentPath, setSearchParams]);

    const getCurrentData = () => {
        if (!featureData) return {};

        let current = featureData;
        for (const key of currentPath) {
            if (current[key] && typeof current[key] === "object") {
                current = current[key];
            } else {
                current = {};
                break;
            }
        }

        return Object.keys(current).reduce((filtered, key) => {
            if (!["enabled", "abTesting", "description", "keyName"].includes(key)) {
                filtered[key] = current[key];
            }
            return filtered;
        }, {});
    };

    const currentData = getCurrentData();

    const handleSelect = (key) => {
        if (currentData[key] && typeof currentData[key] === "object") {
            setCurrentPath([...currentPath, key]);
        }
    };

    const handleToggle = async (key, field) => {
        try {
            const payload = {
                path: [...currentPath, key],
                field,
                value: "toggle",
            };

            await updateFeature(payload);
            toast.success(`${field} toggled successfully`);
            dispatch(fetchFeatureFlagAsync());
        } catch (error) {
            console.error("Error toggling feature:", error);
            toast.error("Error toggling feature");
        }
    };

    const handleDelete = async (key) => {
        try {
            const payload = {
                path: currentPath,
                deleteKey: key,
            };
            await deleteFeature(payload);
            toast.success("Feature deleted successfully");
            dispatch(fetchFeatureFlagAsync());
        } catch (error) {
            console.error("Error deleting feature:", error);
            toast.error("Error deleting feature");
        }
    };

    const pathValid = isPathValid();

    return (
        <section>
            <div className="pt-2 pb-11">
                <div className="flex justify-between gap-8 items-center">
                    <h4 className="text-3xl font-bold">Feature Flag Management</h4>
                    <Button disabled={!pathValid} onClick={() => setIsAddOpen(true)}>
                        Add feature
                    </Button>
                </div>
                <div className="mt-16 space-y-4">
                    <FeatureBreadCrumb path={currentPath} onCrumbClick={setCurrentPath} />
                    <Features
                        data={currentData}
                        onSelect={handleSelect}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        pathValid={pathValid}
                    />
                </div>
            </div>
            <AddFeature onChange={setIsAddOpen} open={isAddOpen} path={currentPath} />
        </section>
    );
}
