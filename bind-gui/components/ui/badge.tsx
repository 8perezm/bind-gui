import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> { }

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, children, ...props }, ref) => (
        <span
            ref={ref}
            className={cn(
                "inline-block border-2 border-black px-3 py-1 text-xs font-medium tracking-widest uppercase",
                className
            )}
            {...props}
        >
            {children}
        </span>
    )
);
Badge.displayName = "Badge";

export { Badge };
