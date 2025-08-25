// Wiki Links Plugin for markdown-it
function wikiLinksPlugin(md, options = {}) {
    const {
        baseUrl = '',
        generatePath = (filename) => filename + '.md',
        target = '',
        className = 'wiki-link'
    } = options;

    function parseWikiLink(state, silent) {
        let pos = state.pos;
        
        // Check for opening [[
        if (pos + 1 >= state.posMax) return false;
        if (state.src.charCodeAt(pos) !== 0x5B /* [ */) return false;
        if (state.src.charCodeAt(pos + 1) !== 0x5B /* [ */) return false;
        
        pos += 2;
        
        // Find closing ]]
        let found = false;
        let content = '';
        let contentStart = pos;
        
        while (pos < state.posMax) {
            if (state.src.charCodeAt(pos) === 0x5D /* ] */ && 
                pos + 1 < state.posMax && 
                state.src.charCodeAt(pos + 1) === 0x5D /* ] */) {
                found = true;
                content = state.src.slice(contentStart, pos);
                break;
            }
            pos++;
        }
        
        if (!found) return false;
        
        // Parse content: [[document|title]] or [[document]]
        const parts = content.split('|');
        const document = parts[0].trim();
        const title = parts[1] ? parts[1].trim() : document;
        
        if (!document) return false;
        
        // Don't process if we're in silent mode
        if (silent) return true;
        
        // Create token
        const token_open = state.push('wiki_link_open', 'a', 1);
        token_open.attrSet('href', '#'); // Use # as placeholder
        if (className) token_open.attrSet('class', className);
        token_open.attrSet('data-document', document);
        token_open.attrSet('title', `Wiki link: ${document}`);
        
        const token_text = state.push('text', '', 0);
        token_text.content = title;
        
        const token_close = state.push('wiki_link_close', 'a', -1);
        
        state.pos = pos + 2; // Skip closing ]]
        return true;
    }

    // Register the inline rule
    md.inline.ruler.before('emphasis', 'wiki_link', parseWikiLink);
    
    // Add render rules
    md.renderer.rules.wiki_link_open = function(tokens, idx) {
        const token = tokens[idx];
        let attrs = '';
        
        if (token.attrIndex('href') >= 0) {
            attrs += ` href="${token.attrGet('href')}"`;
        }
        if (token.attrIndex('class') >= 0) {
            attrs += ` class="${token.attrGet('class')}"`;
        }
        if (token.attrIndex('title') >= 0) {
            attrs += ` title="${token.attrGet('title')}"`;
        }
        if (token.attrIndex('data-document') >= 0) {
            attrs += ` data-document="${escapeHtml(token.attrGet('data-document'))}"`;
        }
        
        return `<a${attrs}>`;
    };
    
    md.renderer.rules.wiki_link_close = function() {
        return '</a>';
    };
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        // Initialize markdown-it with enhanced wiki links plugin
        const md = window.markdownit({
            html: true,
            linkify: false,
            typographer: true,
            breaks: true
        }).use(wikiLinksPlugin, {
            className: 'wiki-link'
        });

        // Enhanced image renderer - preserves original paths
        md.renderer.rules.image = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const src = token.attrGet('src') || '';
            const title = token.attrGet('title') || '';
            const alt = token.content || '';
            
            // Store original src for click handling
            const originalSrcAttr = src.startsWith('vscode-webview://') ? '' : ` data-original-src="${escapeHtml(src)}"`;
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            
            return `<img src="${src}" alt="${escapeHtml(alt)}"${titleAttr}${originalSrcAttr} class="markdown-image" />`;
        };
        
        // Enhanced link renderer
        md.renderer.rules.link_open = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const href = token.attrGet('href') || '';
            const title = token.attrGet('title') || '';
            
            // Don't make webview URIs clickable (they're for display only)
            if (href.startsWith('vscode-webview://')) {
                return '<span class="webview-uri-text">';
            }
            
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            const targetAttr = (href.startsWith('http://') || href.startsWith('https://')) ? ` target="_blank"` : '';
            
            return `<a href="#" data-original-href="${escapeHtml(href)}"${titleAttr}${targetAttr} class="markdown-link">`;
        };
        
        md.renderer.rules.link_close = function(tokens, idx, options, env, renderer) {
            const openToken = tokens[idx - 2]; // link_open token
            if (openToken && openToken.attrGet && openToken.attrGet('href') && 
                openToken.attrGet('href').startsWith('vscode-webview://')) {
                return '</span>';
            }
            return '</a>';
        };
        
        const rendered = md.render(text);
        
        // Remove paragraph wrapping for single line content
        if (!text.includes('\n') && rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) {
            return rendered.slice(3, -5);
        }
        
        return rendered;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        return escapeHtml(text);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}