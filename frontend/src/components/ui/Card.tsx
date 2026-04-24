import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div
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