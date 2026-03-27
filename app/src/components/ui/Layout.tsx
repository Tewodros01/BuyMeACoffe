import { ArrowLeft, Bell, House, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { APP_ROUTES } from "../../config/routes";
import { getAvatarInitials, getPublicAssetUrl } from "../../lib/assets";
import { haptic } from "../../lib/telegram";

/* ─── Avatar ────────────────────────────────────────────────────────── */
interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}
export const Avatar = ({ src, name, size = "md" }: AvatarProps) => {
  const avatarSrc = getPublicAssetUrl(src);
  const dim =
    size === "sm"
      ? "w-8 h-8 text-xs"
      : size === "lg"
        ? "w-14 h-14 text-lg"
        : "w-10 h-10 text-sm";
  const initials = getAvatarInitials(
    name.split(" ")[0],
    name.split(" ").slice(1).join(" "),
    "?",
  );
  return avatarSrc ? (
    <img
      src={avatarSrc}
      alt={name}
      className={`${dim} rounded-full object-cover ring-2 ring-emerald-500/40 shrink-0`}
    />
  ) : (
    <div
      className={`${dim} rounded-full ring-2 ring-emerald-500/40 shrink-0 flex items-center justify-center font-black`}
      style={{ background: "#0e0e1c", color: "#f0f0ff" }}
    >
      {initials}
    </div>
  );
};

/* ─── Pill ──────────────────────────────────────────────────────────── */
interface PillProps {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}
export const Pill = ({ icon, children, className = "" }: PillProps) => (
  <div
    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 ${className}`}
    style={{
      background: "#0e0e1c",
      border: "1px solid rgba(255,255,255,0.07)",
      color: "#f0f0ff",
    }}
  >
    {icon && <span className="text-xs">{icon}</span>}
    {children}
  </div>
);

/* ─── Divider ───────────────────────────────────────────────────────── */
export const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
    <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
      {label}
    </span>
    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
  </div>
);

/* ─── SocialBtn ─────────────────────────────────────────────────────── */
export const SocialBtn = ({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) => (
  <button
    type="button"
    aria-label={label}
    className="flex-1 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95"
    style={{
      background: "#0e0e1c",
      border: "1px solid rgba(255,255,255,0.07)",
      color: "rgba(255,255,255,0.6)",
    }}
  >
    <span className="text-lg">{icon}</span>
  </button>
);

/* ─── PageHeader ────────────────────────────────────────────────────── */
/* Replaces AppBar — supports both new (title/onBack/right) and         */
/* legacy (left/center/right) prop shapes for backward compatibility.   */
interface PageHeaderProps {
  /* new API */
  title?: string;
  onBack?: () => void;
  /* legacy AppBar API */
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}
export const PageHeader = ({
  title,
  onBack,
  left,
  center,
  right,
  className = "",
}: PageHeaderProps) => {
  const navigate = useNavigate();

  /* ── New API: title + optional back + optional right ── */
  if (title !== undefined) {
    const handleBack = onBack ?? (() => navigate(-1));
    return (
      <div
        className={`sticky top-0 z-40 flex items-center gap-3 px-4 py-3 backdrop-blur-xl ${className}`}
        style={{
          background: "rgba(7,7,15,0.82)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="flex h-10 w-10 items-center justify-center rounded-2xl shrink-0 transition-all active:scale-95"
          style={{
            background: "#0e0e1c",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <ArrowLeft
            className="h-5 w-5"
            strokeWidth={2.25}
            style={{ color: "#f0f0ff" }}
          />
        </button>
        <span
          className="flex-1 text-base font-black truncate"
          style={{ color: "#f0f0ff" }}
        >
          {title}
        </span>
        {right && (
          <div className="flex items-center gap-2 shrink-0">{right}</div>
        )}
      </div>
    );
  }

  /* ── Legacy AppBar API: left / center / right ── */
  return (
    <div
      className={`sticky top-0 z-40 flex items-center justify-between px-4 py-3 backdrop-blur-xl ${className}`}
      style={{
        background: "rgba(7,7,15,0.82)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div>{left}</div>
      {center && (
        <div className="absolute left-1/2 -translate-x-1/2">{center}</div>
      )}
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
};

interface AppLayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export const AppLayout = ({ children, showNav = false }: AppLayoutProps) => (
  <div className="relative min-h-screen overflow-x-hidden bg-[#07070f] text-[#f0f0ff]">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_58%)]" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(circle_at_bottom,_rgba(245,158,11,0.08),_transparent_65%)]" />

    <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col border-x border-white/[0.04] bg-[linear-gradient(180deg,rgba(10,10,18,0.96),rgba(7,7,15,1))] shadow-[0_0_60px_rgba(0,0,0,0.35)]">
      <main className="relative flex-1">{children}</main>
      {showNav && <BottomNav />}
    </div>
  </div>
);

/* ─── BottomNav ─────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { path: APP_ROUTES.home, label: "Home", Icon: House },
  { path: APP_ROUTES.wallet, label: "Wallet", Icon: Wallet },
  { path: APP_ROUTES.notifications, label: "Alerts", Icon: Bell },
  { path: APP_ROUTES.settings, label: "Settings", Icon: Settings },
];

export const BottomNav = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-[430px] px-4 pb-5 pt-2 pointer-events-none">
      <div
        className="pointer-events-auto flex items-center rounded-3xl px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        style={{
          background: "rgba(7,7,15,0.92)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const active = pathname === path || pathname.startsWith(path + "/");
          return (
            <button
              key={path}
              type="button"
              onClick={() => {
                haptic("light");
                navigate(path);
              }}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-90"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200 ${
                  active
                    ? "bg-amber-500/18 shadow-[0_0_16px_rgba(245,158,11,0.24)]"
                    : ""
                }`}
                style={!active ? { background: "transparent" } : {}}
              >
                <Icon
                  className={`h-5 w-5 transition-colors duration-200 ${
                    active ? "text-amber-400" : ""
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                  style={!active ? { color: "rgba(255,255,255,0.3)" } : {}}
                />
              </div>
              <span
                className={`text-[9px] font-bold tracking-wide transition-colors duration-200 ${active ? "text-amber-400" : ""}`}
                style={!active ? { color: "rgba(255,255,255,0.3)" } : {}}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
