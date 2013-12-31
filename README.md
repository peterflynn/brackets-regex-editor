Inline Regex Editor for Brackets
================================
For those times when you need to [swoop in and save the day with a regular expression](https://xkcd.com/208/).

Just put your cursor on a JavaScript regular expression and press Ctrl+E to bring up the editor. Enter test strings and see matches
in real time as you edit the regexp.

![Screenshot](http://peterflynn.github.io/screenshots/brackets-regex-editor.png)

* Displays regular expressions with full colored syntax highlighting
* Highlights matched text in your test string
* Shows all capturing-group matches
* Mouseover a capturing-group match to highlight the corresponding group in the regex, and the match in your test string
* Highlights matching parentheses (intelligently ignoring escaped characters) based on cursor position

[Regular expressions can get pretty complicated](http://ex-parrot.com/~pdw/Mail-RFC822-Address.html) - that's why it's important to
have good tools!


How to Install
==============
Inline Regex Editor is an extension for [Brackets](https://github.com/adobe/brackets/), a new open-source code editor for the web.

To install extensions:

1. Choose _File > Extension Manager_ and select the _Available_ tab
2. Search for this extension
3. Click _Install_!


### License
MIT-licensed -- see `main.js` for details.

### Compatibility
Brackets Sprint 23 or newer (Adobe Edge Code Preview 4 or newer).