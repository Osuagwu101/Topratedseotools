import { useEffect } from "react";
import { Layout } from "@/components/layout";
import { Hero } from "@/components/home/Hero";
import { TrustStrip } from "@/components/home/TrustStrip";
import { WhyChooseUs } from "@/components/home/WhyChooseUs";
import { HowItWorks } from "@/components/home/HowItWorks";
import { PopularTools } from "@/components/home/PopularTools";
import { WhoItsFor } from "@/components/home/WhoItsFor";
import { Testimonials } from "@/components/Testimonials";
import { SupportCredibility } from "@/components/home/SupportCredibility";
import { SecurePayments } from "@/components/home/SecurePayments";
import { FAQ } from "@/components/home/FAQ";
import { FinalCTA } from "@/components/home/FinalCTA";
import { useSiteSettings } from "@/context/siteSettings";
import { trackHomepageViewed } from "@/lib/analytics";

export default function Home() {
  const { settings } = useSiteSettings();

  useEffect(() => {
    trackHomepageViewed();
  }, []);

  useEffect(() => {
    const title = settings.seoTitle || "Top Rated SEO Tools — Affordable Access to Premium Tools";
    const description =
      settings.seoDescription ||
      "Get affordable, verified access to the premium SEO, writing, and productivity tools you already rely on.";

    document.title = title;

    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", "website");
    if (settings.seoOgImageUrl) setMeta("property", "og:image", settings.seoOgImageUrl);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);

    if (settings.seoCanonicalUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", settings.seoCanonicalUrl);
    }

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: settings.copyrightText,
          url: settings.seoCanonicalUrl || window.location.origin,
          ...(settings.siteLogoUrl ? { logo: settings.siteLogoUrl } : {}),
        },
        {
          "@type": "WebSite",
          name: settings.copyrightText,
          url: settings.seoCanonicalUrl || window.location.origin,
        },
      ],
    };
    let script = document.querySelector<HTMLScriptElement>("#homepage-jsonld");
    if (!script) {
      script = document.createElement("script");
      script.id = "homepage-jsonld";
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
  }, [settings]);

  return (
    <Layout>
      <Hero />
      <TrustStrip />
      <WhyChooseUs />
      <HowItWorks />
      <PopularTools />
      <WhoItsFor />
      <Testimonials page="home" />
      <SupportCredibility />
      <SecurePayments />
      <FAQ />
      <FinalCTA />
    </Layout>
  );
}
