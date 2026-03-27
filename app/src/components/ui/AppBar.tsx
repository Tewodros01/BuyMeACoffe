import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "./utils";

interface AppBarProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function AppBar({
  title,
  subtitle,
  trailing,
  leading,
  back = false,
  onBack,
  left,
  center,
  right,
  className,
  style,
}: AppBarProps) {
  const leftContent =
    left ??
    ((back || title || subtitle) ? (
      <div className="flex min-w-0 items-center gap-3">
        {back ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.05] text-white/70 transition-transform active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : leading ? (
          leading
        ) : null}

        {(title || subtitle) && (
          <div className="min-w-0">
            {title && (
              <div className="truncate text-[18px] font-bold text-white">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="truncate text-[12px] text-white/35">
                {subtitle}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null);

  const rightContent = right ?? trailing;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 -mx-4 -mt-5 flex w-[calc(100%+2rem)] items-center justify-between gap-3 border-b border-white/[0.06] bg-[#07070f]/85 px-4 py-3 backdrop-blur-xl",
        className,
      )}
      style={{
        paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
        ...style,
      }}
    >
      <div className="min-w-0 flex-1">{leftContent}</div>

      {center && (
        <div className="flex shrink-0 items-center justify-center">{center}</div>
      )}

      {rightContent ? (
        <div className="flex shrink-0 items-center gap-2">{rightContent}</div>
      ) : (
        <div className="w-0 shrink-0" />
      )}
    </header>
  );
}
