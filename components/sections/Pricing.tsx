import PlanCard from "@/components/ui/PlanCard";
import SectionHeading from "@/components/ui/SectionHeading";
import { addons, plans, pricingCopy } from "@/content/copy";
import styles from "./Pricing.module.css";

export default function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" data-motion-root="pricing" className={`section ${styles.pricing}`}>
      <SectionHeading id="pricing-title" font="poppins" accent={pricingCopy.accent}>{pricingCopy.lead}</SectionHeading>
      <p data-reveal className={`script brown ${styles.sub}`}>{pricingCopy.sub}</p>
      <div className={styles.grid}>
        {plans.map((plan, i) => <PlanCard key={plan.name} plan={plan} index={i} />)}
      </div>
      <div data-reveal className={styles.addons}>
        <span className={`script brown ${styles.addTitle}`}>{pricingCopy.addonsTitle}</span>
        <ul className={`serif ${styles.addonList}`}>
          {addons.map((addon) => (
            <li key={addon.name} className={styles.addon}>
              <span>{addon.name}</span>
              <span className={styles.leader} />
              <b className="brown">
                {addon.price.startsWith("₹") ? (
                  <>
                    <span className="poppins">₹</span>
                    {addon.price.slice(1)}
                  </>
                ) : (
                  addon.price
                )}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
