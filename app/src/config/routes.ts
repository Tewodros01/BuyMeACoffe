export const APP_ROUTES = {
  auth: "/auth",
  onboarding: "/onboarding",
  home: "/home",
  dashboard: "/home",
  wallet: "/wallet",
  learn: "/wallet",
  notifications: "/notifications",
  challenge: "/notifications",
  settings: "/settings",
  setting: "/settings",
  jobs: "/settings",
  profile: "/settings",
  publicCreator: "/c/:slug",
  paymentSuccess: "/payment/success",
} as const;

export const AUTHED_ROUTES = [
  APP_ROUTES.home,
  APP_ROUTES.wallet,
  APP_ROUTES.notifications,
  APP_ROUTES.settings,
  APP_ROUTES.onboarding,
] as const;
