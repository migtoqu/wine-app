import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-col gap-2 p-5 pb-0", className)} {...props} />;
}

export function CardBody({ className, ...props }: DivProps) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t border-border p-5", className)}
      {...props}
    />
  );
}
