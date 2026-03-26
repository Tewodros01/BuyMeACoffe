import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AxiosError } from "axios";
import {
  ChevronRight,
  Coffee,
  CreditCard,
  Globe,
  LogOut,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  Input,
  Spinner,
} from "../../components/ui/index";
import { haptic } from "../../lib/telegram";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../auth/authApi";
import {
  creatorApi,
  UpdateProfileSchema,
  type UpdateProfileInput,
} from "../creator/creatorApi";
import {
  CreateAccountSchema,
  financialAccountApi,
  type CreateAccountInput,
} from "./financialAccountApi";

export default function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const [section, setSection] = useState<
    "main" | "profile" | "accounts" | "add-account"
  >("main");

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: creatorApi.getMyProfile,
  });
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: financialAccountApi.list,
    enabled: section === "accounts" || section === "add-account",
  });

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      pageTitle: profile?.pageTitle,
      thankYouMessage: profile?.thankYouMessage ?? "",
      coffeePrice: profile?.coffeePrice,
    },
  });

  const accountForm = useForm<CreateAccountInput>({
    resolver: zodResolver(CreateAccountSchema),
  });

  const updateProfileMutation = useMutation({
    mutationFn: creatorApi.updateProfile,
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      setSection("main");
    },
  });

  const addAccountMutation = useMutation({
    mutationFn: financialAccountApi.create,
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      setSection("accounts");
      accountForm.reset();
    },
  });

  const removeAccountMutation = useMutation({
    mutationFn: financialAccountApi.remove,
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: financialAccountApi.setDefault,
    onSuccess: () => {
      haptic("light");
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
    },
  });

  const handleLogout = async () => {
    haptic("medium");
    if (refreshToken) await authApi.logout(refreshToken).catch(() => {});
    logout();
    navigate("/auth", { replace: true });
  };

  // ── Main Menu ──────────────────────────────────────────────────────────────
  if (section === "main")
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
        <h1 className="text-xl font-bold text-[#e2e2f0]">Settings</h1>

        {/* Profile Card */}
        <Card className="p-4 flex items-center gap-4">
          <Avatar
            src={user?.avatar}
            name={`${user?.firstName} ${user?.lastName}`}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#e2e2f0]">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-sm text-[#7c7c9a]">@{user?.username}</p>
            <p className="text-xs text-[#4a4a6a] truncate">{user?.email}</p>
          </div>
          <Badge variant={user?.isVerified ? "success" : "warning"}>
            {user?.isVerified ? "Verified" : "Unverified"}
          </Badge>
        </Card>

        {/* Menu Items */}
        <Card className="overflow-hidden">
          {[
            {
              icon: <Coffee className="w-4 h-4 text-amber-400" />,
              label: "Creator Profile",
              sub: profile?.slug ? `/${profile.slug}` : "Set up your page",
              action: () => setSection("profile"),
            },
            {
              icon: <CreditCard className="w-4 h-4 text-blue-400" />,
              label: "Financial Accounts",
              sub: `${accounts?.length ?? 0} accounts`,
              action: () => setSection("accounts"),
            },
            {
              icon: <Globe className="w-4 h-4 text-emerald-400" />,
              label: "My Public Page",
              sub: profile?.slug ? `View your page` : "Not set up",
              action: () => profile?.slug && navigate(`/c/${profile.slug}`),
            },
          ].map((item, i) => (
            <div key={i}>
              {i > 0 && <Divider />}
              <button
                onClick={item.action}
                className="w-full flex items-center gap-3 p-4 hover:bg-[#1e1e2a] transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#1e1e2a] flex items-center justify-center">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#e2e2f0]">
                    {item.label}
                  </p>
                  <p className="text-xs text-[#7c7c9a]">{item.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#4a4a6a]" />
              </button>
            </div>
          ))}
        </Card>

        <Button variant="danger" fullWidth onClick={handleLogout}>
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    );

  // ── Creator Profile ────────────────────────────────────────────────────────
  if (section === "profile")
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSection("main")}
            aria-label="Back to settings"
            className="text-[#7c7c9a] hover:text-[#e2e2f0]"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-[#e2e2f0]">Creator Profile</h1>
        </div>
        <form
          onSubmit={profileForm.handleSubmit((d) =>
            updateProfileMutation.mutate(d),
          )}
          className="flex flex-col gap-4"
        >
          <Input
            label="Page Title"
            placeholder="Buy me a coffee ☕"
            error={profileForm.formState.errors.pageTitle?.message}
            {...profileForm.register("pageTitle")}
          />
          <Input
            label="Custom URL Slug"
            placeholder="your-name"
            error={profileForm.formState.errors.slug?.message}
            {...profileForm.register("slug")}
          />
          <Input
            label="Coffee Price (ETB)"
            type="number"
            placeholder="50"
            error={profileForm.formState.errors.coffeePrice?.message}
            {...profileForm.register("coffeePrice", { valueAsNumber: true })}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#7c7c9a] uppercase tracking-wider">
              Thank You Message
            </label>
            <textarea
              placeholder="Thank you so much! 🙏"
              rows={3}
              className="w-full bg-[#1e1e2a] border border-[#2a2a3a] rounded-[12px] px-4 py-3 text-sm text-[#e2e2f0] placeholder:text-[#4a4a6a] focus:outline-none focus:border-amber-500/60 resize-none"
              {...profileForm.register("thankYouMessage")}
            />
          </div>
          <Button
            type="submit"
            fullWidth
            loading={updateProfileMutation.isPending}
          >
            Save Changes
          </Button>
        </form>
      </div>
    );

  // ── Financial Accounts ─────────────────────────────────────────────────────
  if (section === "accounts")
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSection("main")}
              aria-label="Back to settings"
              className="text-[#7c7c9a] hover:text-[#e2e2f0]"
            >
              ←
            </button>
            <h1 className="text-xl font-bold text-[#e2e2f0]">
              Financial Accounts
            </h1>
          </div>
          <Button size="sm" onClick={() => setSection("add-account")}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {accountsLoading ? (
          <Spinner />
        ) : !accounts?.length ? (
          <div className="text-center py-12">
            <CreditCard className="w-10 h-10 text-[#4a4a6a] mx-auto mb-3" />
            <p className="text-sm text-[#7c7c9a]">No accounts yet</p>
            <p className="text-xs text-[#4a4a6a] mt-1">
              Add an account to withdraw funds
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {accounts.map((acc) => (
              <Card key={acc.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-[#e2e2f0]">
                        {acc.label ?? acc.accountName}
                      </p>
                      {acc.isDefault && (
                        <Badge variant="success">Default</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[#7c7c9a]">
                      {acc.provider} · {acc.accountNumber}
                    </p>
                    <p className="text-xs text-[#4a4a6a]">{acc.accountName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!acc.isDefault && (
                      <button
                        onClick={() => setDefaultMutation.mutate(acc.id)}
                        aria-label="Set as default"
                        className="p-1.5 rounded-lg hover:bg-[#1e1e2a] text-[#7c7c9a] hover:text-amber-400 transition-colors"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => removeAccountMutation.mutate(acc.id)}
                      aria-label="Remove account"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#7c7c9a] hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );

  // ── Add Account ────────────────────────────────────────────────────────────
  if (section === "add-account")
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSection("accounts")}
            aria-label="Back to financial accounts"
            className="text-[#7c7c9a] hover:text-[#e2e2f0]"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-[#e2e2f0]">Add Account</h1>
        </div>
        <form
          onSubmit={accountForm.handleSubmit((d) =>
            addAccountMutation.mutate(d),
          )}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#7c7c9a] uppercase tracking-wider">
              Account Type
            </label>
            <select
              className="w-full h-11 bg-[#1e1e2a] border border-[#2a2a3a] rounded-[12px] px-4 text-sm text-[#e2e2f0] focus:outline-none focus:border-amber-500/60"
              {...accountForm.register("type")}
            >
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="BANK_ACCOUNT">Bank Account</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#7c7c9a] uppercase tracking-wider">
              Provider
            </label>
            <select
              className="w-full h-11 bg-[#1e1e2a] border border-[#2a2a3a] rounded-[12px] px-4 text-sm text-[#e2e2f0] focus:outline-none focus:border-amber-500/60"
              {...accountForm.register("provider")}
            >
              <option value="telebirr">TeleBirr</option>
              <option value="cbe">CBE Birr</option>
              <option value="awash">Awash Bank</option>
              <option value="dashen">Dashen Bank</option>
              <option value="other">Other Bank</option>
            </select>
          </div>
          <Input
            label="Account Holder Name"
            placeholder="Abebe Bikila"
            error={accountForm.formState.errors.accountName?.message}
            {...accountForm.register("accountName")}
          />
          <Input
            label="Account Number / Phone"
            placeholder="0911234567"
            error={accountForm.formState.errors.accountNumber?.message}
            {...accountForm.register("accountNumber")}
          />
          <Input
            label="Label (optional)"
            placeholder="My TeleBirr"
            error={accountForm.formState.errors.label?.message}
            {...accountForm.register("label")}
          />
          {addAccountMutation.error && (
            <p className="text-xs text-red-400">
              {(addAccountMutation.error as AxiosError<{ message: string }>)
                ?.response?.data?.message ?? "Failed to add account"}
            </p>
          )}
          <Button
            type="submit"
            fullWidth
            loading={addAccountMutation.isPending}
          >
            Add Account
          </Button>
        </form>
      </div>
    );

  return null;
}
