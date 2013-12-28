/*
 * Copyright (c) 2013 Peter Flynn
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, regexp: true */
/*global define, brackets, CodeMirror */

/**
 * Utilities for working with regular expressions and their matches
 */
define(function (require, exports, module) {
    "use strict";
    
    // Our own modules
    var mode                    = require("regex-mode").mode;
    
    
    /**
     * Run our tokenizer over the regex and return an array of informal "token" objects
     */
    function regexTokens(regexText) {
        var tokens = [];
        var state = CodeMirror.startState(mode);
        var stream = new CodeMirror.StringStream(regexText);
        while (!stream.eol()) {
            var style = mode.token(stream, state);
            tokens.push({ startCh: stream.start, string: stream.current(), style: style, nestLevel: state.nesting.length });
            stream.start = stream.pos;
        }
        return tokens;
    }
    
    /**
     * Returns the range in regexText that represents capturing group #groupI.
     * Tokens are returned for internal reuse with findGroupInMatch().
     * @param {string} regexText
     * @param {number} groupI 1-indexed
     * @return {{start:number, end:number, tokens:Array}?} Null if no such group. 'end' is exclusive.
     */
    function findGroupInRegex(regexText, groupI) {
        
        var tokens = regexTokens(regexText);
        
        var startCh, nestLevel;
        
        var i, atGroupI = 0, token;
        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            if (token.style === "bracket" && token.string === "(") {
                if (!tokens[i + 1] || tokens[i + 1].string !== "?:") {  // ignore non-capturing groups
                    atGroupI++;
                    token.groupI = atGroupI;  // recorded for later use by findGroupInMatch()
                    if (atGroupI === groupI) {
                        startCh = token.startCh;
                        nestLevel = token.nestLevel - 1;  // nestLevel reflects post-token state, so we want 1 level up
                        break;
                    }
                }
            }
        }
        
        for ("ugh, jslint"; i < tokens.length; i++) {
            token = tokens[i];
            if (token.nestLevel === nestLevel) {
                console.assert(token.style === "bracket" && token.string === ")");
                return { start: startCh, end: token.startCh + token.string.length, tokens: tokens };
            }
        }
        
        return null;
    }
    
    
    /**
     * Returns the range in sampleText that was matched by capturing group #groupI
     * @param {string} regexText
     * @param {string} options Options to pass to RegExp constructor
     * @param {string} sampleText
     * @param {Object} match
     * @param {number} groupI 1-indexed
     * @param {{start:number, end:number, tokens:Array}} groupPos Result of findGroupInRegex()
     * @return {?{start:number, end:number}} Null if no such group or group has no match. 'end' is exclusive.
     */
    function findGroupInMatch(regexText, options, sampleText, match, groupI, groupPos) {
        if (!match || !groupPos || !match[groupI]) {
            return null;
        }
        
        // JS regexp results don't tell you the index of each group, only the index of the match overall.
        // Strategy is to construct a new regexp where the entire prefix of the match before the target group is wrapped in a
        // single group, so its match length tell us the offset of the target group's match from the start of the overall match.
        // FIXME: very simple approach that fails with group nesting or quantifiers!
        var newRegexText = "(" + regexText.substr(0, groupPos.start) + ")" + regexText.substr(groupPos.start);
        var newRegex = new RegExp(newRegexText, options);
        
        var newMatch = newRegex.exec(sampleText);
//        console.log("NewRegex:", newRegexText, "->", newMatch);
        
        // Target group may not be newMatch[2], since the new prefix group we created might have nested groups too. But we can
        // easily get the target group's match length from the original `match` object, so we don't need to know its new index.
        var start = newMatch.index + newMatch[1].length;
        return { start: start, end: start + match[groupI].length };
    }
    
    
    exports.findGroupInRegex = findGroupInRegex;
    exports.findGroupInMatch = findGroupInMatch;
});