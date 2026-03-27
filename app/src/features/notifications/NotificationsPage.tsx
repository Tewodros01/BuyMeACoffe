import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Coffee, Wallet } from "lucide-react";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { AppBar, Badge, Card, Empty, Spinner } from "../../components/ui/index";
import { api } from "../../lib/api";
import { haptic } from "../../lib/telegram";
import { timeAgo } from "../creator/utils";

const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum([
    "SUPPORT_RECEIVED",
    "WITHDRAWAL_PROCESSED",
    "WITHDRAWAL_REJECTED",
    "GOAL_REACHED",
    "SYSTEM",
  ]),
  title: z.string(),
  body: z.string(),
  referenceId: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

const notificationApi = {
  list: async () => {
    const { data } = await api.get("/notifications");
    return z.array(NotificationSchema).parse(data);
  },
  markAllRead: async () => api.patch("/notifications/read-all"),
  markRead: async (id: string) => api.patch(`/notifications/${id}/read`),
};

const typeIcon: Record<string, React.ReactNode> = {
  SUPPORT_RECEIVED: <Coffee className="w-4 h-4 text-amber-400" />,
  WITHDRAWAL_PROCESSED: <Wallet className="w-4 h-4 text-emerald-400" />,
  WITHDRAWAL_REJECTED: <Wallet className="w-4 h-4 text-red-400" />,
  GOAL_REACHED: <Bell className="w-4 h-4 text-blue-400" />,
  SYSTEM: <Bell className="w-4 h-4 text-[#7c7c9a]" />,
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationApi.list,
  });

  const markAllMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      haptic("light");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-28 fade-in">
      <AppBar
        title={
          <div className="flex items-center gap-2">
            <span>Notifications</span>
            {unread > 0 && <Badge variant="warning">{unread}</Badge>}
          </div>
        }
        trailing={
          unread > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              loading={markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              <CheckCheck className="w-4 h-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-8 h-8" />
        </div>
      ) : !data?.length ? (
        <Empty
          icon={<Bell className="w-8 h-8" />}
          title="No notifications"
          description="You'll see support alerts and withdrawal updates here"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((n) => (
            <Card
              key={n.id}
              className={`p-4 flex items-start gap-3 cursor-pointer transition-all ${!n.isRead ? "border-amber-500/20 bg-amber-500/5" : ""}`}
              onClick={() => {
                if (!n.isRead) markReadMutation.mutate(n.id);
              }}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${!n.isRead ? "bg-amber-500/10" : "bg-[#1e1e2a]"}`}
              >
                {typeIcon[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-sm font-medium ${!n.isRead ? "text-[#e2e2f0]" : "text-[#7c7c9a]"}`}
                  >
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-xs text-[#7c7c9a] mt-0.5 line-clamp-2">
                  {n.body}
                </p>
                <p className="text-[10px] text-[#4a4a6a] mt-1">
                  {timeAgo(n.createdAt)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
