import { Terminal } from "lucide-react";

import {
    Alert,
    AlertDescription,
    AlertTitle,
} from "@/components/shadcn/ui/alert";

export function AlertComponent({ title, descirption }) {
    return (
        <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{descirption}</AlertDescription>
        </Alert>
    );
}
