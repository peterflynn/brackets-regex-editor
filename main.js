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

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var _                       = brackets.getModule("thirdparty/lodash"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        InlineWidget            = brackets.getModule("editor/InlineWidget").InlineWidget,
        EditorManager           = brackets.getModule("editor/EditorManager");
    
    // Our own modules
    var main                    = require("regex-mode");
    
    // UI templates
    var inlineEditorTemplate    = require("text!regex-editor-template.html");
    
    var TEST = /<.+>/;
    var TEST2 = /(a|x)(b|y)(c|z)/;
    
    
    function RegexInlineEditor(regex) {
        InlineWidget.call(this);
        
        this.$htmlContent.addClass("inline-regex-editor");
        $(inlineEditorTemplate).appendTo(this.$htmlContent);
        
        var $inputField = this.$htmlContent.find(".inline-regex-edit");
        $inputField.val(regex);
        this.cm = CodeMirror.fromTextArea($inputField[0], {
            mode: "regex",
            matchBrackets: true,
            lineNumbers: false
        });
        this.cm.setSize(304, 22);
        
        this._handleChange = this._handleChange.bind(this);
        this.cm.on("change", this._handleChange);
        this.$htmlContent.find(".inline-regex-sample").on("input", this._handleChange);
    }
    RegexInlineEditor.prototype = Object.create(InlineWidget.prototype);
    RegexInlineEditor.prototype.constructor = RegexInlineEditor;
    RegexInlineEditor.prototype.parentClass = InlineWidget.prototype;
    
    RegexInlineEditor.prototype.onAdded = function () {
        RegexInlineEditor.prototype.parentClass.onAdded.apply(this, arguments);
        
        // Setting initial height is a *required* part of the InlineWidget contract
        this.hostEditor.setInlineWidgetHeight(this, 100);
        
        this.cm.refresh(); // must refresh CM after it's initially added to DOM
        this.cm.focus();
    };
    
    
    RegexInlineEditor.prototype._showError = function (message) {
        this.$htmlContent.find(".inline-regex-error").text(message);
        this.$htmlContent.find(".inline-regex-match").hide();
        this.$htmlContent.find(".inline-regex-groups").hide();
        this.$htmlContent.find(".inline-regex-error").show();
    };
    RegexInlineEditor.prototype._showNoMatch = function () {
        this.$htmlContent.find(".inline-regex-error").text("(no match)");
        this.$htmlContent.find(".inline-regex-match").hide();
        this.$htmlContent.find(".inline-regex-groups").hide();
        this.$htmlContent.find(".inline-regex-error").show();
    };
    RegexInlineEditor.prototype._showMatch = function (match) {
        var padding = "", i;
        for (i = 0; i < match.index; i++) { padding += "&nbsp;"; }
        this.$htmlContent.find(".inline-regex-match").html(padding + _.escape(match[0]));
        
        // Show capturing group matches
        if (match.length > 1) {
            var groups = "";
            for (i = 1; i < match.length; i++) {
                if (i > 1) { groups += "&nbsp;&nbsp;"; }
                groups += "<strong style='font-weight: bold'>$" + i + "</strong>&nbsp;";
                groups += _.escape(match[i]);
            }
            this.$htmlContent.find(".inline-regex-groups").html(groups).show();
        } else {
            this.$htmlContent.find(".inline-regex-groups").hide();
        }
        
        this.$htmlContent.find(".inline-regex-match").show();
        this.$htmlContent.find(".inline-regex-error").hide();
    };
    
    RegexInlineEditor.prototype._handleChange = function () {
        var regexText = this.cm.getValue();
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
    
    
    ExtensionUtils.loadStyleSheet(module, "regex-editor-styles.css");
    
    EditorManager.registerInlineEditProvider(javaScriptFunctionProvider);
});
