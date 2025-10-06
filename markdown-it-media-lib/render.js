/**
 * @typedef {import("markdown-it/lib/renderer.mjs").RenderRule} RenderRule
 */

/** @type {RenderRule} */
function renderMedia(tokens, index, options, env, renderer) {
  const token = tokens[index];
  const attrs = renderer.renderAttrs(token);

  // Add performance and error-handling attributes for video/audio elements
  let extraAttrs = '';
  if (token.tag === 'video' || token.tag === 'audio') {
    // Only load metadata initially (not the full file) - prevents memory issues
    extraAttrs += ' preload="metadata"';
    // Prevent autoplay to avoid unwanted loading
    extraAttrs += ' autoplay="false"';
    // Add error recovery attributes
    extraAttrs += ' onerror="this.dataset.loadFailed=\'true\';this.classList.add(\'media-load-failed\');"';
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
