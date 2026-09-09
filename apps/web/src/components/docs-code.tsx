import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import python from "highlight.js/lib/languages/python";
import { Icon } from "./icon";

export const codeLanguages = {
  bash: "Shell", typescript: "TypeScript", javascript: "JavaScript",
  json: "JSON", yaml: "YAML", toml: "TOML", python: "Python", plaintext: "Text"
} as const;
export type CodeLanguage = keyof typeof codeLanguages;

const highlighter = createLowlight({ bash, typescript, javascript, json, yaml, toml: ini, python });
type Token = ReturnType<typeof highlighter.highlight>["children"][number];

function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => token.type === "text" ? token.value
    : token.type === "element" ? <span key={index} className={(token.properties.className as string[] | undefined)?.join(" ")}>{renderTokens(token.children)}</span>
      : null);
}

export function highlightCode(code: string, language: string): ReactNode {
  if (!highlighter.registered(language)) return code;
  try { return renderTokens(highlighter.highlight(language, code).children); }
  catch { return code; }
}

type CodeBlockProps = { children: string; language: CodeLanguage; filename?: string };

export const CodeBlock = memo(function CodeBlock({ children: code, language, filename }: CodeBlockProps) {
  const highlighted = useMemo(() => highlightCode(code, language), [code, language]);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setStatus("idle"); clearTimeout(timer.current); }, [code]);
  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2500);
    } catch { setStatus("failed"); }
  };
  const label = filename ?? codeLanguages[language] ?? "Text";
  return <figure className="doc-code" data-language={language}>
    <figcaption className="doc-code-bar">
      <span className="doc-code-label"><span aria-hidden="true"><Icon name={language === "bash" ? "terminal" : "file"} /></span>{label}</span>
      <span className="doc-code-actions">
        {filename && <span className="doc-code-language">{codeLanguages[language]}</span>}
        <span role="status" className="doc-code-status" title={status === "failed" ? "Select the code and copy it manually." : undefined}>{status === "copied" ? "Copied" : status === "failed" ? "Copy unavailable" : ""}</span>
        <button type="button" onClick={copy} aria-label={`Copy ${label} code`} title={`Copy ${label} code`}><span aria-hidden="true"><Icon name={status === "copied" ? "check" : "copy"} size={15} /></span></button>
      </span>
    </figcaption>
    <pre tabIndex={0} aria-label={`${label} code`}><code translate="no" className={`language-${language}`}>{highlighted}</code></pre>
  </figure>;
});

type CodeExample = { label: string; language: CodeLanguage; code: string; filename?: string };

// Static documentation exports include every language, not just the visible tab.
export const DocumentationExportContext = createContext(false);

export function CodeTabs({ examples, label, value, onValueChange }: { examples: CodeExample[]; label: string; value?: string; onValueChange?: (value: string) => void }) {
  const id = useId();
  const exporting = useContext(DocumentationExportContext);
  const [localSelected, setLocalSelected] = useState(0);
  const selected = value === undefined ? localSelected : Math.max(0, examples.findIndex((example) => example.label === value));
  const setSelected = (index: number) => { setLocalSelected(index); onValueChange?.(examples[index].label); };
  const tabs = useRef<HTMLDivElement>(null);
  if (exporting) return <>{examples.map((example) => <div key={example.label}><h3>{example.label}</h3><CodeBlock language={example.language} filename={example.filename}>{example.code}</CodeBlock></div>)}</>;
  return <div className="doc-code-tabs">
    <div role="tablist" aria-label={label} ref={tabs} onKeyDown={(event) => {
      let next = selected;
      if (event.key === "ArrowRight") next = (selected + 1) % examples.length;
      else if (event.key === "ArrowLeft") next = (selected - 1 + examples.length) % examples.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = examples.length - 1;
      else return;
      event.preventDefault();
      setSelected(next);
      tabs.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>
      {examples.map((example, index) => <button type="button" role="tab" key={example.label} id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)}>{example.label}</button>)}
    </div>
    {examples.map((example, index) => <div key={example.label} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index}>
      {selected === index && <CodeBlock language={example.language} filename={example.filename}>{example.code}</CodeBlock>}
    </div>)}
  </div>;
}
