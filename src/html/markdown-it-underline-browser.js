// Browser-compatible version of markdown-it-underline
(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() :
  typeof define === "function" && define.amd ? define(factory) :
  (global = typeof globalThis !== "undefined" ? globalThis : global || self,
  global.markdownitUnderline = factory());
})(this, (function() {
  "use strict";

  function markdownItUnderline(md) {
    function renderEm(tokens, idx, opts, _, slf) {
      var token = tokens[idx];
      if (token.markup === '_') {
        token.tag = 'u';
      }
      return slf.renderToken(tokens, idx, opts);
    }

    md.renderer.rules.em_open = renderEm;
    md.renderer.rules.em_close = renderEm;
  }

  return markdownItUnderline;
}));