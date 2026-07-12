import sanitizeHtml from "sanitize-html";

// Rich-text content is authored by trusted staff via the TipTap editor, but we
// still sanitize server-side before storage/render since it's rendered as raw
// HTML on public pages — defence in depth against a compromised staff account
// or a bug in the editor producing unexpected markup.
export function sanitizeBlogContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h2", "h3", "h4", "p", "br", "hr", "strong", "em", "u", "s", "blockquote",
      "ul", "ol", "li", "a", "img", "figure", "figcaption", "table", "thead",
      "tbody", "tr", "th", "td", "code", "pre", "span", "div", "iframe",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "width", "height", "frameborder", "allow", "allowfullscreen", "title"],
      "*": ["class"],
    },
    allowedIframeHostnames: ["www.youtube.com", "player.vimeo.com"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
  });
}
