import Image from "next/image";
import Link from "next/link";
import { BrandSlogan } from "./brand-slogan";
import type { Locale } from "./content-public";

type BrandMarkProps = {
  className?: string;
  href?: string;
  priority?: boolean;
  size?: number;
};

export function BrandMark({ className = "", href, priority = false, size = 96 }: BrandMarkProps) {
  const mark = (
    <Image
      className={`brand-mark-image${className ? ` ${className}` : ""}`}
      src="/logo-z-orbit.png?v=60a283f03d83"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );

  if (!href) return mark;

  return <Link className="brand-mark-link" href={href} aria-label="SUPER SCI-Z">{mark}</Link>;
}

export function BrandWordmark({ href = "/", locale = "pt", variant = "compact", priority = false }: { href?: string; locale?: Locale; variant?: "masthead" | "compact" | "footer"; priority?: boolean }) {
  return (
    <Link className={`wordmark wordmark-${variant}`} href={href} aria-label="SUPER SCI-Z">
      <span className="wordmark-name" aria-hidden="true"><span className="wordmark-super">SUPER</span><span className="wordmark-science">SCI-<BrandMark className="wordmark-orbital" size={variant === "masthead" ? 192 : 88} priority={priority} /></span></span>
      <span className="wordmark-tagline"><BrandSlogan locale={locale} /></span>
    </Link>
  );
}

export function FooterBrand({ href, locale = "pt" }: { href: string; locale?: Locale }) {
  return <BrandWordmark href={href} locale={locale} variant="footer" />;
}
