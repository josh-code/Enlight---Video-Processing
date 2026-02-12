import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InfoBadge({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm p-2 border border-[#dde7fd] bg-[#f0f8ff] text-[#0973dc] rounded-md w-fit",
        className
      )}
      {...props}
    >
      <Info className="size-4" />
      {children}
    </div>
  );
}
