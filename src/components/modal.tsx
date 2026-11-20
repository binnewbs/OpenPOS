"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-[420px]", md: "max-w-[600px]", lg: "max-w-[840px]" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1d150e]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default" aria-label="Tutup" onClick={onClose} tabIndex={-1} />
      <div
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-line bg-paper shadow-[0_30px_80px_-20px_rgba(41,31,22,0.5)] sm:rounded-[18px]",
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-[20px] leading-tight text-ink">{title}</h2>
            {description ? <p className="mt-1 text-[12.5px] text-muted">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas-deep hover:text-ink"
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line bg-paper-soft px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
