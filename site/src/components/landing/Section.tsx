import { cn } from "@/lib/utils";

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-24 scroll-mt-20", className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-aris-emerald-light mb-3">{eyebrow}</p>
        )}
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-aris-text tracking-tight">{title}</h2>
        {description && <p className="mt-4 text-aris-muted text-base leading-relaxed">{description}</p>}
      </div>
      {children && <div className="mt-12">{children}</div>}
    </section>
  );
}
