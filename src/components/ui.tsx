import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_16px_-10px_rgba(135,74,18,0.9)] hover:bg-accent-deep",
  secondary: "bg-paper text-ink border border-line-strong hover:border-accent/60 hover:text-accent-deep",
  ghost: "text-ink-soft hover:bg-canvas-deep/70 hover:text-ink",
  danger: "bg-danger text-white hover:bg-[#873823]",
  quiet: "bg-canvas-deep/60 text-ink-soft hover:bg-canvas-deep",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-[9px] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[11px] gap-2",
  lg: "h-12 px-5 text-[15px] rounded-[12px] gap-2",
  icon: "h-9 w-9 rounded-[10px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center font-medium transition-colors duration-150 select-none",
    "disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn("panel", padded && "p-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {meta ? <div className="mb-2 text-[13px] text-muted">{meta}</div> : null}
        <h1 className="text-[30px] leading-[1.1] text-ink">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-ink-soft">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-[19px] leading-tight text-ink">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "accent" | "olive" | "danger" | "gold";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-canvas-deep text-ink-soft",
  accent: "bg-accent-soft text-accent-deep",
  olive: "bg-olive-soft text-olive",
  danger: "bg-danger-soft text-danger",
  gold: "bg-[#f6eacd] text-[#8a6217]",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11.5px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line-strong/70 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="font-display text-[17px] text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-[42ch] text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "accent" | "olive" | "danger";
  className?: string;
}) {
  const accents: Record<string, string> = {
    neutral: "text-ink",
    accent: "text-accent-deep",
    olive: "text-olive",
    danger: "text-danger",
  };
  return (
    <div className={cn("panel px-5 py-4", className)}>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className={cn("num mt-1.5 font-display text-[26px] leading-none", accents[tone])}>{value}</p>
      {hint ? <p className="mt-2 text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function moneyTone(value: number): string {
  return value < 0 ? "text-danger" : "text-ink";
}
