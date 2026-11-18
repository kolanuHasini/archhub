import type { Metadata } from "next";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Home",
  description: "Your current project at a glance: plans, concept, tasks and progress.",
};

export default function DashboardPage() {
  return <Dashboard />;
}
