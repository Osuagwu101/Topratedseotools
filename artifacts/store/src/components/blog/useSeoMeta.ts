import { useEffect } from 'react';

export function useSeoMeta({
  title,
  description,
  canonical,
  ogImage,
  noIndex,
  noFollow
}: {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
  noFollow?: boolean;
}) {
  useEffect(() => {
    if (title) document.title = title;

    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
      setMeta("name", "twitter:description", description);
    }
    if (title) {
      setMeta("property", "og:title", title);
      setMeta("name", "twitter:title", title);
    }
    if (ogImage) {
      setMeta("property", "og:image", ogImage);
    }
    setMeta("name", "twitter:card", "summary_large_image");

    if (noIndex || noFollow) {
      const robots = [];
      if (noIndex) robots.push("noindex");
      if (noFollow) robots.push("nofollow");
      setMeta("name", "robots", robots.join(", "));
    } else {
      setMeta("name", "robots", "index, follow");
    }

    if (canonical) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
    }
  }, [title, description, canonical, ogImage, noIndex, noFollow]);
}