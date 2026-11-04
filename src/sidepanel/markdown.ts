import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' });
hljs.registerAliases(['js', 'node', 'jsx'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['html'], { languageName: 'xml' });
hljs.registerAliases(['toml', 'env'], { languageName: 'ini' });

// html: false escapes any raw HTML the model writes; DOMPurify below is a second line of defence.
const md = new MarkdownIt({ html: false, linkify: true });

function renderCode(code: string, info: string): string {
  const language = info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const highlighted =
    language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(code);
  const label = language ? md.utils.escapeHtml(language) : 'code';
  return (
    `<div class="code"><div class="code__head"><span>${label}</span>` +
    `<button type="button" class="code__copy" data-copy>Copy</button></div>` +
    `<pre><code class="hljs">${highlighted}</code></pre></div>`
  );
}

md.renderer.rules.fence = (tokens, idx) => renderCode(tokens[idx].content, tokens[idx].info);
md.renderer.rules.code_block = (tokens, idx) => renderCode(tokens[idx].content, '');

const renderLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  // A link must open a tab, not navigate the side panel itself.
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return renderLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ['target'] });
}
