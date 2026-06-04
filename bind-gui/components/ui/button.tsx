import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center font-medium text-sm tracking-wider uppercase transition-colors duration-INSTANT focus-visible:outline focus-visible:outline-3 focus-visible:outline-black focus-visible:outline-offset-3",
    {
        variants: {
            variant: {
                default:
                    "bg-black text-white px-8 py-4 border-2 border-black hover:bg-white hover:text-black",
                outline:
                    "border-2 border-black bg-transparent text-black hover:bg-black hover:text-white",
                ghost:
                    "underline-offset-4 hover:underline bg-transparent text-black p-0",
                destructive:
                    "bg-black text-white px-6 py-3 hover:bg-red-700",
                link: "text-black underline-offset-4 hover:underline p-0",
            },
            size: {
                default: "px-8 py-4",
                sm: "px-4 py-2 text-xs",
                lg: "px-10 py-5 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
