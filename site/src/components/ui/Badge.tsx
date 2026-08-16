import { cn } from "@/lib/utils";

type BadgeTone = "emerald" | "gold" | "red" | "blue" | "violet" | "muted";

const toneClasses: Record<BadgeTone, string> = {
  emerald: "bg-aris-emerald/10 text-aris-emerald-light border-aris-emerald/30",
  gold: "bg-aris-gold/10 text-aris-gold border-aris-gold/30",
  red: "bg-aris-red/10 text-aris-red border-aris-red/30",
  blue: "bg-aris-blue/10 text-blue-300 border-aris-blue/30",
  violet: "bg-aris-violet/10 text-violet-300 border-aris-violet/30",
  muted: "bg-white/5 text-aris-muted border-aris-border",
};

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
