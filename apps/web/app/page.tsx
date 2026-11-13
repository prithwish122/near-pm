import HeroSection from "@/components/HeroSection";
import OpportunitySection from "@/components/OpportunitySection";
import MembershipSection from "@/components/MembershipSection";
import ArticleSection from "@/components/ArticleSection";
import NewsletterSection from "@/components/NewsletterSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <div className="space-y-3 p-2 sm:p-3">
        <HeroSection />
        <OpportunitySection />
      </div>
      <MembershipSection />
      <ArticleSection />
      <NewsletterSection />
      <Footer />
    </main>
  );
}
