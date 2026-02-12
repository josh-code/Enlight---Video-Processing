import { Learning, Overview, People, Statics, Support } from "@/assets/icons";
import { BadgeDollarSign, Flag, FolderKanban, Split } from "lucide-react";

export const SITE_NAVIGATION = [
    {
        label: "Overview",
        to: "/",
        icon: <Overview />,
    },
    {
        label: "Course Management",
        to: "/course-management",
        icon: <Learning />,
    },
    {
        label: "Members",
        to: "/members-management",
        icon: <People />,
    },
    {
        label: "Transactions",
        to: "/transactions",
        icon: <BadgeDollarSign />,
    },
    {
        label: "Reports and Analytics",
        to: "/reports-and-analytics",
        icon: <Statics />,
    },

    {
        label: "Help",
        to: "/help",
        icon: <Support />,
    },
];

export const DEV_NAVIGATION = [
    {
        label: "App Versions",
        to: "/dev/app-versions",
        icon: <Split />,
    },
    {
        label: "Manage Courses",
        to: "/dev/dev-courses-manage",
        icon: <FolderKanban />,
    },
    {
        label: "Feature Flag",
        to: "/dev/features",
        icon: <Flag />,
    },
];

export const TIME_OPTIONS = [
    {
        value: "daily",
        label: "Daily",
    },
    {
        value: "weekly",
        label: "Weekly",
    },
    {
        value: "monthly",
        label: "Monthly",
    },
];

export const LEVELS = [
    {
        value: "level1",
        label: "Level 1",
    },
    {
        value: "level2",
        label: "Level 2",
    },
    {
        value: "level3",
        label: "Level 3",
    },
];

export const COURSE_STRUCTURE_TYPES = [
    {
        label: "Course with modules",
        value: "module",
    },
    {
        label: "Course without modules",
        value: "non-module",
    },
];

export const SUMMETIVE_ASSESSMENT_TYPE = {
    close_ended: "closeEnded",
    open_ended: "openEnded",
};

export const ACCEPTED_IMAGE_TYPES = [
    { value: "image/png", label: "PNG" },
    { value: "image/jpg", label: "JPG" },
    { value: "image/jpeg", label: "JPEG" },
];

export const ACCEPTED_VIDEO_TYPES = [{ value: "video/mp4", label: "MP4" }];

export const ACCEPTED_ATTACHMENT_TYPES = [
    { value: "application/pdf", label: "PDF" },
    { value: "application/vnd.ms-powerpoint", label: "PPT" },
    {
        value:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        label: "PPTX",
    },
    { value: "application/msword", label: "DOC" },
    {
        value:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        label: "DOCX",
    },
    { value: "text/plain", label: "TXT" },
];

export const MAX_IMAGE_FILE_SIZE_MB = 1;
export const IMAGE_RESIZE_WIDTH = 1920;

export const zeroDecimalCurrencies = [
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
];

export const AWS_FOLDER_NAME = {
    COVER_IMAGE: "cover-image",
    INSTRUCTOR_IMAGE: "instructor-image",
    ATTACHMENT: "attachment",
    CERTIFICATE: "certificate",
    UPLOADED_VIDEO: "uploaded-video",
    COMPRESSED: "compressed",
};

export const APP_LANGUAGES = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
];

export const PRICE_TYPE = {
    CUSTOM: "Custom",
    FALLBACK: "Fallback",
    PPP: "PPP",
};

export const TRANSACTION_STATUS = {
    PENDING: "pending",
    SUCCEEDED: "succeeded",
    FAILED: "failed",
    REQUIRES_PAYMENT: "requires_payment",
};

// AI Generation Constants
export const AI_GENERATION = {
    MAX_TITLE_LENGTH: 75,
    MIN_DESCRIPTION_LENGTH: 200,
    TARGET_DESCRIPTION_LENGTH: {
        MIN: 300,
        MAX: 400
    },
    MAX_TRANSCRIPTION_CHARS: 12000, // ≈3000 tokens
};