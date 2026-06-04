import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "css"> {
    className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "w-full bg-white border-2 border-black px-4 py-3 text-base",
                    "placeholder:text-mutedForeground placeholder:italic",
                    "focus:border-b-[4px] focus:outline-none",
                    "transition-colors duration-INSTANT",
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export { Input };
