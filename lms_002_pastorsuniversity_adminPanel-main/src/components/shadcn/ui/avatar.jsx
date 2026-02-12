import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => {
  const fallbackRef = React.useRef(null);

  React.useEffect(() => {
    const handleResize = () => {
      if (fallbackRef.current) {
        const { offsetWidth } = fallbackRef.current;
        fallbackRef.current.style.fontSize = `${offsetWidth * 0.4}px`;
        // fallbackRef.current.style.fontFamily = "DM Serif Display";
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);

    if (fallbackRef.current) {
      resizeObserver.observe(fallbackRef.current);
      handleResize();
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [fallbackRef]);

  return (
    <AvatarPrimitive.Fallback
      ref={(node) => {
        fallbackRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  );
});
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
