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
     * @return {{start:number, end:number, tokens:Array, startTokenI:number, endTokenI:number}?}
     *      Null if no such group. 'end' is exclusive, but 'endTokenI' is inclusive.
     */
    function findGroupInRegex(regexText, groupI) {
        
        var tokens = regexTokens(regexText);
        
        var startCh, startTokenI, nestLevel;
        
        // Find start of group
        var i, atGroupI = 0, token;
        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            if (token.style === "bracket" && token.string === "(") {
                if (!tokens[i + 1] || tokens[i + 1].string !== "?:") {  // ignore non-capturing groups
                    atGroupI++;
                    token.groupI = atGroupI;  // recorded for later use by findGroupInMatch()
                    if (atGroupI === groupI) {
                        startCh = token.startCh;
                        startTokenI = i;
                        nestLevel = token.nestLevel - 1;  // nestLevel reflects post-token state, so we want 1 level up
                        break;
                    }
                }
            }
        }
        
        // Find end of group
        for ("ugh, jslint"; i < tokens.length; i++) {
            token = tokens[i];
            if (token.nestLevel === nestLevel) {
                console.assert(token.style === "bracket" && token.string === ")");
                return { start: startCh, end: token.startCh + token.string.length, tokens: tokens,
                         startTokenI: startTokenI, endTokenI: i };
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
        
        var tokens = groupPos.tokens;
        
        // We don't support groups with quantifiers yet - only the last match is captured, and we don't yet have a way to figure
        // out the length of the uncaptures repeated matches before that.
        var tokenAfterGroup = tokens[groupPos.endTokenI + 1];
        if (tokenAfterGroup && tokenAfterGroup.style === "rangeinfo") {
            return null;
        }
        
        // JS regexp results don't tell you the index of each group, only the index of the match overall.
        // Strategy is to construct a new regexp where the entire prefix of the match before the target group is wrapped in a
        // single group, so its match length tells us the offset of the target group's match from the start of the overall match.
        // In cases where the target group is nested, we wrap each nesting level's prefix in a group and then sum those prefix
        // groups' lengths.
        
        // Work backwards (right to left) from target group: start with a prefix group open just to the left of it, and close
        // that group if we encounter a "(" that forces us to step out a level, opening a new one on the other side of the "(".
        var newRegexText = ")";
        var nextNestLevel = groupPos.tokens[groupPos.startTokenI].nestLevel - 1;
        var prefixGroups = [];
        var lastGroupI = tokens[groupPos.startTokenI].groupI;
        var i;
        for (i = groupPos.startTokenI - 1; i >= 0; i--) {
            var token = tokens[i];
            if (token.style === "bracket" && token.string === "(") {
                // Not every "(" we encounter requires terminating our prefix group - only those in the path up from the target
                // group's nest level to the top level. E.g. in "a(b(c)d(e)f(TARGET))", only the leftmost "(" causes a break in
                // prefix groups.
                if (token.nestLevel === nextNestLevel) {
                    nextNestLevel--;
                    newRegexText = ")((" + newRegexText;
//                    prefixGroupInsertions.push(i); // group inserted after tokens[i] in the original regexp's tokenization
                    
                    // This will be the index of our newly inserted group ONLY if we don't insert any more
                    // new groups to the left of it. We'll correct for that later.
                    prefixGroups.unshift(lastGroupI);
                } else {
                    newRegexText = token.string + newRegexText;
                }
                
                // Update lastGroupI *after* the test above - the extra "(" we insert there is *inside* the "(" that our loop is
                // currently at, so we want the group number after it, not its group number. (And we can't just use `token.groupI + 1`
                // instead of tracking 'lastGroupI' since it's possible the "(" here is for a non-capturing group with no number;
                // the "(" token we're on may have no indication of what the next/prev group numbers are).
                if (token.groupI) {  // no group # if non-capturing
                    lastGroupI = token.groupI;
                }
            } else {
                newRegexText = token.string + newRegexText;
            }
        }
        // Close final outermost/leftmost prefix group
        newRegexText = "(" + newRegexText + regexText.substr(groupPos.start);
        prefixGroups.unshift(lastGroupI);
        console.assert(lastGroupI === 1);
        
//        console.log("NewRegexText:", newRegexText);
        
        // Adjust each prefix group's number to account for other prefix groups preceding it
        for (i = 1; i < prefixGroups.length; i++) {
            prefixGroups[i] += i;
        }
//        console.log("PrefixGroups:", prefixGroups);
        
        var newRegex = new RegExp(newRegexText, options);
        var newMatch = newRegex.exec(sampleText);
//        console.log("NewRegex:", newRegexText, "->", newMatch);
        
        // Sum the lengths of all our prefix groups' matching strings to get the offset of the target group's match
        var offsetFromMatchStart = 0;
        for (i = 0; i < prefixGroups.length; i++) {
            var groupMatch = newMatch[prefixGroups[i]];
            if (groupMatch) {
                offsetFromMatchStart += groupMatch.length;
            }
        }
        var start = newMatch.index + offsetFromMatchStart;
//        console.log("Offset:", offsetFromMatchStart, "-> Start:", start, "End:", (start + match[groupI].length));
        return { start: start, end: start + match[groupI].length };
    }
    
    
    exports.findGroupInRegex = findGroupInRegex;
    exports.findGroupInMatch = findGroupInMatch;
});