// Browser-compatible stub for markdown-it-include
// Note: File includes are processed server-side in engine.js
// This stub handles client-side rendering gracefully

(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() :
  typeof define === "function" && define.amd ? define(factory) :
  (global = typeof globalThis !== "undefined" ? globalThis : global || self,
  global.markdownitInclude = factory());
})(this, (function() {
  "use strict";

  const INCLUDE_RE = /!{3}\s*include(.+?)!{3}/i;
  const BRACES_RE = /\((.+?)\)/i;

  function markdownItInclude(md, options = {}) {
    const defaultOptions = {
      showWarning: true,
      warningMessage: 'File includes are processed server-side'
    };

    options = { ...defaultOptions, ...options };

    md.inline.ruler.before('text', 'include', function(state, silent) {
      const start = state.pos;
      const max = state.posMax;

      // Check for include syntax
      if (state.src.charCodeAt(start) !== 0x21 /* ! */) return false;
      if (state.src.charCodeAt(start + 1) !== 0x21 /* ! */) return false;
      if (state.src.charCodeAt(start + 2) !== 0x21 /* ! */) return false;

      const match = INCLUDE_RE.exec(state.src.slice(start));
      if (!match) return false;

      if (silent) return true;

      // Extract filename
      let filename = match[1].trim();
      const braceMatch = BRACES_RE.exec(filename);
      if (braceMatch) {
        filename = braceMatch[1];
      }

      const token = state.push('include_warning', 'span', 0);
      token.content = filename;

      state.pos = start + match[0].length;
      return true;
    });

    md.renderer.rules.include_warning = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      const filename = token.content;

      // Use basic HTML escaping since renderer.utils might not be available
      const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      };

      return `<span class="include-warning" title="File includes are processed server-side. This file should be included when the markdown is rendered on the server.">` +
             `📄 Include: ${escapeHtml(filename)}` +
             `</span>`;
    };
  }

  return markdownItInclude;
}));