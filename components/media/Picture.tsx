import { images, type ImageId } from "@/lib/generated/images";

type DataAttributes = { [K in `data-${string}`]?: string | number | boolean };

export type PictureProps = {
  id: ImageId;
  alt: string;
  /** Standard `sizes` attribute: how wide the image renders at each breakpoint. */
  sizes: string;
  /** Above-the-fold (LCP) image: loads eagerly at high priority. Everything else lazy-loads. */
  priority?: boolean;
  className?: string;
} & DataAttributes;

/**
 * Responsive image from the generated manifest (lib/generated/images.ts, built
 * by `npm run images`). Layout is unchanged from a plain <img>: width/height
 * reserve the space and <picture> is `display: contents`, so CSS and GSAP
 * target the <img> (data-* attributes are forwarded to it).
 *
 * Lazy images offer AVIF, then WebP, then the JPEG/PNG fallback. The priority
 * image is a plain <img srcSet=WebP>: React preloads exactly what an <img>
 * declares, so a <picture> would preload the fallback and download it twice.
 */
export default function Picture({ id, alt, sizes, priority = false, className, ...dataAttrs }: PictureProps) {
  const asset = images[id];

  if (priority) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; files are pre-generated
      <img
        src={asset.src}
        srcSet={asset.webp}
        sizes={sizes}
        width={asset.width}
        height={asset.height}
        alt={alt}
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        className={className}
        {...dataAttrs}
      />
    );
  }

  return (
    <picture style={{ display: "contents" }}>
      {asset.avif && <source type="image/avif" srcSet={asset.avif} sizes={sizes} />}
      {asset.webp && <source type="image/webp" srcSet={asset.webp} sizes={sizes} />}
      <img
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        {...dataAttrs}
      />
    </picture>
  );
}
