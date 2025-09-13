// Browser-compatible version of markdown-it-multicolumn
(function() {
    function render(tokens, index, options, env, self) {
        switch (tokens[index].type) {
            case "multicolumn_open":
                tokens[index].attrJoin("class", "multicolumn");
                tokens[index].attrJoin("style", "display: flex; flex-direction: row; align-items: flex-start;");
                break;
            case "multicolumn_block_open":
                tokens[index].attrJoin("class", "multicolumn-column");
                tokens[index].attrJoin("style", "flex-grow: " + tokens[index].meta.growth + "; flex-basis:0;");
                break;
        }
        return self.renderToken(tokens, index, options, env, self);
    }

    function ruler(state, startLine, endLine, silent) {
        var start = state.bMarks[startLine] + state.tShift[startLine];
        //Quickly check
        var firstChar = state.src.charCodeAt(start);
        if (firstChar != 45) {
            return false;
        }
        var max = state.eMarks[startLine];
        if (max - start < 4) {
            return false;
        }
        if (state.src.substr(start, 4) !== "---:") {
            return false;
        }
        var containerToken = state.push('multicolumn_open', 'div', 1);
        containerToken.block = true;
        var blockToken = state.push('multicolumn_block_open', 'div', 1);
        blockToken.block = true;
        var growth = parseInt(state.src.substring(start + 4, max).trim(), 10) || 1;
        blockToken.meta = {
            growth: growth
        };
        var autoClosed = false;
        var nextLine = startLine;
        var parseContent = function (startLine, endLine) {
            var old_line_max = state.lineMax;
            var old_parent = state.parentType;
            state.parentType = 'multicolumn';
            state.lineMax = endLine;
            state.md.block.tokenize(state, startLine, endLine);
            state.parentType = old_parent;
            state.lineMax = old_line_max;
        };
        var startCount = 1;
        for (;;) {
            nextLine++;
            if (nextLine >= endLine) {
                autoClosed = true;
                break;
            }
            start = state.bMarks[nextLine] + state.tShift[nextLine];
            max = state.eMarks[nextLine];
            if (max - start < 4) {
                continue;
            }
            if (state.src.substr(start, 4) === "---:") {
                startCount++;
            }
            else if (state.src.substr(start, 4) === ":---") {
                startCount--;
                if (!startCount) {
                    break;
                }
            }
            else if (state.src.substr(start, 4) === ":--:") {
                parseContent(startLine + 1, nextLine);
                blockToken = state.push('multicolumn_block_close', 'div', -1);
                blockToken.block = true;
                blockToken = state.push('multicolumn_block_open', 'div', 1);
                blockToken.block = true;
                var growth = parseInt(state.src.substring(start + 4, max).trim(), 10) || 1;
                blockToken.meta = {
                    growth: growth
                };
                startLine = nextLine;
            }
        }
        parseContent(startLine + 1, nextLine);
        blockToken = state.push('multicolumn_block_close', 'div', -1);
        blockToken.block = true;
        containerToken = state.push('multicolumn_close', 'div', -1);
        containerToken.block = true;
        state.line = nextLine + (autoClosed ? 0 : 1);
        return true;
    }

    var MultiColumnPlugin = function (md) {
        md.block.ruler.before('fence', 'multicolumn', ruler, {
            alt: ['paragraph', 'reference', 'blockquote', 'list']
        });
        md.renderer.rules['multicolumn_open'] = render;
        md.renderer.rules['multicolumn_block_open'] = render;
        md.renderer.rules['multicolumn_block_close'] = render;
        md.renderer.rules['multicolumn_close'] = render;
    };

    // Export for browser use
    window.markdownItMulticolumn = MultiColumnPlugin;
    // console.log('markdown-it-multicolumn plugin loaded and available as window.markdownItMulticolumn');
})();