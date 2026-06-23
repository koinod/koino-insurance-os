import fs from 'fs';
global.window = {};
global.document = {
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  head: { appendChild: () => {} },
  body: { appendChild: () => {}, removeChild: () => {} }
};
global.React = { createElement: () => {}, useState: () => [] };
global.console = console;

const code = fs.readFileSync('dist/page-platform-admin.js', 'utf8');
try {
  eval(code);
  console.log("Success! window keys:", Object.keys(window));
} catch (e) {
  console.error("Failed:", e);
}
