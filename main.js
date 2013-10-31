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
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var InlineWidget            = brackets.getModule("editor/InlineWidget").InlineWidget,
        EditorManager           = brackets.getModule("editor/EditorManager");
    
    var TEST = /<.+>/;
    
    function RegexInlineEditor(regex) {
        InlineWidget.call(this);
        
        // TODO: monospace font
        // TODO: move into template (still inline CSS)
        $("<input type='text' class='inline-regex-edit' style='margin-left:40px; margin-top:5px'><br><input type='text' class='inline-regex-sample' style='margin-left:40px'><br><span class='inline-regex-match' style='margin-left:40px'></span>").appendTo(this.$htmlContent);
        this.$htmlContent.find(".inline-regex-edit").val(regex);
        this.$htmlContent.find(".inline-regex-edit, .inline-regex-sample").on("input", this._handleChange.bind(this));
    }
    RegexInlineEditor.prototype = Object.create(InlineWidget.prototype);
    RegexInlineEditor.prototype.constructor = RegexInlineEditor;
    RegexInlineEditor.prototype.parentClass = InlineWidget.prototype;
    
    // Setting initial height is a *required* part of the InlineWidget contract
    RegexInlineEditor.prototype.onAdded = function () {
        RegexInlineEditor.prototype.parentClass.onAdded.apply(this, arguments);
        this.hostEditor.setInlineWidgetHeight(this, 120);
    };
    
    
    RegexInlineEditor.prototype._showError = function (message) {
        this.$htmlContent.find(".inline-regex-match").text("Error: " + message);
    };
    RegexInlineEditor.prototype._showNoMatch = function () {
        this.$htmlContent.find(".inline-regex-match").text("(no match)");
    };
    RegexInlineEditor.prototype._showMatch = function (match) {
        this.$htmlContent.find(".inline-regex-match").text(match[0]);
    };
    
    RegexInlineEditor.prototype._handleChange = function () {
        var regexText = this.$htmlContent.find(".inline-regex-edit").val();
        var testText = this.$htmlContent.find(".inline-regex-sample").val();
        
        // Can't construct a RegExp directly from the literal: have to strip off the
        // slash delimiters and separate out any flags
        var reInfo = regexText.match(/^\/(.*)\/([igm]*)$/);
        if (!reInfo) {
            this._showError("Not a regular expression");
        } else if (!reInfo[1]) {
            this._showError("Empty regular expression is not valid");
        } else {
            var regex;
            try {
                regex = new RegExp(reInfo[1], reInfo[2] || "");
            } catch (ex) {
                this._showError(ex.message);
                return;
            }
            
            var match = regex.exec(testText);
            if (!match) {
                this._showNoMatch();
            } else {
                this._showMatch(match);
            }
        }
    };
    
    
    /**
     * @param {!Editor} hostEditor
     */
    function _createInlineEditor(hostEditor, pos, regexToken) {
        var inlineEditor = new RegexInlineEditor(regexToken.string);
        inlineEditor.load(hostEditor);  // only needed to appease weird InlineWidget API
        
        return new $.Deferred().resolve(inlineEditor);
    }
    
    /**
     * This function is registered with EditorManager as an inline editor provider. It creates an inline editor
     * when the cursor is on a JavaScript function name, finds all functions that match the name
     * and shows (one/all of them) in an inline editor.
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {?$.Promise} a promise that will be resolved with an InlineWidget
     *      or null if we're not going to provide anything.
     */
    function javaScriptFunctionProvider(hostEditor, pos) {
        // Only provide a JavaScript editor when cursor is in JavaScript content
        if (hostEditor.getLanguageForSelection().getId() !== "javascript") {
            return null;
        }
        
        var token = hostEditor._codeMirror.getTokenAt(pos, true); // token to LEFT of cursor
        if (token.className === "string-2") {
            return _createInlineEditor(hostEditor, pos, token);
        }
        
        token = hostEditor._codeMirror.getTokenAt({line: pos.line, ch: pos.ch + 1}, true); // token to RIGHT of cursor
        if (token.className === "string-2") {
            return _createInlineEditor(hostEditor, pos, token);
        }
        
        return null;
    }

    EditorManager.registerInlineEditProvider(javaScriptFunctionProvider);
});
