"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface PopoverProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: "start" | "center" | "end";
    side?: "top" | "bottom";
}

export default function Popover({
    trigger,
    children,
    align = "start",
    side = "bottom",
}: PopoverProps) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [open]);

    return (
        <div className="relative inline-flex" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center justify-center"
                aria-label="More information"
            >
                {trigger}
            </button>
            {open && (
                <div
                    className={`absolute z-50 min-w-[280px] max-w-[320px] border-2 border-black bg-white p-3 text-xs leading-relaxed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                        ${side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"}
                        ${align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"}
                    `}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
