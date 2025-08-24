
// Wiki Links Plugin for markdown-it
// function wikiLinksPlugin(md, options = {}) {
//     const {
//         baseUrl = '',
//         generatePath = (filename) => filename + '.md',
//         target = '_blank',
//         className = 'wiki-link'
//     } = options;

//     function parseWikiLink(state, start, max, silent) {
//         let pos = start;
        
//         // Check for opening [[
//         if (pos + 1 >= max) return false;
//         if (state.src.charCodeAt(pos) !== 0x5B /* [ */) return false;
//         if (state.src.charCodeAt(pos + 1) !== 0x5B /* [ */) return false;
        
//         pos += 2;
        
//         // Find closing ]]
//         let found = false;
//         let content = '';
//         let contentStart = pos;
        
//         while (pos < max) {
//             if (state.src.charCodeAt(pos) === 0x5D /* ] */ && 
//                 pos + 1 < max && 
//                 state.src.charCodeAt(pos + 1) === 0x5D /* ] */) {
//                 found = true;
//                 content = state.src.slice(contentStart, pos);
//                 break;
//             }
//             pos++;
//         }
        
//         if (!found) return false;
        
//         // Parse content: [[document|title]] or [[document]]
//         const parts = content.split('|');
//         const document = parts[0].trim();
//         const title = parts[1] ? parts[1].trim() : document;
        
//         if (!document) return false;
        
//         // Don't process if we're in silent mode
//         if (silent) return true;
        
//         // Create token
//         const token_open = state.push('wiki_link_open', 'a', 1);
//         token_open.attrSet('href', baseUrl + generatePath(document));
//         if (target) token_open.attrSet('target', target);
//         if (className) token_open.attrSet('class', className);
//         token_open.attrSet('data-document', document);
        
//         const token_text = state.push('text', '', 0);
//         token_text.content = title;
        
//         const token_close = state.push('wiki_link_close', 'a', -1);
        
//         state.pos = pos + 2; // Skip closing ]]
//         return true;
//     }

//     // Register the inline rule
//     md.inline.ruler.before('emphasis', 'wiki_link', parseWikiLink);
    
//     // Add render rules
//     md.renderer.rules.wiki_link_open = function(tokens, idx) {
//         const token = tokens[idx];
//         let attrs = '';
        
//         if (token.attrIndex('href') >= 0) {
//             attrs += ` href="${token.attrGet('href')}"`;
//         }
//         if (token.attrIndex('class') >= 0) {
//             attrs += ` class="${token.attrGet('class')}"`;
//         }
//         if (token.attrIndex('target') >= 0) {
//             attrs += ` target="${token.attrGet('target')}"`;
//         }
//         if (token.attrIndex('data-document') >= 0) {
//             attrs += ` data-document="${token.attrGet('data-document')}"`;
//         }
        
//         return `<a${attrs}>`;
//     };
    
//     md.renderer.rules.wiki_link_close = function() {
//         return '</a>';
//     };
// }

// module.exports = {
//     wikiLinksPlugin,
//     VERSION: '1.0.0'
// };

// // Initialize markdown-it with wiki links plugin
// const md = window.markdownit({
//     html: true,
//     linkify: true,
//     typographer: true,
//     breaks: true
// }).use(wikiLinksPlugin, {
//     baseUrl: 'vscode://file/',
//     generatePath: (filename) => filename + '.md',
//     target: '_self',
//     className: 'wiki-link'
// });

// // Get DOM elements
// const input = document.getElementById('markdownInput');
// const output = document.getElementById('output');
// const vscode = window.acquireVsCodeApi ? acquireVsCodeApi() : null;

// // Render markdown function
// function renderMarkdown() {
//     const markdownText = input.value;
//     const html = md.render(markdownText);
//     output.innerHTML = html;
// }

// // Real-time rendering
// input.addEventListener('input', renderMarkdown);

// // Handle wiki link clicks
// document.addEventListener('click', (event) => {
//     const target = event.target;
//     if (target.classList.contains('wiki-link')) {
//         event.preventDefault();
//         const document = target.getAttribute('data-document');
//         const title = target.textContent;
        
//         console.log(`Clicked wiki link: ${document} (${title})`);
        
//         // Send message to VS Code extension if available
//         if (vscode) {
//             vscode.postMessage({
//                 type: 'openDocument',
//                 document: document,
//                 title: title
//             });
//         } else {
//             // Fallback for testing outside VS Code
//             alert(`Would open: ${document}.md`);
//         }
//     }
// });

// // Initial render
// renderMarkdown();

// // Listen for messages from VS Code extension
// if (vscode) {
//     window.addEventListener('message', event => {
//         const message = event.data;
//         switch (message.type) {
//             case 'setContent':
//                 input.value = message.content;
//                 renderMarkdown();
//                 break;
//             case 'updateContent':
//                 if (message.content !== input.value) {
//                     input.value = message.content;
//                     renderMarkdown();
//                 }
//                 break;
//         }
//     });
// }

// Alternative: Simple regex-based approach (commented out)
/*
function simpleWikiLinkReplace(text) {
    return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, document, title) => {
        const linkText = title || document;
        return `<a href="#" class="wiki-link" data-document="${document}" onclick="handleWikiClick('${document}', '${linkText}')">${linkText}</a>`;
    });
}

function handleWikiClick(document, title) {
    console.log(`Clicked: ${document} (${title})`);
    if (vscode) {
        vscode.postMessage({
            type: 'openDocument',
            document: document,
            title: title
        });
    }
}
*/
