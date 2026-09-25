const fs = require('fs');
const css = fs.readFileSync('dist/output.css', 'utf8');

// Check box-sizing
console.log('box-sizing border-box:', css.includes('box-sizing:border-box') || css.includes('box-sizing:border-box'));
const bsIdx = css.indexOf('box-sizing');
if (bsIdx >= 0) {
  console.log('box-sizing context:', css.substring(bsIdx, bsIdx + 100));
}

// Check if align-content/stretch is set anywhere
console.log('align-content:', css.includes('align-content'));

// Check the full CSS for any rules that might affect the grid or section
const lines = css.split('}');
lines.forEach((line, i) => {
  if (line.includes('h-screen') || line.includes('h-full') || line.includes('min-h')) {
    console.log('Rule ' + i + ':', line.trim());
  }
});

// Check what's around the grid rules
const gridIdx = css.indexOf('.grid{display:grid}');
if (gridIdx >= 0) {
  console.log('\nGrid rule area:', css.substring(gridIdx, gridIdx + 200));
}
