import { staggerIn } from "./util";

export const feed = (root: HTMLElement) => staggerIn(root, "[data-card]", { y: 80, stagger: 0.12, duration: 0.9 }, "top 85%");
export const faq = (root: HTMLElement) => staggerIn(root, "[data-faq]", { y: 40, stagger: 0.1, duration: 0.8 }, "top 88%");
export const pricing = (root: HTMLElement) => staggerIn(root, "[data-plan]", { y: 60, stagger: 0.15, duration: 0.9 }, "top 88%");
