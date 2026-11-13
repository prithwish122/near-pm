import AppShell from "@/components/app/AppShell";
import WalletProvider from "@/components/app/WalletProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AppShell>{children}</AppShell>
    </WalletProvider>
  );
}
