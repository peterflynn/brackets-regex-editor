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
/*global define, brackets, $, CodeMirror */

/**
 * "Some people, when confronted with a problem, think 'I know, I'll use regular expressions!' Now they have two problems."
 *                                                                                                      - Jamie Zawinski
 */
define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var _                       = brackets.getModule("thirdparty/lodash"),
        KeyEvent                = brackets.getModule("utils/KeyEvent"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        InlineWidget            = brackets.getModule("editor/InlineWidget").InlineWidget,
        EditorManager           = brackets.getModule("editor/EditorManager"),
        CodeMirror              = brackets.getModule("thirdparty/CodeMirror2/lib/codemirror");
    
    // Our own modules
    var mode                    = require("regex-mode").mode,
        RegexUtil               = require("RegexUtil");
    
    // UI templates
    var inlineEditorTemplate    = require("text!regex-editor-template.html");
    
    var TEST = /<.+>/;
    var TEST2 = /(a|x)(b|y)(c|z)/i;
    
    function findRegexToken(editor, pos) {
        var token = editor._codeMirror.getTokenAt(pos, true); // token to LEFT of cursor
        if (token.type === "string-2") {
            return token;
        }
        
        token = editor._codeMirror.getTokenAt({line: pos.line, ch: pos.ch + 1}, true); // token to RIGHT of cursor
        if (token.type === "string-2") {
            return token;
        }
        
        return null;
    }
    
    
    function RegexInlineEditor(regex, pos) {
        InlineWidget.call(this);
        this._origPos = pos;
        
        this.$htmlContent.addClass("inline-regex-editor");
        $(inlineEditorTemplate).appendTo(this.$htmlContent);
        
        // Strip off the slash delimiters and separate out any flags
        var reInfo = regex.match(/^\/(.*)\/([igm]*)$/);
        if (!reInfo) {
            this._showError("Not a regular expression");
            reInfo = [regex, regex, ""];
        }
        this._origText = reInfo[1];
        
        var $btnInsensitive = this.$htmlContent.find(".btn-regexp-insensitive");
        $btnInsensitive
            .toggleClass("active", reInfo[2].indexOf("i") !== -1)
            .click(function () {
                $btnInsensitive.toggleClass("active");
                this._handleChange();
            }.bind(this));
        
        var $inputField = this.$htmlContent.find(".inline-regex-edit");
        $inputField.val(reInfo[1]);
        this.cm = CodeMirror.fromTextArea($inputField[0], {
            mode: "regex",
            matchBrackets: true,
            lineNumbers: false
        });
        // The CM editor has "auto" height; in practice, it's only ever 1 line tall but height still grows if h scrollbar shown.
        // Its width is determined by its parent layout (a flexbox for now).
        
        this._handleChange = this._handleChange.bind(this);
        this.cm.on("change", this._handleChange);
        
        this.$sampleInput = this.$htmlContent.find(".inline-regex-sample")
            .on("input", this._handleChange);
        
        this._syncToCode = this._syncToCode.bind(this);
        this.$btnDone = this.$htmlContent.find(".btn-regexp-done")
            .click(this._syncToCode)
            .addClass("disabled");  // enabled when modified
        
        this.$htmlContent[0].addEventListener("keydown", this._handleKeyDown.bind(this), true);
        
        this.$htmlContent.find(".inline-regex-groups").on("mouseenter", ".regex-group-match", this._handleGroupMouseover.bind(this));
        this.$htmlContent.find(".inline-regex-groups").on("mouseleave", ".regex-group-match", this._overlayFullMatch.bind(this));
    }
    RegexInlineEditor.prototype = Object.create(InlineWidget.prototype);
    RegexInlineEditor.prototype.constructor = RegexInlineEditor;
    RegexInlineEditor.prototype.parentClass = InlineWidget.prototype;
    
    RegexInlineEditor.prototype.onAdded = function () {
        RegexInlineEditor.prototype.parentClass.onAdded.apply(this, arguments);
        
        this.cm.refresh(); // must refresh CM after it's initially added to DOM
        
        // Setting initial height is a *required* part of the InlineWidget contract
        // (must be after cm.refresh() so computed vertical size is accurate)
        this._adjustHeight();
        
        this.cm.focus();
        
        this._handleChange();  // initial update to show any syntax errors
    };
    RegexInlineEditor.prototype._adjustHeight = function () {
        var inlineWidgetHeight = this.$htmlContent.find(".inline-regex-output-row").position().top + 28;
        this.hostEditor.setInlineWidgetHeight(this, inlineWidgetHeight);
    };
    
    
    RegexInlineEditor.prototype._handleKeyDown = function (event) {
        if (event.keyCode === KeyEvent.DOM_VK_TAB) {
            // Create a closed tab cycle within the widget
            if (this.cm.hasFocus()) {
                this.$sampleInput.focus();
                event.stopPropagation();  // don't insert tab in CM field
            } else {
                this.cm.focus();
            }
            event.preventDefault();
            
        } else if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
            if (this.cm.hasFocus()) {
                event.stopPropagation();  // don't insert newline in CM field
                event.preventDefault();
                // TODO: not thorough enough... could still paste, etc.
            }
        }
    };
    
    RegexInlineEditor.prototype._showError = function (message) {
        this.$htmlContent.find(".inline-regex-error").text(message);
        this.$htmlContent.find(".inline-regex-error").show();
        this.$htmlContent.find(".inline-regex-match").hide();
        this.$htmlContent.find(".inline-regex-groups").hide();
        this.$htmlContent.find(".sample-match-overlay").hide();
    };
    RegexInlineEditor.prototype._showNoMatch = function (testText) {
        if (!testText && !this._testTextModified) {
            // Don't show "no match" message if no test text ever entered before (but if it has been touched
            // and now is blank again, we assume user really wants to know if the regex matches empty string)
            this.$htmlContent.find(".inline-regex-error").hide();
        } else {
            this.$htmlContent.find(".inline-regex-error").text("(no match)");
            this.$htmlContent.find(".inline-regex-error").show();
            if (testText) {
                this._testTextModified = true;
            }
        }
        this.$htmlContent.find(".inline-regex-match").hide();
        this.$htmlContent.find(".inline-regex-groups").hide();
        this.$htmlContent.find(".sample-match-overlay").hide();
    };
    RegexInlineEditor.prototype._showMatch = function () {
        var match = this._match;
        var padding = "", i;
        for (i = 0; i < match.index; i++) { padding += "&nbsp;"; }
        this.$htmlContent.find(".inline-regex-match").html(padding + _.escape(match[0]));
        
        // Show capturing group matches
        if (match.length > 1) {
            var groups = "";
            for (i = 1; i < match.length; i++) {
                if (match[i] !== undefined) {
                    groups += "<span class='regex-group-match' data-groupnum='" + i + "'><strong>$" + i + "</strong>&nbsp;";
                    groups += _.escape(match[i]);
                    groups += "</span>";
                } else {
                    groups += "<span class='regex-group-match unmatched-group' data-groupnum='" + i + "'><strong>$" + i + "</strong></span>";
                }
            }
            this.$htmlContent.find(".inline-regex-groups").html(groups).show();
        } else {
            this.$htmlContent.find(".inline-regex-groups").hide();
        }
        
        this.$htmlContent.find(".inline-regex-match").show();
        this.$htmlContent.find(".inline-regex-error").hide();
        this._overlayFullMatch();
    };
    
    RegexInlineEditor.prototype._getFlags = function () {
        return this.$htmlContent.find(".btn-regexp-insensitive").hasClass("active") ? "i" : "";
    };
    
    RegexInlineEditor.prototype._highlightSampleText = function (start, len) {
        var $overlay = this.$htmlContent.find(".sample-match-overlay").show();
        $overlay.css("left", 47 + 7 * start);
        $overlay.css("width", 7 * len);
        $overlay.css("top", this.$sampleInput.position().top);
    };
    RegexInlineEditor.prototype._overlayFullMatch = function () {
        this._highlightSampleText(this._match.index, this._match[0].length);
        
        if (this._regexGroupHighlight) {
            this._regexGroupHighlight.clear();
            this._regexGroupHighlight = null;
        }
    };
    RegexInlineEditor.prototype._handleGroupMouseover = function (event) {
        var regexText = this.cm.getValue();
        var testText = this.$sampleInput.val();
        var groupI = parseInt($(event.currentTarget).data("groupnum"), 10);
        
        var inRegex = RegexUtil.findGroupInRegex(regexText, groupI);
        this._regexGroupHighlight = this.cm.markText({line: 0, ch: inRegex.start}, {line: 0, ch: inRegex.end},
                                           {className: "regex-group-highlight", startStyle: "rgh-first", endStyle: "rgh-last" });
        
        var inSample = RegexUtil.findGroupInMatch(regexText, this._getFlags(), testText, this._match, groupI, inRegex);
        if (inSample) {
            this._highlightSampleText(inSample.start, inSample.end - inSample.start);
        } else {
            this.$htmlContent.find(".sample-match-overlay").hide();
        }
    };
    
    RegexInlineEditor.prototype._handleChange = function () {
        var regexText = this.cm.getValue();
        var testText = this.$sampleInput.val();
        
        this.$btnDone.toggleClass("disabled", this._origText === regexText);
        
        if (!regexText) {
            this._showError("Empty regular expression is not valid");
        } else {
            var regex;
            try {
                regex = new RegExp(regexText, this._getFlags());
            } catch (ex) {
                this._showError(ex.message);
                return;
            }
            
            this._match = regex.exec(testText);
            if (!this._match) {
                this._showNoMatch(testText);
            } else {
                this._showMatch();
            }
        }
        
        this._adjustHeight();  // in case CM h scrollbar added/removed
    };
    
    RegexInlineEditor.prototype._syncToCode = function () {
        var regexText = this.cm.getValue();
        var regexCode = "/" + regexText + "/" + this._getFlags();
        
        // Rough way to re-find orig token... hopefully dependable enough
        var token = findRegexToken(this.hostEditor, this._origPos);
        
        var chStart = token ? token.start : this._origPos.ch,
            len = token ? token.string.length : 0;
        this.hostEditor.document.replaceRange(regexCode, { line: this._origPos.line, ch: chStart }, { line: this._origPos.line, ch: chStart + len });
        
        this.close();
    };
    
    
    /**
     * @param {!Editor} hostEditor
     */
    function _createInlineEditor(hostEditor, pos, regexToken) {
        var inlineEditor = new RegexInlineEditor(regexToken.string, pos);
        inlineEditor.load(hostEditor);  // only needed to appease weird InlineWidget API
        
        return new $.Deferred().resolve(inlineEditor);
    }
        
    /**
     * Provider registered with EditorManager
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {?$.Promise} Promise resolved with a RegexInlineEditor, or null
     */
    function javaScriptFunctionProvider(hostEditor, pos) {
        // Only provide a JavaScript editor when cursor is in JavaScript content
        if (hostEditor.getLanguageForSelection().getId() !== "javascript") {
            return null;
        }
        
        var token = findRegexToken(hostEditor, pos);
        if (token) {
            return _createInlineEditor(hostEditor, pos, token);
        }
        return null;
    }
    
    
    ExtensionUtils.loadStyleSheet(module, "regex-editor-styles.css");
    
    EditorManager.registerInlineEditProvider(javaScriptFunctionProvider);
});
