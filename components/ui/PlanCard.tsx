import { pricingCopy, type Plan } from "@/content/copy";
import { formatINR } from "@/lib/format";
import DrawLine from "./DrawLine";
import styles from "./PlanCard.module.css";

export default function PlanCard({ plan, index = 0 }: { plan: Plan; index?: number }) {
  return (
    <article data-plan className={`${styles.card} ${styles[plan.tone]}`}>
      {plan.popular && <span className={`script brown ${styles.popularTag}`}>Most popular</span>}
      <div className={styles.head}>
        <h3 className={`serif brown ${styles.name}`}>{plan.name}</h3>
        <span className={`script brown ${styles.kicker}`}>{pricingCopy.packageKicker}</span>
      </div>
      <div className={`serif ${styles.priceRow}`}>
        <span className={`brown ${styles.price}`}>
          <span className={`poppins ${styles.rupee}`}>₹</span>
          {formatINR(plan.price)}
        </span>
        <span className={styles.per}>{pricingCopy.perSuffix}</span>
      </div>
      <DrawLine width={2} dashed delay={0.3 + index * 0.15} />
      <ul className={`serif ${styles.items}`}>
        <li className={styles.item}>
          <span className={styles.itemName}><span className={styles.dot} /><span>Coverage</span></span>
          <span className={`brown ${styles.value}`}>{plan.coverage}</span>
        </li>
        <li className={styles.item}>
          <span className={styles.itemName}><span className={styles.dot} /><span>Reels</span></span>
          <span className={`brown ${styles.value}`}>{plan.reels}</span>
        </li>
      </ul>
      <span className={`serif ${styles.bonus}`}>{plan.role}</span>
    </article>
  );
}
