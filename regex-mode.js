/*
 * Copyright (c) 2013 Peter Flynn.
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
 * A CodeMirror mode for syntax-highlighting regular expressions, mapped to .regex file extension.
 * Each line is assumed to be a separate regex.
 * 
 * The fact that escaped "()"s are a different token class from unescaped ones means CodeMirror's
 * standard brace matching will work correctly with this mode as well.
 */
define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var LanguageManager     = brackets.getModule("language/LanguageManager"),
        CodeMirror          = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror");
    
    
    function clearState(state) {
        state.nesting = [];
        state.quantifiable = false;
        state.justOpened = null;
        return state;
    }
    function startState() {
        return clearState({});
    }
    
    
    var charClasses_arr = ["d", "D", "w", "W", "s", "S", "t", "r", "n", "v", "f", "b", "B", "0"];
    var charClasses = {};
    charClasses_arr.forEach(function (ch) { charClasses[ch] = true; });
    
    
    function token(stream, state) {
        
        var newScope = state.justOpened;
        if (newScope) {
            state.justOpened = null;
            
            if (newScope === "(") {
                if (stream.match(/\?[:=!]/)) {
                    // ?: is non-capturing qualifier
                    // ?= and ?! are only-if-[not]-followed-by directives, technically making the whole group a quantifier
                    state.quantifiable = false;
                    return "keyword";
                }
            } else if (newScope === "[") {
                if (stream.eat("^")) {  // char set inversion
                    state.quantifiable = false;
                    return "keyword";
                }
            }
        }
        
        
        var ch = stream.next();
        
        // Reset for new regexp at start of next line
        if (!ch) {
            clearState(state);
            return;
        }
        
        
        function pushNest() {
            state.nesting.push(ch);
            state.justOpened = ch;
        }
        function popNest() {
            state.nesting.pop();
        }
        
        
        if (ch === "\\") {
            state.quantifiable = true;
            
            var nextCh = stream.next();
            if (charClasses[nextCh]) {
                return "atom";
            } else if (nextCh === "u") {
                stream.next();
                stream.next();
                stream.next();
                stream.next();
                return "atom";
            } else if (nextCh === "x") {
                stream.next();
                stream.next();
                return "atom";
            } else if (!nextCh) {
                return "error";  // regexp cannot end in \
            } else {
                return null;  // just a random escaped character
                // TODO: render the "\" slightly grayed out?
            }
            // TODO: \n backreferences (n>0)
        }
        if (ch === ".") {
            state.quantifiable = true;
            return "atom";
        }
        
        var scope = state.nesting[state.nesting.length - 1];  // may yield undefined
        
        if (scope === "[") {
            if (ch === "]") {
                popNest();
                state.quantifiable = true;  // overall char set can be quantified
                // (else: no need to set quantifiable=false otherwise, since quantifiers not accepted inside char clas anyway)
            } else if (ch === "-" && !newScope) {
                return "keyword";  // char range (unless 1st char after [)
            }
            
            return "number";
        }
        
        if (ch === "(") {
            pushNest();
            state.quantifiable = false;
            return "bracket";
        } else if (ch === "[") {
            pushNest();
            state.quantifiable = false;
            return "number";
        } else if (ch === ")") {
            state.quantifiable = true;  // overall group can be quantified
            if (scope === "(") {
                popNest();
                return "bracket";
            } else {
                return "error";
            }
        }
        // Note: closing "]" floating outside a "[" context is fine - just plain text
        
        
        // Start-line/end-line marker
        // Theyre actually interpreted this way even if not at start/end of regexp... which does make sense sometimes, e.g. with | operator
        if (ch === "^") {
            state.quantifiable = false;
            return "keyword";
        }
        if (ch === "$") {
            state.quantifiable = false;
            return "keyword";
        }
        
        // Quantifiers
        function handleQuantifier() {
            if (state.quantifiable) {
                state.quantifiable = false;
                return "rangeinfo";
            } else {
                return "error";
            }
        }
        if (ch === "+" || ch === "*" || ch === "?") {
            stream.eat("?");  // +? or *? or ?? (non-greedy quantifier)
            return handleQuantifier();
        } else if (ch === "{") {
            if (stream.match(/\d+(,\d*)?\}/)) {
                // TODO: turn red if n>m (ok if n==m though)
                return handleQuantifier();
            }
            // Anything after "{" other than {n} {n,} or {n,m} makes it just plain text to match
            return null;
        }
        
        if (ch === "|") {
            state.quantifiable = false;
            return "keyword";
        }
        
        // Any other plain text chars to match (e.g. letters or digits)
        state.quantifiable = true;
        return null;
    }
    
    
    var modeFactory = function () {
        return { token: token, startState: startState };
    };
    
    CodeMirror.defineMode("regex", modeFactory);
    
    exports.mode = modeFactory();
});
