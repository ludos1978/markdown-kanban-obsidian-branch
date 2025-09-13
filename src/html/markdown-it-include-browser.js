// Browser-compatible markdown-it-include plugin
// Processes !!!include(filepath)!!! statements by requesting file content from VS Code

(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() :
  typeof define === "function" && define.amd ? define(factory) :
  (global = typeof globalThis !== "undefined" ? globalThis : global || self,
  global.markdownItInclude = factory());
})(this, (function() {
  "use strict";

  const INCLUDE_RE = /!!!include\(([^)]+)\)!!!/gi;

  // Cache for file contents to avoid repeated requests
  const fileCache = new Map();
  const pendingRequests = new Set();

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

      // Look for include pattern
      const match = options.includeRe.exec(state.src.slice(start));
      if (!match || match.index !== 0) {
        return false;
      }

      if (silent) return true;

      const filePath = match[1].trim();

      // Try to get file content
      let content = getFileContent(filePath);
      if (content === null) {
        // File not cached yet - show placeholder and request content
        const token = state.push('include_placeholder', 'span', 0);
        token.content = filePath;
        token.attrSet('class', 'include-placeholder');
        token.attrSet('title', `Loading include file: ${filePath}`);
      } else {
        // Successfully got content - render it inline as markdown
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

      // Render the content as markdown (recursively)
      try {
        const rendered = md.render(content);
        // Add clickable icon before the included content
        const includeIcon = `<span class="include-icon" onclick="openIncludeFile('${escapeHtml(filePath)}')" title="Open ${escapeHtml(filePath)}">📄</span>`;
        return `<span class="included-content-inline" data-include-file="${escapeHtml(filePath)}">${includeIcon}${rendered}</span>`;
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

  // Function to get file content (communicates with VS Code extension)
  function getFileContent(filePath) {
    // Check cache first
    if (fileCache.has(filePath)) {
      return fileCache.get(filePath);
    }

    // If not already requesting, request it
    if (!pendingRequests.has(filePath) && typeof vscode !== 'undefined') {
      pendingRequests.add(filePath);

      try {
        // Request file content from VS Code
        vscode.postMessage({
          type: 'requestIncludeFile',
          filePath: filePath
        });
      } catch (error) {
        console.error('Error requesting include file:', error);
        pendingRequests.delete(filePath);
      }
    }

    // Return null to indicate content is not available yet
    return null;
  }

  // Function to update cache when file content is received
  function updateFileCache(filePath, content) {
    // Remove from pending requests
    pendingRequests.delete(filePath);

    // Update cache
    fileCache.set(filePath, content);

    // Trigger re-render of affected content
    if (typeof window !== 'undefined' && window.renderBoard) {
      // Re-render the board to show updated includes
      setTimeout(() => {
        window.renderBoard();
      }, 0);
    }
  }

  // Helper function for HTML escaping
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose cache update function globally
  if (typeof window !== 'undefined') {
    window.updateIncludeFileCache = updateFileCache;
  }

  return markdownItInclude;
}));