import Navbar from "@/components/Navbar";
import Hero from "@/components/landing/Hero";
import Numbers from "@/components/landing/Numbers";
import Mechanics from "@/components/landing/Mechanics";
import Makers from "@/components/landing/Makers";
import Docs from "@/components/landing/Docs";
import Closing from "@/components/landing/Closing";
import Footer from "@/components/Footer";
import { LiveProvider } from "@/components/landing/live";
import SmoothScroll from "@/components/landing/SmoothScroll";

export default function Home() {
  return (
    <main className="landing">
      <SmoothScroll />
      <Navbar />
      <LiveProvider>
        <div className="p-2 sm:p-3"><Hero /></div>
        <Numbers />
        <Mechanics />
        <Makers />
        <Docs />
      </LiveProvider>
      <Closing />
      <Footer />
    </main>
  );
}
