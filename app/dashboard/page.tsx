import { redirect } from "next/navigation";

export default function DashboardIndex() {
  redirect("/dashboard/gex?symbol=SPY");
}
