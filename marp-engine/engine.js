// engine.js
// import MarkdownIt, { markdownItAll, markdownItCustom } from '../index'

// https://www.npmjs.com/package/markdown-it-container
const mdItContainer = require("markdown-it-container");

// ---
// marpitFragmentedTableRowPlugin
// for each row in a table add data-marpit-fragment
const marpitFragmentedTableRowPlugin = (md) => {
  md.core.ruler.after('block', 'marpit_fragmented_table_row', (state) => {
    if (state.inlineMode) return

    let inTBody = false

    // Add data-marpit-fragment attribute to every rows in table body
    for (const token of state.tokens) {
      if (inTBody) {
        if (token.type === 'tr_open') {
          token.attrSet('data-marpit-fragment', '')
        } else if (token.type === 'tbody_close') {
          inTBody = false
        }
      } else if (token.type === 'tbody_open') {
        inTBody = true
      }
    }
  })
}
// ---

// ---
// create fragmented list using the '+' character
// + list
// + otheritem
// ---
const fragmentedListMarkupsPlus = ['+']
function _fragment_plus(md) {
  // Fragmented list
  md.core.ruler.after('marpit_directives_parse', 'marpit_fragment', (state) => {
    if (state.inlineMode) return
 
    for (const token of state.tokens) {
      if (
        token.type === 'list_item_open' &&
        fragmentedListMarkupsPlus.includes(token.markup)
      ) {
        token.meta = token.meta || {}
        token.meta.marpitFragment = true

        token.attrSet('style', 'marpit-fragments-plus')
      }
    }
  })
 
  // Add data-marpit-fragment(s) attributes to token
  md.core.ruler.after('marpit_fragment', 'marpit_apply_fragment', (state) => {
    if (state.inlineMode) return

    const fragments = { slide: undefined, count: 0 }

    for (const token of state.tokens) {
      if (token.meta && token.meta.marpitSlideElement === 1) {
        fragments.slide = token
        fragments.count = 0
      } else if (token.meta && token.meta.marpitSlideElement === -1) {
        if (fragments.slide && fragments.count > 0) {
          fragments.slide.attrSet('data-marpit-fragments', fragments.count)
        }
      } else if (token.meta && token.meta.marpitFragment) {
        fragments.count += 1
 
        token.meta.marpitFragment = fragments.count
        token.attrSet('data-marpit-fragment', fragments.count)
      }
    }
  })
}
// ---


const _customImageCaption = (md) => {
  // console.log(md.renderer.rules);
  var old = md.renderer.rules.image;

  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    let result = ``;
    result += `<!-- type=${tokens[idx].type} -->`;

    if ("image" == tokens[idx].type) {
      // if (tokens[idx].attrs[2]) {
      let attrs = tokens[idx].attrs;
      let content = tokens[idx].content;
      let attrsTitle;
      let attrsStyle;
      let attrsSrc;
      for (let i = 0; i < attrs.length; i++) {
        if ("title" == attrs[i][0]) {
          attrsTitle = attrs[i][1];
        }
        if ("style" == attrs[i][0]) {
          attrsStyle = attrs[i][1];
        }
        if ("src" == attrs[i][0]) {
          attrsSrc = attrs[i][1];
        }
      }

      if (false) {
        result += `<img `;
        if (attrsSrc !== undefined) {
          result += `src="${attrsSrc}" `;
        }
        if (attrsTitle !== undefined) {
          result += `title="${attrsTitle}" `;
        }
        if (attrsStyle !== undefined) {
          result += `style="${attrsStyle}" `;
        }
        result += `alt="${content}" />`;
      }

      if (attrsTitle !== undefined) {
        result += `<figcaption>${attrsTitle}</figcaption>`;
      }

      if (false) {
        let test = "<!--";
        for (let key in tokens[idx]) {
          if (tokens[idx].hasOwnProperty(key)) {
            // To ensure you're only listing own properties
            //console.log(`Key: ${key}, Value: ${person[key]}`);
            test += `, Key: ${key}, Value: ${tokens[idx][key]}`;
          }
        }
        test += "-->";
        result += test;
      }

      return old(tokens, idx, options, env, self) + result;
    }
  };
};

