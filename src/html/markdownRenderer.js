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

// Tag detection and rendering plugin for markdown-it
function tagPlugin(md, options = {}) {
    const tagColors = options.tagColors || {};
    
    function parseTag(state, silent) {
        let pos = state.pos;
        
        // Check for # at word boundary
        if (state.src.charCodeAt(pos) !== 0x23 /* # */) return false;
        if (pos > 0 && state.src.charCodeAt(pos - 1) !== 0x20 /* space */ && 
            state.src.charCodeAt(pos - 1) !== 0x0A /* newline */ &&
            pos !== 0) return false;
        
        pos++;
        if (pos >= state.posMax) return false;
        
        // Parse tag content - for gather tags, include full expression
        let tagStart = pos;
        let tagContent = '';
        
        // Check if it's a gather tag
        if (state.src.substr(pos, 7) === 'gather_') {
            // For gather tags, capture everything until next space or end
            while (pos < state.posMax) {
                const char = state.src.charCodeAt(pos);
                // Stop at space or newline
                if (char === 0x20 || char === 0x0A) break;
                pos++;
            }
            tagContent = state.src.slice(tagStart, pos);
        } else {
            // For regular tags, use existing logic
            while (pos < state.posMax) {
                const char = state.src.charCodeAt(pos);
                // Allow alphanumeric, underscore, hyphen
                if ((char >= 0x30 && char <= 0x39) || // 0-9
                    (char >= 0x41 && char <= 0x5A) || // A-Z
                    (char >= 0x61 && char <= 0x7A) || // a-z
                    char === 0x5F || // _
                    char === 0x2D) { // -
                    pos++;
                } else {
                    break;
                }
            }
            tagContent = state.src.slice(tagStart, pos);
        }
        
        if (tagContent.length === 0) return false;
        
        if (silent) return true;
        
        // Create token
        const token = state.push('tag', 'span', 0);
        token.content = tagContent;
        token.markup = '#';
        
        state.pos = pos;
        return true;
    }
    
    md.inline.ruler.before('emphasis', 'tag', parseTag);
    
    md.renderer.rules.tag = function(tokens, idx) {
        const token = tokens[idx];
        const tagContent = token.content;
        const fullTag = '#' + token.content;
        
        // Extract base tag name for styling (before any operators)
        let baseTagName = tagContent;
        if (tagContent.startsWith('gather_')) {
            baseTagName = 'gather'; // Use 'gather' as base for all gather tags
        } else {
            const baseMatch = tagContent.match(/^([a-zA-Z0-9_-]+)/);
            baseTagName = baseMatch ? baseMatch[1].toLowerCase() : tagContent.toLowerCase();
        }
        
        return `<span class="kanban-tag" data-tag="${escapeHtml(baseTagName)}">${escapeHtml(fullTag)}</span>`;
    };
}

// Date and person tag plugin for markdown-it
function datePersonTagPlugin(md, options = {}) {
    function parseDatePersonTag(state, silent) {
        let pos = state.pos;
        
        // Check for @ at word boundary
        if (state.src.charCodeAt(pos) !== 0x40 /* @ */) return false;
        if (pos > 0 && state.src.charCodeAt(pos - 1) !== 0x20 /* space */ && 
            state.src.charCodeAt(pos - 1) !== 0x0A /* newline */ &&
            pos !== 0) return false;
        
        pos++;
        if (pos >= state.posMax) return false;
        
        let tagStart = pos;
        let tagContent = '';
        let tagType = '';
        
        // Check if it's a date pattern (YYYY-MM-DD or DD-MM-YYYY)
        const remaining = state.src.slice(pos);
        const dateMatch = remaining.match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/);
        
        if (dateMatch) {
            tagContent = dateMatch[1];
            tagType = 'date';
            pos += tagContent.length;
        } else {
            // Parse as person name (letters, numbers, underscore, hyphen)
            while (pos < state.posMax) {
                const char = state.src.charCodeAt(pos);
                if ((char >= 0x30 && char <= 0x39) || // 0-9
                    (char >= 0x41 && char <= 0x5A) || // A-Z
                    (char >= 0x61 && char <= 0x7A) || // a-z
                    char === 0x5F || // _
                    char === 0x2D) { // -
                    pos++;
                } else {
                    break;
                }
            }
            
            if (pos === tagStart) return false; // No content
            
            tagContent = state.src.slice(tagStart, pos);
            tagType = 'person';
        }
        
        if (silent) return true;
        
        // Create token
        const token = state.push('date_person_tag', 'span', 0);
        token.content = tagContent;
        token.markup = '@';
        token.meta = { type: tagType };
        
        state.pos = pos;
        return true;
    }
    
    md.inline.ruler.before('emphasis', 'date_person_tag', parseDatePersonTag);
    
    md.renderer.rules.date_person_tag = function(tokens, idx) {
        const token = tokens[idx];
        const tagContent = token.content;
        const tagType = token.meta.type;
        const fullTag = '@' + token.content;
        
        const className = tagType === 'date' ? 'kanban-date-tag' : 'kanban-person-tag';
        const dataAttr = tagType === 'date' ? 'data-date' : 'data-person';
        
        return `<span class="${className}" ${dataAttr}="${escapeHtml(tagContent)}">${escapeHtml(fullTag)}</span>`;
    };
}

