export function Whistle({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a4 4 0 0 1 4-4h3l4-3v3h2a5 5 0 0 1 5 5 5 5 0 0 1-5 5H9l-2 2v-2a4 4 0 0 1-4-4Z" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
