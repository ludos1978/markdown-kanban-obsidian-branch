/**
 * @typedef {Record<string, string>} AttrsOption
 * @typedef {object} PluginOptions
 * @property {boolean} [controls=false]
 * @property {object} [attrs]
 * @property {AttrsOption} [attrs.image]
 * @property {AttrsOption} [attrs.audio]
 * @property {AttrsOption} [attrs.video]
 * @typedef {import("markdown-it").PluginWithOptions<PluginOptions>} Plugin
 */

const { createMediaRule } = require("./ruler.js");
const { renderMedia } = require("./render.js");

/** @type {Plugin} */
function markdownItMedia(md, options) {
  md.inline.ruler.before("image", "media", createMediaRule(options));
  // md.inline.ruler.disable("image");
	
	// old working version
//	md.inline.ruler.after("image", "media", createMediaRule(options));

  md.renderer.rules.audio = renderMedia;
  md.renderer.rules.video = renderMedia;
}

module.exports = { markdownItMedia };
