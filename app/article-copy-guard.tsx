"use client";
import { useEffect } from "react";

/** Reading-interface preference only. Server authorization protects the content. */
export function ArticleCopyGuard() {
  useEffect(() => {
    const selector = ".article-copy, .critical-reading, .article-takeaways, .takeaways";
    const element = (node: Node | null) => node instanceof Element ? node : node?.parentElement;
    const editable = (node: Node | null) => element(node)?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
    const isProtected = (node: Node | null) => !editable(node) && element(node)?.closest(selector);
    const prevent = (event: ClipboardEvent) => {
      // A field can retain an unrelated document selection: copying it stays allowed.
      if (editable(event.target instanceof Node ? event.target : null) || editable(document.activeElement)) return;
      const selection = document.getSelection();
      if (isProtected(selection?.anchorNode ?? null) || isProtected(selection?.focusNode ?? null)) event.preventDefault();
    };
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    return () => { document.removeEventListener("copy", prevent); document.removeEventListener("cut", prevent); };
  }, []);
  return null;
}
