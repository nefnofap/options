import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import LogoStrip from "@/components/landing/LogoStrip";
import Footer from "@/components/landing/Footer";

export default function Page() {
  return (
    <main className="relative">
      <Nav />
      <Hero />
      <LogoStrip />
      <Features />
      <Footer />
    </main>
  );
}
