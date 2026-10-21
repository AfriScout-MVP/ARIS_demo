"use client";

import { useState } from "react";
import { Flag, Globe2, Landmark, Trophy, type IconType } from "@/components/icons/glyphs";
import { mediaSrc } from "@/lib/api/admin";
import { cn } from "@/lib/utils";

const FALLBACK: Record<"flag" | "federation" | "team", IconType> = { flag: Flag, federation: Landmark, team: Trophy };

function Picture({ src, kind, size }: { src: string | null; kind: "flag" | "federation" | "team"; size: number }) {
  const [failed, setFailed] = useState(false);
  const Fallback = FALLBACK[kind] ?? Globe2;
  const isFlag = kind === "flag";
  const style = isFlag ? { width: size * 1.4, height: size } : { width: size, height: size };

  if (!src || failed) {
    return (
      <span
        aria-hidden
        style={style}
        className="inline-flex shrink-0 items-center justify-center rounded-[5px] border border-line bg-ink-3 text-chalk-faint"
      >
        <Fallback size={size * 0.5} />
      </span>
    );
  }
  return (
    // Flags and crests are user-uploaded media served by the Worker; there is nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      style={style}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-[5px] border border-line bg-ink-3", isFlag ? "object-cover" : "object-contain p-0.5")}
    />
  );
}

/** A flag, federation logo or team crest; a neutral glyph stands in when there is none (or it fails to load). Decorative: the name is always written next to it. */
export function Thumb({ url, kind, size = 28 }: { url: string | null | undefined; kind: "flag" | "federation" | "team"; size?: number }) {
  const src = mediaSrc(url);
  return <Picture key={src ?? "none"} src={src} kind={kind} size={size} />;
}