// import deflistPlugin from './markdown-it-deflist.js';
// const deflistPlugin = require('./markdown-it-deflist.js').default;


// import markdownItMedia from "@gotfeedback/markdown-it-media";

module.exports = ({ marp }) =>
  marp

    // https://www.npmjs.com/package/markdown-it-include
    // !!!include(path)!!!
    .use(require("markdown-it-include"))

    // https://www.npmjs.com/package/markdown-it-strikethrough-alt
    // --Strikeout-- => <s>Strikeout</s>
    .use(require("markdown-it-strikethrough-alt"))

    // https://www.npmjs.com/package/markdown-it-underline
    // _underline_ *emphasis*
    .use(require("markdown-it-underline"))

    // https://www.npmjs.com/package/markdown-it-sub
    // H~2~0 => H<sub>2</sub>O
    .use(require("markdown-it-sub"))

    // https://www.npmjs.com/package/markdown-it-sup
    // 29^th^ => 29<sup>th</sup>
    .use(require("markdown-it-sup"))

    // https://www.npmjs.com/package/markdown-it-mark
    // ==marked== => <mark>inserted</mark>
    .use(require("markdown-it-mark"))

    // https://www.npmjs.com/package/markdown-it-ins
    // ++inserted++ => <ins>inserted</ins>
    .use(require("markdown-it-ins"))

    // https://www.npmjs.com/package/markdown-it-video
    // @[youtube](http://www.youtube.com/embed/dQw4w9WgXcQ)
    // allows exernal video (youtube, ...) with @[]()
    // combine with
    // .use(mdItVideo, {
    //     youtube: { width: 800, height: 600 },
    //     vimeo: { width: 500, height: 281 },
    //     vine: { width: 600, height: 600, embed: 'simple' },
    //     prezi: { width: 550, height: 400 }
    // })
    // .use(require("markdown-it-video"), {
    //   youtube: { },
    //   vimeo: { },
    //   vine: { embed: "simple" },
    //   prezi: { },
    // })

    // https://www.npmjs.com/package/markdown-it-html5-embed
    // allows local video with ![]()
    // combine with
    // .use(mdItHtml5Embed, {
    //     html5embed: {
    //       useImageSyntax: true, // Enables video/audio embed with ![]() syntax (default)
    //       //useLinkSyntax: true   // Enables video/audio embed with []() syntax
    // }})
    // .use(require("markdown-it-html5-embed"), {
    //   html5embed: {
    //     useImageSyntax: true,
    //     attributes: {
    //       audio: 'width="320" controls class="audioplayer"',
    //       video: 'class="audioplayer" controls',
    //     },
    //   },
    // })


		// https://www.npmjs.com/package/@gotfeedback/markdown-it-media
    // Media size: =WxH (see @mdit/img-size).
    // Multiple sources: ![media/type](/path/to/alt-media.mp4).
    // Thumbnails: #=/path/to/poster.jpeg.
    // Captions: [lang](/path/to/captions.lang.vtt).
		// .use(require("@gotfeedback/markdown-it-media").default, {
		// ![](./video.mp4 #=./img.jpg =100x100)
		.use(require("./markdown-it-media").default, {
			controls: true,
			attrs: {
				image: {},
				audio: {},
				video: {},
				},
			}
		)

    // https://github.com/ArcticLampyrid/markdown-it-multicolumn
    // ---:1
    // Hi, W=1/6
    // :--:2
    // Hi, W=1/3
    // :--:3
    // Hi, W=1/2
    // :---
    .use(require("markdown-it-multicolumn").default)
    
    // https://www.npmjs.com/package/markdown-it-abbr
    // *[HTML]: Hyper Text Markup Language
    // *[W3C]:  World Wide Web Consortium
    // The HTML specification
    // is maintained by the W3C.
    .use(require("markdown-it-abbr"))

    // https://www.npmjs.com/package/@peaceroad/markdown-it-footnote-here
    // A paragraph.[^1]
    // [^1]: A footnote.
    .use(require("markdown-it-footnote-here"))

    // https://www.npmjs.com/package/markdown-it-image-figures
    // <figure><img ...></figure>
    // figcaption: Set figcaption to true or "title" to use the title as a <figcaption> block after the image; 
    // set figcaption to "alt" to use the alt text as a <figcaption>. 
    // E.g.: ![This is an alt](fig.png "This is a title")
    .use(require("markdown-it-image-figures"), {
      figcaption: 'title'
    })

    .use(mdItContainer, "note")
		.use(mdItContainer, "comment")
    .use(mdItContainer, "highlight")
    .use(mdItContainer, "mark-red")
    .use(mdItContainer, "mark-green")
    .use(mdItContainer, "mark-blue")
    .use(mdItContainer, "mark-cyan")
    .use(mdItContainer, "mark-magenta")
		.use(mdItContainer, "mark-yellow")

    .use(mdItContainer, "center")
    .use(mdItContainer, "center100")
    .use(mdItContainer, "right")
    .use(mdItContainer, "caption")

    .use(mdItContainer, "columns")
    .use(mdItContainer, "columns3")
    
    .use(mdItContainer, "small66")
    .use(mdItContainer, "small50")
    .use(mdItContainer, "small33")
    .use(mdItContainer, "small25")

    // https://www.npmjs.com/package/markdown-it-anchor
    // adds id attribute to headings
    .use(require("markdown-it-anchor"), {
      permalink: false,
      permalinkBefore: true,
      permalinkSymbol: "§",
    })

    // https://www.npmjs.com/package/markdown-it-toc-done-right
    // [toc]
    .use(require("markdown-it-toc-done-right"), {level: 1})

    // this is broken
    // https://www.npmjs.com/package/mermaid-it
    // ~~~mermaid
    //   graph TD
    //     A[Christmas] -->|Get money| B(Go shopping)
    //     B --> C{Let me think}
    //     C -->|One| D[Laptop]
    //     C -->|Two| E[iPhone]
    //     C -->|Three| F[Car]
    // ~~~
    .use(require('mermaid-it'))

    //
    // 
    // .use(_customImageCaption)

    // create fragmented list using the '+' character
    // + list
    // + otheritem
    .use(_fragment_plus)

    // [ ] unchecked
    // [x] checked
    // .use(require('markdown-it-checkbox'));
    .use(require('markdown-it-checkboxes'))
		
		// this one works partially
		.use(require('./markdown-it-deflist-modified.js').default)
		// .use(require('markdown-it-deflist'))
		;

    // 
    // .use(require(markdown-it-plugins))

    // https://www.npmjs.com/package/markdown-it-footnote
    // Here is a footnote reference,[^1] and another.[^longnote]
    // [^1]: Here is the footnote.
    // ^[Inlines notes are easier to write, since you don't have to pick an identifier and move down to type the note.]
    // .use(require("markdown-it-footnote")

    // .use(require("markdown-it-figure-caption"))
    // .use(require("markdown-it-image-caption"))

    // https://www.npmjs.com/package/markdown-it-all
    // .use(require("markdown-it-all").markdownItCustom, {
    //     abbreviation: true,
    //     // customContainer: string[],
    //     definitionList: true,
    //     emoji: true,
    //     footnote: true,
    //     // githubToc: GithubTocOptions,
    //     insert: true,
    //     // latex: true,
    //     mark: true,
    //     // mermaid: true,
    //     // sourceMap: true,
    //     subscript: true,
    //     superscript: true,
    //     taskList: true,
    // })

    // https://www.npmjs.com/package/markdown-it-deflist
    // Term 1
    // :   Definition
    // with lazy continuation.
    // .use( require("markdown-it-deflist"))

    // https://www.npmjs.com/package/markdown-it-emph
    // _italic_ *emphasis* __bold__ **strong** ____underline____
    // .use(require("markdown-it-emph"))

