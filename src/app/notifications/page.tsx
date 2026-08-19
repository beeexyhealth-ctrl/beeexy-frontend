import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

type NotificationRow = { id: string; title: string; message: string; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data } = user && supabase ? await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }) : { data: [] };
  const notifications = (data || []) as NotificationRow[];
  return <AppShell><div className="page collection-page"><Link className="back-link" href="/"><Icon name="arrow-left" size={15} />Home</Link><header className="page-header"><div><h1>Notifications</h1><p>Updates about your Beeexy activity</p></div></header>{notifications.length ? <div className="notification-list">{notifications.map((item) => <article className={item.read_at ? "" : "unread"} key={item.id}><span><Icon name="bell" size={16} /></span><div><div><h2>{item.title}</h2>{!item.read_at && <i>New</i>}</div><p>{item.message}</p><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></div></article>)}</div> : <div className="collection-empty"><span><Icon name="bell" size={23} /></span><h2>You’re all caught up</h2><p>New updates about appointments and your care journey will appear here.</p></div>}</div></AppShell>;
}