// Helper function to extract first tag from text
function extractFirstTag(text) {
    if (!text) return null;
    const tagMatch = text.match(/#([a-zA-Z0-9_-]+)/);
    return tagMatch ? tagMatch[1].toLowerCase() : null;
}

// Helper function to extract all tags from text
function extractAllTags(text) {
    if (!text) return [];
    const tagMatches = text.match(/#([a-zA-Z0-9_-]+)/g);
    return tagMatches ? tagMatches.map(tag => tag.substring(1).toLowerCase()) : [];
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        // Initialize markdown-it with enhanced wiki links and tags plugins
        const md = window.markdownit({
            html: true,
            linkify: false,
            typographer: true,
            breaks: true
        })
        .use(wikiLinksPlugin, {
            className: 'wiki-link'
        })
        .use(tagPlugin, {
            tagColors: window.tagColors || {}
        })
        .use(datePersonTagPlugin); // Add this line
        
        // Add plugins that are available from CDN (CSP-compliant)
        if (typeof window.markdownitEmoji !== 'undefined') {
            md.use(window.markdownitEmoji); // :smile: => 😊
        }
        if (typeof window.markdownitFootnote !== 'undefined') {
            md.use(window.markdownitFootnote); // [^1]: footnote
        }
        
        // Note: Most other plugins can't be loaded via CDN due to CSP restrictions
        // Advanced plugin functionality would need to be bundled or implemented differently
        if (typeof window.markdownItMediaCustom !== 'undefined') {
            md.use(window.markdownItMediaCustom, {
                controls: true,
                attrs: {
                    image: {},
                    audio: {},
                    video: {}
                }
            }); // Custom media plugin for video/audio
        }
        
        // Add custom renderer for video and audio to handle path mapping
        const originalVideoRenderer = md.renderer.rules.video;
        const originalAudioRenderer = md.renderer.rules.audio;
        
        md.renderer.rules.video = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            console.log('Video token:', token);
            
            // Process source children to map paths
            if (token.children) {
                token.children.forEach(child => {
                    if (child.type === 'source' && child.attrGet) {
                        const originalSrc = child.attrGet('src');
                        if (originalSrc) {
                            console.log('Original video src:', originalSrc);
                            // Use mapped path if available, otherwise use original
                            const displaySrc = (window.currentImageMappings && window.currentImageMappings[originalSrc]) || originalSrc;
                            console.log('Mapped video src:', displaySrc);
                            child.attrSet('src', displaySrc);
                        }
                    }
                });
            }
            
            return originalVideoRenderer ? originalVideoRenderer(tokens, idx, options, env, renderer) : renderer.renderToken(tokens, idx);
        };
        
        md.renderer.rules.audio = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            console.log('Audio token:', token);
            
            // Process source children to map paths
            if (token.children) {
                token.children.forEach(child => {
                    if (child.type === 'source' && child.attrGet) {
                        const originalSrc = child.attrGet('src');
                        if (originalSrc) {
                            console.log('Original audio src:', originalSrc);
                            // Use mapped path if available, otherwise use original
                            const displaySrc = (window.currentImageMappings && window.currentImageMappings[originalSrc]) || originalSrc;
                            console.log('Mapped audio src:', displaySrc);
                            child.attrSet('src', displaySrc);
                        }
                    }
                });
            }
            
            return originalAudioRenderer ? originalAudioRenderer(tokens, idx, options, env, renderer) : renderer.renderToken(tokens, idx);
        };

        // Rest of the function remains the same...
        // Enhanced image renderer - uses mappings for display but preserves original paths
        md.renderer.rules.image = function(tokens, idx, options, env, renderer) {
            const token = tokens[idx];
            const originalSrc = token.attrGet('src') || '';
            const title = token.attrGet('title') || '';
            const alt = token.content || '';
            
            // Use mapped path if available, otherwise use original
            const displaySrc = (window.currentImageMappings && window.currentImageMappings[originalSrc]) || originalSrc;
            
            // Store original src for click handling
            const originalSrcAttr = ` data-original-src="${escapeHtml(originalSrc)}"`;
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            
            return `<img src="${displaySrc}" alt="${escapeHtml(alt)}"${titleAttr}${originalSrcAttr} class="markdown-image" />`;
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