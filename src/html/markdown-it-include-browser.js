// Backend-driven include system
// Replaces !!!include(filepath)!!! with pre-processed content from backend

(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() :
  typeof define === "function" && define.amd ? define(factory) :
  (global = typeof globalThis !== "undefined" ? globalThis : global || self,
  global.markdownItInclude = factory());
})(this, (function() {
  "use strict";

  const INCLUDE_RE = /!!!include\(([^)]+)\)!!!/;

  // Store for processed content from backend
  const processedIncludes = new Map();

  function markdownItInclude(md, options = {}) {
    const defaultOptions = {
      root: '',
      includeRe: INCLUDE_RE
    };

    options = { ...defaultOptions, ...options };

    // Inline rule for include processing
    md.inline.ruler.before('text', 'include_inline', function(state, silent) {
      const start = state.pos;
      const max = state.posMax;

      // Look for include pattern using match() to avoid regex state issues
      const srcSlice = state.src.slice(start);
      const match = srcSlice.match(options.includeRe);
      if (!match || match.index !== 0) {
        return false;
      }

      if (silent) {return true;}

      const filePath = match[1].trim();

      // Get processed content from backend store
      const content = processedIncludes.get(filePath);
      if (content === undefined) {
        // Content not available yet - show placeholder
        const token = state.push('include_placeholder', 'span', 0);
        token.content = filePath;
        token.attrSet('class', 'include-placeholder');
        token.attrSet('title', `Loading include file: ${filePath}`);
      } else {
        // Content available - render it
        const token = state.push('include_content', 'span', 0);
        token.content = content;
        token.attrSet('class', 'included-content-inline');
        token.attrSet('data-include-file', filePath);
      }

      state.pos = start + match[0].length;
      return true;
    });

    // Renderer for include content
    md.renderer.rules.include_content = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      const content = token.content;
      const filePath = token.attrGet('data-include-file') || '';
      const isBlock = token.attrGet('data-include-block') === 'true';

      // Render the content as markdown
      try {
        let rendered;
        let wrapperTag;
        let wrapperClass;

        // Check if content has block-level elements (headers, lists, etc.)
        const hasBlockContent = /^#{1,6}\s|^\*\s|^\d+\.\s|^\>|^```|^\|/m.test(content);

        if (hasBlockContent || isBlock) {
          // Use div for block content and full render
          rendered = md.render(content);
          wrapperTag = 'div';
          wrapperClass = 'included-content-block';
        } else {
          // Use span for inline content and renderInline
          rendered = md.renderInline(content);
          wrapperTag = 'span';
          wrapperClass = 'included-content-inline';
        }

        // Each include gets its own wrapper
        return `<${wrapperTag} class="${wrapperClass}" data-include-file="${escapeHtml(filePath)}">${rendered}</${wrapperTag}>`;
      } catch (error) {
        console.error('Error rendering included content:', error);
        return `<span class="include-error" title="Error rendering included content">Error including: ${escapeHtml(filePath)}</span>`;
      }
    };

    // Renderer for include placeholders
    md.renderer.rules.include_placeholder = function(tokens, idx, options, env, renderer) {
      const token = tokens[idx];
      const filePath = token.content;

      return `<span class="include-placeholder" title="Loading include file: ${escapeHtml(filePath)}">` +
             `📄⏳ Loading: ${escapeHtml(filePath)}` +
             `</span>`;
    };
  }

  // Function to update processed include content from backend
  function updateIncludeContent(filePath, content) {
    // Store the processed content from backend
    processedIncludes.set(filePath, content);

    // Instead of requesting a full board update (which causes infinite loops),
    // just trigger a local re-render if we have current board data
    if (typeof window !== 'undefined' && window.currentBoard && typeof window.renderBoard === 'function') {
      // Use setTimeout to avoid synchronous re-render during current render
      setTimeout(() => {
        window.renderBoard();
      }, 10);
    }
  }

  // Helper function for HTML escaping - now using global ValidationUtils.escapeHtml
  function escapeHtml(text) {
    return window.escapeHtml ? window.escapeHtml(text) : text;
  }

  // Function to clear all processed include content
  function clearIncludeContent() {
    processedIncludes.clear();
  }

  // Expose content functions globally
  if (typeof window !== 'undefined') {
    window.updateIncludeContent = updateIncludeContent;
    window.clearIncludeContent = clearIncludeContent;
  }

  return markdownItInclude;
}));