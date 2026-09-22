import SectionHeading from "@/components/ui/SectionHeading";
import { faqCopy, faqs } from "@/content/copy";
import FaqAccordion from "./FaqAccordion";

export default function Faq() {
  return (
    <section aria-labelledby="faq-title" data-motion-root="faq" className="section">
      <SectionHeading id="faq-title" eyebrow={faqCopy.eyebrow} accent={faqCopy.accent}>{faqCopy.lead}</SectionHeading>
      <FaqAccordion items={faqs} />
    </section>
  );
}
