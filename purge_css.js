const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'internbot', 'style.css');
let css = fs.readFileSync(cssPath, 'utf-8');

// 1. Replace CSS custom properties block
const newRoot = `:root {
  --bg-base: #09090B;
  --bg-surface-1: #111113;
  --bg-surface-2: #1A1A1F;
  --bg-surface-3: #222228;
  --bg-overlay: rgba(0, 0, 0, 0.6);
  --border-subtle: #1C1C22;
  --border-default: #27272F;
  --border-hover: #33333D;
  --border-active: #3F3F4A;
  --text-primary: #EDEDEF;
  --text-secondary: #A1A1A9;
  --text-tertiary: #63636E;
  --text-disabled: #3A3A44;
  --accent: #3B82F6;
  --accent-hover: #2563EB;
  --accent-muted: rgba(59, 130, 246, 0.08);
  --accent-border: rgba(59, 130, 246, 0.19);
  --success: #22C55E;
  --error: #EF4444;
  --warning: #EAB308;
}`;
css = css.replace(/:root\s*\{[\s\S]*?(?=\n\n|\n[a-zA-Z\.#])/g, newRoot + '\n\n');

// 2. Map old variables to new variables
css = css.replace(/var\(--bg-primary\)/g, 'var(--bg-base)');
css = css.replace(/var\(--bg-secondary\)/g, 'var(--bg-surface-1)');
css = css.replace(/var\(--bg-glass\)/g, 'var(--bg-surface-2)');
css = css.replace(/var\(--bg-glass-hover\)/g, 'var(--bg-surface-3)');
css = css.replace(/var\(--text-muted\)/g, 'var(--text-tertiary)');
css = css.replace(/var\(--accent-start\)/g, 'var(--accent)');
css = css.replace(/var\(--accent-mid\)/g, 'var(--accent)');
css = css.replace(/var\(--accent-end\)/g, 'var(--accent)');
css = css.replace(/var\(--accent-glow\)/g, 'none');

// 3. Purge clichés globally
css = css.replace(/backdrop-filter:\s*blur[^;]+;/g, '/* removed blur */');
// Replace gradients, except for -webkit-background-clip (we'll remove the whole block if text-transparent is there)
css = css.replace(/background:\s*linear-gradient[^;]+;/g, 'background: var(--bg-surface-2);');
css = css.replace(/background-image:\s*linear-gradient[^;]+;/g, 'background: var(--bg-surface-2);');
css = css.replace(/box-shadow:\s*[^;]+(20px|40px|30px|16px)[^;]+;/g, 'box-shadow: none;'); // Catch neon shadows
css = css.replace(/border-radius:\s*(16px|20px|24px|30px|50px|9999px|var\(--radius-full\))/g, 'border-radius: 6px');
css = css.replace(/--radius-lg/g, '6px');
css = css.replace(/--radius-md/g, '4px');
css = css.replace(/--radius-sm/g, '2px');

// text gradients
css = css.replace(/-webkit-background-clip:\s*text;/g, 'color: var(--accent);');
css = css.replace(/-webkit-text-fill-color:\s*transparent;/g, '');

// Clean animations
css = css.replace(/animation:\s*pulse[^;]+;/g, '');
css = css.replace(/animation:\s*float[^;]+;/g, '');
css = css.replace(/animation:\s*glow[^;]+;/g, '');

fs.writeFileSync(cssPath, css);
console.log('CSS purge complete');
