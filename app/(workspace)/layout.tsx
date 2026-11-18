import Shell from "@/components/shell/Shell";

// Every page in this folder sits inside the workspace frame
// (sidebar on the left, search bar on top).
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
