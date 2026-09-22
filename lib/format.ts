const inr = new Intl.NumberFormat("en-IN");

/** 18999 -> "18,999" (Indian digit grouping, no currency sign). */
export const formatINR = (amount: number) => inr.format(amount);
