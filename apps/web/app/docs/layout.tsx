import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Sidebar from "@/components/docs/Sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="landing min-h-screen">
      <Navbar />
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-14 sm:px-8 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:px-10">
        <Sidebar />
        {children}
      </div>
      <Footer />
    </main>
  );
}
