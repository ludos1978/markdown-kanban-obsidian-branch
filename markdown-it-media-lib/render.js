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
    // Do not load ANYTHING until user clicks play - prevents memory issues with large files
    extraAttrs += ' preload="none"';
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
