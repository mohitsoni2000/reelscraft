import MotionController from "@/components/motion/MotionController";
import Nav from "@/components/nav/Nav";
import JsonLd from "@/components/seo/JsonLd";
import About from "@/components/sections/About";
import Contact from "@/components/sections/Contact";
import Faq from "@/components/sections/Faq";
import Feed from "@/components/sections/Feed";
import Footer from "@/components/sections/Footer";
import Hero from "@/components/sections/Hero";
import Marquee from "@/components/sections/Marquee";
import PreShootGallery from "@/components/sections/PreShootGallery";
import Pricing from "@/components/sections/Pricing";
import VisualShoots from "@/components/sections/VisualShoots";

export default function Page() {
  return (
    <div id="top" className="shell">
      <div data-hero-pattern aria-hidden="true" className="shell-pattern" />
      <div aria-hidden="true" className="shell-fade" />
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <About />
        <Marquee />
        <VisualShoots />
        <PreShootGallery />
        <Feed />
        <Faq />
        <Pricing />
        <Contact />
      </main>
      <Footer />
      <MotionController />
      <JsonLd />
    </div>
  );
}
