/**
 * @typedef {import("markdown-it/lib/renderer.mjs").RenderRule} RenderRule
 */

/** @type {RenderRule} */
function renderMedia(tokens, index, options, env, renderer) {
  const token = tokens[index];
  const attrs = renderer.renderAttrs(token);

  // Add performance attributes for video/audio elements
  let extraAttrs = '';
  if (token.tag === 'video' || token.tag === 'audio') {
    // Load metadata only (duration, dimensions) but not content - allows playback when user clicks
    extraAttrs += ' preload="metadata"';
    // Add controls so users can play/pause/seek
    extraAttrs += ' controls';
    // Note: Error handling is done via addEventListener in webview.js (CSP-compliant)
  }

  const open = `<${token.tag}${attrs}${extraAttrs}>`;
  const close = `</${token.tag}>`;

  let content = "";
  if (token.children) {
    content = renderer.renderInline(token.children, options, env);
  }

  return `${open}${content}${close}`;
}

module.exports = { renderMedia };
