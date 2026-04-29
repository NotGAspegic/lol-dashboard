import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function Card({ children, className, style }: CardProps) {
  return (
    <div
      style={style}
      className={cn(
        "bg-surface border rounded-lg p-4",
        "border-primary/15",
        className
      )}
    >
      {children}
    </div>
  );
}
