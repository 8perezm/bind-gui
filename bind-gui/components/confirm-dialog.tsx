"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
    busy?: boolean;
}

export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Confirm",
    onConfirm,
    busy = false,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogTitle className="font-heading text-3xl tracking-tight mb-4">{title}</DialogTitle>
                <DialogDescription className="text-mutedForeground leading-relaxed mb-8">
                    {description}
                </DialogDescription>
                <div className="flex gap-3 pt-4 border-t-2 border-black">
                    <Button variant="destructive" onClick={onConfirm} disabled={busy}>
                        {busy ? "Working..." : confirmLabel}
                    </Button>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}